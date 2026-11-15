import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

const requisitarApi = jest.fn();
jest.unstable_mockModule('../utils/api.js', () => ({ requisitarApi }));
const notificacoes = await import('../utils/notificacoesDispositivo.js');
const sessao = await import('../utils/respostaApi.js');

function criarArmazenamento() {
  const dados = new Map();
  return { getItem: (c) => (dados.has(c) ? dados.get(c) : null), setItem: (c, v) => dados.set(c, String(v)), removeItem: (c) => dados.delete(c) };
}

// Service worker simulado: responde cada comando pelo canal recebido, conforme `respostas`.
let respostas;
let mensagens;
const worker = {
  postMessage: (mensagem, [porta]) => {
    mensagens.push(mensagem);
    const resposta = respostas[mensagem.type];
    if (resposta !== 'mudo') porta.postMessage(resposta ?? { vinculos: [] });
  },
};
let inscricao;
const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

function instalarNavegador({ comWorker = true, comRegistro = true } = {}) {
  const registro = comRegistro ? { active: comWorker ? worker : null, pushManager: { getSubscription: async () => inscricao } } : undefined;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker: { controller: { postMessage: jest.fn() }, getRegistration: async () => registro } },
  });
}

beforeEach(() => {
  requisitarApi.mockReset();
  respostas = {};
  mensagens = [];
  inscricao = { endpoint: 'https://push/1', unsubscribe: jest.fn().mockResolvedValue(true) };
  globalThis.window = { location: { hostname: 'agendeaki.com', pathname: '/' } };
  globalThis.localStorage = criarArmazenamento();
  globalThis.sessionStorage = criarArmazenamento();
  instalarNavegador();
});
afterEach(() => jest.useRealTimers());

test('comandar vínculo devolve lista vazia sem service worker, sem registro ou sem worker ativo', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  expect(await notificacoes.comandarVinculo('LISTAR')).toEqual([]);
  instalarNavegador({ comRegistro: false });
  expect(await notificacoes.comandarVinculo('LISTAR')).toEqual([]);
  instalarNavegador({ comWorker: false });
  expect(await notificacoes.comandarVinculo('LISTAR')).toEqual([]);
});

test('comandar vínculo envia o comando ao worker e devolve os vínculos', async () => {
  respostas.AGENDEAKI_VINCULO_LISTAR = { vinculos: [{ idVinculo: 'v' }] };
  expect(await notificacoes.comandarVinculo('LISTAR', { audience: 'cliente' })).toEqual([{ idVinculo: 'v' }]);
  expect(mensagens[0]).toEqual({ type: 'AGENDEAKI_VINCULO_LISTAR', audience: 'cliente' });
  respostas.AGENDEAKI_VINCULO_LISTAR = {};
  expect(await notificacoes.comandarVinculo('LISTAR')).toEqual([]);
});

test('comandar vínculo falha quando o worker informa erro ou não responde', async () => {
  respostas.AGENDEAKI_VINCULO_SALVAR = { erro: true };
  await expect(notificacoes.comandarVinculo('SALVAR')).rejects.toThrow('vínculo do dispositivo');
  respostas.AGENDEAKI_VINCULO_SALVAR = 'mudo';
  jest.useFakeTimers();
  const promessa = notificacoes.comandarVinculo('SALVAR');
  const verificacao = expect(promessa).rejects.toThrow('vínculo do dispositivo');
  await jest.advanceTimersByTimeAsync(2500);
  await verificacao;
});

test('registrar vínculo só envia quando há idVinculo', async () => {
  await notificacoes.registrarVinculoPush(undefined);
  await notificacoes.registrarVinculoPush({});
  expect(mensagens).toEqual([]);
  await notificacoes.registrarVinculoPush({ idVinculo: 'v1' });
  expect(mensagens[0]).toMatchObject({ type: 'AGENDEAKI_VINCULO_SALVAR', idVinculo: 'v1' });
});

test('desativar notificações do cliente remove o vínculo, cancela a inscrição e avisa a API', async () => {
  sessao.armazenarSessao('tok', 'ref', 'cliente', true, 'ext-1');
  respostas.AGENDEAKI_VINCULO_LISTAR = { vinculos: [{ audience: 'cliente', destinatarioId: 'ext-1', idVinculo: 'v1' }, { audience: 'salao', destinatarioId: 'x', idVinculo: 'v2' }] };
  respostas.AGENDEAKI_VINCULO_REMOVER = { vinculos: [] };
  const dados = await notificacoes.desativarNotificacoes('cliente');
  expect(dados).toEqual({ endpointPush: 'https://push/1', idVinculo: 'v1' });
  expect(inscricao.unsubscribe).toHaveBeenCalled();
  expect(requisitarApi).toHaveBeenCalledWith('/api/clientes/notificacoes/inscricao', {
    metodo: 'DELETE', dados: { endpoint: 'https://push/1', idVinculo: 'v1' }, tokenAcesso: 'tok', timeout: 4000,
  });
});

test('desativar notificações do salão usa a rota do salão e mantém a inscrição se restam vínculos', async () => {
  sessao.armazenarSessao('tok', 'ref', 'salao', true, 'ext-2');
  respostas.AGENDEAKI_VINCULO_LISTAR = { vinculos: [{ audience: 'salao', destinatarioId: 'ext-2', idVinculo: 'v1' }] };
  respostas.AGENDEAKI_VINCULO_REMOVER = { vinculos: [{ idVinculo: 'outro' }] };
  await notificacoes.desativarNotificacoes('salao');
  expect(inscricao.unsubscribe).not.toHaveBeenCalled();
  expect(requisitarApi.mock.calls[0][0]).toBe('/api/salao/notificacoes/inscricao');
});

