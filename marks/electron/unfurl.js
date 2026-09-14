/*
 * Link previews.
 *
 * A bookmark that is mostly a link is unreadable as a bare URL, so the main process
 * fetches the page, reads its Open Graph tags, and downloads the preview image to
 * disk. The renderer only ever sees `marks://thumb/<id>` — it never talks to the
 * linked site itself, which keeps the page's connect/img policy closed and means a
 * card still draws when you are offline.
 *
 * Results are cached both ways. A link that 404s should not be re-fetched on every
 * scroll, so failures are remembered too, just for less long.
 */
import { app, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import nodeNet from 'node:net'

const DAY = 86_400_000
const OK_TTL = 30 * DAY
const FAIL_TTL = 3 * DAY
const TIMEOUT = 9_000
const MAX_HTML = 512 * 1024
const MAX_IMAGE = 4 * 1024 * 1024
const CONCURRENCY = 4

const dataDir = () => process.env.MARKS_DATA_DIR || app.getPath('userData')
const cacheFile = () => path.join(dataDir(), 'unfurl.json')
export const thumbDir = () => path.join(dataDir(), 'thumbs')

const idFor = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)

let cache = null
let saveTimer = null

function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'))
  } catch {
    cache = {}
  }
  return cache
}

function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.writeFileSync(cacheFile(), JSON.stringify(cache))
  }, 500)
}

const fresh = (entry) =>
  entry && Date.now() - entry.at < (entry.error ? FAIL_TTL : OK_TTL)

/* ------------------------------------------------------------------ parsing */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'",
}

const decode = (s = '') =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
    const key = name.toLowerCase()
    if (ENTITIES[key]) return ENTITIES[key]
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16))
    if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)))
    return m
  })

const META = /<meta\s+[^>]*>/gi
const ATTR = (tag, name) =>
  tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))

/**
 * Read the tags by hand rather than parsing the document. A preview needs five
 * strings out of the head, and the pages this runs against are exactly the ones most
 * likely to have malformed markup further down.
 */
export function parseMeta(html, baseUrl) {
  const meta = {}
  for (const tag of html.match(META) ?? []) {
    const key = ATTR(tag, 'property') ?? ATTR(tag, 'name')
    const content = ATTR(tag, 'content')
    if (!key || !content) continue
    const k = (key[2] ?? key[3] ?? key[4] ?? '').toLowerCase()
    const v = decode(content[2] ?? content[3] ?? content[4] ?? '').trim()
    if (k && v && !meta[k]) meta[k] = v
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const pick = (...keys) => keys.map((k) => meta[k]).find(Boolean) ?? null

  let image = pick('og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src')
  if (image) {
    try {
      image = new URL(image, baseUrl).toString()
    } catch {
      image = null
    }
  }

  return {
    title: pick('og:title', 'twitter:title') ?? (titleTag ? decode(titleTag[1]).trim() : null),
    description: pick('og:description', 'twitter:description', 'description'),
    site: pick('og:site_name', 'application-name'),
    image,
  }
}

/* ------------------------------------------------------------------ fetching */

let active = 0
const waiting = []
const inflight = new Map()

function pump() {
  while (active < CONCURRENCY && waiting.length) {
    const job = waiting.shift()
    active++
    job
      .fn()
      .then(job.resolve, job.reject)
      .finally(() => {
        active--
        pump()
      })
  }
}

const schedule = (fn) =>
  new Promise((resolve, reject) => {
    waiting.push({ fn, resolve, reject })
    pump()
  })

/*
 * Previews are fetched for links that came out of someone else's post, which makes the
 * URL attacker-chosen: anyone can tweet a link, and bookmarking it is enough to make
 * this app request it. So the fetcher must not be usable as a way to reach things only
 * this machine can reach — a router's admin page, a service on localhost, a cloud
 * metadata endpoint.
 *
 * The check is on the resolved address rather than the hostname, because a name under
 * the attacker's control can simply point at 127.0.0.1.
 */
function isPrivateAddress(address, family) {
  if (family === 6) {
    const a = address.toLowerCase()
    if (a === '::1' || a === '::') return true
    if (/^f[cd]/.test(a)) return true              // unique local
    if (/^fe[89ab]/.test(a)) return true           // link local
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1], 4) : false
  }

  const [a, b] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true          // link local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // carrier NAT
  return a >= 224                                   // multicast and reserved
}

