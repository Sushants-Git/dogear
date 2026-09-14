import { useEffect, useState } from 'react'
import { loadRows, onRowsChanged } from '../lib/store.js'
import { exportRows } from '../lib/export.js'
import { scrapeNow, scrapeStatus, stopScrape } from '../lib/browser.js'
import { BookmarkIcon, PlayIcon, StopIcon, ExternalIcon } from '../components/Icons.jsx'

export function App() {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState(null)

  useEffect(() => {
    loadRows().then(setRows)
    return onRowsChanged(setRows)
  }, [])

  useEffect(() => {
    const tick = () => scrapeStatus().then(setStatus)
    tick()
    const timer = setInterval(tick, 700)
    return () => clearInterval(timer)
  }, [])

  const openLibrary = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') })
    window.close()
  }

  const running = Boolean(status?.running)
  const onPage = Boolean(status)

  return (
    <div className="popup">
      <div className="popup-count">
        <span className="popup-number">{rows.length.toLocaleString()}</span>
        <span className="popup-label">bookmarks</span>
      </div>

      <p className="popup-status">
        {running
          ? status.status
          : onPage
            ? 'Ready to scrape this page.'
            : 'Open your bookmarks page to scrape.'}
      </p>

      <button type="button" className="btn popup-primary" onClick={openLibrary}>
        <BookmarkIcon size={15} />
        Open library
      </button>

      {running ? (
        <button type="button" className="btn-quiet popup-wide" onClick={stopScrape}>
          <StopIcon size={15} />
          Stop scraping
        </button>
      ) : (
        <button type="button" className="btn-quiet popup-wide" onClick={scrapeNow}>
          {onPage ? <PlayIcon size={15} /> : <ExternalIcon size={15} />}
          {onPage ? 'Start scraping' : 'Open bookmarks page'}
        </button>
      )}

      <div className="popup-exports">
        {['json', 'csv', 'md'].map((format) => (
          <button
            key={format}
            type="button"
            className="popup-export"
            disabled={!rows.length}
            onClick={() => exportRows(rows, format)}
          >
            {format.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="popup-hint">Keep the bookmarks tab in front while it runs.</p>
    </div>
  )
}
