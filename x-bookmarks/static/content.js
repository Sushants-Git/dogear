// Isolated-world content script: parses the tapped timeline JSON, drives the
// auto-scroll that makes x.com page through every bookmark, and persists
// results to chrome.storage.local.

const STORE_KEY = 'xbe_bookmarks';

const state = {
  tweets: new Map(),   // id -> normalized tweet
  seen: new Set(),     // ids this run has walked past, new or already stored
  running: false,
  status: 'idle',
  lastResponseAt: 0,
  responses: 0,
  hydrated: false,
};

/* ------------------------------------------------------------------ store */

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 800);
}
function save() {
  const obj = {};
  for (const [id, t] of state.tweets) obj[id] = t;
  chrome.storage.local.set({ [STORE_KEY]: obj });
}
async function hydrate() {
  if (state.hydrated) return;
  const got = await chrome.storage.local.get(STORE_KEY);
  const obj = got[STORE_KEY] || {};
  for (const [id, t] of Object.entries(obj)) state.tweets.set(id, t);
  state.hydrated = true;
}
hydrate();

/* ----------------------------------------------------------------- parsing */

// Walk any object shape looking for timeline entries. X reshuffles its response
// schema regularly, so we key off `entryId` rather than a fixed path.
function walkEntries(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    for (const v of node) walkEntries(v, out, depth + 1);
    return;
  }
  if (typeof node.entryId === 'string' && node.content) {
    out.push(node);
    return; // entry contents are handled by findTweetResult
  }
  for (const k in node) walkEntries(node[k], out, depth + 1);
}

// First `tweet_results.result` found inside an entry is the bookmarked post;
// anything deeper (quoted/retweeted posts) hangs off that one.
function findTweetResult(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 10) return null;
  if (node.tweet_results && node.tweet_results.result) return node.tweet_results.result;
  if (Array.isArray(node)) {
    for (const v of node) {
      const hit = findTweetResult(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const k in node) {
    const hit = findTweetResult(node[k], depth + 1);
    if (hit) return hit;
  }
  return null;
}

function normalize(result, sortIndex = null) {
  let t = result;
  if (t.__typename === 'TweetWithVisibilityResults' && t.tweet) t = t.tweet;
  const legacy = t.legacy;
  if (!legacy) return null;

  const id = t.rest_id || legacy.id_str;
  if (!id) return null;

  const user = (t.core && t.core.user_results && t.core.user_results.result) || {};
  const uLegacy = user.legacy || {};
  const uCore = user.core || {};
  const screenName = uCore.screen_name || uLegacy.screen_name || 'i';
  const name = uCore.name || uLegacy.name || '';

  /*
   * X hands back the 48px `_normal` crop of an avatar. The same path serves bigger
   * ones, so ask for 400x400: at any size worth showing, the small one is visibly soft
   * on a retina screen. The suffix is swapped rather than stripped — the bare path is
   * the original upload, which can be several megabytes.
   */
  const avatarRaw =
    (user.avatar && user.avatar.image_url) || uLegacy.profile_image_url_https || null;
  const avatar = avatarRaw ? avatarRaw.replace(/_normal(\.[a-z]+)$/i, '_400x400$1') : null;

  // Long posts live under note_tweet; legacy.full_text is truncated for those.
  const note =
    t.note_tweet &&
    t.note_tweet.note_tweet_results &&
    t.note_tweet.note_tweet_results.result;
  const text = (note && note.text) || legacy.full_text || '';

  const mediaList =
    (legacy.extended_entities && legacy.extended_entities.media) ||
    (legacy.entities && legacy.entities.media) ||
    [];
  const media = mediaList.map((m) => {
    let src = m.media_url_https;
    if (m.video_info && m.video_info.variants) {
      const best = m.video_info.variants
        .filter((v) => v.content_type === 'video/mp4')
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (best) src = best.url;
    }
    return { type: m.type, url: src };
  });

  const links = ((legacy.entities && legacy.entities.urls) || [])
    .map((u) => u.expanded_url)
    .filter(Boolean);

  const quoted = t.quoted_status_result && t.quoted_status_result.result;

  return {
    id,
    // X's own position key for this entry. The bookmark timeline is ordered by when
    // you bookmarked, not when the post was written, and this is the only thing in
    // the response that carries that order -- nothing on the post itself does.
    sort_index: sortIndex,
    url: `https://x.com/${screenName}/status/${id}`,
    author: screenName,
    author_name: name,
    avatar,
    created_at: legacy.created_at || null,
    text,
    lang: legacy.lang || null,
    replies: legacy.reply_count ?? null,
    reposts: legacy.retweet_count ?? null,
    likes: legacy.favorite_count ?? null,
    quotes: legacy.quote_count ?? null,
    bookmarks: legacy.bookmark_count ?? null,
    media,
    links,
    is_quote: !!quoted,
    quoted_url: quoted ? (normalize(quoted) || {}).url || null : null,
    scraped_at: new Date().toISOString(),
  };
}

function ingest(json) {
  state.responses++;
  state.lastResponseAt = Date.now();

  if (json && Array.isArray(json.errors) && json.errors.length && !json.data) {
    state.status = 'X returned an error (likely rate limited) — pausing';
    return { added: 0, rateLimited: true };
  }

  const entries = [];
  walkEntries(json, entries);
  let added = 0;

  for (const entry of entries) {
    if (!entry.entryId.startsWith('tweet-')) continue;
    const result = findTweetResult(entry.content);
    if (!result) continue;
    const tweet = normalize(result, typeof entry.sortIndex === 'string' ? entry.sortIndex : null);
    if (!tweet) continue;
    state.seen.add(tweet.id);
    const seen = state.tweets.get(tweet.id);
    if (seen) {
      // Re-seeing a bookmark is normal -- the timeline refetches its first page. Take
      // the chance to fill in anything an older scrape did not know to capture, which
      // is what lets a field added later reach rows collected before it existed.
      let filled = false;
      for (const field of ['sort_index', 'avatar']) {
        if (!seen[field] && tweet[field]) {
          seen[field] = tweet[field];
          filled = true;
        }
      }
      if (filled) scheduleSave();
      continue;
    }
    state.tweets.set(tweet.id, tweet);
    added++;
  }

  if (added) scheduleSave();
  return { added, rateLimited: false };
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.__xbe !== 'timeline') return;
  const res = ingest(d.json);
  if (state.running) {
    state.status = res.rateLimited
      ? 'Rate limited — waiting it out'
      : `Collected ${state.tweets.size} bookmarks`;
  }
});

