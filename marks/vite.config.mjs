import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.js',
        vite: {
          build: { outDir: 'dist-electron', rollupOptions: { external: ['electron'] } },
        },
      },
      preload: {
        input: 'electron/preload.mjs',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron'], output: { format: 'es' } },
          },
        },
      },
    }),
    renderer(),
  ],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
})
