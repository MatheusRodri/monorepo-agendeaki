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

self.addEventListener('push', (evento) => {
  const dados = evento.data?.json() ?? {};
  const audience = dados.audience === 'cliente' ? 'cliente' : 'salao';
  const destinoPadrao = audience === 'cliente' ? '/cliente/notificacoes' : '/salao/agendamentos';
  const destinoSolicitado = new URL(dados.url || destinoPadrao, self.location.origin);
  const destino = destinoSolicitado.origin === self.location.origin
    ? `${destinoSolicitado.pathname}${destinoSolicitado.search}${destinoSolicitado.hash}`
    : destinoPadrao;
  const notificacao = {
    id: dados.id,
    audience,
    titulo: dados.title || 'Agende Aki',
    mensagem: dados.body || 'Você tem uma atualização no seu salão.',
    link: destino,
  };
  evento.waitUntil(Promise.all([
    self.registration.showNotification(notificacao.titulo, {
      body: notificacao.mensagem,
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      data: { url: destino },
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
      clientes.forEach((cliente) => {
        const caminho = new URL(cliente.url).pathname;
        const clienteDoPublico = audience === 'cliente' && caminho.startsWith('/cliente/');
        const salaoDoPublico = audience === 'salao' && caminho.startsWith('/salao/');
        if (clienteDoPublico || salaoDoPublico) {
          cliente.postMessage({ type: 'AGENDEAKI_PUSH_NOTIFICATION', notificacao });
        }
      });
    }),
  ]));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/salao/agendamentos', self.location.origin).href;
  evento.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientes) => {
    const clienteExistente = clientes.find((cliente) => cliente.url === destino);
    if (clienteExistente) return clienteExistente.focus();
    return self.clients.openWindow(destino);
  }));
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname === '/offline') return;
  evento.respondWith(fetch(evento.request).catch(async () => {
    const resposta = await caches.match('/offline');
    return resposta || Response.error();
  }));
});
