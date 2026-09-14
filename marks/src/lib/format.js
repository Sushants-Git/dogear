/** Small text helpers shared by the list and the reader. */

const MONTH = { month: 'short', day: 'numeric' }
const MONTH_YEAR = { month: 'short', day: 'numeric', year: 'numeric' }

export function shortDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const thisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, thisYear ? MONTH : MONTH_YEAR)
}

export function fullDate(ts) {
  if (!ts) return 'Unknown date'
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function compactNumber(n) {
  if (n === null || n === undefined) return null
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** t.co links are noise in the body; the real ones are listed separately. */
export const stripTrailingLinks = (text) => text.replace(/\s*https:\/\/t\.co\/\w+\s*$/g, '').trim()

export const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g

/**
 * Split a string into matched and unmatched runs so the caller can wrap the matches.
 * Done here rather than with innerHTML: the text is someone else's, and it is never
 * worth handing it to the parser just to paint a highlight.
 */
export function splitOnTerms(text, terms) {
  if (!terms?.length) return [{ text, hit: false }]
  const pattern = terms
    .filter(Boolean)
    .map((t) => t.replace(ESCAPE, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|')
  if (!pattern) return [{ text, hit: false }]

  const parts = []
  const re = new RegExp(`(${pattern})`, 'gi')
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false })
  return parts
}

/** The first run of text around a match, so a long post shows the relevant part. */
export function snippet(text, terms, length = 180) {
  const clean = stripTrailingLinks(text).replace(/\s+/g, ' ')
  if (!terms?.length || clean.length <= length) return clean.slice(0, length)

  const lower = clean.toLowerCase()
  let at = -1
  for (const term of terms) {
    const i = lower.indexOf(term.toLowerCase())
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  if (at <= 60) return clean.slice(0, length)
  const start = at - 40
  return `…${clean.slice(start, start + length)}`
}
