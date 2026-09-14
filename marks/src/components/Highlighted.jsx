import { splitOnTerms } from '../lib/format.js'

/**
 * Matched runs get painted, everything else is plain text. Done by splitting rather
 * than with innerHTML: the text is someone else's, and it is never worth handing it to
 * the parser just to paint a highlight.
 */
export function Highlighted({ text, terms }) {
  return splitOnTerms(text, terms).map((part, i) =>
    part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>
  )
}
