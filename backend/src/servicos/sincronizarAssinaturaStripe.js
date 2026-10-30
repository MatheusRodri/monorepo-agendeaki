import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteStripe } from './stripe.js';
import { obterIdAssinaturaFatura, salvarFaturaAssinatura } from './faturasAssinaturas.js';

function dataStripe(timestamp) {
  return timestamp ? new Date(Number(timestamp) * 1000) : null;
}

export function mapearStatusStripe(assinatura) {
  switch (assinatura.status) {
    case 'trialing': return assinatura.cancel_at_period_end ? 'CANCELAMENTO_AGENDADO' : 'EM_TESTE';
    case 'active': return assinatura.cancel_at_period_end ? 'CANCELAMENTO_AGENDADO' : 'AUTORIZADA';
    case 'paused': return 'PAUSADA';
    case 'past_due':
    case 'unpaid': return 'PAGAMENTO_PENDENTE';
    case 'canceled': return 'CANCELADA';
    case 'incomplete': return 'PENDENTE';
    case 'incomplete_expired': return 'CANCELADA';
    default: return 'PAGAMENTO_PENDENTE';
  }
}

export function mapearPeriodicidadeStripe(assinatura, periodicidadeAtual) {
  const intervalo = assinatura.items?.data?.[0]?.price?.recurring?.interval;
  if (intervalo === 'month') return 'MENSAL';
  if (intervalo === 'year') return 'ANUAL';
  return periodicidadeAtual;
}

export function mapearValorStripe(assinatura, valorAtual) {
  const preco = assinatura.items?.data?.[0]?.price;
  const valor = Number(preco?.unit_amount) / 100;
  return Number.isFinite(valor) && valor > 0 ? valor : Number(valorAtual);
}

export async function sincronizarAssinaturaStripe(idAssinaturaStripe, idCheckout = null) {
  const dadosStripe = await obterClienteStripe().subscriptions.retrieve(idAssinaturaStripe, { expand: ['items.data.price'] });
  const referencia = dadosStripe.metadata?.referenciaExterna;
  if (!referencia) return false;

  const assinaturas = await bancoDeDados.query(
     `SELECT id_assinatura_salao AS idAssinatura, fk_salao AS idSalao,
            cd_periodicidade AS periodicidade, vl_assinatura AS valor,
            cd_status AS statusAtual, st_teste_gratis AS testeGratis
     FROM tb_assinatura_salao WHERE ds_referencia_externa=:referencia LIMIT 1`,
    { replacements: { referencia }, type: QueryTypes.SELECT },
  );
  const assinatura = assinaturas[0];
  if (!assinatura) return false;

  const status = mapearStatusStripe(dadosStripe);
  const periodicidade = mapearPeriodicidadeStripe(dadosStripe, assinatura.periodicidade);
  const valor = mapearValorStripe(dadosStripe, assinatura.valor);
  const dataInicio = dataStripe(dadosStripe.start_date ?? dadosStripe.created);
  const checkoutNaoPago = assinatura.statusAtual === 'PENDENTE'
    && ['incomplete', 'incomplete_expired', 'canceled'].includes(dadosStripe.status);
  const fimPeriodoAtual = dadosStripe.items?.data?.[0]?.current_period_end
    ?? dadosStripe.current_period_end;
  const timestampProximaCobranca = dadosStripe.status === 'trialing'
    ? (dadosStripe.trial_end ?? fimPeriodoAtual)
    : (fimPeriodoAtual ?? dadosStripe.trial_end);
  const proximaCobranca = checkoutNaoPago || status === 'CANCELADA' ? null : dataStripe(timestampProximaCobranca);
  const dataCancelamento = status === 'CANCELADA' ? new Date() : null;
  const idCliente = typeof dadosStripe.customer === 'string' ? dadosStripe.customer : dadosStripe.customer?.id;
  const idPreco = dadosStripe.items?.data?.[0]?.price?.id ?? null;

  await bancoDeDados.query(
    `UPDATE tb_assinatura_salao
     SET ds_provedor='STRIPE', id_cliente_provedor=:idCliente,
         id_assinatura_provedor=:idAssinaturaStripe, id_preco_provedor=COALESCE(:idPreco, id_preco_provedor),
         id_checkout_provedor=COALESCE(:idCheckout, id_checkout_provedor),
         cd_status=:status, cd_periodicidade=:periodicidade,
         cd_periodicidade_pendente=CASE WHEN :status IN ('CANCELADA','CANCELAMENTO_AGENDADO') OR cd_periodicidade_pendente=:periodicidade THEN NULL ELSE cd_periodicidade_pendente END,
         vl_assinatura=:valor, st_teste_gratis=:testeGratis,
         dt_inicio=COALESCE(dt_inicio, :dataInicio),
         dt_proxima_cobranca=:proximaCobranca,
         dt_cancelamento_solicitado=CASE
           WHEN :status = 'CANCELAMENTO_AGENDADO' THEN COALESCE(dt_cancelamento_solicitado, NOW())
           WHEN :status IN ('AUTORIZADA', 'EM_TESTE') THEN NULL
           ELSE dt_cancelamento_solicitado END,
         dt_cancelamento=CASE
           WHEN :status IN ('AUTORIZADA', 'EM_TESTE') THEN NULL
           WHEN :dataCancelamento IS NULL THEN dt_cancelamento
           ELSE COALESCE(dt_cancelamento, :dataCancelamento) END,
         dt_atualizacao=NOW()
     WHERE id_assinatura_salao=:idAssinatura AND (cd_status <> 'CANCELADA' OR :status = 'CANCELADA')`,
    {
      replacements: {
        dataCancelamento,
        dataInicio,
        idAssinatura: assinatura.idAssinatura,
        idAssinaturaStripe: String(dadosStripe.id),
        idCheckout,
        idCliente: idCliente ?? null,
        periodicidade,
        idPreco,
        proximaCobranca,
        status,
        testeGratis: Boolean(assinatura.testeGratis || dadosStripe.trial_end),
        valor,
      },
    },
  );

  if (dadosStripe.trial_end) {
    await bancoDeDados.query('UPDATE tb_salao SET st_teste_premium_utilizado=TRUE WHERE id_salao=:idSalao', { replacements: { idSalao: assinatura.idSalao } });
  }
  return true;
}

