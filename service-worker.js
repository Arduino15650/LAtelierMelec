const CACHE_NAME = 'bac-pro-melec-v61-group-member-layout';
const APP_FILES = [
  './','./index.html','./styles.css','./bo.css','./referential.js','./app.js',
  './performance.js','./workshop-activities-v2.js','./evaluation-atelier-v2.js','./student-groups.js','./home.js','./results.js','./pdf-generator-v2.js',
  './background-melec-tools.webp','./logo-bac-pro-melec-v3.webp',
  './manifest.webmanifest','./icon-180.png','./icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, {ignoreSearch: true}).then(cached => {
      const refreshed=fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached||refreshed;
    })
  );
});
