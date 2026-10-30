import Stripe from 'stripe';

const planosPremium = {
  MENSAL: { periodicidade: 'MENSAL', valor: 50.00, frequencia: 1, variavelPreco: 'STRIPE_PRICE_ID_MENSAL' },
  ANUAL: { periodicidade: 'ANUAL', valor: 400.00, frequencia: 12, variavelPreco: 'STRIPE_PRICE_ID_ANUAL' },
};

let clienteStripe;

export function obterOfertaPremium() {
  return {
    basico: { nome: 'Básico', preco: 0, recursos: ['Dashboard atual', 'Agenda, clientes e gestão do salão', '1 unidade'] },
    premium: {
      nome: 'Premium',
      testeGratisDias: 7,
      opcoes: Object.values(planosPremium).map(({ periodicidade, valor }) => ({ periodicidade, valor })),
      recursos: [
        { nome: 'Unidades ilimitadas', descricao: 'Cadastre e gerencie quantas unidades sua empresa precisar.' },
        { nome: 'Dashboard avançado', descricao: 'Painel mais detalhado para te auxiliar na tomada de decisão.' },
        { nome: 'Notificações', descricao: 'Receba notificações direto no dispositivo caso o cliente faça um agendamento, cancele ou altere.' },
        { nome: 'Destaque', descricao: 'Ganhe destaque na lista de salões da sua região.' },
        { nome: 'Exportação de dados e relatórios', descricao: 'Exporte seus dados e relatórios.' },
      ],
    },
  };
}

export function obterDadosPlanoPremium(periodicidade) {
  const plano = planosPremium[String(periodicidade ?? '').toUpperCase()];
  if (!plano) throw Object.assign(new Error('Selecione uma periodicidade válida para o plano Premium.'), { status: 400, codigo: 'PLANO_INVALIDO' });
  return plano;
}

export function obterPrecoStripe(periodicidade) {
  const plano = obterDadosPlanoPremium(periodicidade);
  const idPreco = process.env[plano.variavelPreco]?.trim();
  if (!idPreco) throw new Error(`Configure ${plano.variavelPreco} no backend para habilitar este plano.`);
  return idPreco;
}

async function validarPrecoStripe(periodicidade, idPreco = obterPrecoStripe(periodicidade)) {
  const plano = obterDadosPlanoPremium(periodicidade);
  const stripe = obterClienteStripe();
  const preco = await stripe.prices.retrieve(idPreco);
  const intervaloEsperado = String(periodicidade).toUpperCase() === 'ANUAL' ? 'year' : 'month';
  if (preco.currency !== 'brl' || preco.unit_amount !== Math.round(plano.valor * 100)
      || preco.recurring?.interval !== intervaloEsperado || (preco.recurring?.interval_count ?? 1) !== 1) {
    throw new Error(`O preço configurado em ${plano.variavelPreco} precisa ser recorrente em BRL, no valor e período corretos.`);
  }
  return preco.id;
}

export function obterClienteStripe() {
  const chave = process.env.STRIPE_SECRET_KEY?.trim();
  if (!chave) throw new Error('Configure STRIPE_SECRET_KEY no backend para habilitar as assinaturas.');
  if (!clienteStripe) clienteStripe = new Stripe(chave, { timeout: 10_000, maxNetworkRetries: 1 });
  return clienteStripe;
}

export function prepararParametrosCheckout({ emailPagador, periodicidade, referenciaExterna, testeGratis, urlRetorno }) {
  const baseRetorno = urlRetorno.split('?')[0];
  return {
    mode: 'subscription', line_items: [{ price: obterPrecoStripe(periodicidade), quantity: 1 }],
    customer_email: emailPagador, client_reference_id: referenciaExterna,
    metadata: { referenciaExterna, periodicidade },
    subscription_data: { metadata: { referenciaExterna, periodicidade }, ...(testeGratis ? { trial_period_days: 7 } : {}) },
    success_url: `${baseRetorno}?checkout=retorno&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseRetorno}?checkout=cancelado`,
  };
}

export async function criarCheckoutAssinatura({ parametros }) {
  await validarPrecoStripe(parametros.metadata.periodicidade, parametros.line_items[0].price);
  return obterClienteStripe().checkout.sessions.create(parametros, { idempotencyKey: parametros.metadata.referenciaExterna });
}

