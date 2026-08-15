importScripts('./js/version.js');

// Il nome della cache include la versione dell'app: cambiando APP_VERSION
// in js/version.js ad ogni push, il blocco "activate" qui sotto elimina
// automaticamente la cache della versione precedente.
const CACHE_NAME = 'frigo-tracker-v' + APP_VERSION;
const FILE_DA_CACHARE = [
  './',
  './index.html',
  './css/style.css',
  './js/version.js',
  './js/app.js',
  './js/speech.js',
  './js/storage.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILE_DA_CACHARE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(nomi.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// "Rete prima": quando c'è connessione, l'utente vede sempre l'ultima
// versione pubblicata. La cache viene aggiornata di riflesso e usata
// solo come ripiego quando manca la connessione (uso offline).
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
