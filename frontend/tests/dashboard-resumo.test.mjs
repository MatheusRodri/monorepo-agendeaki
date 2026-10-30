import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarRanking, montarSerie } from '../components/DashboardPremium/resumoDashboard.mjs';

test('ranking ordena os valores reais e agrupa os restantes sem perder o total', () => {
  const itens = [2, 5, 1, 8, 4, 0].map((quantidade, id) => ({ id, nome: `Serviço ${id}`, quantidade }));
  const ranking = montarRanking(itens);
  assert.deepEqual(ranking.map((item) => item.quantidade), [8, 5, 4, 2, 1]);
  assert.equal(ranking.at(-1).nome, 'Outros');
  assert.equal(ranking.reduce((soma, item) => soma + item.quantidade, 0), 20);
  assert.equal(ranking.reduce((soma, item) => soma + item.percentual, 0), 100);
  assert.equal(itens[0].quantidade, 2); // não altera os dados compartilhados com o Detalhado.
});

test('ranking não cria serviços ou profissionais fictícios e trata ausência de movimento', () => {
  assert.deepEqual(montarRanking([]), []);
  assert.deepEqual(montarRanking([{ id: 1, nome: 'João', quantidade: '0' }]), [{ id: 1, nome: 'João', quantidade: 0, percentual: 0 }]);
  const nomes = montarRanking([{ nome: 'Barba', quantidade: 1 }, { nome: 'Corte', quantidade: 2 }]);
  assert.equal(nomes.length, 2);
  assert.equal(nomes[0].percentual, 2 / 3 * 100);
});

test('série diária preenche dias sem movimento e exclui registros fora do período', () => {
  const resultado = montarSerie([{ data: '2026-10-01', valor: 40 }, { data: '2026-10-03', valor: 60 }, { data: '2026-09-30', valor: 999 }], '2026-10-01', '2026-10-03', 'valor');
  assert.deepEqual(resultado, [40, 0, 60]);
  assert.deepEqual(montarSerie([], '', '', 'valor'), []);
  assert.deepEqual(montarSerie([], '2026-10-03', '2026-10-01', 'valor'), []);
});

test('períodos longos mantêm totais e calculam ticket ponderado por atendimentos', () => {
  const registros = [{ data: '2026-01-01', receita: 100, atendimentos: 1 }, { data: '2026-01-02', receita: 200, atendimentos: 4 }];
  const receita = montarSerie(registros, '2026-01-01', '2026-12-31', 'receita');
  const ticket = montarSerie(registros, '2026-01-01', '2026-12-31', 'receita', 'atendimentos');
  assert.equal(receita.length, 60);
  assert.equal(receita.reduce((soma, item) => soma + item, 0), 300);
  assert.equal(ticket[0], 60); // (100 + 200) ÷ (1 + 4), em vez da média simples dos tickets.
  assert.equal(ticket[1], 0);
});
