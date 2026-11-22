/* Network-first service worker. HTML, JavaScript and CSS are never cached. */
importScripts('../offline-assets.js', 'offline-assets.js');
const { cache: CACHE_NAME } = self.TD_OFFLINE;
const CACHE_SUFFIX = '-' + encodeURIComponent(new URL('./', self.location.href).pathname);

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('theory-decks-offline-') && name.endsWith(CACHE_SUFFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'td-offline-info' && event.source) {
    event.source.postMessage({ type: 'td-offline-info', cache: CACHE_NAME });
  }
});

function isCode(request, url) {
  return request.mode === 'navigate' || ['document', 'script', 'style', 'worker', 'sharedworker'].includes(request.destination) ||
    /\.(?:html?|css|m?js|cjs)(?:$|\?)/i.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      (request.cache === 'only-if-cached' && request.mode !== 'same-origin') ||
      (request.cache === 'reload' && url.searchParams.has('__td_offline_refresh'))) return;
  if (isCode(request, url)) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
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
