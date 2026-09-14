import { memo, useEffect, useRef, useState } from 'react'
import { Highlighted } from './Highlighted.jsx'
import { LinkCard } from './LinkCard.jsx'
import {
  ExternalIcon, CopyIcon, TrashIcon, QuoteIcon,
  HeartIcon, RepostIcon, ReplyIcon, BookmarkIcon,
} from './Icons.jsx'
import { compactNumber, shortDate, stripTrailingLinks } from '../lib/format.js'
import { api } from '../lib/api.js'

function Metric({ icon: Glyph, value, label }) {
  const shown = compactNumber(value)
  if (shown === null) return null
  return (
    <span className="metric" title={`${value.toLocaleString()} ${label}`}>
      <Glyph size={13} />
      {shown}
    </span>
  )
}

function Media({ media }) {
  if (!media.length) return null
  return (
    <div className={`media media-${Math.min(media.length, 4)}`}>
      {media.map((m, i) =>
        m.type === 'photo' ? (
          // Straight from X's CDN. Nothing is cached locally, so a post whose media has
          // since been taken down shows a gap rather than a stale copy.
          <img key={i} src={m.url} alt="" loading="lazy" />
        ) : (
          <video key={i} src={m.url} controls preload="metadata" />
        )
      )}
    </div>
  )
}

/**
 * Long posts are clamped so one thread does not push everything else off the screen.
 * Whether the clamp is doing anything can only be answered by measuring, so the toggle
 * appears once we know it is.
 */
function Body({ text, terms }) {
  const ref = useRef(null)
  const [clamped, setClamped] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el) setClamped(el.scrollHeight > el.clientHeight + 2)
  }, [text])

  return (
    <>
      <div ref={ref} className={`post-body${open ? ' is-open' : ''}`}>
        <Highlighted text={stripTrailingLinks(text)} terms={terms} />
      </div>
      {clamped && (
        <button type="button" className="post-more" onClick={() => setOpen((v) => !v)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

/**
 * The avatar, at the 400x400 crop the scraper asks X for rather than the 48px one it
 * volunteers. Rows collected before that was captured have none, and an initial stands
 * in — a broken image is worse than no image.
 */
function Avatar({ row }) {
  const [dead, setDead] = useState(false)

  if (!row.avatar || dead) {
    return (
      <span className="card-avatar card-avatar-blank" aria-hidden="true">
        {(row.author_name || row.author || '?').trim().charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      className="card-avatar"
      src={row.avatar}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => setDead(true)}
    />
  )
}

/** The card is the viewer: a bookmark is short enough to read where it sits. */
function PostInner({ row, terms, active, onSelect, onRemove, cardRef }) {
  const open = () => api.openExternal(row.url)

  return (
    <article
      ref={cardRef}
      className={`card${active ? ' is-active' : ''}`}
      onMouseDown={() => onSelect(row.id)}
    >
      <header className="card-head">
        <button
          type="button"
          className="card-who"
          onClick={() => api.openExternal(`https://x.com/${row.author}`)}
          title={`Open @${row.author} on X`}
        >
          <Avatar row={row} />
          <span className="card-who-text">
            <span className="card-name">{row.author_name || `@${row.author}`}</span>
            <span className="card-handle">
              <Highlighted text={`@${row.author}`} terms={terms} />
            </span>
          </span>
        </button>

        {/* The date is the permalink — the most obvious thing on a post to click when
            what you want is the post itself. */}
        <button type="button" className="card-date" onClick={open} title={row.url}>
          {shortDate(row.ts)}
        </button>
      </header>

      <Body text={row.text} terms={terms} />

      <Media media={row.media} />

      {row.links.map((link) => (
        <LinkCard key={link} url={link} />
      ))}

      {row.quoted_url && (
        <button type="button" className="card-quote" onClick={() => api.openExternal(row.quoted_url)}>
          <QuoteIcon size={13} />
          Quotes {row.quoted_url.replace('https://x.com/', '')}
        </button>
      )}

      <footer className="card-foot">
        <span className="metrics">
          <Metric icon={ReplyIcon} value={row.replies} label="replies" />
          <Metric icon={RepostIcon} value={row.reposts} label="reposts" />
          <Metric icon={HeartIcon} value={row.likes} label="likes" />
          <Metric icon={BookmarkIcon} value={row.bookmarks} label="bookmarks" />
        </span>

        <span className="card-tools">
          <button type="button" className="tool" title="Copy link — ⌘⇧C" onClick={() => api.copy(row.url)}>
            <CopyIcon size={14} />
          </button>
          <button
            type="button"
            className="tool tool-danger"
            title="Remove from this library — the bookmark on X is untouched"
            onClick={() => onRemove(row.id)}
          >
            <TrashIcon size={14} />
          </button>
          {/* Always visible, and worded: getting back to the post is the whole point
              of having kept it. */}
          <button type="button" className="card-open" onClick={open} title={row.url}>
            Open on X
            <ExternalIcon size={13} />
          </button>
        </span>
      </footer>
    </article>
  )
}

export const Post = memo(PostInner)
