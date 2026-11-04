import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { beforeEach, expect, test } from '@jest/globals';
import { mockarBanco, silenciarConsole } from './auxiliares/ambiente.js';

const banco = mockarBanco();
const fn = () => jest.fn();
const stripe = {
  prices: { retrieve: fn() },
  checkout: { sessions: { create: fn(), retrieve: fn(), expire: fn() } },
  subscriptions: { retrieve: fn(), cancel: fn(), update: fn() },
  subscriptionSchedules: { cancel: fn(), release: fn(), create: fn(), update: fn() },
  webhooks: { constructEvent: fn() },
};
jest.unstable_mockModule('stripe', () => ({ default: class { constructor() { return stripe; } } }));
const servico = await import('../src/servicos/stripe.js');
const contratacoes = await import('../src/servicos/contratacoes.js');
const sincronizacao = await import('../src/servicos/sincronizarAssinaturaStripe.js');

function reiniciarStripe(objeto = stripe) {
  for (const valor of Object.values(objeto)) {
    if (typeof valor?.mockReset === 'function') valor.mockReset();
    else if (valor && typeof valor === 'object') reiniciarStripe(valor);
  }
}

const precoMensal = { id: 'price_m', currency: 'brl', unit_amount: 5000, recurring: { interval: 'month', interval_count: 1 } };
const precoAnual = { id: 'price_a', currency: 'brl', unit_amount: 40000, recurring: { interval: 'year' } };

beforeEach(() => {
  banco.reiniciar();
  reiniciarStripe();
  silenciarConsole();
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID_MENSAL: 'price_m', STRIPE_PRICE_ID_ANUAL: 'price_a', FRONTEND_URL: 'https://app.teste/' });
});

test('oferta e planos Premium', () => {
  const oferta = servico.obterOfertaPremium();
  assert.equal(oferta.premium.opcoes.length, 2);
  assert.equal(servico.obterDadosPlanoPremium('mensal').valor, 50);
  assert.throws(() => servico.obterDadosPlanoPremium('SEMANAL'), { codigo: 'PLANO_INVALIDO' });
  assert.throws(() => servico.obterDadosPlanoPremium(undefined), { status: 400 });
});

test('preço e cliente Stripe exigem configuração', () => {
  assert.equal(servico.obterPrecoStripe('ANUAL'), 'price_a');
  delete process.env.STRIPE_PRICE_ID_ANUAL;
  assert.throws(() => servico.obterPrecoStripe('ANUAL'), /STRIPE_PRICE_ID_ANUAL/);
  assert.equal(servico.obterClienteStripe(), stripe);
  delete process.env.STRIPE_SECRET_KEY;
  assert.throws(() => servico.obterClienteStripe(), /STRIPE_SECRET_KEY/);
});

test('parâmetros de checkout incluem teste grátis e URLs de retorno sem query', () => {
  const com = servico.prepararParametrosCheckout({ emailPagador: 'a@a.com', periodicidade: 'MENSAL', referenciaExterna: 'ref', testeGratis: true, urlRetorno: 'https://app/salao/assinatura?x=1' });
  assert.equal(com.subscription_data.trial_period_days, 7);
  assert.equal(com.success_url, 'https://app/salao/assinatura?checkout=retorno&session_id={CHECKOUT_SESSION_ID}');
  assert.equal(com.line_items[0].price, 'price_m');
  const sem = servico.prepararParametrosCheckout({ emailPagador: 'a@a.com', periodicidade: 'ANUAL', referenciaExterna: 'ref', testeGratis: false, urlRetorno: 'https://app/x' });
  assert.equal(sem.subscription_data.trial_period_days, undefined);
});

