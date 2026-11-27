const CACHE = "rotulo-shell-v22";
const shell = ["/", "/app.js?v=22", "/manifest.json", "/icone/192.png", "/icone/512.png"];

self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(shell.map(url => new Request(url, {cache:"reload"})));
  await self.skipWaiting();
})()));

self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith("rotulo-shell-") && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  const key = url.pathname === "/" ? "/" : url.pathname + url.search;
  if (!shell.includes(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, {cache:"no-cache"});
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(key);
      if (saved) return saved;
      throw error;
    }
  })());
});
