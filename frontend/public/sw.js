importScripts('/push-vinculos.js');
const identidadesJanelas = new Map();
const CACHE = 'agendeaki-offline-v5';
const ARQUIVOS = ['/offline', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ARQUIVOS);

    // O HTML sozinho não inclui os estilos globais nem os controles React da tela.
    const resposta = await cache.match('/offline');
    const html = await resposta.text();
    const dependencias = new Set();
    for (const [, caminho] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
      const url = new URL(caminho, self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
        dependencias.add(url.href);
      }
    }
    await cache.addAll([...dependencias]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(Promise.all([
    caches.keys().then((chaves) => Promise.all(chaves.filter((chave) => chave.startsWith('agendeaki-offline-') && chave !== CACHE).map((chave) => caches.delete(chave)))),
    self.clients.claim(),
    self.registration.getNotifications().then((avisos) => avisos.filter((a) => !a.data?.idVinculo).forEach((a) => a.close())),
  ]));
});

self.addEventListener('message', (evento) => {
  const dados = evento.data;
  if (!dados?.type?.startsWith('AGENDEAKI_VINCULO_')) return;
  evento.waitUntil((async () => {
    try {
      if (dados.type === 'AGENDEAKI_VINCULO_IDENTIFICAR' && evento.source?.id) {
        identidadesJanelas.set(evento.source.id, { audience: dados.audience, destinatarioId: dados.destinatarioId });
      }
      if (dados.type === 'AGENDEAKI_VINCULO_SALVAR') await VinculosPush.salvar(dados);
      if (dados.type === 'AGENDEAKI_VINCULO_REMOVER') {
        await VinculosPush.remover(dados);
        const avisos = await self.registration.getNotifications();
        for (const aviso of avisos) {
          if (aviso.data?.audience === dados.audience && aviso.data?.destinatarioId === dados.destinatarioId
            && (!dados.idVinculo || aviso.data.idVinculo === dados.idVinculo)) aviso.close();
        }
      }
      evento.ports?.[0]?.postMessage({ vinculos: await VinculosPush.listar() });
    } catch { evento.ports?.[0]?.postMessage({ erro: true }); }
  })());
});

self.addEventListener('push', (evento) => {
  evento.waitUntil((async () => {
    let dados;
    try { dados = evento.data?.json(); } catch { return; }
    const vinculos = await VinculosPush.listar();
    const vinculo = vinculos.find((v) => v.audience === dados?.audience);
    if (!VinculosPush.avisoPermitido(dados, vinculo)) return;
    const url = `/${dados.audience}/notificacoes`;
    await self.registration.showNotification('AgendeAki', {
      body: 'Você tem uma nova atualização.', icon: '/icone-192.png', badge: '/icone-192.png',
      tag: `agendeaki:${dados.audience}:${dados.idVinculo}:${dados.id}`,
      data: { ...vinculo, url, id: dados.id },
    });
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const janela of janelas) {
      const identidade = identidadesJanelas.get(janela.id);
      if (identidade?.audience === dados.audience && identidade.destinatarioId === dados.destinatarioId) {
        janela.postMessage({ type: 'AGENDEAKI_PUSH_NOTIFICATION', notificacao: {
          id: dados.id, audience: dados.audience, destinatarioId: dados.destinatarioId, idVinculo: dados.idVinculo,
          titulo: 'AgendeAki', mensagem: 'Você tem uma nova atualização.', link: url,
        } });
      }
    }
  })());
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil((async () => {
    const dados = evento.notification.data;
    const atual = (await VinculosPush.listar()).find((v) => v.audience === dados?.audience);
    if (!VinculosPush.avisoPermitido({ ...dados, versao: 1 }, atual)) return;
    const destino = new URL(`/${dados.audience}/notificacoes`, self.location.origin).href;
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existente = janelas.find((j) => j.url === destino);
    if (existente) await existente.focus();
    else await self.clients.openWindow(destino);
  })());
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(evento.request)) || fetch(evento.request)));
    return;
  }
  if (evento.request.mode !== 'navigate') return;
  evento.respondWith(fetch(evento.request).catch(async () => {
    const resposta = await caches.match('/offline');
    return resposta || Response.error();
  }));
});
