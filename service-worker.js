const CACHE_NAME = 'bac-pro-melec-v167-sites';
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
  // Un script ou une feuille de style reçus sous forme de page HTML (fichier absent pendant une mise en ligne)
  // ne sont jamais gardés : sinon la page resterait blanche tant que le cache n'est pas vidé.
  const attenduHtml = event.request.mode === 'navigate' || /\.html?$/.test(new URL(event.request.url).pathname);
  const refresh = () => fetch(event.request, event.request.mode === 'navigate' ? {cache:'no-store'} : undefined).then(response => {
    const htmlInattendu = !attenduHtml && /text\/html/.test(response.headers.get('content-type') || '') && /\.(?:js|css|json|webp|png|svg|woff2?)$/.test(new URL(event.request.url).pathname);
    if (response.ok && !htmlInattendu) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  });
  // En ligne, un fichier dont le numéro de version (?v=…) a changé n'est jamais servi depuis le cache :
  // la correspondance est exacte. Hors ligne seulement, n'importe quelle version déjà en cache convient.
  const cached = () => caches.match(event.request);
  const anyVersion = () => caches.match(event.request, {ignoreSearch: true});
  // Fichiers assemblés (nom contenant leur empreinte, ex. enseignant-2.67defb0a29.js) : leur contenu
  // ne change jamais, ils sont lus directement dans le cache sans attendre le réseau.
  if (/-\d+\.[0-9a-f]{10}\.(?:js|css)$/.test(new URL(event.request.url).pathname)) {
    event.respondWith(cached().then(hit => hit || refresh()));
    return;
  }
  const current = event.request.mode === 'navigate'
    || event.request.destination === 'script' || event.request.destination === 'style';
  event.respondWith(current
    ? refresh().catch(async () => (await anyVersion()) || (event.request.mode === 'navigate' && await caches.match('./index.html')) || Response.error())
    : cached().then(hit => hit || refresh().catch(async () => (await anyVersion()) || Response.error())));
});

