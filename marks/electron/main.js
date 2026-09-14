import {
  app, BrowserWindow, Menu, ipcMain, shell, dialog, clipboard, protocol, net,
} from 'electron'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import * as library from './library.js'
import * as search from './search.js'
import * as unfurl from './unfurl.js'
import * as bridge from './bridge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER = path.join(__dirname, '../dist')

let win = null

// One theme, stated once in `src/styles/tokens.css`. The window has to be painted
// before the renderer exists, so the ground colour is repeated here and nowhere else.
const PAGE = '#ffffff'

/** Served over app:// rather than file://, so the page has a real origin. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  // marks://thumb/<file> — downloaded link-preview images. Serving them from here
  // rather than from the linked site means the page never reaches out to a third
  // party, and a card still draws offline.
  {
    scheme: 'marks',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function registerProtocols() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    const target = path.join(RENDERER, rel)
    // `startsWith` alone would also accept a sibling whose name merely begins with the
    // renderer's, so ask path.relative whether the result is genuinely underneath.
    const inside = path.relative(RENDERER, target)
    if (inside.startsWith('..') || path.isAbsolute(inside)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })

  protocol.handle('marks', (request) => {
    const { hostname, pathname } = new URL(request.url)
    const name = decodeURIComponent(pathname.replace(/^\//, ''))
    // Only ever a bare filename out of the thumbnail folder.
    if (hostname !== 'thumb' || !/^[a-f0-9]{20}\.[a-z]{3,4}$/.test(name)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(path.join(unfurl.thumbDir(), name)).toString())
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 500,
    show: false,
    backgroundColor: PAGE,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // required for the ESM preload
    },
  })

  win.once('ready-to-show', () => win.show())

  // A bookmark's whole point is the post it points at; those open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadURL('app://marks/index.html')
}

const send = (channel, ...args) => win?.webContents.send(channel, ...args)

/* ------------------------------------------------------------------- import */

async function pickAndImport() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import bookmarks',
    filters: [{ name: 'Bookmark export', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return null
  return library.importFile(filePaths[0])
}

/* -------------------------------------------------------------------- menu */

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Bookmarks…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await pickAndImport()
            if (result) send('library:imported', result)
          },
        },
        {
          label: 'Reveal Library in Finder',
          click: () => shell.showItemInFolder(library.libraryPath()),
        },
        {
          label: 'Clear Link Previews',
          click: () => {
            unfurl.clearPreviews()
            win?.webContents.reload()
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => send('menu:find') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Open in X', accelerator: 'CmdOrCtrl+Return', click: () => send('menu:open') },
        { label: 'Copy Link', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('menu:copy') },
        { type: 'separator' },
        { label: 'Previous Result', accelerator: 'CmdOrCtrl+Up', click: () => send('menu:prev') },
        { label: 'Next Result', accelerator: 'CmdOrCtrl+Down', click: () => send('menu:next') },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* --------------------------------------------------------------------- ipc */

const handle = (channel, fn) =>
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) }
    }
  })

handle('library:search', (params) => search.search(params))
handle('library:stats', () => search.stats())
handle('library:import', () => pickAndImport())
handle('library:importPath', (filePath) => library.importFile(filePath))
handle('library:remove', (id) => library.remove(id))
handle('library:clear', () => library.clear())
handle('library:path', () => library.libraryPath())
handle('unfurl', (url) => unfurl.unfurl(url))
handle('sync:info', () => bridge.info())
handle('sync:rotate', () => bridge.rotate())
handle('unfurl:clear', () => unfurl.clearPreviews())
handle('open:external', (url) => {
  if (!/^https?:/.test(url)) throw new Error('Refusing to open that.')
  return shell.openExternal(url)
})
handle('clipboard:write', (text) => {
  clipboard.writeText(String(text))
  return true
})

app.whenReady().then(() => {
  registerProtocols()
  buildMenu()
  createWindow()

  // The extension pushes here while it scrapes; the renderer is told so the feed can
  // fill in without anyone asking it to.
  bridge
    .start((result) => send('library:changed', result))
    .catch((error) => console.error('sync bridge did not start:', error.message))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => bridge.stop())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
