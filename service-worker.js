const CACHE_NAME = 'bac-pro-melec-v78-medias-palette';
const APP_FILES = [
  './','./index.html','./eleve.html','./enseignant.html','./styles.css','./bo.css','./portal.css','./teaching.css','./referential.js','./app.js',
  './performance.js','./workshop-activities-v2.js','./evaluation-atelier-v2.js','./student-groups.js','./ccf-dashboard.js','./home.js','./pdf-generator-v2.js','./cloud-sync.js','./portal-api.js','./portal-contact.js','./student-space.js','./teaching-space.js','./content-render.js',
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
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
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
