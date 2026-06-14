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
  "./assets/icon.svg",
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

// Fetch events handling (Network First, falling back to cache)
self.addEventListener("fetch", (e) => {
  // Only cache standard GET requests (e.g. bypass Firestore REST/Websocket calls)
  if (e.request.method !== "GET") return;

  // Bypass Firebase Authentication domain requests
  if (e.request.url.includes("googleapis.com") || e.request.url.includes("firebase")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Return valid responses, clone and save to cache
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // If network request fails, search Cache Storage
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback if not found (can show a mock page or let it fail)
        });
      })
  );
});