async function assertPublic(url) {
  const { protocol, hostname } = new URL(url)
  if (protocol !== 'http:' && protocol !== 'https:') throw new Error('Not a web link')

  const host = hostname.replace(/^\[|\]$/g, '')
  const literal = nodeNet.isIP(host)
  const addresses = literal
    ? [{ address: host, family: literal }]
    : await dns.lookup(host, { all: true }).catch(() => {
        throw new Error('Could not resolve that host')
      })

  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) throw new Error('Refusing to fetch a private address')
  }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])

/**
 * Redirects are followed by hand, one hop at a time, so that every hop is checked. A
 * public URL that redirects to 127.0.0.1 is the ordinary way this protection is dodged,
 * and `redirect: 'follow'` would take that hop without ever showing it to us.
 */
async function get(url, init = {}) {
  let current = url

  for (let hop = 0; hop <= 5; hop++) {
    await assertPublic(current)

    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), TIMEOUT)
    let res
    try {
      res = await net.fetch(current, { redirect: 'manual', signal: abort.signal, ...init })
    } finally {
      clearTimeout(timer)
    }

    const location = REDIRECTS.has(res.status) ? res.headers.get('location') : null
    if (!location) return { res, finalUrl: current }

    current = new URL(location, current).toString()
  }

  throw new Error('Too many redirects')
}

/** Read at most `limit` bytes, so one enormous page cannot stall the queue. */
async function readCapped(res, limit) {
  const reader = res.body?.getReader()
  if (!reader) return Buffer.from(await res.arrayBuffer()).subarray(0, limit)
  const chunks = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    size += value.length
  }
  reader.cancel().catch(() => {})
  return Buffer.concat(chunks).subarray(0, limit)
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' }

async function fetchThumb(imageUrl, id) {
  const { res } = await get(imageUrl)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!res.ok || !EXT[type]) return null

  const length = Number(res.headers.get('content-length') ?? 0)
  if (length > MAX_IMAGE) return null

  const bytes = await readCapped(res, MAX_IMAGE)
  if (!bytes.length) return null

  const name = `${id}.${EXT[type]}`
  fs.mkdirSync(thumbDir(), { recursive: true })
  fs.writeFileSync(path.join(thumbDir(), name), bytes)
  return name
}

async function fetchPreview(url) {
  const id = idFor(url)
  const { res, finalUrl } = await get(url)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

  // A link straight to an image is its own preview.
  if (EXT[type]) {
    const image = await fetchThumb(url, id).catch(() => null)
    return { url, finalUrl, title: null, description: null, site: null, image, at: Date.now() }
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!type.includes('html')) throw new Error(`Not a page (${type || 'unknown'})`)

  const html = (await readCapped(res, MAX_HTML)).toString('utf8')
  const meta = parseMeta(html, finalUrl)
  const image = meta.image ? await fetchThumb(meta.image, id).catch(() => null) : null

  return {
    url,
    finalUrl,
    title: meta.title,
    description: meta.description,
    site: meta.site,
    image,
    at: Date.now(),
  }
}

/**
 * Returns a cached preview straight away, otherwise fetches one. Callers that ask for
 * the same url at the same moment share a single request.
 */
export async function unfurl(url) {
  if (!/^https?:\/\//i.test(url)) return { url, error: 'Not a web link', at: Date.now() }

  const store = load()
  if (fresh(store[url])) return store[url]
  if (inflight.has(url)) return inflight.get(url)

  const work = schedule(() => fetchPreview(url))
    .then((entry) => {
      store[url] = entry
      save()
      return entry
    })
    .catch((error) => {
      // Remembered so a dead link is not re-fetched on every scroll past it.
      const entry = { url, error: error?.message ?? 'Could not load', at: Date.now() }
      store[url] = entry
      save()
      return entry
    })
    .finally(() => inflight.delete(url))

  inflight.set(url, work)
  return work
}

export function clearPreviews() {
  cache = {}
  save()
  fs.rmSync(thumbDir(), { recursive: true, force: true })
  return { ok: true }
}
