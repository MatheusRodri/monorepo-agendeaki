import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

export function assinaturaTemAcessoPremium(assinatura, agora = new Date()) {
  return Boolean(assinatura && (['AUTORIZADA', 'EM_TESTE'].includes(assinatura.status)
    || (assinatura.status === 'CANCELAMENTO_AGENDADO'
      && assinatura.dataProximaCobranca && new Date(assinatura.dataProximaCobranca) > agora)));
}

export async function obterAcessoPremiumSalao(idSalao, { transaction, agora = new Date() } = {}) {
  const [assinatura] = await bancoDeDados.query(`SELECT cd_status AS status,
    dt_proxima_cobranca AS dataProximaCobranca FROM tb_assinatura_salao
    WHERE fk_salao=:idSalao ORDER BY dt_criacao DESC, id_assinatura_salao DESC LIMIT 1`, {
    replacements: { idSalao }, transaction, type: QueryTypes.SELECT,
  });
  return assinaturaTemAcessoPremium(assinatura, agora);
}
