import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SUPABASE_URL = 'https://auth.agendeaki.test';
process.env.SUPABASE_ANON_KEY = 'chave-de-teste';
const { bancoDeDados } = await import('../src/configuracoes/bancoDeDados.js');
const { default: rotas } = await import('../src/rotas/salao.js');
const executarRota = (sufixo) => rotas.stack.find(({ route }) => route?.path === `/agendamentos/:idAgendamento/${sufixo}` && route.methods.patch).route.stack[0].handle;

function preparar(t, { status = 'AGENDADO', servicoValido = true } = {}) {
  const consultas = [];
  const transacao = { connection: {}, commit: t.mock.fn(), rollback: t.mock.fn() };
  t.mock.method(bancoDeDados, 'transaction', async () => transacao);
  t.mock.method(bancoDeDados.connectionManager, 'getConnection', async () => ({}));
  t.mock.method(bancoDeDados.connectionManager, 'releaseConnection', async () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    id: 'administrador-teste', email: 'admin@teste.local', user_metadata: { perfil: 'ADMIN_SALAO', nome: 'Admin' },
  }), { headers: { 'Content-Type': 'application/json' } }));

  // Mantém bancoDeDados.query real, incluindo a substituição de parâmetros do
  // Sequelize. Simula somente a execução no driver, sem conectar a um banco.
  t.mock.method(bancoDeDados.dialect.Query.prototype, 'run', async function (sql) {
    assert.doesNotMatch(sql, /:[a-z_]\w*/i, 'O SQL enviado ao MySQL deve ter todos os parâmetros substituídos.');
    consultas.push({ sql, transaction: this.options.transaction });
    if (sql.includes('FROM tb_usuario WHERE id_autenticacao_externa')) return [{ idUsuario: 1 }];
    if (sql.includes('FROM tb_salao s')) return [{ idSalao: 1 }];
    if (sql.includes('FROM tb_agendamento a INNER JOIN')) return [{ idUnidade: 1, idUsuario: null, idClienteSalao: 2 }];
    if (sql.includes('FROM tb_agendamento')) return [{ status, idUnidade: 1, servico: 'Corte', dataHoraInicio: '2020-01-01T09:00:00-03:00' }];
    if (sql.includes('FROM tb_servico s')) return servicoValido ? [{ nomeServico: 'Escova', valorReferencia: 40, duracaoMinutos: 30, nomeFuncionario: 'Bia' }] : [];
    if (sql.startsWith('SELECT')) return [];
    if (sql.startsWith('UPDATE tb_agendamento') || sql.startsWith('INSERT INTO tb_agendamento_servico_adicional')) return [{ affectedRows: 1 }, { affectedRows: 1 }];
    throw new Error(`Consulta inesperada no teste: ${sql}`);
  });
  const resposta = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(dados) { this.dados = dados; return this; } };
  const requisicao = { headers: { authorization: 'Bearer teste' }, params: { idAgendamento: '7' }, originalUrl: '/agendamentos/7/confirmar-atendimento', body: {} };
  return { requisicao, resposta, transacao, consultas };
}

for (const quantidade of [0, 1, 2]) test(`conclui com ${quantidade} extra(s) e substitui os parâmetros antes de enviar o SQL`, async (t) => {
  const { requisicao, resposta, transacao, consultas } = preparar(t);
  if (quantidade) requisicao.body.servicosAdicionais = Array.from({ length: quantidade }, (_, indice) => ({ idServico: indice + 2, idFuncionario: 3, valorCobrado: '35.50' }));
  await executarRota('confirmar-atendimento')(requisicao, resposta);
  assert.equal(resposta.codigo, 200, resposta.dados?.mensagem);
  assert.equal(transacao.commit.mock.callCount(), 1);
  assert.equal(transacao.rollback.mock.callCount(), 0);
  const gravacoes = consultas.filter(({ sql }) => /^(UPDATE|INSERT)/.test(sql));
  assert.equal(gravacoes.filter(({ sql }) => sql.startsWith('INSERT')).length, quantidade);
  assert.equal(gravacoes.length, quantidade + 1);
  assert.ok(gravacoes.every(({ transaction }) => transaction === transacao));
  assert.match(gravacoes.at(-1).sql, /CASE WHEN 'REALIZADO' = 'REALIZADO' THEN NOW\(\) ELSE dt_realizacao END/);
});

test('ausência usa parâmetros substituídos e preserva a data de realização', async (t) => {
  const { requisicao, resposta, consultas } = preparar(t);
  await executarRota('nao-compareceu')(requisicao, resposta);
  assert.equal(resposta.codigo, 200, resposta.dados?.mensagem);
  assert.match(consultas.find(({ sql }) => sql.startsWith('UPDATE')).sql, /CASE WHEN 'NAO_COMPARECEU' = 'REALIZADO' THEN NOW\(\) ELSE dt_realizacao END/);
});

test('envio repetido não grava extras nem atualiza novamente o atendimento', async (t) => {
  const { requisicao, resposta, transacao, consultas } = preparar(t, { status: 'REALIZADO' });
  requisicao.body.servicosAdicionais = [{ idServico: 2, idFuncionario: 3, valorCobrado: 40 }];
  await executarRota('confirmar-atendimento')(requisicao, resposta);
  assert.equal(resposta.codigo, 409);
  assert.equal(transacao.rollback.mock.callCount(), 1);
  assert.equal(transacao.commit.mock.callCount(), 0);
  assert.ok(consultas.every(({ sql }) => sql.startsWith('SELECT')));
});

test('extra inválido impede a conclusão e desfaz a transação', async (t) => {
  const { requisicao, resposta, transacao, consultas } = preparar(t, { servicoValido: false });
  requisicao.body.servicosAdicionais = [{ idServico: 2, idFuncionario: 3, valorCobrado: 40 }];
  await executarRota('confirmar-atendimento')(requisicao, resposta);
  assert.equal(resposta.codigo, 400);
  assert.equal(transacao.rollback.mock.callCount(), 1);
  assert.equal(transacao.commit.mock.callCount(), 0);
  assert.ok(consultas.every(({ sql }) => sql.startsWith('SELECT')));
});
