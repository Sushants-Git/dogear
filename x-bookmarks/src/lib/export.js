/** JSON, CSV and Markdown out. The rows are yours; they should not be trapped here. */

const cell = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const COLUMNS = [
  'id', 'sort_index', 'url', 'author', 'author_name', 'created_at', 'text',
  'replies', 'reposts', 'likes', 'quotes', 'bookmarks', 'media', 'links', 'quoted_url',
]

export function toCSV(rows) {
  const lines = [COLUMNS.join(',')]
  for (const r of rows) {
    lines.push(
      COLUMNS.map((c) => {
        if (c === 'media') return cell((r.media ?? []).map((m) => m.url).join(' '))
        if (c === 'links') return cell((r.links ?? []).join(' '))
        return cell(r[c])
      }).join(',')
    )
  }
  return lines.join('\n')
}

export function toMarkdown(rows) {
  const out = ['# X Bookmarks\n', `${rows.length} bookmarks exported ${new Date().toISOString()}\n`]
  for (const r of rows) {
    out.push(`## [@${r.author}](https://x.com/${r.author})${r.author_name ? ` — ${r.author_name}` : ''}`)
    out.push(`*${r.created_at || 'unknown date'}* · [permalink](${r.url})\n`)
    out.push(`${r.text}\n`)
    for (const m of r.media ?? []) out.push(`![${m.type}](${m.url})`)
    for (const l of r.links ?? []) out.push(`- ${l}`)
    out.push('\n---\n')
  }
  return out.join('\n')
}

/** `sort_index` is X's position key: a positive integer too long to hold as a double. */
export function bySavedRow(a, b) {
  const x = a.sort_index
  const y = b.sort_index
  if (x && y) return x.length === y.length ? (x < y ? 1 : x > y ? -1 : 0) : y.length - x.length
  if (x) return -1
  if (y) return 1
  return Number(b.id) - Number(a.id)
}

export function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function exportRows(rows, format) {
  const stamp = new Date().toISOString().slice(0, 10)
  // Bookmark order, most recently bookmarked first — the order they sit in on x.com,
  // and the one thing a reader of the export cannot reconstruct for itself.
  const sorted = [...rows].sort(bySavedRow)
  if (format === 'csv') return download(`x-bookmarks-${stamp}.csv`, toCSV(sorted), 'text/csv')
  if (format === 'md') return download(`x-bookmarks-${stamp}.md`, toMarkdown(sorted), 'text/markdown')
  return download(`x-bookmarks-${stamp}.json`, JSON.stringify(sorted, null, 2), 'application/json')
}
