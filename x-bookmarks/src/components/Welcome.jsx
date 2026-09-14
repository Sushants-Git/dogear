import { BookmarkIcon, ImportIcon, RefreshIcon } from './Icons.jsx'

/** What the whole page is until something has been scraped. */
export function Welcome({ onScrape, onImport, dragging }) {
  return (
    <div className={`welcome${dragging ? ' is-dragging' : ''}`}>
      <div className="welcome-body">
        <BookmarkIcon size={28} />
        <h1>No bookmarks yet</h1>
        <p>
          Scraping opens your bookmarks page and reads it as it scrolls. Everything
          lands here as it is found — this page and the scraper share one library.
        </p>
        <div className="welcome-actions">
          <button type="button" className="btn" onClick={onScrape}>
            <RefreshIcon size={15} />
            Scrape my bookmarks
          </button>
          <button type="button" className="btn-quiet" onClick={onImport}>
            <ImportIcon size={15} />
            Import a JSON export
          </button>
        </div>
      </div>
    </div>
  )
}
