/* Network-first service worker. HTML, JavaScript and CSS are never cached. */
importScripts('offline-assets.js');
const VERSION_BASE = self.ST_OFFLINE.version + '-network-first';
const SCOPE_SUFFIX = '-' + encodeURIComponent(new URL(self.registration.scope).pathname);
const VERSION = VERSION_BASE + SCOPE_SUFFIX;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('st-') && key.endsWith(SCOPE_SUFFIX) && key !== VERSION)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function bypass(url) {
  return url.origin !== self.location.origin || url.pathname.startsWith('/api/') ||
    url.pathname.includes('/_embedded_host') || url.pathname.includes('/_websim') ||
    url.searchParams.has('__td_offline_refresh');
}

function isCode(request, url) {
  return request.mode === 'navigate' || ['document', 'script', 'style', 'worker', 'sharedworker'].includes(request.destination) ||
    /\.(?:html?|css|m?js|cjs)(?:$|\?)/i.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (bypass(url)) return;
  // App source always comes from the live revision; never serve or save a stale copy.
  if (isCode(request, url)) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const response = await fetch(request);
      const type = response.headers.get('content-type') || '';
      if (response.ok && !response.redirected && !/text\/(?:html|css|javascript)|application\/(?:javascript|x-javascript)/i.test(type)) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      return new Response('This asset is not available offline. Reconnect to load it.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
