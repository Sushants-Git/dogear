/*
 * The sync bridge: a small HTTP listener on the loopback interface that the browser
 * extension pushes bookmarks into while it is scraping, so the app fills in live
 * rather than waiting for someone to export a file and import it again.
 *
 * Three things keep this from being a hole in the machine:
 *   - it binds to 127.0.0.1, so nothing off this computer can reach it at all;
 *   - writes need a token, generated on first run and shown in the app;
 *   - writes need a custom header, which forces a CORS preflight, so a random page
 *     you happen to have open cannot post to it even with the token guessed.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { app } from 'electron'
import * as library from './library.js'

const FIRST_PORT = 7654
const LAST_PORT = 7659
const MAX_BODY = 32 * 1024 * 1024

const dataDir = () => process.env.MARKS_DATA_DIR || app.getPath('userData')
const tokenFile = () => path.join(dataDir(), 'sync.json')

let server = null
let port = null
let token = null
let lastSync = null
let onImported = () => {}

/** Written once and kept, so pairing the extension is a thing you do a single time. */
function ensureToken() {
  if (token) return token
  try {
    token = JSON.parse(fs.readFileSync(tokenFile(), 'utf8')).token
  } catch {
    token = null
  }
  if (!token) {
    token = crypto.randomBytes(16).toString('hex')
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.writeFileSync(tokenFile(), JSON.stringify({ token }))
  }
  return token
}

const isExtension = (origin) => !origin || /^chrome-extension:\/\/[a-p]+$/.test(origin)

/**
 * Constant time, so the token cannot be recovered a byte at a time by watching how long
 * a rejection takes. The listener is on loopback and the token is 128 bits, which makes
 * this close to theatre — but it is two lines, and the alternative is a comparison that
 * is wrong in a way people write papers about.
 */
function sameToken(candidate) {
  if (typeof candidate !== 'string') return false
  const want = Buffer.from(ensureToken())
  const got = Buffer.from(candidate)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

function cors(req, res) {
  const origin = req.headers.origin
  if (!isExtension(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-marks-token')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Max-Age', '86400')
  res.setHeader('Vary', 'Origin')
  return true
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Too much at once'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handler(req, res) {
  if (!cors(req, res)) return send(res, 403, { error: 'Not allowed' })
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const { pathname } = new URL(req.url, 'http://127.0.0.1')

  // Unauthenticated on purpose: the extension needs a way to notice the app is running
  // before it has been paired, and this says nothing a caller did not already know.
  if (req.method === 'GET' && pathname === '/ping') {
    return send(res, 200, { app: 'marks', ok: true, paired: Boolean(token), lastSync })
  }

  if (req.method === 'POST' && pathname === '/bookmarks') {
    if (!sameToken(req.headers['x-marks-token'])) {
      return send(res, 401, { error: 'Bad or missing token' })
    }
    try {
      const body = JSON.parse(await readBody(req))
      const rows = Array.isArray(body) ? body : body?.bookmarks
      if (!Array.isArray(rows)) return send(res, 400, { error: 'Expected a bookmarks array' })

      const result = library.importRows(rows, 'extension')
      lastSync = new Date().toISOString()
      onImported(result)
      return send(res, 200, { ...result, lastSync })
    } catch (error) {
      return send(res, 400, { error: error?.message ?? 'Could not read that' })
    }
  }

  return send(res, 404, { error: 'No such thing' })
}

/** Walks up the port range, because the first one is often already somebody else's. */
function listen(candidate) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler)
    s.once('error', (error) => {
      s.close()
      if (error.code === 'EADDRINUSE' && candidate < LAST_PORT) {
        listen(candidate + 1).then(resolve, reject)
      } else {
        reject(error)
      }
    })
    s.listen(candidate, '127.0.0.1', () => resolve({ server: s, port: candidate }))
  })
}

export async function start(notify) {
  if (server) return info()
  onImported = notify ?? (() => {})
  ensureToken()
  const started = await listen(FIRST_PORT)
  server = started.server
  port = started.port
  return info()
}

export function stop() {
  server?.close()
  server = null
  port = null
}

export const info = () => ({ running: Boolean(server), port, token: ensureToken(), lastSync })

/** Invalidates the paired extension by minting a new token. */
export function rotate() {
  token = crypto.randomBytes(16).toString('hex')
  fs.writeFileSync(tokenFile(), JSON.stringify({ token }))
  return info()
}