test('criar checkout valida moeda, valor e intervalo do preço', async () => {
  const parametros = servico.prepararParametrosCheckout({ emailPagador: 'a@a.com', periodicidade: 'MENSAL', referenciaExterna: 'ref', testeGratis: false, urlRetorno: 'https://app/x' });
  stripe.prices.retrieve.mockResolvedValue(precoMensal);
  stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_1' });
  assert.equal((await servico.criarCheckoutAssinatura({ parametros })).id, 'cs_1');
  assert.equal(stripe.checkout.sessions.create.mock.calls[0][1].idempotencyKey, 'ref');
  for (const invalido of [{ ...precoMensal, currency: 'usd' }, { ...precoMensal, unit_amount: 1 }, { ...precoMensal, recurring: { interval: 'year' } }, { ...precoMensal, recurring: { interval: 'month', interval_count: 2 } }]) {
    stripe.prices.retrieve.mockResolvedValue(invalido);
    await assert.rejects(() => servico.criarCheckoutAssinatura({ parametros }), /recorrente em BRL/);
  }
});

test('encerrar assinatura trata estados, agenda de troca e cancelamento imediato', async () => {
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'canceled' });
  assert.equal((await servico.encerrarAssinaturaStripe('s')).status, 'canceled');
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'active', schedule: 'sched_1' });
  await servico.encerrarAssinaturaStripe('s');
  assert.equal(stripe.subscriptionSchedules.cancel.mock.calls[0][0], 'sched_1');
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'active', schedule: { id: 'sched_2' } });
  await servico.encerrarAssinaturaStripe('s');
  assert.equal(stripe.subscriptionSchedules.cancel.mock.calls[1][0], 'sched_2');
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'active' });
  stripe.subscriptions.cancel.mockResolvedValue({ status: 'canceled' });
  assert.equal((await servico.encerrarAssinaturaStripe('s')).status, 'canceled');
});

test('consultar e cancelar checkout cobre todas as ramificações', async () => {
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'complete', subscription: null });
  assert.equal((await servico.consultarCheckoutStripe('cs')).id, 'cs');
  assert.equal((await servico.cancelarCheckoutStripe('cs')).id, 'cs');
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'open' });
  await servico.cancelarCheckoutStripe('cs');
  assert.equal(stripe.checkout.sessions.expire.mock.calls.length, 1);
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'complete', subscription: { id: 'sub', status: 'incomplete' } });
  await servico.cancelarCheckoutStripe('cs');
  assert.equal(stripe.subscriptions.cancel.mock.calls[0][0], 'sub');
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'complete', subscription: { id: 'sub', status: 'active' } });
  await servico.cancelarCheckoutStripe('cs');
  expect(stripe.subscriptions.update.mock.calls[0]).toEqual(['sub', { cancel_at_period_end: true }]);
});

test('cancelar e reativar assinatura', async () => {
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'canceled' });
  await servico.cancelarAssinaturaStripe('s');
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'active', schedule: 'sch' });
  await servico.cancelarAssinaturaStripe('s');
  assert.equal(stripe.subscriptionSchedules.release.mock.calls[0][0], 'sch');
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 's', status: 'trialing', schedule: { id: 'sch2' } });
  await servico.cancelarAssinaturaStripe('s');
  assert.equal(stripe.subscriptionSchedules.release.mock.calls[1][0], 'sch2');

  const futuro = Math.floor(Date.now() / 1000) + 86400;
  stripe.subscriptions.retrieve.mockResolvedValue({ status: 'canceled' });
  await assert.rejects(() => servico.reativarAssinaturaStripe('s'), { status: 409 });
  stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active', items: { data: [{ current_period_end: 1 }] } });
  await assert.rejects(() => servico.reativarAssinaturaStripe('s'), { status: 409 });
  stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active', cancel_at_period_end: false, current_period_end: futuro });
  assert.equal((await servico.reativarAssinaturaStripe('s')).status, 'active');
  stripe.subscriptions.retrieve.mockResolvedValue({ status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: futuro }] } });
  await servico.reativarAssinaturaStripe('s');
  assert.equal(stripe.subscriptions.update.mock.calls.at(-1)[1].cancel_at_period_end, false);
});

