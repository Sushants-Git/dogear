/* Link-preview parsing. Run with: npm test */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'

process.env.MARKS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'marks-unfurl-'))
register(new URL('./electron-stub.mjs', import.meta.url))

const { parseMeta } = await import('../electron/unfurl.js')

test('reads the Open Graph tags', () => {
  const meta = parseMeta(`
    <head>
      <meta property="og:title" content="A Title">
      <meta property="og:description" content="What it is about.">
      <meta property="og:image" content="https://cdn.example.com/hero.png">
      <meta property="og:site_name" content="Example">
    </head>`, 'https://example.com/post')

  assert.equal(meta.title, 'A Title')
  assert.equal(meta.description, 'What it is about.')
  assert.equal(meta.image, 'https://cdn.example.com/hero.png')
  assert.equal(meta.site, 'Example')
})

test('falls back to twitter: tags, then to <title>', () => {
  const twitter = parseMeta(
    '<meta name="twitter:title" content="Via Twitter"><meta name="twitter:image" content="https://x/y.jpg">',
    'https://example.com'
  )
  assert.equal(twitter.title, 'Via Twitter')
  assert.equal(twitter.image, 'https://x/y.jpg')

  const plain = parseMeta('<title>  Just a page  </title>', 'https://example.com')
  assert.equal(plain.title, 'Just a page')
  assert.equal(plain.image, null)
})

test('resolves a relative image against the page it came from', () => {
  const meta = parseMeta('<meta property="og:image" content="/img/hero.png">', 'https://example.com/a/b')
  assert.equal(meta.image, 'https://example.com/img/hero.png')
})

test('drops an image url it cannot make sense of', () => {
  assert.equal(parseMeta('<meta property="og:image" content=":::">', 'not a url').image, null)
})

test('decodes entities, named and numeric', () => {
  const meta = parseMeta(
    `<meta property="og:title" content="Tips &amp; tricks &#39;24 &quot;quoted&quot; &#x2014;">`,
    'https://example.com'
  )
  assert.equal(meta.title, 'Tips & tricks \'24 "quoted" —')
})

test('handles single quotes, odd spacing and attribute order', () => {
  const meta = parseMeta(
    "<meta content='Odd' property='og:title' ><meta   property = \"og:description\"   content = \"Spaced\">",
    'https://example.com'
  )
  assert.equal(meta.title, 'Odd')
  assert.equal(meta.description, 'Spaced')
})

test('the first tag wins when a page states one twice', () => {
  const meta = parseMeta(
    '<meta property="og:title" content="First"><meta property="og:title" content="Second">',
    'https://example.com'
  )
  assert.equal(meta.title, 'First')
})

test('a page with nothing useful returns nulls rather than throwing', () => {
  const meta = parseMeta('<html><body><p>hi</p><meta broken</body></html>', 'https://example.com')
  assert.deepEqual(meta, { title: null, description: null, site: null, image: null })
})
