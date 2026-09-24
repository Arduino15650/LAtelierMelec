const CACHE_NAME = 'bac-pro-melec-v62-cloud-sync';
const APP_FILES = [
  './','./index.html','./styles.css','./bo.css','./referential.js','./app.js',
  './performance.js','./workshop-activities-v2.js','./evaluation-atelier-v2.js','./student-groups.js','./ccf-dashboard.js','./home.js','./pdf-generator-v2.js','./backup-data.js','./cloud-sync.js',
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
  // Ne jamais mettre en cache les réponses privées de Supabase.
  if (new URL(event.request.url).origin !== self.location.origin) return;

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
    fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request, {ignoreSearch: true}))
  );
});
