import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api.js'
import { CopyIcon } from './Icons.jsx'

const when = (iso) => {
  if (!iso) return 'nothing yet'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  return new Date(iso).toLocaleString()
}

/**
 * Pairing, in the only shape that works without either side being able to see the
 * other: the app states an address and a secret, and you carry them across once.
 */
export function SyncPanel({ onFlash }) {
  const [shown, setShown] = useState(false)

  const { data } = useQuery({
    queryKey: ['sync'],
    queryFn: api.syncInfo,
    refetchInterval: 5_000,
  })

  if (!data) return null

  const endpoint = `http://127.0.0.1:${data.port}`

  const copy = (text, what) => {
    api.copy(text)
    onFlash?.(`${what} copied.`)
  }

  return (
    <div className="sync">
      <div className="sync-row">
        <span className={`dot${data.running ? ' is-on' : ''}`} />
        <span className="sync-state">
          {data.running ? 'Listening for the extension' : 'Not listening'}
        </span>
        <span className="sync-when">Last sync: {when(data.lastSync)}</span>
      </div>

      <p className="sync-how">
        In the extension&rsquo;s options, paste these two, then scrape. Bookmarks land
        here as they are found — no export, no import.
      </p>

      <label className="sync-field">
        <span>Address</span>
        <code>{endpoint}</code>
        <button type="button" className="tool" title="Copy" onClick={() => copy(endpoint, 'Address')}>
          <CopyIcon size={13} />
        </button>
      </label>

      <label className="sync-field">
        <span>Token</span>
        <code onClick={() => setShown((v) => !v)} title="Click to show or hide">
          {shown ? data.token : '•'.repeat(32)}
        </code>
        <button type="button" className="tool" title="Copy" onClick={() => copy(data.token, 'Token')}>
          <CopyIcon size={13} />
        </button>
      </label>

      <button
        type="button"
        className="sync-rotate"
        onClick={async () => {
          await api.rotateToken()
          onFlash?.('New token — paste it into the extension again.')
        }}
      >
        Replace token
      </button>
    </div>
  )
}
