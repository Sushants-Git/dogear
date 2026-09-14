/** Lets `import { app } from 'electron'` resolve outside Electron. */
export async function resolve(specifier, context, next) {
  if (specifier === 'electron') {
    return { url: new URL('./electron-shim.mjs', import.meta.url).href, shortCircuit: true }
  }
  return next(specifier, context)
}
