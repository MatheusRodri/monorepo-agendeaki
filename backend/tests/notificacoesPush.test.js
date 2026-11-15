import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { beforeEach, test } from '@jest/globals';
import { mockarBanco, silenciarConsole } from './auxiliares/ambiente.js';

const banco = mockarBanco();
const enviar = jest.fn();
const definirVapid = jest.fn();
jest.unstable_mockModule('web-push', () => ({ default: { sendNotification: enviar, setVapidDetails: definirVapid } }));
const push = await import('../src/servicos/notificacoesPush.js');

const inscricao = { endpoint: 'https://push.exemplo/abc', keys: { p256dh: 'p', auth: 'a' } };
const inscritos = [{ endpoint: 'https://push.exemplo/1', p256dh: 'p', auth: 'a', idVinculo: 'v1', destinatarioId: 'ext-1' }];

beforeEach(() => {
  banco.reiniciar();
  enviar.mockReset();
  silenciarConsole();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

function configurarVapid() {
  process.env.VAPID_PUBLIC_KEY = 'publica';
  process.env.VAPID_PRIVATE_KEY = 'privada';
}

test('chave pública só existe quando configurada', () => {
  assert.equal(push.obterChavePublicaPush(), null);
  configurarVapid();
  assert.equal(push.obterChavePublicaPush(), 'publica');
});

test('notificações do salão: criar, listar e marcar como lidas', async () => {
  banco.responder(/INSERT INTO tb_notificacao_salao/, [7, 1]);
  assert.equal(await push.criarNotificacaoSalao(1, 'T', 'C'), 7);
  banco.reiniciar();
  assert.equal(await push.criarNotificacaoSalao(1, 'T', 'C'), null);
  banco.responder(/FROM tb_notificacao_salao WHERE fk_salao=:idSalao\s+ORDER BY/, [{ id: 1 }]);
  banco.responder(/SELECT COUNT\(\*\) AS quantidade FROM tb_notificacao_salao/, [{ quantidade: '3' }]);
  assert.deepEqual(await push.listarNotificacoesSalao(1), { notificacoes: [{ id: 1 }], naoLidas: 3 });
  banco.responder(/UPDATE tb_notificacao_salao SET st_lida=TRUE WHERE id_notificacao/, [{ affectedRows: 1 }]);
  assert.equal(await push.marcarNotificacaoSalaoLida(1, 2), true);
  banco.reiniciar();
  assert.equal(await push.marcarNotificacaoSalaoLida(1, 2), false);
  await push.marcarTodasNotificacoesSalaoLidas(1);
  assert.ok(banco.chamou(/WHERE fk_salao=:idSalao AND st_lida=FALSE/));
});

test('inscrições de salão e de cliente: salvar, consultar e remover', async () => {
  const idSalao = await push.salvarInscricaoPush(1, inscricao);
  const idCliente = await push.salvarInscricaoPushCliente(2, inscricao);
  assert.match(idSalao, /^[0-9a-f-]{36}$/);
  assert.notEqual(idSalao, idCliente);
  await push.removerInscricaoPush(1, inscricao.endpoint, idSalao);
  await push.removerInscricaoPushCliente(2, inscricao.endpoint, idCliente);
  assert.equal(await push.consultarInscricaoPush(1, ''), false);
  assert.equal(await push.consultarInscricaoPushCliente(2, ''), false);
  assert.equal(await push.consultarInscricaoPush(1, inscricao.endpoint), null);
  banco.responder(/id_vinculo_dispositivo AS idVinculo FROM tb_inscricao_notificacao/, [{ idVinculo: 'v' }]);
  assert.equal(await push.consultarInscricaoPush(1, inscricao.endpoint), 'v');
  assert.equal(await push.consultarInscricaoPushCliente(2, inscricao.endpoint), 'v');
});

test('notificações do cliente: criar, listar, marcar uma e todas', async () => {
  banco.responder(/INSERT INTO tb_notificacao_cliente/, [9, 1]);
  assert.equal(await push.criarNotificacaoCliente(1, 2, { titulo: 'T', mensagem: 'M', link: '/x' }, {}), 9);
  banco.responder(/FROM tb_notificacao_cliente n\s+INNER JOIN tb_agendamento a[\s\S]*ORDER BY criadaEm/, [{ id: 1 }]);
  banco.responder(/SELECT COUNT\(\*\) AS quantidade FROM tb_notificacao_cliente/, [{ quantidade: '2' }]);
  assert.equal((await push.listarNotificacoesCliente(1)).naoLidas, 2);
  banco.responder(/UPDATE tb_notificacao_cliente n INNER JOIN tb_agendamento a[\s\S]*n.id_notificacao=:idNotificacao/, [{ affectedRows: 1 }]);
  assert.equal(await push.marcarNotificacaoClienteLida(1, 5), true);
  banco.reiniciar();
  assert.equal(await push.marcarNotificacaoClienteLida(1, 5), false);
  await push.marcarTodasNotificacoesClienteLidas(1);
  assert.ok(banco.chamou(/UPDATE tb_notificacao_cliente/));
});

test('push do cliente: sem VAPID avisa e considera entregue', async () => {
  assert.equal(await push.enviarNotificacaoPushCliente(1, 'T', 'M', 1, '/l'), true);
  assert.equal(enviar.mock.calls.length, 0);
});

test('push do cliente: sem dispositivos, sucesso, expiração e falha', async () => {
  configurarVapid();
  assert.equal(await push.enviarNotificacaoPushCliente(1, 'T', 'M', 1, '/l'), true);
  banco.responder(/FROM tb_inscricao_notificacao_cliente i INNER JOIN tb_usuario u/, inscritos);
  enviar.mockResolvedValue({});
  assert.equal(await push.enviarNotificacaoPushCliente(1, 'T', 'M', 1, '/l'), true);
  assert.equal(JSON.parse(enviar.mock.calls[0][1]).audience, 'cliente');
  enviar.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
  assert.equal(await push.enviarNotificacaoPushCliente(1, 'T', 'M', 1, '/l'), true);
  assert.ok(banco.chamou(/DELETE FROM tb_inscricao_notificacao_cliente WHERE ds_endpoint_hash/));
  enviar.mockRejectedValue(Object.assign(new Error('erro'), { statusCode: 500 }));
  assert.equal(await push.enviarNotificacaoPushCliente(1, 'T', 'M', 1, '/l'), false);
  banco.responder(/FROM tb_inscricao_notificacao_cliente i INNER JOIN tb_usuario u/, () => { throw new Error('banco'); });
  assert.equal(await push.enviarNotificacaoPushCliente(1, 'T', 'M', 1, '/l'), false);
});

test('push do salão: sem VAPID, sem dispositivos, sucesso, expiração e falhas', async () => {
  await push.enviarNotificacaoSalao(1, 'T', 'C');
  configurarVapid();
  await push.enviarNotificacaoSalao(1, 'T', 'C');
  assert.equal(enviar.mock.calls.length, 0);
  banco.responder(/FROM tb_inscricao_notificacao i INNER JOIN tb_salao s/, inscritos);
  enviar.mockResolvedValue({});
  await push.enviarNotificacaoSalao(1, 'T', 'C', 3);
  assert.equal(JSON.parse(enviar.mock.calls[0][1]).id, 3);
  enviar.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 404 }));
  await push.enviarNotificacaoSalao(1, 'T', 'C');
  assert.ok(banco.chamou(/DELETE FROM tb_inscricao_notificacao WHERE ds_endpoint_hash/));
  enviar.mockRejectedValue(new Error('rede'));
  await push.enviarNotificacaoSalao(1, 'T', 'C');
  banco.responder(/FROM tb_inscricao_notificacao i INNER JOIN tb_salao s/, () => { throw new Error('banco'); });
  await push.enviarNotificacaoSalao(1, 'T', 'C');
});

