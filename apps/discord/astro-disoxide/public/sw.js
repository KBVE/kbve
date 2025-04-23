
const CACHE_NAME = 'kbve-cache-v1';
const SW_VERSION = '1.0.2';

const PRECACHE_URLS = [
  // Static assets, CDN files, or local fallback resources
  '/i18n/db.json',
  '/assets/json/lottie/animu.json',
  'https://esm.sh/@lottiefiles/dotlottie-web',
  'https://esm.sh/toastify-js?worker',
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching:', PRECACHE_URLS);
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('message', async (event) => {
  const data = event.data;

  if (data?.type === 'ping') {
    event.source.postMessage({ type: 'pong', swVersion: SW_VERSION });
  }

  if (data?.type === 'check-version') {
    if (data.expectedVersion !== SW_VERSION) {
      console.warn('[SW] Version mismatch! Triggering self-destruct');
      triggerSelfDestruct();
    } else {
      console.log('[SW] Version match:', SW_VERSION);
    }
  }

  if (data === 'self-destruct' || data?.type === 'self-destruct') {
    triggerSelfDestruct();
  }
});

async function triggerSelfDestruct() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));

  self.registration.unregister().then((success) => {
    console.log('[SW] Self-destruct complete:', success);
  });

  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.navigate(client.url);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        console.log('[SW] Serving from cache:', request.url);
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
          return response;
        })
        .catch((err) => {
          console.warn('[SW] Fetch failed:', err);
          throw err;
        });
    })
  );
});