test('atualizar periodicidade agenda a troca para o próximo ciclo', async () => {
  stripe.prices.retrieve.mockResolvedValue(precoAnual);
  stripe.subscriptions.retrieve.mockResolvedValue({ items: { data: [] } });
  await assert.rejects(() => servico.atualizarPeriodicidadeStripe('s', 'ANUAL'), /plano atual/);
  stripe.subscriptions.retrieve.mockResolvedValue({ items: { data: [{ price: { id: 'price_m' } }] } });
  stripe.subscriptionSchedules.create.mockResolvedValue({ id: 'sch', phases: [{}] });
  await assert.rejects(() => servico.atualizarPeriodicidadeStripe('s', 'ANUAL'), /agendar a troca/);
  stripe.subscriptionSchedules.create.mockResolvedValue({ id: 'sch', phases: [{ start_date: 1, end_date: 2, items: [{ price: 'price_m' }, { price: { id: 'price_x' }, quantity: 2 }] }] });
  await servico.atualizarPeriodicidadeStripe('s', 'ANUAL');
  const fases = stripe.subscriptionSchedules.update.mock.calls[0][1].phases;
  assert.deepEqual(fases[0].items, [{ price: 'price_m', quantity: 1 }, { price: 'price_x', quantity: 2 }]);
  assert.equal(fases[1].items[0].price, 'price_a');
});

test('receber evento delega a validação da assinatura ao SDK', async () => {
  stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt' });
  assert.deepEqual(await servico.receberEventoStripe('corpo', 'sig', 'segredo'), { id: 'evt' });
});

// ---- contratações ----

const salaoLivre = [{ exclusao: 0, testeUtilizado: 0 }];

test('reservar contratação: salão ausente, exclusão e assinatura existente', async () => {
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'XX' }), { codigo: 'PLANO_INVALIDO' });
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL' }), { codigo: 'SALAO_AUSENTE' });
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao AND st_ativo=TRUE FOR UPDATE/, [{ exclusao: 1 }]);
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL' }), { codigo: 'EXCLUSAO_PENDENTE' });
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao AND st_ativo=TRUE FOR UPDATE/, salaoLivre);
  const existente = { idAssinatura: 3, status: 'PENDENTE', periodicidade: 'MENSAL', idCheckout: null, tentativa: null, parametros: '{}' };
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao=:idSalao AND cd_status<>'CANCELADA'/, [existente]);
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL', local: true }), { codigo: 'ASSINATURA_EM_ANDAMENTO' });
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'ANUAL' }), { codigo: 'ASSINATURA_EM_ANDAMENTO' });
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao=:idSalao AND cd_status<>'CANCELADA'/, [{ ...existente, status: 'AUTORIZADA' }]);
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL' }), { codigo: 'ASSINATURA_EM_ANDAMENTO' });
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao=:idSalao AND cd_status<>'CANCELADA'/, [{ ...existente, tentativa: new Date() }]);
  await assert.rejects(() => contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL' }), { codigo: 'CHECKOUT_EM_PREPARACAO' });
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao=:idSalao AND cd_status<>'CANCELADA'/, [existente]);
  const retomada = await contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL' });
  assert.equal(retomada.nova, false);
  assert.ok(banco.chamou(/SET dt_tentativa_checkout=NOW\(\)/));
  banco.chamadas.length = 0;
  banco.responder(/FROM tb_assinatura_salao WHERE fk_salao=:idSalao AND cd_status<>'CANCELADA'/, [{ ...existente, idCheckout: 'cs' }]);
  await contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL' });
  assert.equal(banco.chamou(/SET dt_tentativa_checkout=NOW\(\)/), false);
});

