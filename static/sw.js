const CACHE = "rotulo-shell-v1";
const files = ["/", "/app.js", "/manifest.json", "/icone/192.png", "/icone/512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files))));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith("rotulo-shell-") && key !== CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || !files.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
});
