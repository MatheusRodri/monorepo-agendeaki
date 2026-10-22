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
  if (!plano) throw new Error('Selecione uma periodicidade válida para o plano Premium.');
  return plano;
}

export function obterPrecoStripe(periodicidade) {
  const plano = obterDadosPlanoPremium(periodicidade);
  const idPreco = process.env[plano.variavelPreco]?.trim();
  if (!idPreco) throw new Error(`Configure ${plano.variavelPreco} no backend para habilitar este plano.`);
  return idPreco;
}

async function validarPrecoStripe(periodicidade) {
  const plano = obterDadosPlanoPremium(periodicidade);
  const stripe = obterClienteStripe();
  const preco = await stripe.prices.retrieve(obterPrecoStripe(periodicidade));
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
  if (!clienteStripe) clienteStripe = new Stripe(chave);
  return clienteStripe;
}

export async function criarCheckoutAssinatura({ emailPagador, periodicidade, referenciaExterna, testeGratis, urlRetorno }) {
  const stripe = obterClienteStripe();
  const idPreco = await validarPrecoStripe(periodicidade);
  const baseRetorno = urlRetorno.split('?')[0];
  const assinatura = {
    metadata: { referenciaExterna, periodicidade },
    ...(testeGratis ? { trial_period_days: 7 } : {}),
  };
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: idPreco, quantity: 1 }],
    customer_email: emailPagador,
    client_reference_id: referenciaExterna,
    metadata: { referenciaExterna, periodicidade },
    subscription_data: assinatura,
    success_url: `${baseRetorno}?checkout=retorno&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseRetorno}?checkout=cancelado`,
  });
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
  return obterClienteStripe().subscriptions.update(idAssinatura, { cancel_at_period_end: true });
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
