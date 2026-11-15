import assert from 'node:assert/strict';
import {
  apresentarServico, calcularValorPromocional, normalizarPromocao, normalizarValorServico,
  precoServico, resolverPromocaoEdicao, validarValorEsperado,
} from '../src/servicos/promocoesServicos.js';

const promocao = { ativa: true, tipo: 'PERCENTUAL', valor: 20, dataInicio: '2026-10-01', dataFim: '2026-10-31' };

test('normalizarValorServico aceita até duas casas e rejeita valores inválidos', () => {
  assert.equal(normalizarValorServico(50), '50.00');
  assert.equal(normalizarValorServico('19.9'), '19.90');
  for (const valor of [-1, '1.234', 'abc', null, undefined, 100000000, '']) {
    assert.throws(() => normalizarValorServico(valor), { status: 400, codigo: 'PROMOCAO_INVALIDA' });
  }
});

test('calcularValorPromocional calcula percentual em centavos e preço fixo', () => {
  assert.equal(calcularValorPromocional(50, { tipo: 'PERCENTUAL', valor: 20 }), 40);
  assert.equal(calcularValorPromocional(19.99, { tipo: 'PERCENTUAL', valor: 12.5 }), 17.49);
  assert.equal(calcularValorPromocional(50, { tipo: 'PRECO_FIXO', valor: 35 }), 35);
});

test('normalizarPromocao valida estrutura, percentual, datas e preço inferior ao normal', () => {
  assert.equal(normalizarPromocao(null, 50), null);
  assert.deepEqual(normalizarPromocao(promocao, 50).tipo, 'PERCENTUAL');
  const invalidas = [
    undefined, [], { ativa: 'sim', tipo: 'PERCENTUAL', valor: 10 }, { ativa: true, tipo: 'OUTRO', valor: 10 },
    { ...promocao, valor: 0 }, { ...promocao, valor: 101 },
    { ...promocao, dataInicio: '2026-10-31', dataFim: '2026-10-01' },
    { ...promocao, dataInicio: '2026-02-30' },
    { ativa: true, tipo: 'PRECO_FIXO', valor: 50 },
  ];
  for (const invalida of invalidas) assert.throws(() => normalizarPromocao(invalida, 50), { status: 400 });
});

test('promoção inativa não exige preço inferior ao normal', () => {
  assert.doesNotThrow(() => normalizarPromocao({ ativa: false, tipo: 'PRECO_FIXO', valor: 80 }, 50));
});

test('precoServico informa o status da promoção por data, ativação e Premium', () => {
  const agora = new Date('2026-10-15T15:00:00Z');
  const status = (oferta, premium = true, data = agora) => precoServico(50, oferta, premium, data).statusPromocao;
  assert.equal(status(null), 'SEM_PROMOCAO');
  assert.equal(status({ ...promocao, ativa: false }), 'DESATIVADA');
  assert.equal(status(promocao, false), 'SUSPENSA');
  assert.equal(status(promocao, true, new Date('2026-09-30T15:00:00Z')), 'AGENDADA');
  assert.equal(status(promocao, true, new Date('2026-11-02T15:00:00Z')), 'ENCERRADA');
  assert.equal(status(promocao), 'ATIVA');
  assert.deepEqual(precoServico(50, promocao, true, agora), {
    valorOriginal: 50, valorVigente: 40, promocaoAtiva: true, statusPromocao: 'ATIVA',
  });
  assert.equal(precoServico(50, promocao, false, agora).valorVigente, 50);
});

test('resolverPromocaoEdicao bloqueia mudanças sem Premium e mantém a anterior sem novo dado', () => {
  assert.deepEqual(resolverPromocaoEdicao({}, promocao, 50, false), promocao);
  assert.throws(() => resolverPromocaoEdicao({ promocao: { ...promocao, valor: 10 } }, promocao, 50, false),
    { status: 403, codigo: 'PREMIUM_NECESSARIO' });
  assert.equal(resolverPromocaoEdicao({ promocao: null }, promocao, 50, true), null);
  assert.equal(resolverPromocaoEdicao({ promocao: { ...promocao, valor: 10 } }, null, 50, true).valor, 10);
});

test('validarValorEsperado ignora ausência e rejeita preço desatualizado', () => {
  assert.doesNotThrow(() => validarValorEsperado(undefined, 40));
  assert.doesNotThrow(() => validarValorEsperado('40.00', 40));
  assert.throws(() => validarValorEsperado(50, 40), { status: 409, codigo: 'PRECO_ALTERADO' });
});

test('apresentarServico usa o valor vigente para o cliente e o original no administrativo', () => {
  const linha = {
    id: 1, nome: 'Corte', valor: '50.00', promocaoTipo: 'PERCENTUAL', promocaoValor: '20.00',
    promocaoHabilitada: 1, promocaoInicio: '2026-10-01', promocaoFim: '2026-10-31',
  };
  const agora = new Date('2026-10-15T15:00:00Z');
  const cliente = apresentarServico(linha, true, false, agora);
  assert.equal(cliente.valor, 40);
  assert.equal(cliente.promocao, undefined);
  assert.equal(cliente.promocaoTipo, undefined);
  const admin = apresentarServico(linha, true, true, agora);
  assert.equal(admin.valor, 50);
  assert.equal(admin.promocao.valor, 20);
});
