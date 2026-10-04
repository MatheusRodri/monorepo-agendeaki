import { Router } from 'express';
import { receberEventoStripe } from '../servicos/stripe.js';
import { sincronizarEventoStripe } from '../servicos/sincronizarAssinaturaStripe.js';

const roteadorWebhooks = Router();
const eventosStripe = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

roteadorWebhooks.post('/stripe', async (requisicao, resposta) => {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const assinatura = requisicao.headers['stripe-signature'];
  if (!segredo || !assinatura || !Buffer.isBuffer(requisicao.body)) {
    resposta.status(400).json({ mensagem: 'Webhook Stripe não configurado ou inválido.' });
    return;
  }

  let evento;
  try {
    evento = await receberEventoStripe(requisicao.body, assinatura, segredo);
  } catch (erro) {
    console.warn('[Webhook Stripe] Assinatura recusada.', { mensagem: erro.message });
    resposta.status(400).json({ mensagem: 'Assinatura do webhook inválida.' });
    return;
  }

  if (!eventosStripe.has(evento.type)) {
    resposta.status(200).json({ recebido: true });
    return;
  }

  try {
    await sincronizarEventoStripe(evento);
    resposta.status(200).json({ recebido: true });
  } catch (erro) {
    console.error('[Webhook Stripe] Falha ao sincronizar assinatura.', { mensagem: erro.message, idEvento: evento.id, tipo: evento.type });
    resposta.status(500).json({ mensagem: 'Não foi possível sincronizar a assinatura.' });
  }
});

export default roteadorWebhooks;
