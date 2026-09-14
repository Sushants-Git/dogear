/*
 * The library: every bookmark the app knows about, on disk as one JSON file.
 *
 * Keyed by post id rather than kept as a list, because importing is something you do
 * repeatedly — a fresh export from the extension overlaps almost entirely with the
 * last one, and re-importing should update what changed rather than duplicate it.
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * `MARKS_DATA_DIR` overrides where the library lives. It exists so the search and
 * import logic can be exercised outside Electron, and doubles as a way to point a
 * second copy of the app at a different library.
 */
const dataDir = () => process.env.MARKS_DATA_DIR || app.getPath('userData')
const file = () => path.join(dataDir(), 'library.json')

let cache = null
const listeners = new Set()

/** Called whenever the rows change, so the search index can drop itself. */
export const onChange = (fn) => listeners.add(fn)
const changed = () => listeners.forEach((fn) => fn())

function empty() {
  return { bookmarks: {}, importedAt: null, sources: [] }
}

export function load() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'))
    cache = { ...empty(), ...parsed }
  } catch {
    cache = empty()
  }
  return cache
}

function persist() {
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(cache))
}

export const all = () => Object.values(load().bookmarks)
export const libraryPath = () => file()
export const meta = () => ({ importedAt: load().importedAt, sources: load().sources })

/**
 * Post ids are snowflakes: the timestamp is the top 41 bits, with the Twitter epoch
 * subtracted. That makes every row sortable by post time even when `created_at` is
 * missing or in one of the several formats the exports have used over the years.
 */
const TWITTER_EPOCH = 1288834974657
function timeFromId(id) {
  const n = Number(id)
  if (!Number.isFinite(n) || n < 1e15) return null
  return Math.floor(n / 4194304) + TWITTER_EPOCH
}

function timestamp(row) {
  const parsed = row.created_at ? Date.parse(row.created_at) : NaN
  if (!Number.isNaN(parsed)) return parsed
  return timeFromId(row.id) ?? 0
}

/**
 * Accepts what the exporter writes, and is forgiving about the rest — an older export,
 * a hand-edited file, or a row someone added by other means should still load rather
 * than take the whole import down with it.
 */
function coerce(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id ?? row.id_str ?? '').trim()
  if (!/^\d+$/.test(id)) return null

  const author = String(row.author ?? row.screen_name ?? row.username ?? '').replace(/^@/, '')
  const media = Array.isArray(row.media)
    ? row.media.filter((m) => m && m.url).map((m) => ({ type: m.type || 'photo', url: m.url }))
    : []

  return {
    id,
    // X's position key for the bookmark, captured by the exporter. Absent on rows that
    // came from an export made before it was captured; `sort_index` is the only record
    // of when you bookmarked something, since nothing on the post itself carries it.
    sort_index: typeof row.sort_index === 'string' ? row.sort_index : null,
    url: row.url || (author ? `https://x.com/${author}/status/${id}` : `https://x.com/i/status/${id}`),
    author,
    author_name: row.author_name ?? row.name ?? '',
    avatar: typeof row.avatar === 'string' ? row.avatar : null,
    created_at: row.created_at ?? null,
    ts: timestamp({ ...row, id }),
    text: String(row.text ?? row.full_text ?? ''),
    lang: row.lang ?? null,
    replies: row.replies ?? null,
    reposts: row.reposts ?? null,
    likes: row.likes ?? null,
    quotes: row.quotes ?? null,
    bookmarks: row.bookmarks ?? null,
    media,
    links: Array.isArray(row.links) ? row.links.filter(Boolean) : [],
    quoted_url: row.quoted_url ?? null,
    scraped_at: row.scraped_at ?? null,
  }
}

/** JSON from the extension is an array; tolerate the id-keyed object too. */
function rowsFrom(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.bookmarks)) return parsed.bookmarks
  if (parsed && typeof parsed === 'object') return Object.values(parsed.bookmarks ?? parsed)
  return []
}

export function importFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const rows = rowsFrom(parsed)
  if (!rows.length) throw new Error('That file has no bookmarks in it.')
  return importRows(rows, path.basename(filePath))
}

/**
 * The one way rows get in, whether they came from a file the user picked or arrived
 * over the sync bridge while the extension was scraping.
 */
export function importRows(rows, source = 'sync') {
  const lib = load()
  let added = 0
  let updated = 0
  let skipped = 0

  for (const raw of rows) {
    const row = coerce(raw)
    if (!row) {
      skipped++
      continue
    }
    if (lib.bookmarks[row.id]) updated++
    else added++
    // Merge rather than replace: an older export missing `media` should not blank a
    // field a newer one filled in. `sort_index` and `avatar` are spelled out because
    // coerce always returns them, so the spread alone would let an older export null
    // out a good one.
    const prev = lib.bookmarks[row.id]
    lib.bookmarks[row.id] = {
      ...prev,
      ...row,
      sort_index: row.sort_index ?? prev?.sort_index ?? null,
      avatar: row.avatar ?? prev?.avatar ?? null,
    }
  }

  lib.importedAt = new Date().toISOString()
  lib.sources = [...new Set([...(lib.sources ?? []), source])].slice(-10)
  persist()
  changed()

  return { added, updated, skipped, total: Object.keys(lib.bookmarks).length }
}

export function remove(id) {
  const lib = load()
  if (!lib.bookmarks[id]) return { removed: false }
  delete lib.bookmarks[id]
  persist()
  changed()
  return { removed: true }
}

export function clear() {
  cache = empty()
  persist()
  changed()
  return { ok: true }
}
