import assert from 'node:assert/strict';
import { calcularHistoricoPreco, calcularAjusteExtra, normalizarFiltrosPrecos, normalizarObservacaoAjuste } from '../src/servicos/historicoPrecos.js';

const agora = new Date('2026-10-30T15:00:00Z');
const promocao = { ativa: true, tipo: 'PERCENTUAL', valor: 20, dataInicio: '2026-10-30', dataFim: '2026-10-30' };

test('registra preço e configuração da promoção separadamente dos ajustes', () => {
  const historico = calcularHistoricoPreco(50, promocao, true, agora);
  assert.deepEqual(historico, { precoNormal: 50, precoVigente: 40, promocaoAplicada: true, tipoPromocaoAplicada: 'PERCENTUAL', valorPromocaoAplicada: 20 });
  for (const [cobrado, desconto, acrescimo] of [[35, 5, 0], [40, 0, 0], [45, 0, 5], [0, 40, 0]]) {
    assert.deepEqual(calcularAjusteExtra(historico, cobrado, 40), { valorCobrado: cobrado, descontoAdicional: desconto, acrescimo });
  }
  promocao.valor = 10;
  assert.equal(historico.precoVigente, 40);
  assert.equal(historico.valorPromocaoAplicada, 20);
  promocao.valor = 20;
});

test('respeita validade, ativação e Premium inclusive nos limites do dia em São Paulo', () => {
  for (const [oferta, premium, data] of [
    [null, true, agora], [{ ...promocao, ativa: false }, true, agora], [promocao, false, agora],
    [promocao, true, new Date('2026-10-30T02:59:59Z')], [promocao, true, new Date('2026-10-31T03:00:00Z')],
  ]) {
    const historico = calcularHistoricoPreco(50, oferta, premium, data);
    assert.equal(historico.precoVigente, 50);
    assert.equal(historico.promocaoAplicada, false);
    assert.equal(historico.tipoPromocaoAplicada, null);
  }
  assert.equal(calcularHistoricoPreco(50, promocao, true, new Date('2026-10-31T02:59:59Z')).precoVigente, 40);
  assert.equal(calcularHistoricoPreco(50, { ativa: true, tipo: 'PRECO_FIXO', valor: 35 }, true, agora).precoVigente, 35);
});

test('arredonda em centavos e rejeita valores inválidos ou preço esperado desatualizado', () => {
  const historico = calcularHistoricoPreco(19.99, { ativa: true, tipo: 'PERCENTUAL', valor: 12.5 }, true, agora);
  assert.equal(historico.precoVigente, 17.49);
  assert.equal(calcularAjusteExtra(historico, 17.48, 17.49).descontoAdicional, 0.01);
  assert.equal(calcularAjusteExtra(historico, 17.50, 17.49).acrescimo, 0.01);
  assert.equal(calcularAjusteExtra(historico, undefined, 17.49).valorCobrado, 17.49);
  assert.throws(() => calcularAjusteExtra(historico, 17.48, 20), { status: 409, codigo: 'PRECO_ALTERADO' });
  for (const valor of [-1, '1.234', 'abc', Infinity, 100000000]) assert.throws(() => calcularAjusteExtra(historico, valor), { status: 400 });
});

test('filtros opcionais têm valores fechados e preservam a classificação desconhecida', () => {
  assert.deepEqual(normalizarFiltrosPrecos({}), { promocao: 'todas', ajusteValor: 'todos' });
  assert.deepEqual(normalizarFiltrosPrecos({ promocao: 'naoInformado', ajusteValor: 'naoInformado' }), { promocao: 'naoInformado', ajusteValor: 'naoInformado' });
  for (const query of [{ promocao: 'ativa' }, { ajusteValor: 'qualquer' }, { promocao: [] }]) assert.throws(() => normalizarFiltrosPrecos(query), { status: 400 });
});

test('observação do ajuste é opcional, preserva o texto e valida tipo e limite', () => {
  for (const valor of [undefined, null, '', '  \n ']) assert.equal(normalizarObservacaoAjuste(valor), null);
  assert.equal(normalizarObservacaoAjuste('  Acréscimo por acabamento especial.\nCombinado no fechamento.  '), 'Acréscimo por acabamento especial.\nCombinado no fechamento.');
  assert.equal(normalizarObservacaoAjuste('á'.repeat(500)).length, 500);
  for (const valor of [123, [], {}, true, 'a'.repeat(501)]) assert.throws(() => normalizarObservacaoAjuste(valor), { status: 400 });
});