test('desativar sem service worker, sem inscrição ou sem token não chama a API', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  expect(await notificacoes.desativarNotificacoes('cliente')).toEqual({ endpointPush: undefined, idVinculo: undefined });
  instalarNavegador();
  inscricao = undefined;
  await notificacoes.desativarNotificacoes('cliente');
  inscricao = { endpoint: 'e', unsubscribe: jest.fn() };
  respostas.AGENDEAKI_VINCULO_LISTAR = { vinculos: [{ audience: 'cliente', destinatarioId: null, idVinculo: 'v' }] };
  await notificacoes.desativarNotificacoes('cliente');
  expect(requisitarApi).not.toHaveBeenCalled();
});

test('desativar propaga a falha ao cancelar a inscrição ou avisar a API, com os dados', async () => {
  sessao.armazenarSessao('tok', 'ref', 'cliente', true, 'ext-1');
  respostas.AGENDEAKI_VINCULO_LISTAR = { vinculos: [{ audience: 'cliente', destinatarioId: 'ext-1', idVinculo: 'v1' }] };
  inscricao.unsubscribe.mockRejectedValue(new Error('push'));
  await expect(notificacoes.desativarNotificacoes('cliente')).rejects.toMatchObject({ message: 'push', dados: { idVinculo: 'v1' } });
  inscricao.unsubscribe.mockResolvedValue(true);
  requisitarApi.mockRejectedValue(new Error('api'));
  await expect(notificacoes.desativarNotificacoes('cliente')).rejects.toMatchObject({ message: 'api' });
});

test('encerrar sessão do administrador não mexe em notificações e limpa a sessão', async () => {
  sessao.armazenarSessao(jwt({ sid: 's1' }), 'ref', 'admin');
  expect(await notificacoes.encerrarSessaoPerfil('admin')).toBe(true);
  expect(requisitarApi.mock.calls[0][0]).toBe('/api/admin/logout');
  expect(sessao.obterTokenAcesso('admin')).toBeNull();
});

test('encerrar sessão do cliente e do salão usa a rota de logout do perfil', async () => {
  sessao.armazenarSessao(jwt({ session_id: 's1' }), 'ref', 'cliente');
  expect(await notificacoes.encerrarSessaoPerfil('cliente')).toBe(true);
  expect(requisitarApi.mock.calls.at(-1)[0]).toBe('/api/clientes/logout');
  sessao.armazenarSessao('token-sem-formato', 'ref', 'salao');
  expect(await notificacoes.encerrarSessaoPerfil('salao')).toBe(true);
  expect(requisitarApi.mock.calls.at(-1)[0]).toBe('/api/saloes/logout');
});

test('encerrar sessão informa que não foi confirmado quando o logout ou as notificações falham', async () => {
  sessao.armazenarSessao(jwt({ sid: 's1' }), 'ref', 'cliente', true, 'ext-1');
  requisitarApi.mockRejectedValue(new Error('api'));
  expect(await notificacoes.encerrarSessaoPerfil('cliente')).toBe(false);
  expect(sessao.obterTokenAcesso('cliente')).toBeNull();

  sessao.armazenarSessao(jwt({ sid: 's1' }), 'ref', 'cliente', true, 'ext-1');
  respostas.AGENDEAKI_VINCULO_LISTAR = { vinculos: [{ audience: 'cliente', destinatarioId: 'ext-1', idVinculo: 'v1' }] };
  inscricao.unsubscribe.mockRejectedValue(new Error('push'));
  requisitarApi.mockResolvedValue({});
  expect(await notificacoes.encerrarSessaoPerfil('cliente')).toBe(false);
  expect(requisitarApi.mock.calls.at(-1)[1].dados).toEqual({ endpointPush: 'https://push/1', idVinculo: 'v1' });
});

test('não apaga a sessão se outra aba já entrou com uma sessão diferente', async () => {
  sessao.armazenarSessao(jwt({ sid: 's1' }), 'ref', 'cliente');
  requisitarApi.mockImplementation(async () => { sessao.armazenarSessao(jwt({ sid: 's2' }), 'ref', 'cliente'); });
  await notificacoes.encerrarSessaoPerfil('cliente');
  expect(sessao.obterTokenAcesso('cliente')).not.toBeNull();
});

test('apaga a sessão quando o token foi renovado mas continua a mesma sessão', async () => {
  sessao.armazenarSessao(jwt({ sid: 's1' }), 'ref', 'cliente');
  requisitarApi.mockImplementation(async () => { sessao.armazenarSessao(jwt({ sid: 's1', renovado: true }), 'ref', 'cliente'); });
  await notificacoes.encerrarSessaoPerfil('cliente');
  expect(sessao.obterTokenAcesso('cliente')).toBeNull();
});

test('token sem identificador de sessão não impede o encerramento', async () => {
  sessao.armazenarSessao(jwt({}), 'ref', 'cliente');
  expect(await notificacoes.encerrarSessaoPerfil('cliente')).toBe(true);
  expect(sessao.obterTokenAcesso('cliente')).toBeNull();
});
