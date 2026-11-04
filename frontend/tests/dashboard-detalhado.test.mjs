import assert from 'node:assert/strict';
import { destaquesDetalhados, rankingDetalhado, receitaPromocoes, resumirAgenda, seriesFinanceiras } from '../components/DashboardPremium/detalhadoDashboard.mjs';

test('alternância dos rankings conserva quantidades e receitas inclusive em Outros', () => {
  const itens = Array.from({ length: 8 }, (_, i) => ({ id: i, nome: `Serviço ${i}`, quantidade: i + 1, receita: (8 - i) * 10 }));
  for (const criterio of ['quantidade', 'receita']) {
    const ranking = rankingDetalhado(itens, criterio);
    assert.equal(ranking.length, 5);
    assert.equal(ranking.at(-1).nome, 'Outros');
    assert.equal(ranking.reduce((soma, item) => soma + item.quantidade, 0), 36);
    assert.equal(ranking.reduce((soma, item) => soma + item.receita, 0), 360);
    assert.ok(Math.abs(ranking.reduce((soma, item) => soma + item.percentual, 0) - 100) < 1e-9);
  }
  assert.equal(rankingDetalhado(itens, 'quantidade')[0].id, 7);
  assert.equal(rankingDetalhado(itens, 'receita')[0].id, 0);
  assert.equal(itens[0].id, 0);
  assert.deepEqual(rankingDetalhado([]), []);
  assert.equal(rankingDetalhado([{ id: 1, nome: 'Gratuito', quantidade: 2, receita: 0 }], 'receita')[0].percentual, 0);
});

test('agenda preserva a base ativa, ordena segunda a domingo e inclui horários fora da faixa comercial', () => {
  const agenda = resumirAgenda([
    { diaSemana: 0, hora: 6, quantidade: '2', cancelados: 1 },
    { diaSemana: 1, hora: 22, quantidade: 3 },
    { diaSemana: 1, hora: 22, quantidade: 1 },
    { diaSemana: 3, hora: 12, quantidade: 0, cancelados: 5 },
  ]);
  assert.deepEqual(agenda.dias.map((item) => item.nome), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
  assert.equal(agenda.total, 6); // cancelamentos não entram na demanda.
  assert.equal(agenda.dias[0].quantidade, 4);
  assert.equal(agenda.dias[6].quantidade, 2);
  assert.equal(agenda.horas[0], 6);
  assert.equal(agenda.horas.at(-1), 22);
  assert.equal(agenda.celulas.get('1:22').quantidade, 4);
  assert.equal(resumirAgenda().total, 0);
});

test('evolução financeira alinha períodos pela posição e preenche dias sem receita', () => {
  const serie = seriesFinanceiras({ filtros: { dataInicio: '2026-10-01', dataFim: '2026-10-03' },
    periodoComparacao: { dataInicioAnterior: '2026-09-28', dataFimAnterior: '2026-09-30' },
    receitaPorDia: [{ data: '2026-10-03', valor: '90' }],
    visaoGeral: { receitaPorDiaAnterior: [{ data: '2026-09-28', valor: '30' }, { data: '2026-09-30', valor: '50' }] } });
  assert.deepEqual(serie.atual, [0, 0, 90]);
  assert.deepEqual(serie.anterior, [30, 0, 50]);
});

test('receita de promoções conserva valores fora dos dez serviços do ranking', () => {
  const itens = receitaPromocoes({ promocoes: { resumo: { receitaComPromocao: '500.01' },
    ranking: [{ idServico: 1, idUnidade: 1, servico: 'Corte', unidade: 'Centro', utilizacoes: 3, receitaRealizada: '300.00' }] } });
  assert.equal(itens[0].nome, 'Corte · Centro');
  assert.equal(itens[1].receita, 200.01);
  assert.equal(rankingDetalhado(itens, 'receita').reduce((soma, item) => soma + item.receita, 0), 500.01);
});

test('destaques sem base não inventam variação, ocupação ou utilização de promoções', () => {
  const destaques = destaquesDetalhados({}, String);
  assert.match(destaques.financeiro[0].texto, /Sem receita no período anterior/);
  assert.equal(destaques.servicos[0].tipo, 'neutro');
  assert.equal(destaques.agenda[0].tipo, 'neutro');
  assert.equal(destaques.profissionais[0].tipo, 'neutro');
  assert.equal(destaques.promocoes[0].tipo, 'neutro');
  const legado = destaquesDetalhados({ promocoes: { resumo: { servicosNaoInformados: 8, servicosConhecidos: 0 } } }, String);
  assert.doesNotMatch(legado.promocoes[0].texto, /100%|0,0%/);
});

test('destaques distinguem serviços de atendimentos e respeitam ausência de grade', () => {
  const destaques = destaquesDetalhados({ resumo: { receitaRealizada: 100 }, comparacaoAnterior: { receitaRealizada: 200 },
    receitaPorServico: [{ servico: 'Corte', quantidade: 3, valor: 75 }, { servico: 'Barba', quantidade: 1, valor: 25 }],
    profissionais: [{ profissional: 'João', atendimentosRealizados: 2, ocupacaoEstimada: null }] }, String);
  assert.equal(destaques.financeiro[0].tipo, 'alerta');
  assert.match(destaques.financeiro[0].texto, /50,0%/);
  assert.match(destaques.servicos[0].texto, /75,0% dos serviços/);
  assert.match(destaques.profissionais[0].texto, /Sem grade/);
});