/* -------------------------------------------------------------- scrolling */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function atBottom() {
  const el = document.scrollingElement || document.documentElement;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 200;
}

/*
 * X moved bookmarks into a History page, where they are one tab of two, and kept the
 * old path working as a redirect. Match both: the old URL is still what links and
 * muscle memory point at. Being on the Likes tab is harmless -- inject.js only taps
 * the bookmark timeline queries, so nothing else can end up in the library.
 */
function onBookmarksPage() {
  return /^\/i\/(bookmarks|history)/.test(location.pathname);
}

async function runScrape() {
  await hydrate();

  if (!onBookmarksPage()) {
    state.status = 'Open your bookmarks — x.com/i/history — first';
    state.running = false;
    return;
  }

  state.running = true;
  state.status = 'Starting…';

  // Progress is rows walked past, not rows newly added. A second scrape over a library
  // that already has everything adds nothing, and counting additions would read that as
  // "no more bookmarks" and stop a few screens in -- which is exactly the run that
  // backfills sort_index onto rows collected before it was captured.
  state.seen.clear();
  let lastSeen = 0;
  let stagnantTicks = 0;

  // Nudge the timeline into loading its first page.
  window.scrollTo(0, 0);
  await sleep(600);

  while (state.running) {
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop = el.scrollHeight;
    await sleep(1400);

    if (state.seen.size > lastSeen) {
      lastSeen = state.seen.size;
      stagnantTicks = 0;
      state.status = `Collected ${state.tweets.size} bookmarks`;
    } else {
      stagnantTicks++;
      // Virtualized lists sometimes need a jiggle to re-fire their loader.
      if (stagnantTicks % 3 === 0) {
        el.scrollTop = el.scrollHeight - el.clientHeight * 2;
        await sleep(400);
      }
      state.status = `Collected ${state.tweets.size} bookmarks — checking for more (${stagnantTicks}/12)`;
    }

    // ~17s of the timeline showing us nothing further, at the bottom, means we're done.
    if (stagnantTicks >= 12 && atBottom()) break;
    if (stagnantTicks >= 25) break;
  }

  save();
  state.running = false;
  state.status = `Done — ${state.tweets.size} bookmarks collected`;
}

/* --------------------------------------------------------------- in-page UI */

/*
 * Two pieces on the bookmarks page itself, because that is where you already are when
 * you decide to scrape:
 *
 *   idle     a pill, out of the way in the corner
 *   running  a bar across the top, saying plainly what is happening to your browser
 *
 * The bar is not decoration. A scrape takes over the tab and scrolls it for minutes;
 * a small button in the corner that says "stop" does not explain why the page is
 * moving on its own. Something full width, at the top, does.
 *
 * All of it lives in a shadow root: x.com's stylesheet is not going to leave a bare
 * <button> alone, and nothing here should leak out either.
 */

const HOST_ID = 'xbe-scrape-host';