test('reservar contratação cria assinatura Stripe pendente ou ativação local', async () => {
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao AND st_ativo=TRUE FOR UPDATE/, salaoLivre);
  banco.responder(/INSERT INTO tb_assinatura_salao/, [41, 1]);
  const stripePendente = await contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL', emailPagador: 'a@a.com' });
  assert.equal(stripePendente.nova, true);
  assert.equal(stripePendente.idAssinatura, 41);
  const gravado = banco.chamadas.find((c) => /INSERT INTO tb_assinatura_salao/.test(c.sql)).opcoes.replacements;
  assert.equal(gravado.status, 'PENDENTE');
  assert.equal(gravado.teste, true);
  assert.equal(JSON.parse(gravado.parametros).subscription_data.trial_period_days, 7);
  await contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'ANUAL', local: true });
  const local = banco.chamadas.filter((c) => /INSERT INTO tb_assinatura_salao/.test(c.sql)).at(-1).opcoes.replacements;
  assert.equal(local.status, 'AUTORIZADA');
  assert.equal(local.provedor, 'LOCAL');
  assert.equal(local.parametros, null);
  assert.deepEqual(contratacoes.lerParametrosCheckout({ a: 1 }), { a: 1 });
});

test('recuperar checkout consulta, recria ou exige conciliação', async () => {
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'open' });
  assert.equal((await contratacoes.recuperarCheckout({ idCheckout: 'cs' })).id, 'cs');
  await assert.rejects(() => contratacoes.recuperarCheckout({ parametros: null, criadaEm: new Date() }), { codigo: 'CHECKOUT_REQUER_CONCILIACAO' });
  const parametros = servico.prepararParametrosCheckout({ emailPagador: 'a@a.com', periodicidade: 'MENSAL', referenciaExterna: 'ref', testeGratis: false, urlRetorno: 'https://app/x' });
  await assert.rejects(() => contratacoes.recuperarCheckout({ parametros: JSON.stringify(parametros), criadaEm: new Date(Date.now() - 25 * 3600 * 1000) }), { status: 502 });
  stripe.prices.retrieve.mockResolvedValue(precoMensal);
  stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_novo' });
  const criado = await contratacoes.recuperarCheckout({ idAssinatura: 4, parametros: JSON.stringify(parametros), criadaEm: new Date() });
  assert.equal(criado.id, 'cs_novo');
  assert.equal(banco.chamadas.at(-1).opcoes.replacements.idCheckout, 'cs_novo');
});

test('finalizar checkout valida exclusão e encerramento e sempre libera a tentativa', async () => {
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'open', url: 'https://pay' });
  banco.responder(/SELECT st_exclusao_pendente AS exclusao FROM tb_salao WHERE id_salao/, [{ exclusao: 0 }]);
  assert.equal((await contratacoes.finalizarCheckout({ idCheckout: 'cs', idAssinatura: 4 }, 1)).url, 'https://pay');
  assert.ok(banco.chamou(/dt_dt_tentativa_checkout=NULL|dt_tentativa_checkout=NULL/));
  banco.responder(/SELECT st_exclusao_pendente AS exclusao FROM tb_salao WHERE id_salao/, [{ exclusao: 1 }]);
  await assert.rejects(() => contratacoes.finalizarCheckout({ idCheckout: 'cs', idAssinatura: 4 }, 1), { codigo: 'EXCLUSAO_PENDENTE' });
  banco.responder(/SELECT st_exclusao_pendente AS exclusao FROM tb_salao WHERE id_salao/, [{ exclusao: 0 }]);
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'complete' });
  await assert.rejects(() => contratacoes.finalizarCheckout({ idCheckout: 'cs', idAssinatura: 4 }, 1), { codigo: 'CHECKOUT_ENCERRADO' });
});

