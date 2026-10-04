import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterDadosPlanoPremium } from './stripe.js';

function calcularProximaCobranca(periodicidade, dataInicio) {
  const data = new Date(dataInicio);
  data.setMonth(data.getMonth() + obterDadosPlanoPremium(periodicidade).frequencia);
  return data;
}

export async function ativarAssinaturaPremium({ dataInicio = new Date(), dataProximaCobranca, idAssinatura = null, idStripe = null, idSalao, periodicidade, testeGratis = false, valor }) {
  const dadosPlano = obterDadosPlanoPremium(periodicidade);
  const valorAssinatura = valor ?? dadosPlano.valor;
  const dataProximaCobrancaEfetiva = dataProximaCobranca ?? calcularProximaCobranca(periodicidade, dataInicio);

  if (idAssinatura) {
    await bancoDeDados.query(
      `UPDATE tb_assinatura_salao
       SET cd_status='AUTORIZADA', cd_periodicidade=:periodicidade, cd_periodicidade_pendente=NULL,
           vl_assinatura=:valorAssinatura, id_assinatura_provedor=COALESCE(:idStripe, id_assinatura_provedor),
           dt_inicio=COALESCE(dt_inicio, :dataInicio), dt_proxima_cobranca=:proximaCobranca, dt_atualizacao=NOW()
       WHERE id_assinatura_salao=:idAssinatura AND fk_salao=:idSalao`,
      { replacements: { dataInicio, periodicidade, proximaCobranca: dataProximaCobrancaEfetiva, valorAssinatura, idAssinatura, idStripe, idSalao } },
    );
  } else {
    await bancoDeDados.query(
      `INSERT INTO tb_assinatura_salao (
        fk_salao, cd_periodicidade, cd_status, vl_assinatura, st_teste_gratis,
        ds_provedor, id_preco_provedor, ds_referencia_externa, dt_inicio, dt_proxima_cobranca
      ) VALUES (
        :idSalao, :periodicidade, 'AUTORIZADA', :valorAssinatura, :testeGratis,
        'LOCAL', 'ATIVACAO_TESTE', :referenciaExterna, :dataInicio, :proximaCobranca
      )`,
      { replacements: { dataInicio, idSalao, periodicidade, proximaCobranca: dataProximaCobrancaEfetiva, referenciaExterna: randomUUID(), testeGratis, valorAssinatura } },
    );
  }

  if (testeGratis) {
    await bancoDeDados.query('UPDATE tb_salao SET st_teste_premium_utilizado=TRUE WHERE id_salao=:idSalao', { replacements: { idSalao } });
  }

  const assinaturas = await bancoDeDados.query(
    `SELECT id_assinatura_salao AS idAssinatura, cd_periodicidade AS periodicidade,
            cd_periodicidade_pendente AS periodicidadePendente, cd_status AS status,
            vl_assinatura AS valor, st_teste_gratis AS testeGratis,
            ds_provedor AS provedor, id_assinatura_provedor AS idAssinaturaProvedor,
            id_preco_provedor AS idPrecoProvedor, id_checkout_provedor AS idCheckoutProvedor,
            dt_inicio AS dataInicio,
            dt_proxima_cobranca AS dataProximaCobranca, dt_cancelamento_solicitado AS dataCancelamentoSolicitado
     FROM tb_assinatura_salao
     WHERE fk_salao=:idSalao ${idAssinatura ? 'AND id_assinatura_salao=:idAssinatura' : ''}
     ORDER BY dt_criacao DESC LIMIT 1`,
    { replacements: { idAssinatura, idSalao }, type: QueryTypes.SELECT },
  );
  return assinaturas[0] ?? null;
}
