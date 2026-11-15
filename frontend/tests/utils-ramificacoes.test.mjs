import assert from 'node:assert/strict';
import { afterEach, beforeEach, jest, test } from '@jest/globals';
import { dataNascimentoMaiorDeIdade, dataParaExibicao } from '../utils/formatadores.js';
import { normalizarRetornoInterno } from '../utils/retornoSeguro.mjs';
import * as sessao from '../utils/respostaApi.js';

function criarArmazenamento() {
  const dados = new Map();
  return { getItem: (c) => (dados.has(c) ? dados.get(c) : null), setItem: (c, v) => dados.set(c, String(v)), removeItem: (c) => dados.delete(c) };
}

const urlOriginal = process.env.NEXT_PUBLIC_API_URL;
beforeEach(() => {
  globalThis.window = { location: { hostname: 'agendeaki.com', pathname: '/' } };
  globalThis.localStorage = criarArmazenamento();
  globalThis.sessionStorage = criarArmazenamento();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { controller: { postMessage: jest.fn() } } } });
});
afterEach(() => {
  jest.useRealTimers();
  if (urlOriginal === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = urlOriginal;
});

test('maioridade considera o aniversário ainda não ocorrido no mês corrente', () => {
  jest.useFakeTimers({ now: new Date('2026-06-15T15:00:00Z') });
  assert.equal(dataNascimentoMaiorDeIdade('2008-06-20'), false);
  assert.equal(dataNascimentoMaiorDeIdade('2008-06-15'), true);
  assert.equal(dataNascimentoMaiorDeIdade('2008-06-10'), true);
});

test('data para exibição de valor vazio devolve o formato padrão', () => {
  assert.equal(dataParaExibicao('2026-10-30'), '30/10/2026');
  assert.equal(typeof dataParaExibicao(null), 'string');
});

test('retorno interno recusa origem com barra final ou inválida', () => {
  assert.equal(normalizarRetornoInterno('/x', 'https://a.com/'), null);
  assert.equal(normalizarRetornoInterno('/x', 'origem-invalida'), null);
});

test('endereço da API: local, produção com variável e produção sem variável', () => {
  window.location.hostname = 'localhost';
  assert.equal(sessao.obterUrlApi(), 'http://localhost:3001');
  window.location.hostname = 'agendeaki.com';
  process.env.NEXT_PUBLIC_API_URL = 'https://api.agendeaki.com';
  assert.equal(sessao.obterUrlApi(), 'https://api.agendeaki.com');
  delete process.env.NEXT_PUBLIC_API_URL;
  assert.equal(sessao.obterUrlApi(), 'http://localhost:3001');
  delete globalThis.window;
  assert.equal(sessao.obterUrlApi(), 'http://localhost:3001');
});

test('sem janela (renderização no servidor) a sessão fica vazia e nada é gravado', () => {
  delete globalThis.window;
  assert.equal(sessao.obterTokenAcesso(), null);
  assert.equal(sessao.obterTokenAtualizacao('cliente'), null);
  assert.equal(sessao.sessaoPersistente('cliente'), true);
  assert.equal(sessao.obterIdentidadeSessao('cliente'), null);
  assert.equal(sessao.limparSessao('cliente'), undefined);
  assert.equal(sessao.armazenarSessao('t', 'r', 'cliente'), undefined);
});

test('identidade da sessão temporária fica no sessionStorage', () => {
  sessao.armazenarSessao('t', 'r', 'cliente', false, 'ext-9');
  assert.equal(sessionStorage.getItem('identidadecliente'), 'ext-9');
  assert.equal(sessao.obterIdentidadeSessao('cliente'), 'ext-9');
});

test('sessão legada é migrada para as chaves do perfil', () => {
  localStorage.setItem('perfilUsuario', 'salao');
  localStorage.setItem('tokenAcesso', 'legado');
  assert.equal(sessao.obterTokenAcesso('salao'), 'legado');
  assert.equal(localStorage.getItem('tokenAcesso'), null);
});
