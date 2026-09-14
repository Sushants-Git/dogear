import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TopBar } from './components/TopBar.jsx'
import { Feed } from './components/Feed.jsx'
import { Welcome } from './components/Welcome.jsx'
import { useImport, useImportPath, useRemove, useSearch, useStats } from './lib/queries.js'
import { api } from './lib/api.js'

/**
 * Typing is faster than searching, and searching touches every row. Holding the query
 * one beat behind the field means a fast typist causes one search, not eleven.
 */
function useDebounced(value, ms = 140) {
  const [held, setHeld] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setHeld(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return held
}

export function App() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [activeId, setActiveId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState(null)

  const searchRef = useRef(null)
  const feedRef = useRef(null)
  const qc = useQueryClient()

  const debounced = useDebounced(query)
  const stats = useStats()
  const { data } = useSearch(debounced, sort)

  const importDialog = useImport()
  const importPath = useImportPath()
  const remove = useRemove()

  const results = data?.results ?? []
  const terms = data?.terms ?? []
  const searching = debounced.trim().length > 0

  const active = useMemo(
    () => results.find((r) => r.id === activeId) ?? null,
    [results, activeId]
  )

  // Whatever is on top is what you meant to be looking at, so the selection follows
  // the results rather than stranding you on a row that is no longer in them.
  useEffect(() => {
    if (results.length === 0) {
      setActiveId(null)
    } else if (!results.some((r) => r.id === activeId)) {
      setActiveId(results[0].id)
    }
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

  const flash = useCallback((message) => {
    setNotice(message)
    setTimeout(() => setNotice(null), 2600)
  }, [])

  const runImport = useCallback(async () => {
    const result = await importDialog.mutateAsync().catch((e) => {
      flash(e.message)
      return null
    })
    if (result) flash(`Imported ${result.added} new, updated ${result.updated}.`)
  }, [importDialog, flash])

  // The extension pushes while it scrapes, so the feed has to refresh itself.
  useEffect(() => {
    return api.onLibraryChanged((result) => {
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['search'] })
      if (result?.added) flash(`Synced ${result.added} new from the extension.`)
    })
  }, [qc, flash])

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    return api.onMenu((action) => {
      if (action === 'find') {
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (action === 'open' && active) {
        api.openExternal(active.url)
      } else if (action === 'copy' && active) {
        api.copy(active.url)
        flash('Link copied.')
      } else if (action === 'next') {
        step(1)
      } else if (action === 'prev') {
        step(-1)
      }
    })
  }, [active, step, flash])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        step(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        step(-1)
      } else if (event.key === 'Enter' && active) {
        api.openExternal(active.url)
      } else if (event.key === '/' && event.target !== searchRef.current) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, step])

  /* ------------------------------------------------------------ drag-drop */

  useEffect(() => {
    const over = (e) => {
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = async (e) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      const filePath = api.pathForFile(file)
      if (!filePath) return flash('Could not read that file.')
      try {
        const result = await importPath.mutateAsync(filePath)
        flash(`Imported ${result.added} new, updated ${result.updated}.`)
      } catch (error) {
        flash(error.message)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [importPath, flash])

  if (stats.isLoading) return <div className="boot" />
  if ((stats.data?.total ?? 0) === 0) {
    return (
      <>
        <Welcome onImport={runImport} onFlash={flash} dragging={dragging} />
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
        total={data?.total ?? 0}
        searching={searching}
        authors={stats.data?.authors ?? []}
        onImport={runImport}
        onFlash={flash}
        searchRef={searchRef}
      />
      <Feed
        results={results}
        terms={terms}
        activeId={activeId}
        onSelect={setActiveId}
        onRemove={(id) => remove.mutate(id)}
        scrollRef={feedRef}
      />
      {notice && <div className="notice">{notice}</div>}
    </div>
  )
}
