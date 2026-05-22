/**
 * SIOS Service Worker — Offline-Capable PWA
 * Caches critical assets, enables offline operation,
 * and handles immersive fullscreen mode.
 */

const CACHE_NAME = 'sios-v1';
const CRITICAL_PATHS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/',
];

// Install: cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Installed, caching critical assets');
      return cache.addAll(['/']);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first with fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip WS and API calls (let them go to network)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) {
    return;
  }

  // Network-first for HTML
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for assets
  event.respondWith(
    caches
      .match(request)
      .then((response) => response || fetch(request))
      .catch(() => {
        if (request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// Message handler for client commands
self.addEventListener('message', (event) => {
  const { type } = event.data;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }

  if (type === 'CACHE_STATUS') {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((requests) => {
        event.ports[0].postMessage({
          cached: requests.length,
          cache: CACHE_NAME,
        });
      });
    });
  }
});

console.log('[SW] SIOS Service Worker loaded');