test('cancelar recursos da contratação em todos os cenários', async () => {
  assert.deepEqual(await contratacoes.cancelarRecursosContratacao({}), { idAssinatura: null, assinatura: null });
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub', status: 'canceled' });
  assert.equal((await contratacoes.cancelarRecursosContratacao({ idAssinaturaProvedor: 'sub' }, true)).idAssinatura, 'sub');
  assert.equal((await contratacoes.cancelarRecursosContratacao({ idAssinaturaProvedor: 'sub' })).idAssinatura, 'sub');
  const retrieve = stripe.checkout.sessions.retrieve;
  retrieve.mockResolvedValueOnce({ id: 'cs', status: 'open' }).mockResolvedValue({ id: 'cs', status: 'complete', subscription: 'sub' });
  const resultado = await contratacoes.cancelarRecursosContratacao({ idCheckout: 'cs' }, true);
  assert.equal(resultado.idAssinatura, 'sub');
  assert.equal(stripe.checkout.sessions.expire.mock.calls.length, 1);
  retrieve.mockReset();
  retrieve.mockResolvedValue({ id: 'cs', status: 'complete', subscription: { id: 'outra' } });
  await assert.rejects(() => contratacoes.cancelarRecursosContratacao({ idCheckout: 'cs', idAssinaturaProvedor: 'sub' }), { codigo: 'ASSINATURA_EM_CONFLITO' });
  retrieve.mockReset();
  retrieve.mockResolvedValueOnce({ id: 'cs', status: 'open' }).mockResolvedValueOnce({ id: 'cs', status: 'complete', subscription: null }).mockResolvedValue({ id: 'cs', status: 'complete', subscription: null });
  stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('já concluído'));
  assert.deepEqual(await contratacoes.cancelarRecursosContratacao({ idCheckout: 'cs' }), { idAssinatura: null, assinatura: null });
  retrieve.mockReset();
  retrieve.mockResolvedValue({ id: 'cs', status: 'open' });
  stripe.checkout.sessions.expire.mockRejectedValue(new Error('falha real'));
  await assert.rejects(() => contratacoes.cancelarRecursosContratacao({ idCheckout: 'cs' }), /falha real/);
});

// ---- sincronização ----

test('mapeamentos de status, periodicidade e valor do Stripe', () => {
  const casos = { active: 'AUTORIZADA', trialing: 'EM_TESTE', paused: 'PAUSADA', past_due: 'PAGAMENTO_PENDENTE', unpaid: 'PAGAMENTO_PENDENTE', canceled: 'CANCELADA', incomplete: 'PENDENTE', incomplete_expired: 'CANCELADA', outro: 'PAGAMENTO_PENDENTE' };
  for (const [status, esperado] of Object.entries(casos)) assert.equal(sincronizacao.mapearStatusStripe({ status }), esperado);
  assert.equal(sincronizacao.mapearStatusStripe({ status: 'active', cancel_at_period_end: true }), 'CANCELAMENTO_AGENDADO');
  assert.equal(sincronizacao.mapearStatusStripe({ status: 'trialing', cancel_at_period_end: true }), 'CANCELAMENTO_AGENDADO');
  const item = (interval, unit_amount) => ({ items: { data: [{ price: { recurring: { interval }, unit_amount } }] } });
  assert.equal(sincronizacao.mapearPeriodicidadeStripe(item('month'), 'X'), 'MENSAL');
  assert.equal(sincronizacao.mapearPeriodicidadeStripe(item('year'), 'X'), 'ANUAL');
  assert.equal(sincronizacao.mapearPeriodicidadeStripe({}, 'ATUAL'), 'ATUAL');
  assert.equal(sincronizacao.mapearValorStripe(item('month', 5000), 1), 50);
  assert.equal(sincronizacao.mapearValorStripe({}, '40.5'), 40.5);
});

const assinaturaLocal = [{ idAssinatura: 3, idSalao: 9, periodicidade: 'MENSAL', valor: '50.00', statusAtual: 'PENDENTE', testeGratis: 0 }];
const assinaturaStripe = (extra = {}) => ({ id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { referenciaExterna: 'ref' }, start_date: 1761840000,
  items: { data: [{ current_period_end: 1764432000, price: { id: 'price_m', unit_amount: 5000, recurring: { interval: 'month' } } }] }, ...extra });

