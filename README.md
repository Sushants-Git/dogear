# Dogear

Read your X bookmarks without opening X.

![The library: every bookmark you have saved](docs/library.png)

Bookmarks are where the good stuff goes. The trouble is fetching one means opening X,
and opening X rarely ends with the thing you went in for. Dogear is a Chrome extension
that pulls your bookmarks into a reader of their own, on your machine.

## Install

1. Download `x-bookmarks.zip` from [Releases](../../releases/latest) and unzip it.
2. In Chrome, type `chrome://extensions` in the address bar — the same box you type a
   website into — and press Enter.
3. Turn on **Developer mode** with the toggle at the top right.
4. Click **Load unpacked** (top left) and choose the folder you unzipped.

## Use it

1. Click the Dogear icon in Chrome's toolbar. If it isn't there, click the puzzle piece
   and pin it.
2. Click **Scrape bookmarks**. It opens your bookmarks on X and starts working through
   them. Leave that tab in front while it scrolls.
3. When it's done, click the icon again and choose **Open library**.

If you're already on your bookmarks page, the same controls are in the bar across the
top of it.

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

The dog that runs along the bar during a scrape is a sprite from a third-party pixel art
pack, and is not covered by the MIT licence above.
