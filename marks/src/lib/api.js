/** Everything the renderer knows about the library comes through here. */
const bridge = window.marks

export const api = {
  search: (params) => bridge.search(params),
  stats: () => bridge.stats(),
  importDialog: () => bridge.importDialog(),
  importPath: (filePath) => bridge.importPath(filePath),
  remove: (id) => bridge.remove(id),
  clear: () => bridge.clear(),
  libraryPath: () => bridge.libraryPath(),

  syncInfo: () => bridge.syncInfo(),
  rotateToken: () => bridge.rotateToken(),

  unfurl: (url) => bridge.unfurl(url),
  clearPreviews: () => bridge.clearPreviews(),

  openExternal: (url) => bridge.openExternal(url),
  copy: (text) => bridge.copy(text),
  pathForFile: (file) => bridge.pathForFile(file),

  onImported: (cb) => bridge.onImported(cb),
  onLibraryChanged: (cb) => bridge.onLibraryChanged(cb),
  onMenu: (cb) => bridge.onMenu(cb),
}
