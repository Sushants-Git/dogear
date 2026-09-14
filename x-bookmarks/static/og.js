/*
 * Open Graph tags, read by hand rather than by parsing the document.
 *
 * A preview needs four strings out of the head, the pages this runs against are the
 * ones most likely to have malformed markup further down, and DOMParser does not exist
 * in a service worker anyway. Kept apart from the worker so it can be tested directly.
 */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decode = (s = '') =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
    const key = name.toLowerCase()
    if (ENTITIES[key]) return ENTITIES[key]
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16))
    if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)))
    return m
  })

const META = /<meta\s+[^>]*>/gi
const attr = (tag, name) =>
  tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))

/**
 * Read the tags by hand rather than parsing the document. A preview needs four strings
 * out of the head, and the pages this runs against are the ones most likely to have
 * malformed markup further down. (DOMParser is not available in a worker anyway.)
 */
export function parseMeta(html, baseUrl) {
  const meta = {}
  for (const tag of html.match(META) ?? []) {
    const key = attr(tag, 'property') ?? attr(tag, 'name')
    const content = attr(tag, 'content')
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
