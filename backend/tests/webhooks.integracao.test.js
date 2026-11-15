import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import express from 'express';

// Servidor HTTP real com o roteador real; Stripe e sincronização são simulados.
const sincronizados = [];
let eventoRecebido = { id: 'evt_1', type: 'invoice.paid' };
let falharAssinatura = false;
let falharSincronizacao = false;
jest.unstable_mockModule('../src/servicos/stripe.js', () => ({
  receberEventoStripe: async () => {
    if (falharAssinatura) throw new Error('assinatura inválida');
    return eventoRecebido;
  },
}));
jest.unstable_mockModule('../src/servicos/sincronizarAssinaturaStripe.js', () => ({
  sincronizarEventoStripe: async (evento) => {
    if (falharSincronizacao) throw new Error('banco indisponível');
    sincronizados.push(evento.id);
  },
}));
const { default: roteadorWebhooks } = await import('../src/rotas/webhooks.js');

let servidor;
let url;
beforeAll(async () => {
  const aplicacao = express();
  aplicacao.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  aplicacao.use('/api/webhooks', roteadorWebhooks);
  await new Promise((resolver) => { servidor = aplicacao.listen(0, resolver); });
  url = `http://127.0.0.1:${servidor.address().port}/api/webhooks/stripe`;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_teste';
});
afterAll(() => new Promise((resolver) => servidor.close(resolver)));

const enviar = (cabecalhos = { 'stripe-signature': 't=1,v1=abc' }) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...cabecalhos }, body: '{"id":"evt_1"}',
});

test('rejeita requisição sem assinatura', async () => {
  const resposta = await enviar({});
  assert.equal(resposta.status, 400);
});

test('rejeita quando o segredo do webhook não está configurado', async () => {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try { assert.equal((await enviar()).status, 400); } finally { process.env.STRIPE_WEBHOOK_SECRET = segredo; }
});

test('rejeita assinatura recusada pela Stripe', async () => {
  falharAssinatura = true;
  const aviso = console.warn;
  console.warn = () => {};
  try { assert.equal((await enviar()).status, 400); } finally { falharAssinatura = false; console.warn = aviso; }
});

test('sincroniza eventos de assinatura conhecidos', async () => {
  eventoRecebido = { id: 'evt_paid', type: 'invoice.paid' };
  const resposta = await enviar();
  assert.equal(resposta.status, 200);
  expect(await resposta.json()).toEqual({ recebido: true });
  assert.deepEqual(sincronizados, ['evt_paid']);
});

test('confirma sem sincronizar eventos desconhecidos', async () => {
  eventoRecebido = { id: 'evt_outro', type: 'charge.refunded' };
  const resposta = await enviar();
  assert.equal(resposta.status, 200);
  assert.equal(sincronizados.includes('evt_outro'), false);
});

test('responde 500 quando a sincronização falha, para a Stripe reenviar', async () => {
  eventoRecebido = { id: 'evt_falha', type: 'customer.subscription.updated' };
  falharSincronizacao = true;
  const erro = console.error;
  console.error = () => {};
  try { assert.equal((await enviar()).status, 500); } finally { falharSincronizacao = false; console.error = erro; }
});
