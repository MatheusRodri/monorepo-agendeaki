import { beforeEach, expect, jest, test } from '@jest/globals';

// O axios é simulado: cada chamada à instância passa por `instancia`.
const instancia = jest.fn();
jest.unstable_mockModule('axios', () => ({ default: { create: () => instancia } }));
const { requisitarApi } = await import('../utils/api.js');
const sessao = await import('../utils/respostaApi.js');

function criarArmazenamento() {
  const dados = new Map();
  return { getItem: (c) => (dados.has(c) ? dados.get(c) : null), setItem: (c, v) => dados.set(c, String(v)), removeItem: (c) => dados.delete(c) };
}

const erroHttp = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } });

beforeEach(() => {
  instancia.mockReset();
  globalThis.window = { location: { hostname: 'agendeaki.com', pathname: '/', assign: jest.fn() } };
  globalThis.localStorage = criarArmazenamento();
  globalThis.sessionStorage = criarArmazenamento();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { controller: { postMessage: jest.fn() } } } });
});

test('envia a requisição com token da sessão, parâmetros e timeout opcional', async () => {
  sessao.armazenarSessao('tok', 'ref', 'cliente');
  instancia.mockResolvedValue({ data: { ok: true } });
  expect(await requisitarApi('/api/clientes/perfil', { parametros: { a: 1 }, timeout: 4000, tipoResposta: 'blob' })).toEqual({ ok: true });
  const config = instancia.mock.calls[0][0];
  expect(config).toMatchObject({ url: '/api/clientes/perfil', method: 'GET', params: { a: 1 }, responseType: 'blob', timeout: 4000, headers: { Authorization: 'Bearer tok' } });
  await requisitarApi('/publico/x');
  expect(instancia.mock.calls[1][0].headers).toEqual({});
  expect('timeout' in instancia.mock.calls[1][0]).toBe(false);
});

test('reconhece o perfil pela rota', async () => {
  instancia.mockResolvedValue({ data: 1 });
  for (const [caminho, chave] of [['/api/admin/x', 'Admin'], ['/api/salao/x', 'Salao'], ['/api/saloes/x', 'Salao'], ['/api/clientes/x', 'Cliente'], ['/api/cliente/x', 'Cliente']]) {
    localStorage.setItem(`tokenAcesso${chave}`, `t-${chave}`);
    await requisitarApi(`${caminho}?q=1`);
    expect(instancia.mock.calls.at(-1)[0].headers.Authorization).toBe(`Bearer t-${chave}`);
  }
});

test('transforma falhas em erros com mensagem, status e campos da API', async () => {
  instancia.mockRejectedValue(erroHttp(409, { mensagem: 'Conflito', codigo: 'X', precosAtualizados: [1], etapa: 'E', cobrancaEncerrada: true, indiceItem: 2 }));
  await expect(requisitarApi('/api/x')).rejects.toMatchObject({ message: 'Conflito', status: 409, codigo: 'X', precosAtualizados: [1], etapa: 'E', cobrancaEncerrada: true, indiceItem: 2 });
  instancia.mockRejectedValue(Object.assign(new Error('t'), { code: 'ECONNABORTED' }));
  await expect(requisitarApi('/api/x')).rejects.toThrow('A API demorou para responder');
  instancia.mockRejectedValue(new Error('rede'));
  await expect(requisitarApi('/api/x')).rejects.toThrow('Não foi possível conversar com a API');
});

test('lê o JSON de erros recebidos como Blob e ignora Blob inválido', async () => {
  instancia.mockRejectedValue(erroHttp(400, new Blob([JSON.stringify({ mensagem: 'Do Blob' })], { type: 'application/json' })));
  await expect(requisitarApi('/api/x')).rejects.toThrow('Do Blob');
  instancia.mockRejectedValue(erroHttp(400, new Blob(['não é json'], { type: 'application/json' })));
  await expect(requisitarApi('/api/x')).rejects.toThrow('Não foi possível conversar com a API');
  instancia.mockRejectedValue(erroHttp(400, new Blob(['texto'], { type: 'text/plain' })));
  await expect(requisitarApi('/api/x')).rejects.toThrow('Não foi possível conversar com a API');
});

test('cadastro incompleto leva ao cadastro do perfil correspondente', async () => {
  instancia.mockRejectedValue(erroHttp(403, { codigo: 'CADASTRO_INCOMPLETO', mensagem: 'm' }));
  await expect(requisitarApi('/api/salao/filiais')).rejects.toThrow('m');
  expect(window.location.assign).toHaveBeenLastCalledWith('/salao');
  await expect(requisitarApi('/api/clientes/perfil')).rejects.toThrow('m');
  expect(window.location.assign).toHaveBeenLastCalledWith('/cliente');
  delete globalThis.window;
  await expect(requisitarApi('/api/clientes/perfil', { tokenAcesso: 'x' })).rejects.toThrow('m');
});

