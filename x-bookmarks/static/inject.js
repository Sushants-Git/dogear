// Runs in the PAGE's JS context (MAIN world) at document_start.
// Taps fetch/XHR so we can read the bookmark timeline JSON that x.com itself
// requests. We never craft our own API calls -- no auth headers, no GraphQL
// query IDs to keep up to date.
(() => {
  const TIMELINE_RE =
    /\/graphql\/[^/]+\/(Bookmarks|BookmarkFolderTimeline|BookmarkSearchTimeline)/;

  const relay = (url, json) => {
    try {
      window.postMessage({ __xbe: 'timeline', url, json }, window.location.origin);
    } catch (_) {}
  };

  const nativeFetch = window.fetch;
  window.fetch = function (...args) {
    const p = nativeFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (TIMELINE_RE.test(url)) {
        p.then((res) => {
          res.clone().json().then((j) => relay(url, j)).catch(() => {});
        }).catch(() => {});
      }
    } catch (_) {}
    return p;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xbeUrl = url;
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    try {
      if (this.__xbeUrl && TIMELINE_RE.test(this.__xbeUrl)) {
        this.addEventListener('load', () => {
          try {
            relay(this.__xbeUrl, JSON.parse(this.responseText));
          } catch (_) {}
        });
      }
    } catch (_) {}
    return nativeSend.apply(this, args);
  };
})();
