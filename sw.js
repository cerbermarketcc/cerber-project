const CACHE_NAME = "cerber-mobile-v45";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=45",
  "./app.js?v=45",
  "./manifest.webmanifest",
  "./assets/cerber-head-logo.png",
  "./assets/logo1-header.png",
  "./assets/logo1-white.png",
  "./assets/user-avatar.png",
  "./assets/cerber-emblem.png",
  "./assets/market-banner.png",
  "./assets/marketolog-avatar.svg",
  "./assets/marketolog-banner.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
