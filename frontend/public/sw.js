const CACHE = 'agendeaki-offline-v3';
const ARQUIVOS = ['/offline', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(Promise.all([
    caches.keys().then((chaves) => Promise.all(chaves.filter((chave) => chave.startsWith('agendeaki-offline-') && chave !== CACHE).map((chave) => caches.delete(chave)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname === '/offline') return;
  evento.respondWith(fetch(evento.request).catch(async () => {
    const resposta = await caches.match('/offline');
    return resposta || Response.error();
  }));
});