const agendamento = { idSalao: 1, nomeCliente: 'Maria', nomeServico: 'Corte', dataAgendamento: '30/10/2026', horaAgendamento: '10:00' };

test('notificar salão do agendamento exige Premium e personaliza a mensagem por tipo', async () => {
  banco.responder(/FROM tb_agendamento a\s+INNER JOIN tb_unidade u/, [agendamento]);
  await push.notificarSalaoDoAgendamento(1, 'Novo agendamento', 'x');
  assert.equal(banco.chamou(/INSERT INTO tb_notificacao_salao/), false);
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao/, [{ status: 'AUTORIZADA' }]);
  banco.responder(/INSERT INTO tb_notificacao_salao/, [4, 1]);
  const mensagens = {};
  for (const titulo of ['Novo agendamento', 'Agendamento cancelado', 'Agendamento alterado', 'Outro']) {
    banco.chamadas.length = 0;
    await push.notificarSalaoDoAgendamento(1, titulo, 'padrão');
    mensagens[titulo] = banco.chamadas.find((c) => /INSERT INTO tb_notificacao_salao/.test(c.sql)).opcoes.replacements.corpo;
  }
  assert.match(mensagens['Novo agendamento'], /realizou um agendamento/);
  assert.match(mensagens['Agendamento cancelado'], /cancelou/);
  assert.match(mensagens['Agendamento alterado'], /alterou/);
  assert.equal(mensagens.Outro, 'padrão');
});