test('sincronizar assinatura ignora sem referência ou sem registro local', async () => {
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub', metadata: {} });
  assert.equal(await sincronizacao.sincronizarAssinaturaStripe('sub'), false);
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe());
  assert.equal(await sincronizacao.sincronizarAssinaturaStripe('sub'), false);
});

test('sincronizar assinatura grava status, próxima cobrança e marca teste utilizado', async () => {
  banco.responder(/FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia/, assinaturaLocal);
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe({ status: 'trialing', trial_end: 1762000000, customer: { id: 'cus_2' } }));
  assert.equal(await sincronizacao.sincronizarAssinaturaStripe('sub_1', 'cs_1'), true);
  const gravado = banco.chamadas.find((c) => /UPDATE tb_assinatura_salao\s+SET ds_provedor/.test(c.sql)).opcoes.replacements;
  assert.equal(gravado.status, 'EM_TESTE');
  assert.equal(gravado.idCliente, 'cus_2');
  assert.equal(gravado.proximaCobranca.getTime(), 1762000000 * 1000);
  assert.equal(gravado.testeGratis, true);
  assert.ok(banco.chamou(/st_teste_premium_utilizado=TRUE/));
  banco.reiniciar();
  banco.responder(/FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia/, assinaturaLocal);
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe({ status: 'incomplete_expired', customer: null }));
  await sincronizacao.sincronizarAssinaturaStripe('sub_1');
  const cancelada = banco.chamadas.find((c) => /UPDATE tb_assinatura_salao\s+SET ds_provedor/.test(c.sql)).opcoes.replacements;
  assert.equal(cancelada.status, 'CANCELADA');
  assert.equal(cancelada.proximaCobranca, null);
  assert.ok(cancelada.dataCancelamento instanceof Date);
  assert.equal(banco.chamou(/st_teste_premium_utilizado/), false);
});

test('eventos Stripe: checkout expirado', async () => {
  const evento = (objeto) => ({ type: 'checkout.session.expired', data: { object: objeto } });
  assert.equal(await sincronizacao.sincronizarEventoStripe({ type: 'x' }), false);
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento({ id: 'cs' })), false);
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento({ id: 'cs', metadata: { referenciaExterna: 'ref' } })), false);
  banco.responder(/SET cd_status='CANCELADA', id_checkout_provedor/, [{ affectedRows: 1 }]);
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento({ id: 'cs', client_reference_id: 'ref' })), true);
});

test('eventos Stripe: checkout concluído copia a referência para a assinatura', async () => {
  const evento = (objeto) => ({ type: 'checkout.session.completed', data: { object: objeto } });
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento({ id: 'cs' })), false);
  banco.responder(/FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia/, assinaturaLocal);
  stripe.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_1', metadata: {} }).mockResolvedValue(assinaturaStripe());
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento({ id: 'cs', subscription: { id: 'sub_1' }, metadata: { referenciaExterna: 'ref' } })), true);
  assert.equal(stripe.subscriptions.update.mock.calls[0][1].metadata.referenciaExterna, 'ref');
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe());
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento({ id: 'cs', subscription: 'sub_1' })), true);
  assert.equal(stripe.subscriptions.update.mock.calls.length, 1);
});

test('eventos Stripe: assinatura atualizada e faturas', async () => {
  banco.responder(/FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia/, assinaturaLocal);
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe());
  assert.equal(await sincronizacao.sincronizarEventoStripe({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }), true);
  const fatura = { id: 'in_1', subscription: 'sub_1', status: 'paid', amount_paid: 5000, total: 5000, created: 1761840000 };
  const evento = (type, objeto) => ({ type, data: { object: objeto } });
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento('invoice.paid', {})), false);
  banco.responder(/FROM tb_assinatura_salao a\s+WHERE a.id_assinatura_provedor/, [{ idAssinatura: 3, idSalao: 9, idCliente: 'cus_1' }]);
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento('invoice.paid', fatura)), true);
  assert.ok(banco.chamou(/INSERT INTO tb_fatura_assinatura_salao/));
  banco.reiniciar();
  banco.responder(/FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia/, assinaturaLocal);
  await assert.rejects(() => sincronizacao.sincronizarEventoStripe(evento('invoice.payment_failed', fatura)), /não foi associada/);
});