export async function sincronizarEventoStripe(evento) {
  const recurso = evento.data?.object;
  if (!recurso) return false;

  if (evento.type === 'checkout.session.expired') {
    const referencia = recurso.metadata?.referenciaExterna ?? recurso.client_reference_id;
    if (!referencia) return false;
    const [resultado] = await bancoDeDados.query(
      `UPDATE tb_assinatura_salao
       SET cd_status='CANCELADA', id_checkout_provedor=:idCheckout, dt_cancelamento=COALESCE(dt_cancelamento, NOW()), dt_atualizacao=NOW()
       WHERE ds_referencia_externa=:referencia AND cd_status='PENDENTE' AND (id_checkout_provedor IS NULL OR id_checkout_provedor=:idCheckout)`,
      { replacements: { referencia, idCheckout: recurso.id } },
    );
    return Boolean(resultado?.affectedRows);
  }

  if (evento.type === 'checkout.session.completed') {
    const idAssinatura = typeof recurso.subscription === 'string' ? recurso.subscription : recurso.subscription?.id;
    if (!idAssinatura) return false;
    const idCheckout = recurso.id;
    const stripe = obterClienteStripe();
    const dadosAssinatura = await stripe.subscriptions.retrieve(idAssinatura);
    if (!dadosAssinatura.metadata?.referenciaExterna && recurso.metadata?.referenciaExterna) {
      await stripe.subscriptions.update(idAssinatura, { metadata: { ...dadosAssinatura.metadata, referenciaExterna: recurso.metadata.referenciaExterna } });
    }
    return sincronizarAssinaturaStripe(idAssinatura, idCheckout);
  }

  if (evento.type.startsWith('customer.subscription.')) {
    return sincronizarAssinaturaStripe(recurso.id);
  }

  if (evento.type === 'invoice.paid' || evento.type === 'invoice.payment_failed') {
    const idAssinatura = obterIdAssinaturaFatura(recurso);
    if (!idAssinatura) return false;
    const sincronizada = await sincronizarAssinaturaStripe(idAssinatura);
    if (!sincronizada) {
      const assinatura = await obterClienteStripe().subscriptions.retrieve(idAssinatura);
      const referencia = assinatura.metadata?.referenciaExterna;
      if (referencia && ['canceled','incomplete_expired'].includes(assinatura.status)) {
        const exclusoes = await bancoDeDados.query(`SELECT id_operacao FROM tb_exclusao_conta_salao
          WHERE cd_etapa IN ('IDENTIDADE','CONCLUIDA') AND JSON_CONTAINS(js_referencias_stripe, JSON_QUOTE(:referencia)) LIMIT 1`, {
          replacements: { referencia }, type: QueryTypes.SELECT,
        });
        if (exclusoes.length) return true;
      }
      throw new Error('A assinatura da fatura ainda não está associada a um salão local.');
    }
    const faturaSalva = await salvarFaturaAssinatura(recurso);
    if (!faturaSalva) throw new Error('A fatura não foi associada a uma assinatura local.');
    return true;
  }
  return false;
}
