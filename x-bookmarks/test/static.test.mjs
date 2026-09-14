/*
 * The three scripts that run inside a page are copied, not bundled, and nothing
 * imports them — so a syntax error in one of them passes the build, passes every other
 * test, and breaks the whole extension the moment Chrome tries to parse it.
 *
 * (A stray backtick inside the CSS template literal did exactly that.)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'static')

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  test(`${file} parses`, () => {
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ['--check', path.join(dir, file)], { stdio: 'pipe' }),
      `${file} is not valid JavaScript`
    )
  })
}

test('manifest.json is valid and points at files that exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const referenced = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((c) => c.js),
    ...Object.values(manifest.icons ?? {}),
  ]
  for (const rel of referenced) {
    assert.ok(fs.existsSync(path.join(dir, rel)), `manifest names ${rel}, which is not in static/`)
  }
})
