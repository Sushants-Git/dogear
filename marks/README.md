# Marks

A searcher and reader for your X bookmarks. Electron · Vite · React.

One column. A search field at the top, the results as a feed underneath. The card is
the viewer — a bookmark is already short enough to read where it sits, so there is no
sidebar and no detail pane to open.

Noti's white palette and GT Walsheim; the layout is its own.

---

## Run

```bash
npm install
npm start      # vite build && electron .
npm run dev    # vite dev server with HMR
npm test       # search and import tests, no Electron needed
```

## Getting bookmarks in

Export from the `x-bookmarks-exporter` extension in this repo, then either drop the
JSON anywhere in the window or use **File → Import Bookmarks…** (⌘O).

Importing is a merge, not a replace. Rows are keyed by post id, so re-importing a
fresh export updates what changed and adds what's new — you can export monthly and
the library just accumulates.

## Searching

The search field takes plain words and filters together. Every term must match
somewhere; where it matched decides the ranking, so a post *by* `@swyx` outranks a
post that merely mentions them.

| | |
|---|---|
| `agent harness` | both words, anywhere |
| `"design system"` | the phrase, kept together |
| `from:swyx` | by that account |
| `-from:swyx` | everything except them |
| `has:media` `has:video` `has:links` | attachments |
| `is:quote` | posts that quote another |
| `after:2024-01-01` `before:2025-06-01` | date range |
| `min:500` | at least that many likes |

Sort with **Best / Saved / New / Old / Top**. With no search terms there is nothing to
be relevant to, so *Best* falls back to newest.

*Saved* is the order the bookmarks sit in on x.com — most recently bookmarked first,
which is not the same as most recently posted. It rides on `sort_index`, X's own
position key for the bookmark timeline, captured per row by the exporter. Rows from an
export made before that was captured have no `sort_index` and sort after every row that
does, newest post first; re-run the scraper once and they fill in.

The author chips under the search field are the filter UI: clicking one writes
`from:` into the query, which keeps every way of narrowing the feed in one place.

## Keys

| | |
|---|---|
| ⌘F or `/` | search |
| ↑ ↓ | walk the feed |
| ⏎ | open in X |
| ⌘⇧C | copy link |
| ⌘O | import |

## Where things live

```
electron/
  main.js      window, menu, IPC
  library.js   the library on disk — one JSON file, keyed by post id
  search.js    query parsing, scoring, filters, stats
src/
  styles/tokens.css   every colour in the app, and nowhere else
  components/         TopBar (search + sort), Feed, Post
```

The library is one JSON file in `~/Library/Application Support/Marks/`. Set
`MARKS_DATA_DIR` to point at a different one — the tests use that, and it works for a
second library too.

## Notes

- **Media is not cached.** Images and video load from X's CDN at read time, so a post
  whose media has since been deleted shows a gap. Nothing about the app needs the
  network otherwise.
- **Removing a bookmark here removes it from this library only.** The bookmark on X is
  untouched — this app never talks to X.
- **Search is a linear scan.** A few thousand rows score in well under a frame, and a
  scan is what makes substring matching, field weighting and the filters fall out for
  free. Revisit at a hundred thousand rows, not before.
