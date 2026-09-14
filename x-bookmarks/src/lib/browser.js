/** Everything the pages ask of the browser goes through here. */

export const openUrl = (url) => window.open(url, '_blank', 'noopener')

export const copyText = (text) => navigator.clipboard.writeText(String(text))

export const unfurl = (url) => chrome.runtime.sendMessage({ type: 'unfurl', url })

export const clearPreviews = () => chrome.runtime.sendMessage({ type: 'clearPreviews' })

/**
 * Link previews mean fetching pages the extension otherwise has no business reading,
 * so the permission is optional and asked for the first time you switch them on.
 * Chrome only grants it from a real click, which is why this takes no callback.
 */
export const hasPreviewAccess = () => chrome.permissions.contains({ origins: ['<all_urls>'] })

export const askPreviewAccess = () => chrome.permissions.request({ origins: ['<all_urls>'] })

export const dropPreviewAccess = () => chrome.permissions.remove({ origins: ['<all_urls>'] })

/**
 * Starting and stopping go through the service worker: the popup is closed by the tab
 * focus that starting causes, so it cannot be the one waiting on the result.
 */
export const scrapeNow = () => chrome.runtime.sendMessage({ type: 'scrape' })

export const stopScrape = () => chrome.runtime.sendMessage({ type: 'stopScrape' })

/** Bookmarks live at /i/history now; /i/bookmarks is a redirect that still gets used. */
const BOOKMARK_TABS = [
  'https://x.com/i/bookmarks*',
  'https://x.com/i/history*',
  'https://twitter.com/i/bookmarks*',
  'https://twitter.com/i/history*',
]

export async function scrapeStatus() {
  const [tab] = await chrome.tabs.query({ url: BOOKMARK_TABS })
  if (!tab) return null
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'status' }).catch(() => null)
  // No answer means the tab predates the extension being loaded, not that there is no
  // bookmarks page. It is still one, and starting a scrape reloads it into life, so
  // report it as ready — the alternative is a popup that offers to open a tab that is
  // already open, and hides the only button that does anything.
  return res ?? { running: false, status: 'Ready to scrape this page.', count: null, onPage: true, asleep: true }
}
