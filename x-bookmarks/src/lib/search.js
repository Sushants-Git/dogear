/*
 * Search over the library.
 *
 * A linear scan, deliberately. An inverted index would be the reflex, but a few
 * thousand bookmarks score in well under a frame, and a scan is the only thing that
 * makes substring matching, field weighting and the `key:value` filters below fall out
 * for free.
 */

const FILTER = /(-?)(from|has|is|before|after|min)\s*:\s*("[^"]*"|\S+)/gi
const PHRASE = /"([^"]+)"/g

/**
 * `from:swyx has:media react hooks` — filters peel off, whatever is left is terms.
 * Quoted runs stay together, so `"design system"` does not match a post that happens
 * to contain both words far apart.
 */
export function parse(query) {
  const filters = { from: [], notFrom: [], has: [], is: [], before: null, after: null, min: null }

  let rest = String(query || '').replace(FILTER, (_m, neg, key, rawValue) => {
    const value = rawValue.replace(/^"|"$/g, '').toLowerCase()
    const k = key.toLowerCase()
    if (k === 'from') (neg ? filters.notFrom : filters.from).push(value.replace(/^@/, ''))
    else if (k === 'has') filters.has.push(value)
    else if (k === 'is') filters.is.push(value)
    else if (k === 'before') filters.before = Date.parse(value)
    else if (k === 'after') filters.after = Date.parse(value)
    else if (k === 'min') filters.min = Number(value)
    return ' '
  })

  const phrases = []
  rest = rest.replace(PHRASE, (_m, p) => {
    phrases.push(p.toLowerCase().trim())
    return ' '
  })

  const words = rest.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return { filters, terms: [...phrases, ...words].filter(Boolean) }
}

/** Lowercased once per row, so a keystroke does not re-case the whole library. */
export function index(rows) {
  return rows
    .map((row) => ({
      row,
      text: row.text.toLowerCase(),
      author: row.author.toLowerCase(),
      name: (row.author_name || '').toLowerCase(),
      links: row.links.join(' ').toLowerCase(),
    }))
    .sort((a, b) => b.row.ts - a.row.ts)
}

function passesFilters(entry, f) {
  const { row } = entry

  if (f.from.length && !f.from.includes(entry.author)) return false
  if (f.notFrom.length && f.notFrom.includes(entry.author)) return false

  for (const has of f.has) {
    if (has === 'media' && !row.media.length) return false
    if (['image', 'images', 'photo'].includes(has) && !row.media.some((m) => m.type === 'photo')) return false
    if (has === 'video' && !row.media.some((m) => m.type !== 'photo')) return false
    if (['link', 'links'].includes(has) && !row.links.length) return false
  }

  for (const is of f.is) {
    if (is === 'quote' && !row.quoted_url) return false
    if (is === 'text' && (row.media.length || row.links.length)) return false
  }

  if (Number.isFinite(f.before) && row.ts >= f.before) return false
  if (Number.isFinite(f.after) && row.ts <= f.after) return false
  if (Number.isFinite(f.min) && (row.likes ?? 0) < f.min) return false

  return true
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g

/**
 * A hit anywhere counts, but not equally: who wrote it is a stronger signal than a
 * word buried in the body, and a whole-word hit beats a fragment of a longer word.
 */
function scoreTerm(entry, term) {
  let score = 0
  const boundary = new RegExp(`(^|[^a-z0-9])${term.replace(ESCAPE, '\\$&')}`, 'i')

  if (entry.author === term) score += 12
  else if (entry.author.includes(term)) score += 6
  if (entry.name.includes(term)) score += 4
  if (entry.text.includes(term)) score += boundary.test(entry.text) ? 3 : 1
  if (entry.links.includes(term)) score += 1

  return score
}

/**
 * Bookmark order — the order they sit in on x.com, most recently bookmarked first.
 *
 * `sort_index` is X's own position key, kept as a string because the values run past
 * what a double holds exactly; they are positive integers, so longer is larger and
 * same-length compares lexicographically. Rows from an export made before the key was
 * captured have none and fall to the end, newest post first, rather than silently
 * mixing into an order they cannot actually claim.
 */
function bySaved(a, b) {
  const x = a.row.sort_index
  const y = b.row.sort_index
  if (x && y) return x.length === y.length ? (x < y ? 1 : x > y ? -1 : 0) : y.length - x.length
  if (x) return -1
  if (y) return 1
  return b.row.ts - a.row.ts
}

const SORTS = {
  relevance: (a, b) => b.score - a.score || b.row.ts - a.row.ts,
  newest: (a, b) => b.row.ts - a.row.ts,
  oldest: (a, b) => a.row.ts - b.row.ts,
  likes: (a, b) => (b.row.likes ?? 0) - (a.row.likes ?? 0) || b.row.ts - a.row.ts,
  saved: bySaved,
}

export function search(entries, { query = '', sort = 'relevance', limit = 300 } = {}) {
  const { filters, terms } = parse(query)
  const hits = []

  for (const entry of entries) {
    if (!passesFilters(entry, filters)) continue

    let score = 0
    let matchedAll = true
    for (const term of terms) {
      const s = scoreTerm(entry, term)
      if (s === 0) {
        matchedAll = false
        break
      }
      score += s
    }
    if (!matchedAll) continue
    hits.push({ row: entry.row, score })
  }

  // With no terms there is nothing to be relevant to, so fall back to newest.
  const order = SORTS[terms.length ? sort : sort === 'relevance' ? 'newest' : sort] ?? SORTS.newest
  hits.sort(order)

  return { total: hits.length, terms, results: hits.slice(0, limit).map((h) => h.row) }
}

export function stats(rows) {
  const byAuthor = new Map()
  let withMedia = 0
  let withLinks = 0

  for (const row of rows) {
    byAuthor.set(row.author, (byAuthor.get(row.author) ?? 0) + 1)
    if (row.media.length) withMedia++
    if (row.links.length) withLinks++
  }

  const authors = [...byAuthor.entries()]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))

  return { total: rows.length, authors, authorCount: authors.length, withMedia, withLinks }
}
