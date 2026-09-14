import { ImportIcon, BookmarkIcon } from './Icons.jsx'
import { SyncPanel } from './SyncPanel.jsx'

/** What the whole window is until a library exists. */
export function Welcome({ onImport, onFlash, dragging }) {
  return (
    <div className={`welcome${dragging ? ' is-dragging' : ''}`}>
      <div className="drag-strip" />
      <div className="welcome-body">
        <BookmarkIcon size={28} />
        <h1>No bookmarks yet</h1>
        <p>
          Pair the X Bookmarks Exporter extension below and they will arrive as it
          scrapes — or drop an exported JSON file anywhere in this window.
        </p>
        <button type="button" className="btn" onClick={onImport}>
          <ImportIcon size={15} />
          Choose a file
        </button>
        <div className="welcome-sync">
          <SyncPanel onFlash={onFlash} />
        </div>
      </div>
    </div>
  )
}
