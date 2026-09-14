/*
 * Exercises import + search outside Electron. Run with: node --test test/
 *
 * `MARKS_DATA_DIR` points the library at a scratch folder, and `electron` is stubbed
 * by node's module mocking so `library.js` can be imported at all.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marks-test-'))
process.env.MARKS_DATA_DIR = dir

const { register } = await import('node:module')
register(new URL('./electron-stub.mjs', import.meta.url))

const library = await import('../electron/library.js')
const search = await import('../electron/search.js')

const post = (over) => ({
  id: '1700000000000000000',
  url: 'https://x.com/a/status/1700000000000000000',
  author: 'a', author_name: 'A', created_at: 'Wed Sep 06 12:00:00 +0000 2023',
  text: 'a post', likes: 0, media: [], links: [], ...over,
})

const FIXTURE = [
  post({ id: '1700000000000000001', sort_index: '1867000000000000030', author: 'swyx', author_name: 'Shawn', text: 'Notes on building an AI agent harness', likes: 400 }),
  post({ id: '1700000000000000002', sort_index: '986000000000000000', author: 'dan_abramov', author_name: 'Dan', text: 'react hooks are just closures, agent-free', likes: 9000,
         media: [{ type: 'photo', url: 'https://pbs.twimg.com/x.jpg' }] }),
  post({ id: '1500000000000000003', sort_index: '1867000000000000040', author: 'swyx', author_name: 'Shawn', text: 'An older post about design systems', likes: 20,
         created_at: 'Tue Mar 01 12:00:00 +0000 2022',
         links: ['https://example.com/design'] }),
  post({ id: '1700000000000000004', author: 'rauchg', author_name: 'Guillermo', text: 'video demo', likes: 100,
         media: [{ type: 'video', url: 'https://video.twimg.com/v.mp4' }], quoted_url: 'https://x.com/a/status/9' }),
]

const fixturePath = path.join(dir, 'export.json')
fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE))

test('import adds rows and is idempotent', () => {
  const first = library.importFile(fixturePath)
  assert.equal(first.added, 4)
  assert.equal(first.updated, 0)

  const second = library.importFile(fixturePath)
  assert.equal(second.added, 0, 're-importing the same export must not duplicate')
  assert.equal(second.updated, 4)
  assert.equal(second.total, 4)
})

test('import skips junk rows instead of failing the whole file', () => {
  const junkPath = path.join(dir, 'junk.json')
  fs.writeFileSync(junkPath, JSON.stringify([null, { id: 'not-an-id' }, post({ id: '1700000000000000005' })]))
  const res = library.importFile(junkPath)
  assert.equal(res.skipped, 2)
  assert.equal(res.added, 1)
  library.remove('1700000000000000005')
})

test('a row with no created_at falls back to the id\'s snowflake time', () => {
  const p = path.join(dir, 'nodate.json')
  fs.writeFileSync(p, JSON.stringify([post({ id: '1700000000000000005', created_at: null })]))
  library.importFile(p)
  const row = search.search({ query: 'from:a' }).results[0]
  assert.equal(new Date(row.ts).getUTCFullYear(), 2023)
  library.remove('1700000000000000005')
})

test('free text matches across body and author, all terms required', () => {
  assert.equal(search.search({ query: 'agent' }).total, 2)
  assert.equal(search.search({ query: 'agent harness' }).total, 1)
  assert.equal(search.search({ query: 'agent nonexistentword' }).total, 0)
})

test('author matches outrank a body mention', () => {
  const { results } = search.search({ query: 'swyx' })
  assert.equal(results[0].author, 'swyx')
})

test('quoted phrases stay together', () => {
  assert.equal(search.search({ query: '"design systems"' }).total, 1)
  assert.equal(search.search({ query: '"systems design"' }).total, 0)
})

test('from: filters, and -from: excludes', () => {
  assert.equal(search.search({ query: 'from:swyx' }).total, 2)
  assert.equal(search.search({ query: '-from:swyx' }).total, 2)
  assert.equal(search.search({ query: 'from:swyx design' }).total, 1)
})

test('has: and is: filters', () => {
  assert.equal(search.search({ query: 'has:media' }).total, 2)
  assert.equal(search.search({ query: 'has:video' }).total, 1)
  assert.equal(search.search({ query: 'has:links' }).total, 1)
  assert.equal(search.search({ query: 'is:quote' }).total, 1)
})

test('date and likes filters', () => {
  assert.equal(search.search({ query: 'after:2023-01-01' }).total, 3)
  assert.equal(search.search({ query: 'before:2023-01-01' }).total, 1)
  assert.equal(search.search({ query: 'min:500' }).total, 1)
})

test('an empty query lists everything newest-first', () => {
  const { results, total } = search.search({ query: '' })
  assert.equal(total, 4)
  assert.ok(results[0].ts >= results[1].ts)
})

test('sorts', () => {
  assert.equal(search.search({ query: '', sort: 'likes' }).results[0].author, 'dan_abramov')
  assert.equal(search.search({ query: '', sort: 'oldest' }).results[0].author, 'swyx')
})

test('saved order follows X\'s sort_index, longest-then-lexicographic', () => {
  const ids = search.search({ query: '', sort: 'saved' }).results.map((r) => r.id)
  assert.deepEqual(ids, [
    '1500000000000000003', // an old post, bookmarked most recently
    '1700000000000000001',
    '1700000000000000002', // a shorter sort_index is a smaller one
    '1700000000000000004', // no sort_index at all — falls to the end
  ])
})

test('re-importing an export made before sort_index existed does not blank it', () => {
  library.importRows([{ id: '1500000000000000003', author: 'swyx', text: 'An older post about design systems' }], 'old.json')
  assert.equal(search.search({ query: '', sort: 'saved' }).results[0].id, '1500000000000000003')
})

test('terms come back for highlighting', () => {
  assert.deepEqual(search.search({ query: 'from:swyx Design' }).terms, ['design'])
})

test('removing a row drops it from search immediately', () => {
  library.remove('1700000000000000004')
  assert.equal(search.search({ query: 'is:quote' }).total, 0)
  assert.equal(search.search({ query: '' }).total, 3)
})

test('stats summarise the library', () => {
  const s = search.stats()
  assert.equal(s.total, 3)
  assert.equal(s.authorCount, 2)
  assert.equal(s.authors[0].author, 'swyx')
  assert.equal(s.authors[0].count, 2)
  assert.equal(s.withMedia, 1)
})