test('notificar salão cobre status de assinatura e falhas de gravação', async () => {
  banco.responder(/FROM tb_agendamento a\s+INNER JOIN tb_unidade u/, [agendamento]);
  banco.responder(/INSERT INTO tb_notificacao_salao/, () => { throw new Error('banco'); });
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao/, [{ status: 'CANCELAMENTO_AGENDADO', dataFim: '2999-01-01' }]);
  await push.notificarSalaoDoAgendamento(1, 'Novo agendamento', 'x');
  assert.ok(banco.chamou(/INSERT INTO tb_notificacao_salao/));
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao/, [{ status: 'CANCELAMENTO_AGENDADO', dataFim: '2000-01-01' }]);
  banco.chamadas.length = 0;
  await push.notificarSalaoDoAgendamento(1, 'Novo agendamento', 'x');
  assert.equal(banco.chamou(/INSERT INTO tb_notificacao_salao/), false);
  banco.responder(/FROM tb_agendamento a\s+INNER JOIN tb_unidade u/, [{ ...agendamento, dataAgendamento: null }]);
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao/, [{ status: 'EM_TESTE' }]);
  await push.notificarSalaoDoAgendamento(1, 'Novo agendamento', 'x');
  banco.responder(/FROM tb_agendamento a\s+INNER JOIN tb_unidade u/, () => { throw new Error('banco'); });
  await push.notificarSalaoDoAgendamento(1, 'Novo agendamento', 'x');
  banco.reiniciar();
  await push.notificarSalaoDoAgendamento(1, 'Novo agendamento', 'x');
});

test('notificar salão da unidade respeita Premium e tolera falhas', async () => {
  await push.notificarSalaoDaUnidade(5, 'T', 'C');
  banco.responder(/SELECT fk_salao AS idSalao FROM tb_unidade/, [{ idSalao: 1 }]);
  await push.notificarSalaoDaUnidade(5, 'T', 'C');
  assert.equal(banco.chamou(/INSERT INTO tb_notificacao_salao/), false);
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao/, [{ status: 'AUTORIZADA' }]);
  banco.responder(/INSERT INTO tb_notificacao_salao/, [3, 1]);
  await push.notificarSalaoDaUnidade(5, 'T', 'C');
  assert.ok(banco.chamou(/INSERT INTO tb_notificacao_salao/));
  banco.responder(/INSERT INTO tb_notificacao_salao/, () => { throw new Error('banco'); });
  await push.notificarSalaoDaUnidade(5, 'T', 'C');
  banco.responder(/SELECT fk_salao AS idSalao FROM tb_unidade/, () => { throw new Error('banco'); });
  await push.notificarSalaoDaUnidade(5, 'T', 'C');
});

test('montar aviso e desvincular push por identidade', async () => {
  assert.deepEqual(push.montarAvisoPush({ destinatarioId: 'e', idVinculo: 'v' }, 'salao', 3),
    { versao: 1, id: 3, audience: 'salao', destinatarioId: 'e', idVinculo: 'v', title: 'AgendeAki', body: 'Você tem uma nova atualização.', url: '/salao/notificacoes' });
  await push.desvincularPushIdentidade('e', 'cliente', 1, 'v');
  assert.equal(banco.chamadas.length, 0);
  await push.desvincularPushIdentidade('e', 'cliente', 'https://p/1', 'v');
  assert.ok(banco.chamou(/DELETE i FROM tb_inscricao_notificacao_cliente/));
  await push.desvincularPushIdentidade('e', 'salao', 'https://p/1', 'v');
  assert.ok(banco.chamou(/DELETE i FROM tb_inscricao_notificacao i/));
});
