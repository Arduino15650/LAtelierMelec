const CACHE_NAME = 'bac-pro-melec-v156-fluide';
// Les scripts de l'espace non visité sont mis en cache à la demande.
const CORE_FILES = ['./logo-melec-192.webp'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('bac-pro-melec-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Ne jamais mettre en cache les réponses privées de Supabase.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  const refresh = () => fetch(event.request, event.request.mode === 'navigate' ? {cache:'no-store'} : undefined).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  });
  const cached = () => caches.match(event.request, {ignoreSearch: true});
  // Fichiers assemblés (nom contenant leur empreinte, ex. enseignant-2.67defb0a29.js) : leur contenu
  // ne change jamais, ils sont lus directement dans le cache sans attendre le réseau.
  if (/-\d+\.[0-9a-f]{10}\.(?:js|css)$/.test(new URL(event.request.url).pathname)) {
    event.respondWith(cached().then(hit => hit || refresh()));
    return;
  }
  const current = event.request.mode === 'navigate'
    || event.request.destination === 'script' || event.request.destination === 'style';
  event.respondWith(current
    ? refresh().catch(async () => (await cached()) || (event.request.mode === 'navigate' && await caches.match('./index.html')) || Response.error())
    : cached().then(hit => hit || refresh().catch(() => Response.error())));
});

