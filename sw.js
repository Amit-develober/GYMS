// ApexGym PWA Service Worker
const CACHE_NAME = "apexgym-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./index.css",
  "./manifest.json",
  "./js/app.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/firebase-config.js",
  "./assets/logo.png",
  "https://unpkg.com/lucide@latest",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap"
];

// Installation Lifecycle hook
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching critical shell assets...");
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation Lifecycle hook
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Service Worker: Clearing legacy cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events handling (Stale-While-Revalidate / Cache-First strategy)
self.addEventListener("fetch", (e) => {
  // Only cache standard GET requests (e.g. bypass Firestore REST/Websocket calls)
  if (e.request.method !== "GET") return;

  // Bypass Firebase Authentication and database domain requests
  if (e.request.url.includes("googleapis.com") || e.request.url.includes("firebase")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Create a background fetch promise to update the cache
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Ignore background fetch errors (e.g., if offline)
        });

      // If cached response exists, return it immediately and let fetchPromise run in background
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise, return the network request fetch promise
      return fetchPromise;
    })
  );
});
