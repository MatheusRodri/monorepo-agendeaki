import assert from 'node:assert/strict';
import { jest } from '@jest/globals';

// Troca somente a conexão: o SQL e o mapeamento de campos do serviço são os reais.
const chamadas = [];
let assinaturaEncontrada = { idAssinatura: 3, idSalao: 9, idCliente: 'cus_banco' };
jest.unstable_mockModule('../src/configuracoes/bancoDeDados.js', () => ({
  bancoDeDados: {
    async query(sql, opcoes) {
      chamadas.push({ sql, opcoes });
      return sql.includes('SELECT') ? (assinaturaEncontrada ? [assinaturaEncontrada] : []) : [];
    },
  },
}));
const { obterIdAssinaturaFatura, salvarFaturaAssinatura } = await import('../src/servicos/faturasAssinaturas.js');

test('obterIdAssinaturaFatura lê os formatos antigo e novo da fatura Stripe', () => {
  assert.equal(obterIdAssinaturaFatura({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(obterIdAssinaturaFatura({ subscription: { id: 'sub_2' } }), 'sub_2');
  assert.equal(obterIdAssinaturaFatura({ parent: { subscription_details: { subscription: 'sub_3' } } }), 'sub_3');
  assert.equal(obterIdAssinaturaFatura({ parent: { subscription_details: { subscription_id: 'sub_4' } } }), 'sub_4');
  assert.equal(obterIdAssinaturaFatura({}), null);
});

test('salvarFaturaAssinatura ignora fatura sem assinatura ou sem id', async () => {
  chamadas.length = 0;
  assert.equal(await salvarFaturaAssinatura({ id: 'in_1' }), false);
  assert.equal(await salvarFaturaAssinatura({ subscription: 'sub_1' }), false);
  assert.equal(chamadas.length, 0);
});

test('salvarFaturaAssinatura ignora assinatura desconhecida', async () => {
  chamadas.length = 0;
  assinaturaEncontrada = null;
  assert.equal(await salvarFaturaAssinatura({ id: 'in_1', subscription: 'sub_x' }), false);
  assert.equal(chamadas.length, 1);
  assinaturaEncontrada = { idAssinatura: 3, idSalao: 9, idCliente: 'cus_banco' };
});

test('salvarFaturaAssinatura grava a fatura paga com valores e datas convertidos', async () => {
  chamadas.length = 0;
  const salvou = await salvarFaturaAssinatura({
    id: 'in_1', subscription: 'sub_1', customer: { id: 'cus_1' }, status: 'paid', currency: 'BRL',
    total: 2990, amount_paid: 2990, created: 1761840000, period_start: 1761840000, period_end: 1764432000,
    billing_reason: 'subscription_cycle',
  });
  assert.equal(salvou, true);
  const { replacements } = chamadas[1].opcoes;
  assert.equal(replacements.idFatura, 'in_1');
  assert.equal(replacements.idCliente, 'cus_1');
  assert.equal(replacements.moeda, 'brl');
  assert.equal(replacements.total, 2990);
  assert.equal(replacements.idSalao, 9);
  assert.equal(replacements.criadaEm.toISOString(), '2025-10-30T16:00:00.000Z');
  assert.deepEqual(replacements.pagoEm, replacements.criadaEm);
});

test('salvarFaturaAssinatura usa padrões para fatura aberta sem campos opcionais', async () => {
  chamadas.length = 0;
  await salvarFaturaAssinatura({ id: 'in_2', subscription: 'sub_1', status: 'open' });
  const { replacements } = chamadas[1].opcoes;
  assert.equal(replacements.idCliente, 'cus_banco');
  assert.equal(replacements.pago, 0);
  assert.equal(replacements.pagoEm, null);
  assert.equal(replacements.motivo, null);
});
