import assert from 'node:assert/strict';
import { calcularMetricasCancelamento, comporMotivo } from '../src/servicos/metricasAgenda.js';
import { completarResumoPromocoes } from '../src/servicos/metricasPromocoes.js';
import { normalizarPaginacaoCliente } from '../src/servicos/listagemAgendamentosCliente.js';

const motivos = { CLIENTE: 'Cliente desistiu', OUTRO: 'Outro motivo' };

test('calcularMetricasCancelamento calcula taxa e distribuição de status', () => {
  const resumo = calcularMetricasCancelamento({
    quantidadeAgendamentosElegiveis: '8', quantidadeCancelamentosElegiveis: '2',
    quantidadeComparecimentos: '5', quantidadeAgendamentosMarcados: '1', quantidadeNaoCompareceu: '0',
  });
  assert.equal(resumo.taxaCancelamento, 25);
  assert.deepEqual(resumo.distribuicaoStatus, { realizados: 5, marcados: 1, cancelados: 2, naoCompareceu: 0 });
});

test('calcularMetricasCancelamento devolve taxa nula sem agendamentos elegíveis', () => {
  assert.equal(calcularMetricasCancelamento({}).taxaCancelamento, null);
});

test('comporMotivo monta o texto e valida código e detalhe', () => {
  assert.equal(comporMotivo('CLIENTE', '', motivos), 'Cliente desistiu');
  assert.equal(comporMotivo('CLIENTE', 'sem tempo', motivos), 'Cliente desistiu: sem tempo');
  const invalidos = [['INEXISTENTE', '', motivos], ['CLIENTE', 123, motivos], ['CLIENTE', 'x'.repeat(201), motivos], ['OUTRO', '   ', motivos]];
  for (const argumentos of invalidos) assert.throws(() => comporMotivo(...argumentos), { status: 400 });
});

test('comporMotivo rejeita motivo completo acima de 300 caracteres', () => {
  assert.throws(() => comporMotivo('CLIENTE', 'x'.repeat(200), { CLIENTE: 'y'.repeat(150) }), { status: 400 });
});

test('completarResumoPromocoes converte para número e calcula a participação', () => {
  const resumo = completarResumoPromocoes({ servicosConhecidos: '10', servicosComPromocao: '4' });
  assert.equal(resumo.servicosConhecidos, 10);
  assert.equal(resumo.participacaoPromocoes, 40);
  assert.equal(completarResumoPromocoes({ servicosConhecidos: '0', servicosComPromocao: '0' }).participacaoPromocoes, null);
});

test('normalizarPaginacaoCliente aplica padrões e valida os limites', () => {
  assert.deepEqual(normalizarPaginacaoCliente({}), { pagina: 1, porPagina: 10, localizar: null });
  assert.deepEqual(normalizarPaginacaoCliente({ pagina: '3', porPagina: '25', localizar: '9' }), { pagina: 3, porPagina: 25, localizar: 9 });
  const invalidas = [{ pagina: '0' }, { pagina: 'a' }, { pagina: '-1' }, { porPagina: '20' }, { localizar: '0' }, { localizar: 'x' }];
  for (const consulta of invalidas) assert.throws(() => normalizarPaginacaoCliente(consulta), { status: 400 });
});
