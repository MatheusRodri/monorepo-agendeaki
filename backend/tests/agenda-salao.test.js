import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { consultarAgendaSalao, normalizarConsultaAgenda } from '../src/servicos/agendaSalao.js';

const agora = new Date('2026-12-31T02:30:00Z'); // 30/12 às 23h30 em São Paulo.
const normalizar = (query = {}) => normalizarConsultaAgenda(query, agora);
function simularBanco(t, executar) {
  const transaction = { connection: {} };
  t.mock.method(bancoDeDados, 'transaction', async (opcoes, trabalho) => {
    assert.equal(opcoes.isolationLevel, 'REPEATABLE READ');
    return trabalho(transaction);
  });
  t.mock.method(bancoDeDados.connectionManager, 'getConnection', async () => ({}));
  t.mock.method(bancoDeDados.connectionManager, 'releaseConnection', async () => {});
  t.mock.method(bancoDeDados.dialect.Query.prototype, 'run', async function (sql) {
    assert.equal(this.options.transaction, transaction);
    assert.doesNotMatch(sql, /:(idSalao|agora|inicioPeriodo|fimPeriodo|limite|offset|ids)\b/);
    return executar(sql);
  });
}

test('agenda usa São Paulo nos limites de dia, amanhã e sete dias, inclusive na virada do ano', () => {
  const todos = normalizar();
  assert.deepEqual([todos.tipo, todos.periodo, todos.pagina, todos.porPagina], ['futuros', 'todos', 1, 10]);
  assert.equal(todos.agora, '2026-12-30 23:30:00');
  assert.equal(todos.inicioPeriodo, null);
  for (const [periodo, inicio, fim] of [
    ['hoje', '2026-12-30', '2026-12-31'], ['amanha', '2026-12-31', '2027-01-01'], ['7dias', '2026-12-30', '2027-01-06'],
  ]) {
    const consulta = normalizar({ periodo });
    assert.equal(consulta.inicioPeriodo, `${inicio} 00:00:00`);
    assert.equal(consulta.fimPeriodo, `${fim} 00:00:00`);
  }
});

test('recusa períodos, tipos e paginação inválidos', () => {
  for (const query of [{ tipo: 'outro' }, { periodo: 'ontem' }, { pagina: 0 }, { pagina: -1 }, { pagina: '1.5' }, { pagina: '' }, { porPagina: '25.0' }, { porPagina: 1000 }, { porPagina: '' }, { pagina: Number.MAX_SAFE_INTEGER }]) assert.throws(() => normalizar(query), { status: 400 });
});

for (const tipo of ['futuros', 'historico']) test(`${tipo}: filtra antes de paginar, isola o salão e desempata horários pelo ID`, async (t) => {
  const consultas = [];
  simularBanco(t, (sql) => {
    consultas.push(sql);
    if (sql.includes('FROM tb_agendamento_servico_adicional')) {
      assert.match(sql, /WHERE fk_agendamento IN \(9\)/);
      return [{ idAgendamento: 9, servico: 'Escova', valorCobrado: '12.50' }, { idAgendamento: 9, servico: 'Extra gratuito', valorCobrado: '0.00' }];
    }
    assert.match(sql, /u.fk_salao = 8 AND \(/);
    assert.match(sql, /AND a.dt_inicio >= '2026-12-31 00:00:00' AND a.dt_inicio < '2027-01-01 00:00:00'/);
    assert.match(sql, tipo === 'futuros' ? /a.dt_inicio >= '2026-12-30 23:30:00' AND a.cd_status = 'AGENDADO'/
      : /a.dt_inicio < '2026-12-30 23:30:00' OR a.cd_status IN \('REALIZADO', 'CANCELADO', 'NAO_COMPARECEU'\)\) AND/);
    if (sql.startsWith('SELECT COUNT')) {
      assert.doesNotMatch(sql, /tb_pagamento|servico_adicional|LIMIT/);
      return [{ total: '27' }];
    }
    assert.match(sql, new RegExp(`ORDER BY a.dt_inicio ${tipo === 'futuros' ? 'ASC' : 'DESC'}, a.id_agendamento ${tipo === 'futuros' ? 'ASC' : 'DESC'}\\s+LIMIT 10 OFFSET 10`));
    return [{ idAgendamento: 9, valor: '50.00' }];
  });
  const resultado = await consultarAgendaSalao(8, normalizar({ tipo, periodo: 'amanha', pagina: 2 }));
  assert.deepEqual([resultado.pagina, resultado.porPagina, resultado.total, resultado.totalPaginas], [2, 10, 27, 3]);
  assert.equal(resultado.tipo, tipo);
  assert.equal(resultado.agendamentos[0].valorTotal, 62.5);
  assert.equal(resultado.agendamentos[0].servicosAdicionais.length, 2);
  assert.equal(consultas.length, 3);
});

for (const total of [0, 26]) test(`ajusta uma página removida ou inválida para o total atual de ${total} registros`, async (t) => {
  simularBanco(t, (sql) => {
    assert.doesNotMatch(sql, /inicioPeriodo|fimPeriodo/);
    if (sql.startsWith('SELECT COUNT')) return [{ total }];
    assert.match(sql, new RegExp(`LIMIT 25 OFFSET ${total ? 25 : 0}$`));
    return [];
  });
  const resultado = await consultarAgendaSalao(8, normalizar({ tipo: 'historico', pagina: 20, porPagina: 25 }));
  assert.equal(resultado.pagina, total ? 2 : 1);
  assert.equal(resultado.totalPaginas, total ? 2 : 1);
  assert.deepEqual(resultado.agendamentos, []);
});
