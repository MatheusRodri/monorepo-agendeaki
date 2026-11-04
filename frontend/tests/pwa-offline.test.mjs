import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const codigo = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const origem = 'https://agendeaki.test';
const html = `<!doctype html><html><head>
  <link rel="stylesheet" href="/_next/static/css/global.css">
  <link rel="preload" as="script" href="/_next/static/chunks/offline.js">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans">
</head><body>
  <script src="/_next/static/chunks/offline.js" async></script>
  <script src="/_next/static/chunks/acessibilidade.js" async></script>
  <script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script>
</body></html>`;
const estilos = 'body { margin: 0; } * { box-sizing: border-box; } .atalho-conteudo { position: fixed; }';

function simularNavegador() {
  const eventos = new Map();
  const armazenamentos = new Map();
  const recursos = new Map([
    ['/offline', html], ['/icone-192.png', 'icone'], ['/icone-512.png', 'icone'],
    ['/_next/static/css/global.css', estilos],
    ['/_next/static/chunks/offline.js', 'controle de atualização'],
    ['/_next/static/chunks/acessibilidade.js', 'controle de acessibilidade'],
    ['/salao/dashboard', 'dashboard online'],
  ]);
  const rede = { online: true, requisicoes: [], ativacoes: 0 };
  const chave = (requisicao) => new URL(typeof requisicao === 'string' ? requisicao : requisicao.url, origem).href;
  const buscar = async (requisicao) => {
    const url = new URL(chave(requisicao));
    rede.requisicoes.push(url.href);
    if (!rede.online || url.origin !== origem || !recursos.has(url.pathname)) throw new TypeError('Sem conexão');
    return new Response(recursos.get(url.pathname));
  };
  const caches = {
    async open(nome) {
      if (!armazenamentos.has(nome)) armazenamentos.set(nome, new Map());
      const itens = armazenamentos.get(nome);
      return {
        async addAll(requisicoes) {
          const respostas = await Promise.all(requisicoes.map(async (requisicao) => [chave(requisicao), await buscar(requisicao)]));
          for (const [url, resposta] of respostas) itens.set(url, resposta);
        },
        async match(requisicao) { return itens.get(chave(requisicao))?.clone(); },
      };
    },
    async match(requisicao) {
      for (const itens of armazenamentos.values()) {
        const resposta = itens.get(chave(requisicao));
        if (resposta) return resposta.clone();
      }
    },
    async keys() { return [...armazenamentos.keys()]; },
    async delete(nome) { return armazenamentos.delete(nome); },
  };
  runInNewContext(codigo, {
    URL, Response, caches, fetch: buscar, importScripts() {},
    self: {
      location: { origin: origem },
      addEventListener(nome, executar) { eventos.set(nome, executar); },
      async skipWaiting() { rede.ativacoes += 1; },
      clients: { async claim() {} },
      registration: { async getNotifications() { return []; } },
    },
  });
  return {
    caches, recursos, rede,
    executar(nome) {
      let trabalho;
      eventos.get(nome)({ waitUntil(promessa) { trabalho = promessa; } });
      return trabalho;
    },
    requisitar(caminho, mode = 'navigate') {
      let resposta;
      eventos.get('fetch')({
        request: { url: new URL(caminho, origem).href, method: 'GET', mode },
        respondWith(promessa) { resposta = promessa; },
      });
      return resposta;
    },
  };
}

test('instalação preserva HTML, CSS e scripts locais sem depender de serviços externos', async () => {
  const navegador = simularNavegador();
  await navegador.executar('install');
  assert.equal(navegador.rede.ativacoes, 1);
  assert.equal(await (await navegador.caches.match('/_next/static/css/global.css')).text(), estilos);
  assert.equal(await (await navegador.caches.match('/_next/static/chunks/acessibilidade.js')).text(), 'controle de acessibilidade');
  assert.equal(navegador.rede.requisicoes.filter((url) => url.endsWith('/offline.js')).length, 1);
  assert.ok(navegador.rede.requisicoes.every((url) => new URL(url).origin === origem));
});

test('sem rede, navegação e acesso direto a /offline mantêm estilos e controles disponíveis', async () => {
  const navegador = simularNavegador();
  await navegador.executar('install');
  navegador.rede.online = false;
  for (const caminho of ['/salao/dashboard', '/offline']) {
    const pagina = await navegador.requisitar(caminho);
    assert.equal(await pagina.text(), html);
    assert.equal(await (await navegador.requisitar('/_next/static/css/global.css', 'same-origin')).text(), estilos);
    assert.equal(await (await navegador.requisitar('/_next/static/chunks/offline.js', 'same-origin')).text(), 'controle de atualização');
  }
  assert.equal(navegador.requisitar('/offline?atualizar=123', 'same-origin'), undefined, 'Verificação de conexão deve consultar a rede');
  assert.equal(navegador.requisitar('/api/agendamentos', 'same-origin'), undefined);
});

test('falha ao baixar um estilo impede substituir a versão offline já instalada', async () => {
  const navegador = simularNavegador();
  await navegador.caches.open('agendeaki-offline-v4');
  navegador.recursos.delete('/_next/static/css/global.css');
  await assert.rejects(navegador.executar('install'), /Sem conexão/);
  assert.equal(navegador.rede.ativacoes, 0);
  assert.ok((await navegador.caches.keys()).includes('agendeaki-offline-v4'));
});

test('ativação remove só versões offline antigas e mantém navegação online pela rede', async () => {
  const navegador = simularNavegador();
  await navegador.caches.open('agendeaki-offline-v4');
  await navegador.caches.open('outro-cache');
  await navegador.executar('install');
  await navegador.executar('activate');
  assert.deepEqual(await navegador.caches.keys(), ['outro-cache', 'agendeaki-offline-v5']);
  assert.equal(await (await navegador.requisitar('/salao/dashboard')).text(), 'dashboard online');
});
