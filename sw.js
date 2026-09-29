/* Service worker for התנור של סבתא סיסי.
   Deliberately conservative:
   - HTML is network-first, so a visitor never reads a stale menu or stale prices
     while online. Only a failed network falls back to a cached copy, and the page
     shows an offline notice when it does.
   - The 4.4MB hero video is never cached. It is fetched as a blob by the page and
     would blow the storage quota for no benefit.
   - Nothing about a cart, a customer or an order passes through here. That data
     lives in localStorage, which a service worker cannot read. */

const VERSION = 'sisi-v1';
const SHELL = VERSION + '-shell';
const PAGES = VERSION + '-pages';

/* the static shell: safe to serve from cache because a new VERSION replaces it */
const SHELL_ASSETS = [
  '/assets/style.css',
  '/assets/script.js',
  '/assets/fonts.css',
  '/assets/fonts/v15-taiJGmd_EZ6rqscQgOFMmouQ-A.woff2',
  '/assets/fonts/v15-taiJGmd_EZ6rqscQgOFOmos.woff2',
  '/assets/fonts/v31-iJWKBXyIfDnIV7nBrXw.woff2',
  '/assets/fonts/v31-iJWKBXyIfDnIV7nDrXyi0A.woff2',
  '/assets/fonts/v24-tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxTOlOV.woff2',
  '/assets/hero-poster.jpg',
  '/assets/hero-ending.jpg',
  '/assets/fire.jpg',
  '/offline.html'
];

const NEVER_CACHE = /hero-scrub\.(mp4|webm)$/;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== PAGES).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* the page asks for this after an update is installed */
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch third parties
  if (NEVER_CACHE.test(url.pathname)) return;        // the video streams straight from the network

  /* HTML: network first, cache only as a fallback */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // only a good page is worth keeping; caching a 404 or a 502 would
          // serve that error back later as if it were the site
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('/offline.html')))
    );
    return;
  }

  /* CSS and JS change whenever the site is edited, and there are no content
     hashes in the filenames to tell a new one from an old one. Cache-first
     would keep serving last week's file to anyone who has visited before, so
     these are stale-while-revalidate: the cached copy answers immediately and
     a fresh copy is fetched in the background for the next load. */
  if (/\.(css|js)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then(cache => cache.match(req).then(hit => {
        const fresh = fetch(req).then(res => {
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || fresh;
      }))
    );
    return;
  }

  /* fonts and images never change without changing name: cache first */
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
