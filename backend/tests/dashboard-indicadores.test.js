import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SUPABASE_URL = 'https://auth.agendeaki.test';
process.env.SUPABASE_ANON_KEY = 'chave-de-teste';
const { bancoDeDados } = await import('../src/configuracoes/bancoDeDados.js');
const { default: rotas } = await import('../src/rotas/salao.js');
const executar = rotas.stack.find(({ route }) => route?.path === '/indicadores/premium').route.stack[0].handle;

async function consultar(t, resumo, anterior = {}, filtros = {}) {
  const consultas = [];
  t.mock.method(bancoDeDados.connectionManager, 'getConnection', async () => ({}));
  t.mock.method(bancoDeDados.connectionManager, 'releaseConnection', async () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    id: 'administrador-teste', email: 'admin@teste.local', user_metadata: { perfil: 'ADMIN_SALAO', nome: 'Admin' },
  }), { headers: { 'Content-Type': 'application/json' } }));
  t.mock.method(bancoDeDados.dialect.Query.prototype, 'run', async (sql) => {
    assert.doesNotMatch(sql, /:(idSalao|idUnidade|idServico|idFuncionario|dataInicio|dataFim)\b/);
    consultas.push(sql);
    if (sql.includes('FROM tb_usuario WHERE id_autenticacao_externa')) return [{ idUsuario: 1 }];
    if (sql.includes('FROM tb_salao s')) return [{ idSalao: 8 }];
    if (sql.includes('FROM tb_assinatura_salao WHERE')) return [{ status: 'AUTORIZADA' }];
    if (sql.includes('AS quantidadeComparecimentos')) return [{
      quantidadeAgendamentosElegiveis: 0, quantidadeAgendamentosCancelados: 0,
      ...(sql.includes('AS quantidadeAgendamentosRealizados') ? resumo : anterior),
    }];
    if (sql.includes('AS receitaPrevista')) return [{ receitaPrevista: 0 }];
    return [];
  });
  const resposta = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(dados) { this.dados = dados; return this; } };
  await executar({ headers: { authorization: 'Bearer teste' }, query: {
    dataInicio: '2026-10-01', dataFim: '2026-10-23', incluirAnalise: 'false', ...filtros,
  } }, resposta);
  assert.equal(resposta.codigo, 200, resposta.dados?.mensagem);
  return { ...resposta.dados, consultas };
}

for (const [realizados, ausencias, taxa] of [[3, 1, 75], [3, 0, 100], [0, 2, 0], [0, 0, null]]) {
  test(`comparecimento com ${realizados} realizados e ${ausencias} ausências retorna ${taxa ?? 'sem base'}`, async (t) => {
    const dados = await consultar(t, { quantidadeComparecimentos: String(realizados), quantidadeNaoCompareceu: String(ausencias) }, {
      quantidadeComparecimentos: '1', quantidadeNaoCompareceu: '1',
    });
    assert.equal(dados.resumo.taxaComparecimento, taxa);
    assert.equal(dados.comparacaoAnterior.taxaComparecimento, 50);
  });
}

test('indicadores e comparação usam itens filtrados, confirmação para serviços e data agendada para comparecimento', async (t) => {
  const dados = await consultar(t, {
    quantidadeServicosRealizados: '3', receitaServicosExtras: '10.00', quantidadeComparecimentos: '1', quantidadeNaoCompareceu: '1',
  }, { quantidadeComparecimentos: 0, quantidadeNaoCompareceu: 0 }, { idUnidade: '4', idServico: '2', idFuncionario: '3' });
  assert.equal(dados.resumo.quantidadeServicosRealizados, '3');
  assert.equal(dados.resumo.receitaServicosExtras, '10.00');
  assert.equal(dados.comparacaoAnterior.taxaComparecimento, null);
  const agregados = dados.consultas.filter((sql) => sql.includes('AS quantidadeComparecimentos'));
  assert.equal(agregados.length, 2);
  for (const sql of agregados) {
    assert.match(sql, /SELECT COUNT\(\*\) FROM vw_servico_atendimento item WHERE item.id_agendamento=a.id_agendamento AND \(2 = 0 OR item.fk_servico=2\) AND \(3 = 0 OR item.fk_funcionario=3\)/);
    assert.match(sql, /SELECT COALESCE\(SUM\(item.vl_cobrado\),0\) FROM tb_agendamento_servico_adicional item/);
    assert.match(sql, /WHERE u.fk_salao=8 AND a.fk_unidade=4 AND EXISTS/);
    assert.doesNotMatch(sql, /INNER JOIN vw_servico_atendimento/, 'O agregado principal conta atendimentos, sem multiplicar pelos serviços.');
  }
  assert.match(agregados[0], /a.cd_status='REALIZADO' AND DATE\(a.dt_realizacao\)>='2026-10-01'[^]*AS quantidadeServicosRealizados/);
  assert.match(agregados[0], /a.cd_status='REALIZADO' AND DATE\(a.dt_inicio\)>='2026-10-01' AND DATE\(a.dt_inicio\)<='2026-10-23' THEN 1 ELSE 0 END\),0\) AS quantidadeComparecimentos/);
  assert.match(agregados[1], /DATE\(a.dt_inicio\) BETWEEN '2026-09-08' AND '2026-09-30' AND a.cd_status='NAO_COMPARECEU'/);
});
