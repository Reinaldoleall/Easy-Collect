// Service Worker para Easy Collect PWA
const CACHE_NAME = 'easy-collect-v1.0.4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.json',
  './tcss.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
  './icons/favicon.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pré-cache de recursos principais do Easy Collect');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Aviso durante pré-cache:', err);
      });
    })
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições com estratégia híbrida
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Não interceptar requisições não-GET
  if (req.method !== 'GET') return;

  // Ignorar extensões do navegador e endpoints do Firebase Auth/Firestore
  if (url.protocol === 'chrome-extension:' || url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  // Requisições de Navegação (HTML da página) -> Network First com fallback de Cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] Modo offline: servindo index.html do cache');
          const cachedResponse = await caches.match('./index.html') || await caches.match('/');
          return cachedResponse || new Response('Offline - Easy Collect', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Recursos estáticos e CDNs (Fontes, FontAwesome, jsPDF, imagens) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Se falhar e não houver cache, apenas prossegue
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Comunicação com a interface (atualização forçada)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
