import { contextBridge, ipcRenderer, webUtils } from 'electron'

const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args)
  if (!res?.ok) throw new Error(res?.error ?? 'Something went wrong')
  return res.data
}

const on = (channel, cb) => {
  ipcRenderer.on(channel, cb)
  return () => ipcRenderer.off(channel, cb)
}

const MENU_CHANNELS = ['menu:find', 'menu:open', 'menu:copy', 'menu:prev', 'menu:next']

contextBridge.exposeInMainWorld('marks', {
  search: (params) => call('library:search', params),
  stats: () => call('library:stats'),
  importDialog: () => call('library:import'),
  importPath: (filePath) => call('library:importPath', filePath),
  remove: (id) => call('library:remove', id),
  clear: () => call('library:clear'),
  libraryPath: () => call('library:path'),

  syncInfo: () => call('sync:info'),
  rotateToken: () => call('sync:rotate'),

  unfurl: (url) => call('unfurl', url),
  clearPreviews: () => call('unfurl:clear'),

  openExternal: (url) => call('open:external', url),
  copy: (text) => call('clipboard:write', text),

  // Electron strips File.path, so a dropped file's real path is read here.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return null }
  },

  onImported: (cb) => on('library:imported', (_e, result) => cb(result)),
  onLibraryChanged: (cb) => on('library:changed', (_e, result) => cb(result)),
  onMenu(cb) {
    const offs = MENU_CHANNELS.map((channel) => on(channel, () => cb(channel.slice(5))))
    return () => offs.forEach((off) => off())
  },
})