test('401 renova a sessão uma única vez para chamadas simultâneas e repete a requisição', async () => {
  sessao.armazenarSessao('velho', 'ref', 'cliente');
  let refreshes = 0;
  instancia.mockImplementation(async (config) => {
    if (config.url === '/api/clientes/refresh') { refreshes += 1; return { data: { tokenAcesso: 'novo', tokenAtualizacao: 'ref2' } }; }
    if (config.headers.Authorization === 'Bearer novo') return { data: 'ok' };
    throw erroHttp(401, { mensagem: 'expirou' });
  });
  expect(await Promise.all([requisitarApi('/api/clientes/a'), requisitarApi('/api/clientes/b')])).toEqual(['ok', 'ok']);
  expect(refreshes).toBe(1);
  expect(sessao.obterTokenAcesso('cliente')).toBe('novo');
  expect(sessao.obterTokenAtualizacao('cliente')).toBe('ref2');
});

test('usa a rota de renovação do salão', async () => {
  sessao.armazenarSessao('velho', 'ref', 'salao', false);
  instancia.mockImplementation(async (config) => {
    if (config.url === '/api/saloes/refresh') return { data: { tokenAcesso: 'novo', tokenAtualizacao: 'ref2' } };
    if (config.headers.Authorization === 'Bearer novo') return { data: 'ok' };
    throw erroHttp(401);
  });
  expect(await requisitarApi('/api/salao/agenda')).toBe('ok');
});

test('não renova quando o token foi informado, a rota é de autenticação, não há perfil ou o erro não é 401', async () => {
  sessao.armazenarSessao('t', 'r', 'cliente');
  instancia.mockRejectedValue(erroHttp(401, { mensagem: 'não' }));
  await expect(requisitarApi('/api/clientes/a', { tokenAcesso: 'outro' })).rejects.toThrow('não');
  await expect(requisitarApi('/api/clientes/login')).rejects.toThrow('não');
  await expect(requisitarApi('/sem-perfil')).rejects.toThrow('não');
  instancia.mockRejectedValue(erroHttp(500, { mensagem: 'falhou' }));
  await expect(requisitarApi('/api/clientes/a')).rejects.toThrow('falhou');
  expect(instancia.mock.calls.every(([c]) => c.url !== '/api/clientes/refresh')).toBe(true);
});

test('administrador não renova: a sessão é encerrada', async () => {
  sessao.armazenarSessao('t', 'r', 'admin');
  instancia.mockRejectedValue(erroHttp(401, { mensagem: 'expirou' }));
  await expect(requisitarApi('/api/admin/dashboard')).rejects.toThrow('expirou');
  expect(sessao.obterTokenAcesso('admin')).toBeNull();
});

test('sem token de atualização a sessão antiga é limpa', async () => {
  sessao.armazenarSessao('t', null, 'cliente');
  instancia.mockRejectedValue(erroHttp(401, { mensagem: 'expirou' }));
  await expect(requisitarApi('/api/clientes/a')).rejects.toThrow('expirou');
  expect(sessao.obterTokenAcesso('cliente')).toBeNull();
  await expect(requisitarApi('/api/clientes/a')).rejects.toThrow('expirou');
});

test('renovação recusada (401/403) encerra a sessão; outros erros são repassados', async () => {
  sessao.armazenarSessao('t', 'r', 'cliente');
  instancia.mockImplementation(async (config) => { throw erroHttp(config.url.endsWith('refresh') ? 403 : 401, { mensagem: 'x' }); });
  await expect(requisitarApi('/api/clientes/a')).rejects.toThrow('x');
  expect(sessao.obterTokenAcesso('cliente')).toBeNull();

  sessao.armazenarSessao('t', 'r', 'cliente');
  instancia.mockImplementation(async (config) => { throw config.url.endsWith('refresh') ? erroHttp(500, { mensagem: 'refresh caiu' }) : erroHttp(401); });
  await expect(requisitarApi('/api/clientes/a')).rejects.toThrow('refresh caiu');
});

test('renovação sem tokens válidos na resposta falha', async () => {
  sessao.armazenarSessao('t', 'r', 'cliente');
  instancia.mockImplementation(async (config) => {
    if (config.url.endsWith('refresh')) return { data: { tokenAcesso: 'so-acesso' } };
    throw erroHttp(401);
  });
  await expect(requisitarApi('/api/clientes/a')).rejects.toThrow('sessão renovada válida');
});

test('se outra aba trocou o token durante a renovação, usa o token atual', async () => {
  sessao.armazenarSessao('t', 'r', 'cliente');
  instancia.mockImplementation(async (config) => {
    if (config.url.endsWith('refresh')) { sessao.armazenarSessao('da-outra-aba', 'r-outra', 'cliente'); return { data: { tokenAcesso: 'n', tokenAtualizacao: 'n2' } }; }
    if (config.headers.Authorization === 'Bearer da-outra-aba') return { data: 'ok' };
    throw erroHttp(401);
  });
  expect(await requisitarApi('/api/clientes/a')).toBe('ok');

  sessao.armazenarSessao('t', 'r', 'cliente');
  instancia.mockImplementation(async (config) => {
    if (config.url.endsWith('refresh')) { sessao.armazenarSessao('da-outra-aba', 'r-outra', 'cliente'); throw erroHttp(500); }
    if (config.headers.Authorization === 'Bearer da-outra-aba') return { data: 'ok2' };
    throw erroHttp(401);
  });
  expect(await requisitarApi('/api/clientes/a')).toBe('ok2');
});