export async function encerrarAssinaturaStripe(idAssinatura) {
  const stripe = obterClienteStripe();
  const assinatura = await stripe.subscriptions.retrieve(idAssinatura);
  if (['canceled', 'incomplete_expired'].includes(assinatura.status)) return assinatura;
  if (assinatura.schedule) {
    await stripe.subscriptionSchedules.cancel(typeof assinatura.schedule === 'string' ? assinatura.schedule : assinatura.schedule.id,
      { prorate: false, invoice_now: false });
    return stripe.subscriptions.retrieve(idAssinatura);
  }
  return stripe.subscriptions.cancel(idAssinatura, { prorate: false, invoice_now: false });
}

export async function consultarCheckoutStripe(idCheckout) {
  return obterClienteStripe().checkout.sessions.retrieve(idCheckout, { expand: ['subscription'] });
}

export async function cancelarCheckoutStripe(idCheckout) {
  const stripe = obterClienteStripe();
  const checkout = await stripe.checkout.sessions.retrieve(idCheckout, { expand: ['subscription'] });
  if (checkout.status === 'open') return stripe.checkout.sessions.expire(idCheckout);
  if (checkout.subscription) {
    const idAssinatura = typeof checkout.subscription === 'string' ? checkout.subscription : checkout.subscription.id;
    if (['incomplete', 'incomplete_expired'].includes(checkout.subscription.status)) return stripe.subscriptions.cancel(idAssinatura);
    return stripe.subscriptions.update(idAssinatura, { cancel_at_period_end: true });
  }
  return checkout;
}

export async function cancelarAssinaturaStripe(idAssinatura) {
  const stripe = obterClienteStripe();
  const assinatura = await stripe.subscriptions.retrieve(idAssinatura);
  if (!['active','trialing'].includes(assinatura.status)) return encerrarAssinaturaStripe(idAssinatura);
  if (assinatura.schedule) await stripe.subscriptionSchedules.release(typeof assinatura.schedule === 'string' ? assinatura.schedule : assinatura.schedule.id);
  return stripe.subscriptions.update(idAssinatura, { cancel_at_period_end: true });
}

export async function reativarAssinaturaStripe(idAssinatura) {
  const stripe = obterClienteStripe();
  const assinatura = await stripe.subscriptions.retrieve(idAssinatura);
  const fimPeriodo = assinatura.items?.data?.[0]?.current_period_end ?? assinatura.current_period_end;
  if (!['active', 'trialing'].includes(assinatura.status) || !fimPeriodo || fimPeriodo * 1000 <= Date.now()) {
    throw Object.assign(new Error('Esta assinatura não pode mais ser reativada. Atualize o status e escolha “Assinar novamente”.'), { status: 409 });
  }
  if (!assinatura.cancel_at_period_end) return assinatura;
  return stripe.subscriptions.update(idAssinatura, { cancel_at_period_end: false, proration_behavior: 'none' });
}

export async function atualizarPeriodicidadeStripe(idAssinatura, periodicidade) {
  const stripe = obterClienteStripe();
  const novoPreco = await validarPrecoStripe(periodicidade);
  const assinatura = await stripe.subscriptions.retrieve(idAssinatura, { expand: ['items.data.price'] });
  const precoAtual = assinatura.items.data[0]?.price?.id;
  if (!precoAtual) throw new Error('Não foi possível identificar o plano atual no Stripe.');

  const agenda = await stripe.subscriptionSchedules.create({ from_subscription: idAssinatura });
  const faseAtual = agenda.phases[0];
  if (!faseAtual?.end_date) throw new Error('Não foi possível agendar a troca para o próximo ciclo.');

  await stripe.subscriptionSchedules.update(agenda.id, {
    end_behavior: 'release',
    phases: [
      {
        start_date: faseAtual.start_date,
        end_date: faseAtual.end_date,
        items: faseAtual.items.map((item) => ({ price: typeof item.price === 'string' ? item.price : item.price.id, quantity: item.quantity ?? 1 })),
        proration_behavior: 'none',
      },
      {
        start_date: faseAtual.end_date,
        items: [{ price: novoPreco, quantity: 1 }],
        proration_behavior: 'none',
      },
    ],
  });
  return stripe.subscriptions.retrieve(idAssinatura, { expand: ['items.data.price'] });
}

export async function receberEventoStripe(corpo, assinatura, segredo) {
  return obterClienteStripe().webhooks.constructEvent(corpo, assinatura, segredo);
}
