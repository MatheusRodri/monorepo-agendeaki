import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { consultarVisaoGeralDashboard } from '../src/servicos/dashboardVisaoGeral.js';

after(async () => bancoDeDados.close());

for (const [nome, selecao] of [
  ['sem filtros opcionais', { idUnidade: 0, idServico: 0, idFuncionario: 0, promocao: 'todas', ajusteValor: 'todos' }],
  ['com unidade, serviço, profissional e promoção', { idUnidade: 2, idServico: 3, idFuncionario: 4, promocao: 'com', ajusteValor: 'acrescimo' }],
]) {
  test(`prepara as consultas da visão geral ${nome}`, async (t) => {
    // Executa a preparação real do Sequelize, interceptando somente o acesso ao MySQL.
    t.mock.method(bancoDeDados.connectionManager, 'getConnection', async () => ({}));
    t.mock.method(bancoDeDados.connectionManager, 'releaseConnection', async () => {});
    const consultas = [];
    t.mock.method(bancoDeDados.dialect.Query.prototype, 'run', async (sql) => {
      consultas.push(sql);
      assert.doesNotMatch(sql, /:[a-zA-Z_][a-zA-Z0-9_]*/, 'Não pode enviar parâmetros sem substituição ao MySQL');
      if (sql.includes('SUM(item.valor) AS valor')) {
        assert.match(sql, /a.cd_status = 'REALIZADO'/);
        assert.match(sql, /DATE\(a.dt_realizacao\) BETWEEN '2026-09-01' AND '2026-09-30'/);
        return [{ data: '2026-09-15', valor: '40.00' }];
      }
      if (sql.includes('AS quantidadeAnterior')) return [{ quantidade: 2, quantidadeAnterior: 1 }];
      if (sql.includes('AS promocaoTipo')) return [{ idServico: 3, servico: 'Corte', unidade: 'Centro', valor: '50.00',
        promocaoTipo: 'PERCENTUAL', promocaoValor: '20.00', promocaoHabilitada: 1,
        promocaoInicio: '2026-10-01', promocaoFim: '2026-10-30' }];
      return [];
    });

    const resultado = await consultarVisaoGeralDashboard({
      idSalao: 1, ...selecao, dataInicio: '2026-10-01', dataFim: '2026-10-30', agora: '2026-10-30 12:00:00',
    }, '2026-09-01', '2026-09-30');

    assert.equal(consultas.length, 5);
    assert.deepEqual(resultado.receitaPorDiaAnterior, [{ data: '2026-09-15', valor: '40.00' }]);
    assert.deepEqual(resultado.futurosPorDia, []);
    assert.deepEqual(resultado.cancelamentosPorDia, []);
    assert.equal(resultado.inicioPrevisao, '2026-10-30');
    assert.equal(resultado.fimPrevisao, '2026-11-29');
    assert.equal(resultado.promocoesAtivas, 1);
    assert.equal(resultado.listaPromocoesAtivas[0].promocaoAtiva, true);
    assert.equal(resultado.listaPromocoesAtivas[0].valorVigente, 40);
    assert.equal(resultado.agendamentosComPromocao, 2);
    assert.equal(resultado.agendamentosComPromocaoAnterior, 1);
  });
}
