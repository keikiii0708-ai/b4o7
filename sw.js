const CACHE = "b4o7-v3";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/main.js",
  "./js/dates.js",
  "./js/scoring.js",
  "./js/sleep.js",
  "./js/selectors.js",
  "./js/db.js",
  "./js/backup.js",
  "./js/demo.js",
  "./js/reminders.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/views/home.js",
  "./js/views/goals.js",
  "./js/views/sleep.js",
  "./js/views/rewards.js",
  "./js/views/history.js",
  "./js/views/settings.js",
  "./icons/favicon.svg",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      if (event.request.mode === "navigate") {
        return (await cache.match("./index.html")) || (await cache.match("./")) || Promise.reject(error);
      }
      throw error;
    }
  })());
});
