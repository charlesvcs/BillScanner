const CACHE_NAME = 'ticket-scanner-cache-v1';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './manifest.json'
];

// Installation du Service Worker et mise en cache des fichiers statiques
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// Interception des requêtes réseaux
self.addEventListener('fetch', event => {
    // Ne pas intercepter les requêtes cross-origin pour éviter de bloquer les CDN (WebLLM / Tesseract)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Retourne le fichier en cache s'il existe, sinon tente le réseau
                return response || fetch(event.request);
            })
    );
});

// Nettoyage des vieux caches lors de la mise à jour
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
