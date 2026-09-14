import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.js'
import { hostOf } from '../lib/format.js'
import { useInView } from '../lib/useInView.js'
import { LinkIcon } from './Icons.jsx'

/**
 * A link with whatever the page says about itself. The fetch happens in the main
 * process and the image is served from disk, so this component never touches the
 * linked site — see `electron/unfurl.js`.
 */
export function LinkCard({ url }) {
  const [ref, inView] = useInView()

  const { data } = useQuery({
    queryKey: ['unfurl', url],
    queryFn: () => api.unfurl(url),
    enabled: inView,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  })

  const preview = data && !data.error ? data : null
  const host = hostOf(url)

  return (
    <button
      ref={ref}
      type="button"
      className={`link-card${preview?.image ? ' has-image' : ''}`}
      onClick={() => api.openExternal(url)}
      title={url}
    >
      {preview?.image && (
        <img className="link-thumb" src={`marks://thumb/${preview.image}`} alt="" loading="lazy" />
      )}
      <span className="link-text">
        <span className="link-host">
          <LinkIcon size={12} />
          {preview?.site || host}
        </span>
        {/* Until the preview lands, the url stands in for the title, so the card is
            the same shape before and after and nothing jumps as it fills in. */}
        <span className="link-title">{preview?.title || url}</span>
        {preview?.description && <span className="link-desc">{preview.description}</span>}
      </span>
    </button>
  )
}
