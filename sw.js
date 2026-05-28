const CACHE_NAME = "cerber-mobile-v21";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=21",
  "./app.js?v=21",
  "./manifest.webmanifest",
  "./assets/cerber-head-logo.png",
  "./assets/logo1-header.png",
  "./assets/logo1-white.png",
  "./assets/user-avatar.png",
  "./assets/soleniy-malchik.jpg",
  "./assets/market-banner.png"
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
