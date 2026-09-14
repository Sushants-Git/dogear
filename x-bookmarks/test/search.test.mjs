/* Search and normalisation. Pure functions — no browser, no extension. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { coerce } from '../src/lib/store.js'
import { index, parse, search, stats } from '../src/lib/search.js'

const post = (over) => ({
  id: '1700000000000000000', author: 'a', author_name: 'A',
  created_at: 'Wed Sep 06 12:00:00 +0000 2023', text: 'a post',
  likes: 0, media: [], links: [], ...over,
})

const ROWS = [
  post({ id: '1700000000000000001', sort_index: '1867000000000000030', author: 'swyx', author_name: 'Shawn', text: 'Notes on building an AI agent harness', likes: 400 }),
  post({ id: '1700000000000000002', sort_index: '986000000000000000', author: 'dan_abramov', author_name: 'Dan', text: 'react hooks are just closures, agent-free', likes: 9000, media: [{ type: 'photo', url: 'https://pbs.twimg.com/x.jpg' }] }),
  post({ id: '1500000000000000003', sort_index: '1867000000000000040', author: 'swyx', author_name: 'Shawn', text: 'An older post about design systems', likes: 20, created_at: 'Tue Mar 01 12:00:00 +0000 2022', links: ['https://example.com/design'] }),
  post({ id: '1700000000000000004', author: 'rauchg', author_name: 'Guillermo', text: 'video demo', likes: 100, media: [{ type: 'video', url: 'https://video.twimg.com/v.mp4' }], quoted_url: 'https://x.com/a/status/9' }),
].map(coerce)

const entries = index(ROWS)
const find = (query, sort) => search(entries, { query, sort })

test('coerce rejects junk and keeps real rows', () => {
  assert.equal(coerce(null), null)
  assert.equal(coerce({ id: 'not-an-id' }), null)
  assert.equal(coerce({ id: '123456789012345678' }).url, 'https://x.com/i/status/123456789012345678')
})

test('a row with no created_at falls back to the snowflake time in its id', () => {
  const row = coerce({ id: '1700000000000000005', author: 'a' })
  assert.equal(new Date(row.ts).getUTCFullYear(), 2023)
})

test('free text matches across body and author, all terms required', () => {
  assert.equal(find('agent').total, 2)
  assert.equal(find('agent harness').total, 1)
  assert.equal(find('agent nonexistentword').total, 0)
})

test('author matches outrank a body mention', () => {
  assert.equal(find('swyx').results[0].author, 'swyx')
})

test('quoted phrases stay together', () => {
  assert.equal(find('"design systems"').total, 1)
  assert.equal(find('"systems design"').total, 0)
})

test('from: filters, and -from: excludes', () => {
  assert.equal(find('from:swyx').total, 2)
  assert.equal(find('-from:swyx').total, 2)
  assert.equal(find('from:swyx design').total, 1)
  assert.equal(find('from:@swyx').total, 2, 'a pasted handle keeps its @')
})

test('has: and is: filters', () => {
  assert.equal(find('has:media').total, 2)
  assert.equal(find('has:video').total, 1)
  assert.equal(find('has:links').total, 1)
  assert.equal(find('is:quote').total, 1)
})

test('date and likes filters', () => {
  assert.equal(find('after:2023-01-01').total, 3)
  assert.equal(find('before:2023-01-01').total, 1)
  assert.equal(find('min:500').total, 1)
})

test('an empty query lists everything newest-first', () => {
  const { results, total } = find('')
  assert.equal(total, 4)
  assert.ok(results[0].ts >= results[1].ts)
})

test('sorts', () => {
  assert.equal(find('', 'likes').results[0].author, 'dan_abramov')
  assert.equal(find('', 'oldest').results[0].author, 'swyx')
})

test('saved order follows X\'s sort_index, longest-then-lexicographic', () => {
  assert.deepEqual(find('', 'saved').results.map((r) => r.id), [
    '1500000000000000003', // an old post, bookmarked most recently
    '1700000000000000001',
    '1700000000000000002', // a shorter sort_index is a smaller one
    '1700000000000000004', // no sort_index at all — falls to the end
  ])
})

test('terms come back for highlighting, filters stripped out', () => {
  assert.deepEqual(find('from:swyx Design').terms, ['design'])
  assert.deepEqual(parse('has:media').terms, [])
})

test('stats summarise the library', () => {
  const s = stats(ROWS)
  assert.equal(s.total, 4)
  assert.equal(s.authorCount, 3)
  assert.equal(s.authors[0].author, 'swyx')
  assert.equal(s.authors[0].count, 2)
  assert.equal(s.withMedia, 2)
})
