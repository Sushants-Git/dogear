import { useEffect, useState } from 'react'
import { openUrl, unfurl } from '../lib/browser.js'
import { hostOf } from '../lib/format.js'
import { useInView } from '../lib/useInView.js'
import { LinkIcon } from './Icons.jsx'

/**
 * A link with whatever the page says about itself. The fetch happens in the service
 * worker, which caches the result and shrinks the image before storing it.
 */
export function LinkCard({ url, previews }) {
  const [ref, inView] = useInView()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!inView || !previews) return
    let live = true
    unfurl(url)
      .then((entry) => live && setData(entry))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [inView, previews, url])

  const preview = data && !data.error ? data : null

  return (
    <button
      ref={ref}
      type="button"
      className={`link-card${preview?.image ? ' has-image' : ''}`}
      onClick={() => openUrl(url)}
      title={url}
    >
      {preview?.image && <img className="link-thumb" src={preview.image} alt="" loading="lazy" />}
      <span className="link-text">
        <span className="link-host">
          <LinkIcon size={12} />
          {preview?.site || hostOf(url)}
        </span>
        {/* Until the preview lands, the url stands in for the title, so the card is the
            same shape before and after and nothing jumps as it fills in. */}
        <span className="link-title">{preview?.title || url}</span>
        {preview?.description && <span className="link-desc">{preview.description}</span>}
      </span>
    </button>
  )
}
