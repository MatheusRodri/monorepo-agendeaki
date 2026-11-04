import assert from 'node:assert/strict';
import { destaquesDetalhados, percentualDetalhado, rankingDetalhado, receitaPromocoes, resumirAgenda, servicosDetalhados } from '../components/DashboardPremium/detalhadoDashboard.mjs';
import { montarRanking, montarSerie } from '../components/DashboardPremium/resumoDashboard.mjs';

const dinheiro = (valor) => `R$ ${valor}`;

test('percentual sem valor aparece como traço', () => {
  assert.equal(percentualDetalhado(null), '—');
  assert.equal(percentualDetalhado(12.34), '12,3%');
});

test('empates nos rankings seguem a ordem alfabética do nome', () => {
  const itens = [{ id: 1, nome: 'Zeca', quantidade: 2, receita: 5 }, { id: 2, nome: 'Ana', quantidade: 2, receita: 5 }];
  assert.deepEqual(rankingDetalhado(itens).map((item) => item.nome), ['Ana', 'Zeca']);
  assert.deepEqual(montarRanking(itens).map((item) => item.nome), ['Ana', 'Zeca']);
});

test('agenda ignora dia ou hora fora do intervalo', () => {
  const agenda = resumirAgenda([{ diaSemana: 9, hora: 10, quantidade: 5 }, { diaSemana: 1, hora: 30, quantidade: 5 }, { diaSemana: 2, hora: 9, quantidade: 1 }]);
  assert.equal(agenda.total, 1);
});

test('serviços detalhados toleram dados sem receita por serviço', () => {
  assert.deepEqual(servicosDetalhados({}), []);
});

test('série aceita registros ausentes e valores não numéricos', () => {
  assert.deepEqual(montarSerie(undefined, '2026-10-01', '2026-10-02', 'valor'), [0, 0]);
  assert.deepEqual(montarSerie([{ data: '2026-10-01', valor: 'x', qtd: 'y' }], '2026-10-01', '2026-10-01', 'valor', 'qtd'), [0]);
});

const completo = (extra = {}) => ({
  resumo: { receitaRealizada: 200 },
  comparacaoAnterior: { receitaRealizada: 100 },
  receitaPorServico: [{ servico: 'Corte', quantidade: 3, valor: 150 }, { servico: 'Barba', quantidade: 3, valor: 50 }],
  mapaCalor: [{ diaSemana: 1, hora: 9, quantidade: 4 }, { diaSemana: 2, hora: 10, quantidade: 1 }],
  profissionais: [
    { profissional: 'Ana', atendimentosRealizados: 3, receitaRealizada: 150, ocupacaoEstimada: 40 },
    { profissional: 'Bia', atendimentosRealizados: 3, receitaRealizada: 50, ocupacaoEstimada: 20 },
  ],
  promocoes: { resumo: { servicosComPromocao: 2, receitaComPromocao: 80, participacaoPromocoes: 50 } },
  ...extra,
});

test('destaques completos descrevem crescimento, agenda, equipe e promoções', () => {
  const d = destaquesDetalhados(completo(), dinheiro);
  assert.equal(d.financeiro[0].titulo, 'Receita em crescimento');
  assert.match(d.financeiro[0].texto, /aumentou 100,0%.* Corte lidera/);
  assert.equal(d.financeiro[0].tipo, 'positivo');
  assert.match(d.financeiro[1].texto, /Barba teve a menor receita/);
  assert.match(d.servicos[0].titulo, /Barba|Corte/);
  assert.match(d.agenda[0].titulo, /Seg concentra/);
  assert.match(d.agenda[0].texto, /segunda-feira, às 09h/);
  assert.match(d.agenda[1].texto, /menor volume/);
  assert.match(d.profissionais[0].texto, /Ocupação estimada de 40,0%/);
  assert.match(d.profissionais[1].texto, /Bia apresenta a menor ocupação/);
  assert.equal(d.promocoes[0].titulo, 'Promoções geraram R$ 80');
});

test('destaques de receita estável, em queda e sem serviços', () => {
  const estavel = destaquesDetalhados(completo({ comparacaoAnterior: { receitaRealizada: 200 } }), dinheiro);
  assert.equal(estavel.financeiro[0].titulo, 'Receita estável');
  assert.match(estavel.financeiro[0].texto, /variou/);
  const queda = destaquesDetalhados(completo({ comparacaoAnterior: { receitaRealizada: 400 } }), dinheiro);
  assert.equal(queda.financeiro[0].titulo, 'Receita em queda');
  assert.equal(queda.financeiro[0].tipo, 'alerta');
  const semServicos = destaquesDetalhados({ resumo: { receitaRealizada: 10 }, comparacaoAnterior: { receitaRealizada: 5 } }, dinheiro);
  assert.doesNotMatch(semServicos.financeiro[0].texto, /lidera/);
});

test('serviço em destaque com receita zero mostra 0% da receita', () => {
  const d = destaquesDetalhados(completo({ resumo: { receitaRealizada: 0 } }), dinheiro);
  assert.match(d.servicos[0].texto, /0,0% da receita/);
});

test('profissional sem grade informa que não há estimativa de ocupação', () => {
  const d = destaquesDetalhados(completo({ profissionais: [{ profissional: 'Ana', atendimentosRealizados: 2, receitaRealizada: 10, ocupacaoEstimada: null }] }), dinheiro);
  assert.match(d.profissionais[0].texto, /Sem grade para estimar/);
  assert.match(d.profissionais[1].texto, /Cadastre a disponibilidade/);
});

test('promoções sem ranking e empates de receita e de pico seguem critérios de desempate', () => {
  assert.deepEqual(receitaPromocoes({ promocoes: { resumo: {} } }), []);
  const empates = destaquesDetalhados({
    resumo: { receitaRealizada: 10 },
    receitaPorServico: [{ servico: 'Zeta', quantidade: 1, valor: 5 }, { servico: 'Alfa', quantidade: 2, valor: 5 }],
    mapaCalor: [{ diaSemana: 3, hora: 9, quantidade: 2 }, { diaSemana: 1, hora: 11, quantidade: 2 }, { diaSemana: 1, hora: 8, quantidade: 2 }],
  }, dinheiro);
  assert.match(empates.financeiro[1].texto, /Zeta teve a menor receita/);
  assert.match(empates.agenda[0].texto, /segunda-feira, às 08h/);
});
