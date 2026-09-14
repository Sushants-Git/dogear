/*
 * Link previews.
 *
 * A bookmark that is mostly a link reads as a bare url, so the worker fetches the
 * page, takes its Open Graph tags, and shrinks the preview image down to something
 * worth storing. Results live in IndexedDB — images are far too big for
 * chrome.storage, which has to serialise the whole object on every write.
 *
 * Reaching other sites needs a host permission the extension does not hold by
 * default. The viewer asks for it the first time you turn previews on.
 */
import { parseMeta } from './og.js'

const DB = 'xb-previews'
const STORE = 'previews'
const DAY = 86_400_000
const OK_TTL = 30 * DAY
const FAIL_TTL = 3 * DAY
const TIMEOUT = 9_000
const MAX_HTML = 512 * 1024
const THUMB = 320

/* ------------------------------------------------------------------ storage */

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'url' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function read(url) {
  const db = await open()
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(url)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => resolve(null)
  })
}

async function write(entry) {
  const db = await open()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(entry)
    tx.oncomplete = resolve
    tx.onerror = resolve
  })
}

async function clearAll() {
  const db = await open()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = resolve
    tx.onerror = resolve
  })
}

const fresh = (entry) => entry && Date.now() - entry.at < (entry.error ? FAIL_TTL : OK_TTL)

/* ----------------------------------------------------------------- fetching */

/*
 * Preview URLs come out of other people's posts, so they are attacker-chosen. A worker
 * has no DNS, so this cannot check where a hostname actually resolves the way the
 * desktop app does — what it can do is refuse the addresses that are written down
 * plainly. A name pointed at 127.0.0.1 still gets through; the permission this feature
 * needs is optional and asked for separately, which is the real control here.
 */
const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd])/i

function assertPublic(url) {
  const { protocol, hostname } = new URL(url)
  if (protocol !== 'http:' && protocol !== 'https:') throw new Error('Not a web link')
  if (PRIVATE_HOST.test(hostname)) throw new Error('Refusing to fetch a private address')
}

async function get(url) {
  assertPublic(url)

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT)
  try {
    return await fetch(url, { signal: abort.signal, credentials: 'omit', redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Down to a thumbnail before it is stored. A hero image is often a megabyte or more,
 * and the card it ends up in is a couple of hundred pixels wide.
 */
async function thumbnail(imageUrl) {
  const res = await get(imageUrl)
  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  if (!res.ok || !type.startsWith('image/')) return null

  const bitmap = await createImageBitmap(await res.blob())
  const scale = Math.min(1, THUMB / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
  return await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

async function fetchPreview(url) {
  const res = await get(url)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

  if (type.startsWith('image/')) {
    return { url, title: null, description: null, site: null, image: await thumbnail(url).catch(() => null), at: Date.now() }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!type.includes('html')) throw new Error('Not a page')

  const html = (await res.text()).slice(0, MAX_HTML)
  const meta = parseMeta(html, res.url || url)

  return {
    url,
    title: meta.title,
    description: meta.description,
    site: meta.site,
    image: meta.image ? await thumbnail(meta.image).catch(() => null) : null,
    at: Date.now(),
  }
}

const inflight = new Map()

async function unfurl(url) {
  if (!/^https?:\/\//i.test(url)) return { url, error: 'Not a web link', at: Date.now() }

  const cached = await read(url)
  if (fresh(cached)) return cached
  if (inflight.has(url)) return inflight.get(url)

  const work = fetchPreview(url)
    .catch((error) => ({
      // Remembered, so a dead link is not re-fetched every time you scroll past it.
      url,
      error: error?.message ?? 'Could not load',
      at: Date.now(),
    }))
    .then(async (entry) => {
      await write(entry)
      return entry
    })
    .finally(() => inflight.delete(url))

  inflight.set(url, work)
  return work
}

/* ------------------------------------------------------------------ scraping */

/*
 * Starting a scrape lives here rather than in the popup because the first thing it does
 * is focus the bookmarks tab, which closes the popup and takes its half-finished work
 * with it. The worker is still around a second later to finish the job.
 */

const BOOKMARKS_URL = 'https://x.com/i/bookmarks'

/*
 * Bookmarks live at /i/history now, with /i/bookmarks left as a redirect, so a tab can
 * legitimately be sitting at either. twitter.com is in here because the content script
 * is, and a tab left open on the old domain is still a bookmarks page.
 */
const BOOKMARK_TABS = [
  'https://x.com/i/bookmarks*',
  'https://x.com/i/history*',
  'https://twitter.com/i/bookmarks*',
  'https://twitter.com/i/history*',
]

const bookmarksTab = async () => (await chrome.tabs.query({ url: BOOKMARK_TABS }))[0] ?? null

const loaded = (tabId) =>
  new Promise((resolve) => {
    const onUpdated = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })

/**
 * `content.js` attaches at document_start and nowhere else, so a tab that was open
 * before the extension was installed or reloaded has no listener in it and every
 * message to it fails. Reload the tab and say it again, rather than swallowing the
 * failure and leaving a button that quietly does nothing.
 */
async function tell(tabId, type) {
  const first = await chrome.tabs.sendMessage(tabId, { type }).catch(() => null)
  if (first) return first
  await chrome.tabs.reload(tabId)
  await loaded(tabId)
  return chrome.tabs.sendMessage(tabId, { type }).catch(() => null)
}

async function startScrape() {
  const existing = await bookmarksTab()
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true })
    return tell(existing.id, 'start')
  }

  const tab = await chrome.tabs.create({ url: BOOKMARKS_URL })
  await loaded(tab.id)
  return chrome.tabs.sendMessage(tab.id, { type: 'start' }).catch(() => null)
}

async function stopScrape() {
  const tab = await bookmarksTab()
  if (!tab) return null
  return chrome.tabs.sendMessage(tab.id, { type: 'stop' }).catch(() => null)
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type === 'scrape') {
    startScrape().then((res) => respond(res ?? { ok: false }), () => respond({ ok: false }))
    return true
  }
  if (msg?.type === 'stopScrape') {
    stopScrape().then((res) => respond(res ?? { ok: false }), () => respond({ ok: false }))
    return true
  }
  if (msg?.type === 'unfurl') {
    unfurl(msg.url).then(respond, (error) => respond({ url: msg.url, error: String(error) }))
    return true
  }
  if (msg?.type === 'clearPreviews') {
    clearAll().then(() => respond({ ok: true }))
    return true
  }
  return false
})
