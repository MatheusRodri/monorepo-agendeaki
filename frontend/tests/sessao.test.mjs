import assert from 'node:assert/strict';


function criarArmazenamento() {
  const dados = new Map();
  return {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: (chave) => dados.delete(chave),
    dados,
  };
}

const mensagens = [];
function prepararAmbiente(caminho = '/') {
  globalThis.window = { location: { hostname: 'agendeaki.com', pathname: caminho } };
  globalThis.localStorage = criarArmazenamento();
  globalThis.sessionStorage = criarArmazenamento();
  mensagens.length = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker: { controller: { postMessage: (m) => mensagens.push(m) } } },
  });
}

const {
  armazenarSessao, limparSessao, obterIdentidadeSessao, obterTokenAcesso, obterTokenAtualizacao, sessaoPersistente,
} = await import('../utils/respostaApi.js');

beforeEach(() => prepararAmbiente());

test('guarda tokens em localStorage quando mantém conectado', () => {
  armazenarSessao('acesso', 'refresh', 'cliente', true);
  assert.equal(localStorage.getItem('tokenAcessoCliente'), 'acesso');
  assert.equal(obterTokenAtualizacao('cliente'), 'refresh');
  assert.equal(sessaoPersistente('cliente'), true);
});

test('guarda tokens em sessionStorage quando não mantém conectado', () => {
  armazenarSessao('acesso', 'refresh', 'salao', false);
  assert.equal(sessionStorage.getItem('tokenAcessoSalao'), 'acesso');
  assert.equal(localStorage.getItem('tokenAcessoSalao'), null);
  assert.equal(sessaoPersistente('salao'), false);
});

test('ignora perfis inválidos', () => {
  armazenarSessao('acesso', 'refresh', 'hacker');
  assert.equal(localStorage.dados.size, 0);
  assert.equal(obterTokenAcesso('hacker'), null);
});

test('obterTokenAcesso escolhe o perfil pelo caminho da página', () => {
  armazenarSessao('t-salao', null, 'salao');
  armazenarSessao('t-admin', null, 'admin');
  window.location.pathname = '/salao/agenda';
  assert.equal(obterTokenAcesso(), 't-salao');
  window.location.pathname = '/admin';
  assert.equal(obterTokenAcesso(), 't-admin');
  window.location.pathname = '/';
  assert.equal(obterTokenAcesso(), null);
});

test('migra a sessão legada para a chave do perfil', () => {
  localStorage.setItem('perfilUsuario', 'cliente');
  localStorage.setItem('tokenAcesso', 'legado');
  assert.equal(obterTokenAcesso('cliente'), 'legado');
  assert.equal(localStorage.getItem('tokenAcesso'), null);
  assert.equal(localStorage.getItem('perfilUsuario'), null);
});

test('trocar de sessão avisa o service worker para remover o vínculo anterior', () => {
  armazenarSessao('a', null, 'cliente', true, 'usuario-1');
  armazenarSessao('b', null, 'cliente', true, 'usuario-2');
  assert.deepEqual(mensagens, [{ type: 'AGENDEAKI_VINCULO_REMOVER', audience: 'cliente', destinatarioId: 'usuario-1' }]);
  assert.equal(obterIdentidadeSessao('cliente'), 'usuario-2');
});

test('obterIdentidadeSessao lê o sub do JWT e tolera token malformado', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'abc' })).toString('base64url');
  armazenarSessao(`x.${payload}.y`, null, 'cliente');
  assert.equal(obterIdentidadeSessao('cliente'), 'abc');
  armazenarSessao('x.@@@.y', null, 'salao');
  assert.equal(obterIdentidadeSessao('salao'), null);
});

test('limparSessao remove um perfil ou todos', () => {
  armazenarSessao('a', 'r', 'cliente');
  armazenarSessao('b', 'r', 'salao');
  limparSessao('cliente');
  assert.equal(obterTokenAcesso('cliente'), null);
  assert.equal(obterTokenAcesso('salao'), 'b');
  limparSessao();
  assert.equal(obterTokenAcesso('salao'), null);
});
