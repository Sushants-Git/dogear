import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar.jsx'
import { Feed } from '../components/Feed.jsx'
import { Welcome } from '../components/Welcome.jsx'
import { importRows, loadRows, onRowsChanged, removeRow, rowsFrom } from '../lib/store.js'
import { index, search, stats } from '../lib/search.js'
import { exportRows } from '../lib/export.js'
import {
  askPreviewAccess, dropPreviewAccess, hasPreviewAccess, openUrl, scrapeNow, scrapeStatus,
} from '../lib/browser.js'

/** One beat behind the field, so a fast typist causes one search and not eleven. */
function useDebounced(value, ms = 120) {
  const [held, setHeld] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setHeld(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return held
}

export function App() {
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [activeId, setActiveId] = useState(null)
  const [previews, setPreviews] = useState(false)
  const [scraping, setScraping] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState(null)

  const searchRef = useRef(null)
  const fileRef = useRef(null)

  const debounced = useDebounced(query)

  const flash = useCallback((message) => {
    setNotice(message)
    setTimeout(() => setNotice(null), 2600)
  }, [])

  // The scraper writes to the same store this page reads, so there is nothing to sync:
  // a run in another tab simply appears here.
  useEffect(() => {
    loadRows().then(setRows)
    return onRowsChanged(setRows)
  }, [])

  useEffect(() => {
    hasPreviewAccess().then(setPreviews)
  }, [])

  // While a scrape is running, say so and keep saying how far along it is.
  useEffect(() => {
    let live = true
    const tick = async () => {
      const status = await scrapeStatus()
      if (live) setScraping(status?.running ? status.status : null)
    }
    tick()
    const timer = setInterval(tick, 1500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  const entries = useMemo(() => index(rows ?? []), [rows])
  const { results, terms, total } = useMemo(
    () => search(entries, { query: debounced, sort }),
    [entries, debounced, sort]
  )
  const summary = useMemo(() => stats(rows ?? []), [rows])
  const active = useMemo(() => results.find((r) => r.id === activeId) ?? null, [results, activeId])
  const searching = debounced.trim().length > 0

  // Whatever is on top is what you meant to be looking at, so the selection follows the
  // results rather than stranding you on a row no longer in them.
  useEffect(() => {
    if (results.length === 0) setActiveId(null)
    else if (!results.some((r) => r.id === activeId)) setActiveId(results[0].id)
  }, [results, activeId])

  const step = useCallback(
    (delta) => {
      if (!results.length) return
      const at = results.findIndex((r) => r.id === activeId)
      const next = Math.min(results.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))
      setActiveId(results[next].id)
    },
    [results, activeId]
  )

  /* ------------------------------------------------------------- previews */

  const togglePreviews = useCallback(async () => {
    if (previews) {
      await dropPreviewAccess()
      setPreviews(false)
      return flash('Link previews off.')
    }
    // Chrome only grants this from a real click, which is why it hangs off the button.
    const granted = await askPreviewAccess()
    setPreviews(granted)
    flash(granted ? 'Link previews on.' : 'Previews need permission to read linked pages.')
  }, [previews, flash])

  /* -------------------------------------------------------------- import */

  const readFile = useCallback(
    async (file) => {
      try {
        const parsed = JSON.parse(await file.text())
        const incoming = rowsFrom(parsed)
        if (!incoming.length) throw new Error('That file has no bookmarks in it.')
        const result = await importRows(incoming)
        setRows(await loadRows())
        flash(`Imported ${result.added} new, updated ${result.updated}.`)
      } catch (error) {
        flash(error.message)
      }
    },
    [flash]
  )

  useEffect(() => {
    const over = (e) => {
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) readFile(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [readFile])

  /* ----------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (event) => {
      const typing = event.target === searchRef.current
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        step(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        step(-1)
      } else if (event.key === 'Enter' && active) {
        openUrl(active.url)
      } else if ((event.key === '/' || (event.key === 'f' && (event.metaKey || event.ctrlKey))) && !typing) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, step])

  const onExport = useCallback(() => {
    if (!rows?.length) return flash('Nothing to export yet.')
    exportRows(rows, 'json')
    flash('Exported as JSON.')
  }, [rows, flash])

  if (rows === null) return <div className="boot" />

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) readFile(file)
      }}
    />
  )

  if (rows.length === 0) {
    return (
      <>
        <Welcome onScrape={scrapeNow} onImport={() => fileRef.current?.click()} dragging={dragging} />
        {picker}
        {notice && <div className="notice">{notice}</div>}
      </>
    )
  }

  return (
    <div className={`shell${dragging ? ' is-dragging' : ''}`}>
      <TopBar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        total={total}
        searching={searching}
        authors={summary.authors}
        scraping={scraping}
        previews={previews}
        onTogglePreviews={togglePreviews}
        onScrape={scrapeNow}
        onImport={() => fileRef.current?.click()}
        onExport={onExport}
        searchRef={searchRef}
      />
      <Feed
        results={results}
        terms={terms}
        activeId={activeId}
        previews={previews}
        onSelect={setActiveId}
        onRemove={async (id) => {
          // Hand the selection to the neighbour before the row goes. Otherwise the rule
          // above — selection follows the results — finds the active row missing and
          // re-points it at results[0], and the feed scrolls to the top. Fine when a
          // search changed what is on screen; maddening when you deleted one card out
          // of a thousand and lost your place.
          const at = results.findIndex((r) => r.id === id)
          if (at !== -1) setActiveId(results[at + 1]?.id ?? results[at - 1]?.id ?? null)

          await removeRow(id)
          setRows(await loadRows())
        }}
      />
      {picker}
      {notice && <div className="notice">{notice}</div>}
    </div>
  )
}
