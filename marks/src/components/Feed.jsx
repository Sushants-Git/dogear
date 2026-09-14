import { useEffect, useRef } from 'react'
import { Post } from './Post.jsx'

/**
 * A plain list. Search already caps what comes back at a few hundred rows, and
 * virtualised cards cannot scroll into view or hold focus normally — both of which
 * the arrow keys need.
 */
export function Feed({ results, terms, activeId, onSelect, onRemove, scrollRef }) {
  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  if (results.length === 0) {
    return (
      <div className="feed-empty">
        <p>Nothing matches that.</p>
        <p className="hint">
          Try <code>from:swyx</code>, <code>has:media</code>, <code>after:2024-01-01</code>,
          or <code>"an exact phrase"</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="feed" ref={scrollRef}>
      <div className="feed-inner">
        {results.map((row) => (
          <Post
            key={row.id}
            row={row}
            terms={terms}
            active={row.id === activeId}
            cardRef={row.id === activeId ? activeRef : null}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}
