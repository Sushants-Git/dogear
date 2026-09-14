# Dogear

Read your X bookmarks without opening X.

![The library: every bookmark you have saved](docs/library.png)

Bookmarks are where the good stuff goes. The trouble is fetching one means opening X,
and opening X rarely ends with the thing you went in for. Dogear is a Chrome extension
that pulls your bookmarks into a reader of their own, on your machine.

## Install

1. Download `x-bookmarks.zip` from [Releases](../../releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**, top right.
3. Click **Load unpacked** and choose the unzipped folder.

## Use it

1. Go to your bookmarks on X — `x.com/i/history`.
2. Click **Scrape bookmarks**, bottom right of the page. Leave the tab in front while it
   scrolls.
3. Click the extension icon, then **Open library**.

Run it again whenever you like. Rows are keyed by post id, so a second pass updates and
adds rather than duplicating.

## Worth knowing

- **Sort by when you saved something** — X knows that order and never shows it to you.
- **Export** to JSON, CSV or Markdown. They are your bookmarks.
- **Nothing leaves your machine.** No server, no account, no telemetry. The library sits
  in `chrome.storage.local`. The only outbound requests are link previews, which are off
  until you turn them on.
- **Removing a bookmark here leaves X untouched.** This never writes to your account.
- It reads the bookmark data X already sends your browser as you scroll — no API calls,
  no credentials. Automating any site can still sit badly with its terms; your call.

## Build it yourself

```bash
cd x-bookmarks
npm install
npm run build   # dist/ is the folder to load
npm test
```

MIT. Set in [Inter](https://rsms.me/inter/) and
[JetBrains Mono](https://www.jetbrains.com/lp/mono/), both SIL Open Font License.
