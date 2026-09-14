import { memo, useState } from 'react'
import { SearchIcon, CloseIcon, ImportIcon } from './Icons.jsx'
import { SyncPanel } from './SyncPanel.jsx'

const SORTS = [
  { id: 'relevance', label: 'Best' },
  { id: 'saved', label: 'Saved' },
  { id: 'newest', label: 'New' },
  { id: 'oldest', label: 'Old' },
  { id: 'likes', label: 'Top' },
]

function TopBarInner({ query, onQuery, sort, onSort, total, searching, authors, onImport, onFlash, searchRef }) {
  const [syncOpen, setSyncOpen] = useState(false)

  return (
    <header className="top">
      <div className="drag-strip" />

      <div className="top-inner">
        <div className="search">
          <SearchIcon className="search-icon" size={16} />
          <input
            ref={searchRef}
            className="search-input"
            type="text"
            value={query}
            placeholder="Search bookmarks"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onQuery('')}
          />
          {query && (
            <button type="button" className="search-clear" title="Clear" onClick={() => onQuery('')}>
              <CloseIcon size={12} />
            </button>
          )}
        </div>

        <div className="top-row">
          <div className="segmented">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`segment${sort === s.id ? ' is-on' : ''}`}
                onClick={() => onSort(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <span className="count">
            {total.toLocaleString()} {searching ? 'found' : 'bookmarks'}
          </span>

          <button
            type="button"
            className={`top-sync${syncOpen ? ' is-on' : ''}`}
            onClick={() => setSyncOpen((v) => !v)}
            title="Sync with the browser extension"
          >
            Sync
          </button>

          <button type="button" className="top-import" onClick={onImport} title="Import an export — ⌘O">
            <ImportIcon size={15} />
          </button>
        </div>

        {/* The handles are the filter UI: one click writes `from:` into the query, so
            every way of narrowing the feed lives in the same one field. */}
        {syncOpen && <SyncPanel onFlash={onFlash} />}

        {!searching && authors.length > 0 && (
          <div className="chips">
            {authors.slice(0, 14).map((a) => (
              <button
                key={a.author}
                type="button"
                className="chip"
                onClick={() => onQuery(`from:${a.author} `)}
              >
                @{a.author}
                <span className="chip-count">{a.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}

export const TopBar = memo(TopBarInner)
