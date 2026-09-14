/*
 * The library lives in `chrome.storage.local`, written by the scraper and read here.
 *
 * That one fact is what makes the viewer and the scraper the same program: there is no
 * export, no import and no syncing, because there is only ever one copy. A scrape
 * running in another tab lands in this page as it happens.
 */
const KEY = 'xbe_bookmarks'

/** Post ids are snowflakes: the timestamp is the top 41 bits, Twitter's epoch removed. */
const TWITTER_EPOCH = 1288834974657
function timeFromId(id) {
  const n = Number(id)
  if (!Number.isFinite(n) || n < 1e15) return null
  return Math.floor(n / 4194304) + TWITTER_EPOCH
}

/**
 * Forgiving on purpose. An older export, a hand-edited file or a row from some other
 * tool should load rather than take everything else down with it.
 */
export function coerce(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id ?? row.id_str ?? '').trim()
  if (!/^\d+$/.test(id)) return null

  const author = String(row.author ?? row.screen_name ?? row.username ?? '').replace(/^@/, '')
  const parsed = row.created_at ? Date.parse(row.created_at) : NaN

  return {
    // X's position key for the bookmark, written by the scraper. Rows collected before
    // it was captured have none: nothing else in a post records when you bookmarked it.
    id,
    sort_index: typeof row.sort_index === 'string' ? row.sort_index : null,
    url: row.url || (author ? `https://x.com/${author}/status/${id}` : `https://x.com/i/status/${id}`),
    author,
    author_name: row.author_name ?? row.name ?? '',
    avatar: typeof row.avatar === 'string' ? row.avatar : null,
    created_at: row.created_at ?? null,
    ts: Number.isNaN(parsed) ? timeFromId(id) ?? 0 : parsed,
    text: String(row.text ?? row.full_text ?? ''),
    replies: row.replies ?? null,
    reposts: row.reposts ?? null,
    likes: row.likes ?? null,
    quotes: row.quotes ?? null,
    bookmarks: row.bookmarks ?? null,
    media: Array.isArray(row.media) ? row.media.filter((m) => m && m.url) : [],
    links: Array.isArray(row.links) ? row.links.filter(Boolean) : [],
    quoted_url: row.quoted_url ?? null,
  }
}

export async function loadRows() {
  const got = await chrome.storage.local.get(KEY)
  return Object.values(got[KEY] ?? {})
    .map(coerce)
    .filter(Boolean)
}

/** Fires whenever the scraper writes, which is what keeps this page live. */
export function onRowsChanged(cb) {
  const listener = (changes, area) => {
    if (area === 'local' && changes[KEY]) {
      cb(Object.values(changes[KEY].newValue ?? {}).map(coerce).filter(Boolean))
    }
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

async function mutate(fn) {
  const got = await chrome.storage.local.get(KEY)
  const obj = got[KEY] ?? {}
  const next = fn(obj)
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

export const removeRow = (id) =>
  mutate((obj) => {
    delete obj[id]
    return obj
  })

/** Merge, never replace: an older row missing a field should not blank a newer one. */
export async function importRows(rows) {
  let added = 0
  let updated = 0
  let skipped = 0

  await mutate((obj) => {
    for (const raw of rows) {
      const row = coerce(raw)
      if (!row) {
        skipped++
        continue
      }
      if (obj[row.id]) updated++
      else added++
      obj[row.id] = { ...obj[row.id], ...raw, id: row.id }
    }
    return obj
  })

  return { added, updated, skipped }
}

export const clearAll = () => chrome.storage.local.remove(KEY)

/** JSON from an export is an array; tolerate the id-keyed object too. */
export function rowsFrom(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.bookmarks)) return parsed.bookmarks
  if (parsed && typeof parsed === 'object') return Object.values(parsed.bookmarks ?? parsed)
  return []
}