test('eventos Stripe: fatura de assinatura sem salão local', async () => {
  const evento = { type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_x' } } };
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe({ metadata: {} }));
  await assert.rejects(() => sincronizacao.sincronizarEventoStripe(evento), /ainda não está associada/);
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe({ status: 'canceled' }));
  await assert.rejects(() => sincronizacao.sincronizarEventoStripe(evento), /ainda não está associada/);
  banco.responder(/FROM tb_exclusao_conta_salao/, [{ id_operacao: 1 }]);
  stripe.subscriptions.retrieve.mockResolvedValue(assinaturaStripe({ metadata: { referenciaExterna: 'ref' }, status: 'canceled' }));
  assert.equal(await sincronizacao.sincronizarEventoStripe(evento), true);
  assert.equal(await sincronizacao.sincronizarEventoStripe({ type: 'outro.evento', data: { object: { id: 'x' } } }), false);
});

// ---- ramificações restantes ----

test('cancelar checkout aceita assinatura informada apenas pelo id', async () => {
  stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs', status: 'complete', subscription: 'sub_texto' });
  await servico.cancelarCheckoutStripe('cs');
  expect(stripe.subscriptions.update.mock.calls[0]).toEqual(['sub_texto', { cancel_at_period_end: true }]);
});

test('reservar contratação usa o endereço local quando FRONTEND_URL não existe', async () => {
  delete process.env.FRONTEND_URL;
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao AND st_ativo=TRUE FOR UPDATE/, salaoLivre);
  banco.responder(/INSERT INTO tb_assinatura_salao/, [42, 1]);
  await contratacoes.reservarContratacao({ idSalao: 1, periodicidade: 'MENSAL', emailPagador: 'a@a.com' });
  const gravado = banco.chamadas.find((c) => /INSERT INTO tb_assinatura_salao/.test(c.sql)).opcoes.replacements;
  assert.match(gravado.parametros, /http:\/\/localhost:3000\/salao\/assinatura/);
});

test('sincronizar assinatura trata datas e preço ausentes no objeto da Stripe', async () => {
  const gravadoDe = () => banco.chamadas.filter((c) => /UPDATE tb_assinatura_salao\s+SET ds_provedor/.test(c.sql)).at(-1).opcoes.replacements;
  banco.responder(/FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia/, assinaturaLocal);
  // sem start_date, usa created; sem período nos itens, usa o do próprio objeto; sem preço, idPreco nulo
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub', status: 'active', metadata: { referenciaExterna: 'ref' }, created: 1761840000,
    current_period_end: 1764432000, items: { data: [{}] } });
  await sincronizacao.sincronizarAssinaturaStripe('sub');
  assert.equal(gravadoDe().dataInicio.getTime(), 1761840000 * 1000);
  assert.equal(gravadoDe().proximaCobranca.getTime(), 1764432000 * 1000);
  assert.equal(gravadoDe().idPreco, null);
  // em teste sem trial_end, cai para o fim do período; sem nenhuma data, próxima cobrança nula
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub', status: 'trialing', metadata: { referenciaExterna: 'ref' }, items: { data: [{ current_period_end: 1764432000 }] } });
  await sincronizacao.sincronizarAssinaturaStripe('sub');
  assert.equal(gravadoDe().proximaCobranca.getTime(), 1764432000 * 1000);
  assert.equal(gravadoDe().dataInicio, null);
  // ativa sem período, usa trial_end
  stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub', status: 'active', metadata: { referenciaExterna: 'ref' }, trial_end: 1762000000 });
  await sincronizacao.sincronizarAssinaturaStripe('sub');
  assert.equal(gravadoDe().proximaCobranca.getTime(), 1762000000 * 1000);
});
