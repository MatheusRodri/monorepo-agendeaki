import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { consultarAgendamentosCliente, normalizarPaginacaoCliente } from '../src/servicos/listagemAgendamentosCliente.js';

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
    assert.doesNotMatch(sql, /:(idUsuario|pagina|porPagina|localizar|agora|inicioAlvo|limite|offset|ids)\b/);
    return executar(sql);
  });
}

test('valida página, tamanho e identificador do link de avaliação', () => {
  assert.deepEqual(normalizarPaginacaoCliente({}), { pagina: 1, porPagina: 10, localizar: null });
  assert.deepEqual(normalizarPaginacaoCliente({ pagina: '2', porPagina: '25', localizar: '7' }), { pagina: 2, porPagina: 25, localizar: 7 });
  for (const query of [{ pagina: 0 }, { pagina: '1.2' }, { pagina: -1 }, { pagina: '' }, { porPagina: 100 }, { porPagina: '10.0' }, { localizar: -7 }, { localizar: '1 OR 1=1' }, { pagina: Number.MAX_SAFE_INTEGER }]) {
    assert.throws(() => normalizarPaginacaoCliente(query), { status: 400 });
  }
});

for (const tipo of ['futuros', 'historico']) test(`${tipo} conta antes de paginar e ordena empates pelo ID`, async (t) => {
  const consultas = [];
  simularBanco(t, (sql) => {
    consultas.push(sql);
    assert.match(sql, /a.fk_usuario = 2|fk_agendamento IN \(7\)/);
    if (sql.startsWith('SELECT COUNT')) { assert.doesNotMatch(sql, /tb_avaliacao|servico_adicional|LIMIT/); return [{ total: 31 }]; }
    if (sql.includes('FROM tb_agendamento_servico_adicional')) return [
      { idAgendamento: 7, valorCobrado: '10.00' }, { idAgendamento: 7, valorCobrado: '0.00' },
    ];
    assert.match(sql, new RegExp(`ORDER BY a.dt_inicio ${tipo === 'futuros' ? 'ASC' : 'DESC'}, a.id_agendamento ${tipo === 'futuros' ? 'ASC' : 'DESC'}\\s+LIMIT 10 OFFSET 10$`));
    return [{ idAgendamento: 7, valor: '50.00' }];
  });
  const resultado = await consultarAgendamentosCliente(2, tipo, normalizarPaginacaoCliente({ pagina: 2 }));
  assert.deepEqual([resultado.pagina, resultado.total, resultado.totalPaginas], [2, 31, 4]);
  assert.equal(resultado.agendamentos[0].valorTotal, 60);
  assert.equal(resultado.agendamentos[0].servicosAdicionais.length, 2);
  assert.equal(consultas.length, 3);
});

test('link de avaliação encontra a página do próprio atendimento, incluindo empates de horário', async (t) => {
  simularBanco(t, (sql) => {
    if (sql.startsWith('SELECT COUNT') && !sql.includes('inicioAlvo') && !sql.includes('a.dt_inicio >')) return [{ total: 28 }];
    if (sql.startsWith('SELECT a.dt_inicio AS inicio')) {
      assert.match(sql, /a.fk_usuario = 2/);
      assert.match(sql, /a.id_agendamento = 7/);
      return [{ inicio: '2026-10-22 10:00:00' }];
    }
    if (sql.startsWith('SELECT COUNT')) {
      assert.match(sql, /a.dt_inicio > '2026-10-22 10:00:00' OR \(a.dt_inicio = '2026-10-22 10:00:00' AND a.id_agendamento > 7\)/);
      return [{ total: 21 }];
    }
    if (sql.includes('FROM tb_agendamento_servico_adicional')) return [];
    assert.match(sql, /LIMIT 10 OFFSET 20$/);
    return [{ idAgendamento: 7, valor: '50.00' }];
  });
  const resultado = await consultarAgendamentosCliente(2, 'historico', normalizarPaginacaoCliente({ localizar: 7 }));
  assert.equal(resultado.pagina, 3);
  assert.equal(resultado.localizado, true);
  assert.equal(resultado.agendamentos[0].idAgendamento, 7);
});

test('link de outro cliente não revela o atendimento e página excedente volta à última', async (t) => {
  simularBanco(t, (sql) => {
    if (sql.startsWith('SELECT COUNT')) return [{ total: 11 }];
    if (sql.startsWith('SELECT a.dt_inicio AS inicio')) return [];
    assert.match(sql, /LIMIT 10 OFFSET 10$/);
    return [];
  });
  const resultado = await consultarAgendamentosCliente(2, 'historico', normalizarPaginacaoCliente({ pagina: 99, localizar: 500 }));
  assert.equal(resultado.pagina, 2);
  assert.equal(resultado.totalPaginas, 2);
  assert.equal(resultado.localizado, false);
});
