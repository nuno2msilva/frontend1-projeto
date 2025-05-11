// Service worker for offline capabilities and progressive web app functionality
const CACHE_NAME = 'notes-app-v1';

// List of assets that should be available offline
const filesToCache = [
  './',
  './index.html',
  './styles/style.css',
  './scripts/script.js',
  './scripts/api.js',
  './scripts/dom.js',
  './scripts/animation.js',
  './scripts/modal.js',
  './scripts/time.js',
  './scripts/markdown.js',
  './scripts/canvas.js',
  './scripts/sync.js',
  './scripts/noteCounter.js',
  './scripts/theme.js',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Install event - cache essential assets when service worker is installed
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(filesToCache);
      })
  );
});

// Fetch event - serve from cache first, fallback to network and update cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // Skip caching non-successful or non-basic responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response since it can only be consumed once
            const responseToCache = response.clone();

            // Add successful network responses to the cache for future use
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
  );
});

// Activate event - clean up old cache versions when service worker is updated
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});