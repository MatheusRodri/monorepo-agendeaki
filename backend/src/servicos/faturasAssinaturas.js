import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

function dataStripe(timestamp) {
  return timestamp ? new Date(Number(timestamp) * 1000) : null;
}

export function obterIdAssinaturaFatura(fatura) {
  const id = fatura.subscription
    ?? fatura.parent?.subscription_details?.subscription
    ?? fatura.parent?.subscription_details?.subscription_id
    ?? null;
  return typeof id === 'string' ? id : id?.id ?? null;
}

export async function salvarFaturaAssinatura(fatura) {
  const idAssinaturaProvedor = obterIdAssinaturaFatura(fatura);
  if (!idAssinaturaProvedor || !fatura.id) return false;
  const assinaturas = await bancoDeDados.query(
    `SELECT a.id_assinatura_salao AS idAssinatura, a.fk_salao AS idSalao,
            a.id_cliente_provedor AS idCliente
     FROM tb_assinatura_salao a
     WHERE a.id_assinatura_provedor=:idAssinaturaProvedor LIMIT 1`,
    { replacements: { idAssinaturaProvedor: String(idAssinaturaProvedor) }, type: QueryTypes.SELECT },
  );
  const assinatura = assinaturas[0];
  if (!assinatura) return false;

  const pagoEm = fatura.status_transitions?.paid_at ?? (fatura.status === 'paid' ? fatura.created : null);
  await bancoDeDados.query(
    `INSERT INTO tb_fatura_assinatura_salao (
       fk_assinatura_salao, fk_salao, id_fatura_provedor, id_assinatura_provedor,
       id_cliente_provedor, cd_status, cd_motivo, ds_moeda,
       vl_total_centavos, vl_pago_centavos, dt_criacao_provedor,
       dt_periodo_inicio, dt_periodo_fim, dt_pago
     ) VALUES (
       :idAssinatura, :idSalao, :idFatura, :idAssinaturaProvedor,
       :idCliente, :status, :motivo, :moeda,
       :total, :pago, :criadaEm, :periodoInicio, :periodoFim, :pagoEm
     ) ON DUPLICATE KEY UPDATE
       fk_assinatura_salao=VALUES(fk_assinatura_salao), fk_salao=VALUES(fk_salao),
       id_assinatura_provedor=VALUES(id_assinatura_provedor), id_cliente_provedor=VALUES(id_cliente_provedor),
       cd_status=VALUES(cd_status), cd_motivo=VALUES(cd_motivo), ds_moeda=VALUES(ds_moeda),
       vl_total_centavos=VALUES(vl_total_centavos), vl_pago_centavos=VALUES(vl_pago_centavos),
       dt_criacao_provedor=VALUES(dt_criacao_provedor), dt_periodo_inicio=VALUES(dt_periodo_inicio),
       dt_periodo_fim=VALUES(dt_periodo_fim), dt_pago=VALUES(dt_pago), dt_atualizacao=NOW()`,
    {
      replacements: {
        criadaEm: dataStripe(fatura.created),
        idAssinatura: assinatura.idAssinatura,
        idAssinaturaProvedor: String(idAssinaturaProvedor),
        idCliente: fatura.customer ? String(typeof fatura.customer === 'string' ? fatura.customer : fatura.customer.id) : assinatura.idCliente,
        idFatura: String(fatura.id),
        moeda: String(fatura.currency ?? 'brl').toLowerCase(),
        motivo: fatura.billing_reason ?? null,
        pago: Number(fatura.amount_paid ?? 0),
        pagoEm: dataStripe(pagoEm),
        periodoFim: dataStripe(fatura.period_end),
        periodoInicio: dataStripe(fatura.period_start),
        idSalao: assinatura.idSalao,
        status: fatura.status ?? 'unknown',
        total: Number(fatura.total ?? 0),
      },
    },
  );
  return true;
}
