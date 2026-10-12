const CACHE_NAME = 'syncmeet-app-shell-v1';

globalThis.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await globalThis.fetch('/', { cache: 'reload' });
    if (!response.ok) throw new Error(`App shell request failed with status ${response.status}`);

    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], globalThis.location.origin))
      .filter((url) => url.origin === globalThis.location.origin)
      .map((url) => url.href);
    const cache = await globalThis.caches.open(CACHE_NAME);
    await cache.put('/', new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
    await cache.addAll(assets);
    await globalThis.skipWaiting();
  })());
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await globalThis.caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith('syncmeet-app-shell-') && cacheName !== CACHE_NAME)
      .map((cacheName) => globalThis.caches.delete(cacheName)));
    await globalThis.clients.claim();
  })());
});

globalThis.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== globalThis.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/socket.io/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(globalThis.fetch(event.request)
      .then((response) => response)
      .catch(async () => (await globalThis.caches.match('/')) || Response.error()));
    return;
  }

  if (!requestUrl.pathname.startsWith('/assets/')) return;
  event.respondWith(globalThis.caches.match(event.request, { ignoreVary: true }).then((cached) => {
    if (cached) return cached;
    return globalThis.fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        globalThis.caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    });
  }));
});
