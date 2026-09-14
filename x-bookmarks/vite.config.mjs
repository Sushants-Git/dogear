import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The three scripts that run inside a page — the network tap, the scraper and the
 * service worker — are copied rather than bundled. They import nothing, and content
 * scripts cannot be ES modules, which is exactly what a bundler wants to emit.
 */
function copyStatic() {
  return {
    name: 'copy-static',
    apply: 'build',
    closeBundle() {
      for (const file of fs.readdirSync('static')) {
        fs.copyFileSync(path.join('static', file), path.join('dist', file))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyStatic()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // An extension page's CSP is `script-src 'self'`, so nothing inline may be emitted.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        viewer: 'viewer.html',
        popup: 'popup.html',
      },
    },
  },
})
