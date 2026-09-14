# X Bookmarks

Scrape every one of your X bookmarks, then search and read them — all inside one
Chrome extension. There is no server, no API key and no export/import step: the page
you read them in and the scraper that collects them share a single library.

```
npm install
npm run build     # -> dist/, the unpacked extension
npm test          # search and Open Graph parsing
```

Load `dist/` at `chrome://extensions` → Developer mode → **Load unpacked**.

---

## How it works

**Scraping.** A `document_start` script taps `fetch`/`XHR` in x.com's own JS context and
reads the bookmark-timeline JSON the app is already fetching for itself, while the
extension auto-scrolls the page so it keeps paging. No bearer token, no CSRF header, no
GraphQL query IDs — the three things that break every other scraper when X ships a
change. The parser keys off `entryId` and deep-walks for `tweet_results`, so a
reshuffled response schema does not kill it either.

**The library** is `chrome.storage.local`, keyed by post id. The scraper writes it and
the viewer reads it, which is the whole of the sync story: a run in one tab shows up in
the library page as it happens, and re-scraping later merges rather than duplicates.

**Link previews** are fetched by the service worker, which reads the page's Open Graph
tags and shrinks the image to a 320px WebP before storing it in IndexedDB. Reaching
other sites needs a permission the extension does not hold by default — the viewer asks
for it the first time you turn previews on, and gives it back when you turn them off.

## The library page

One search field, then your bookmarks as cards. Every card carries its date and an
**Open on X** button, both permalinks — getting back to the post is the point of having
kept it.

| | |
|---|---|
| `agent harness` | both words, anywhere |
| `"design system"` | the phrase, kept together |
| `from:swyx` / `-from:swyx` | by, or not by, that account |
| `has:media` `has:video` `has:links` | attachments |
| `is:quote` | posts quoting another |
| `after:2024-01-01` `before:2025-06-01` | date range |
| `min:500` | at least that many likes |

Terms must all match; *where* they matched sets the ranking, so a post **by** `@swyx`
outranks one that merely mentions them. Sort with **Best / Saved / New / Old / Top** — with
no search terms there is nothing to be relevant to, so Best falls back to newest.

*Saved* is the order they sit in on x.com, most recently bookmarked first, which is not
the same as most recently posted. Nothing on a post records when you bookmarked it; the
only thing that does is `sort_index`, X's position key for the bookmark timeline, which
the scraper keeps per row. Rows collected before it was kept have none and sort last,
newest post first — one more scrape fills them in.

The author chips are the filter UI: clicking one writes `from:` into the query, so
there is one place to narrow the feed rather than two.

⌘F or `/` searches, ↑↓ walk the cards, ⏎ opens the selected one on X.

## Layout

```
static/          copied verbatim into the build — they import nothing
  manifest.json
  inject.js        the network tap, in the page's own JS context
  content.js       parses timelines, drives the auto-scroll, writes the library
  background.js    link previews: fetch, parse, shrink, cache
  og.js            Open Graph parsing, kept apart so it can be tested
src/
  lib/store.js     the library — read, merge, subscribe
  lib/search.js    query parsing, scoring, filters
  styles/tokens.css   every colour in the app, and nowhere else
  viewer/          the library page
  popup/           the toolbar popup
```

## Notes

- **Keep the bookmarks tab in front while scraping.** Chrome throttles background
  timers, and the virtualised timeline needs real layout to keep fetching.
- **Resumable.** Stop, hit a rate limit, or come back next month — everything already
  collected stays, and new bookmarks merge in.
- **Removing a bookmark here removes it from this library only.** The one on X is
  untouched; the extension never writes to your account.
- **Media is not cached.** Images and video load from X's CDN, so a post whose media has
  since been deleted quietly drops it. Link previews *are* cached, and work offline.
- This reads X's private endpoints, which is against their terms. Your own data on your
  own account, but it is the unofficial path.