const CSS = `
  :host { all: initial; }

  .pill {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483000;
    font: 500 14px/1 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  }

  .pill button {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 0;
    padding: 11px 17px;
    font: inherit;
    color: var(--ink);
    background: var(--ground);
    border: 1px solid var(--edge);
    border-radius: 9999px;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 28px rgba(0, 0, 0, 0.14);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .pill button:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.07), 0 12px 34px rgba(0, 0, 0, 0.18); }
  .pill button:active { transform: none; }

  .bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 46px;
    padding: 0 16px;
    color: var(--ink);
    background: var(--ground);
    border-bottom: 1px solid var(--edge);
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.14);
    font: 500 13.5px/1 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    animation: drop 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .bar .count {
    color: var(--quiet);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .bar .hint {
    margin-left: auto;
    color: var(--quiet);
    font-weight: 400;
  }
  .bar button {
    flex: none;
    margin: 0;
    padding: 7px 14px;
    font: inherit;
    font-size: 12.5px;
    color: var(--ink);
    background: transparent;
    border: 1px solid var(--edge);
    border-radius: 9999px;
    cursor: pointer;
    transition: border-color 120ms ease;
  }
  .bar button:hover { border-color: var(--ink); }

  /* The hint is the first thing to go; the count and the stop button are not. */
  @media (max-width: 640px) {
    .bar .hint { display: none; }
    .bar .count { margin-left: auto; }
  }

  button:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 2px; }

  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--quiet);
  }
  .bar .dot { background: #1d9bf0; animation: pulse 1.4s ease-in-out infinite; }

  .pill .count { color: var(--quiet); font-variant-numeric: tabular-nums; }
  .pill .count:empty { display: none; }

  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
  @keyframes drop { from { transform: translateY(-100%) } to { transform: none } }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none }
    .bar { animation: none }
  }
`;

const THEMES = {
  light: { ground: '#ffffff', ink: '#171717', quiet: '#9e9e9e', edge: '#e8e8e8' },
  dark: { ground: '#16181c', ink: '#e7e9ea', quiet: '#71767b', edge: '#2f3336' },
};

/** X ships three themes and does not say which is on, so read it off the page. */
function pageTheme() {
  const bg = getComputedStyle(document.body).backgroundColor || '';
  const [r, g, b] = (bg.match(/\d+/g) || ['255', '255', '255']).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? THEMES.dark : THEMES.light;
}

let ui = null;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

function mount() {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });

  // A constructed sheet rather than a <style> element: x.com sets a style-src policy,
  // and CSSOM is out of its reach where an injected tag might not be.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [sheet];

  // idle — the pill
  const pill = el('div', 'pill');
  const pillButton = el('button');
  pillButton.type = 'button';
  const pillCount = el('span', 'count');
  pillButton.append(el('span', 'dot'), el('span', null, 'Scrape bookmarks'), pillCount);
  pillButton.addEventListener('click', () => runScrape());
  pill.append(pillButton);

  // running — the bar
  const bar = el('div', 'bar');
  const barCount = el('span', 'count');
  const stop = el('button', null, 'Stop');
  stop.type = 'button';
  stop.addEventListener('click', () => halt());
  bar.append(
    el('span', 'dot'),
    el('span', null, 'Scraping your X bookmarks'),
    barCount,
    el('span', 'hint', 'Keep this tab in front — it scrolls on its own'),
    stop
  );

  root.append(pill, bar);
  document.body.append(host);

  ui = { host, pill, pillCount, bar, barCount };
}

function render() {
  for (const [name, value] of Object.entries(pageTheme())) {
    ui.host.style.setProperty(`--${name}`, value);
  }

  ui.pill.hidden = state.running;
  ui.bar.hidden = !state.running;

  const total = state.tweets.size;
  ui.pillCount.textContent = total ? total.toLocaleString() : '';
  ui.barCount.textContent = total ? `· ${total.toLocaleString()} collected` : '';
}

/*
 * x.com is a single page app, so there is no load event to hang this off — leaving and
 * coming back to the bookmarks page is a URL change and nothing else. Polling the path
 * is a string compare a couple of times a second, which is cheaper than watching the
 * DOM of a timeline that rewrites itself constantly.
 */
function syncUI() {
  if (!document.body) return;

  if (!onBookmarksPage()) {
    if (ui) ui.host.remove();
    ui = null;
    return;
  }

  if (!ui || !ui.host.isConnected) mount();
  render();
}

setInterval(syncUI, 600);

/* --------------------------------------------------------------- messaging */

function halt() {
  state.running = false;
  state.status = `Stopped — ${state.tweets.size} bookmarks collected`;
  save();
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.type === 'status') {
    respond({
      running: state.running,
      status: state.status,
      count: state.tweets.size,
      onPage: onBookmarksPage(),
    });
  } else if (msg.type === 'start') {
    if (!state.running) runScrape();
    respond({ ok: true });
  } else if (msg.type === 'stop') {
    halt();
    respond({ ok: true });
  } else if (msg.type === 'clear') {
    state.tweets.clear();
    state.status = 'Cleared';
    chrome.storage.local.remove(STORE_KEY);
    respond({ ok: true });
  }
  return true;
});
