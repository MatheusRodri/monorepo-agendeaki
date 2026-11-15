import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { criarCheckoutAssinatura, consultarCheckoutStripe, prepararParametrosCheckout, obterDadosPlanoPremium, obterPrecoStripe, obterClienteStripe, encerrarAssinaturaStripe, cancelarAssinaturaStripe } from './stripe.js';

const falha = (mensagem, codigo, status = 409) => Object.assign(new Error(mensagem), { codigo, status });
export const lerParametrosCheckout = (valor) => typeof valor === 'string' ? JSON.parse(valor) : valor;

export async function reservarContratacao({ idSalao, periodicidade, emailPagador, local = false }, banco = bancoDeDados) {
  const plano = obterDadosPlanoPremium(periodicidade);
  return banco.transaction(async (transaction) => {
    const [salao] = await banco.query(`SELECT st_exclusao_pendente AS exclusao, st_teste_premium_utilizado AS testeUtilizado
      FROM tb_salao WHERE id_salao=:idSalao AND st_ativo=TRUE FOR UPDATE`, { replacements: { idSalao }, transaction, type: QueryTypes.SELECT });
    if (!salao) throw falha('Salão não encontrado.', 'SALAO_AUSENTE', 404);
    if (salao.exclusao) throw falha('A exclusão da conta está em andamento.', 'EXCLUSAO_PENDENTE');
    const [existente] = await banco.query(`SELECT id_assinatura_salao AS idAssinatura, cd_status AS status,
      cd_periodicidade AS periodicidade, ds_referencia_externa AS referencia,
      id_checkout_provedor AS idCheckout, js_parametros_checkout AS parametros,
      dt_criacao AS criadaEm, dt_tentativa_checkout AS tentativa
      FROM tb_assinatura_salao WHERE fk_salao=:idSalao AND cd_status<>'CANCELADA'
      ORDER BY id_assinatura_salao DESC LIMIT 1 FOR UPDATE`, { replacements: { idSalao }, transaction, type: QueryTypes.SELECT });
    if (existente) {
      if (local || existente.status !== 'PENDENTE' || existente.periodicidade !== periodicidade) {
        throw falha('Já existe uma assinatura em andamento para este salão.', 'ASSINATURA_EM_ANDAMENTO');
      }
      if (!existente.idCheckout && existente.tentativa && Date.now() - new Date(existente.tentativa).getTime() < 60_000) {
        throw falha('O checkout está sendo preparado. Aguarde e atualize o status.', 'CHECKOUT_EM_PREPARACAO');
      }
      if (!existente.idCheckout) await banco.query('UPDATE tb_assinatura_salao SET dt_tentativa_checkout=NOW() WHERE id_assinatura_salao=:id', { replacements: { id: existente.idAssinatura }, transaction });
      return { ...existente, nova: false };
    }
    const referencia = randomUUID();
    const parametros = local ? null : prepararParametrosCheckout({ emailPagador, periodicidade, referenciaExterna: referencia,
      testeGratis: !salao.testeUtilizado, urlRetorno: `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/salao/assinatura` });
    const [id] = await banco.query(`INSERT INTO tb_assinatura_salao
      (fk_salao, cd_periodicidade, cd_status, vl_assinatura, st_teste_gratis, ds_provedor,
       id_preco_provedor, ds_referencia_externa, js_parametros_checkout, dt_tentativa_checkout, dt_inicio, dt_proxima_cobranca)
      VALUES (:idSalao,:periodicidade,:status,:valor,:teste,:provedor,:preco,:referencia,:parametros,NOW(),:inicio,:fim)`, {
      replacements: { idSalao, periodicidade, status: local ? 'AUTORIZADA' : 'PENDENTE', valor: plano.valor,
        teste: !local && !salao.testeUtilizado, provedor: local ? 'LOCAL' : 'STRIPE', preco: local ? 'ATIVACAO_TESTE' : parametros.line_items[0].price,
        referencia, parametros: parametros ? JSON.stringify(parametros) : null, inicio: local ? new Date() : null,
        fim: local ? new Date(new Date().setMonth(new Date().getMonth() + plano.frequencia)) : null }, transaction,
    });
    return { idAssinatura: Number(id), referencia, parametros, criadaEm: new Date(), nova: true };
  });
}

export async function recuperarCheckout(registro) {
  if (registro.idCheckout) return consultarCheckoutStripe(registro.idCheckout);
  const parametros = lerParametrosCheckout(registro.parametros);
  if (!parametros || Date.now() - new Date(registro.criadaEm).getTime() >= 24 * 60 * 60 * 1000) {
    // Chaves Stripe antigas podem ter sido removidas. Não arriscar uma segunda criação.
    throw falha('O checkout precisa de conciliação no Stripe antes de uma nova contratação.', 'CHECKOUT_REQUER_CONCILIACAO', 502);
  }
  // Checkout pendente pode ter sido reservado com Price ID antigo; alinha ao preço vigente antes de criar.
  const periodicidade = parametros.metadata?.periodicidade;
  const precoAtual = obterPrecoStripe(periodicidade);
  const plano = obterDadosPlanoPremium(periodicidade);
  if (parametros.line_items?.[0]) parametros.line_items[0].price = precoAtual;
  const checkout = await criarCheckoutAssinatura({ parametros });
  await bancoDeDados.query(`UPDATE tb_assinatura_salao
    SET id_checkout_provedor=:idCheckout, id_preco_provedor=:preco, vl_assinatura=:valor, js_parametros_checkout=:parametros
    WHERE id_assinatura_salao=:id`, {
    replacements: {
      idCheckout: checkout.id,
      preco: precoAtual,
      valor: plano.valor,
      parametros: JSON.stringify(parametros),
      id: registro.idAssinatura,
    },
  });
  return checkout;
}

export async function finalizarCheckout(registro, idSalao) {
  try {
    const checkout = await recuperarCheckout(registro);
    const [salao] = await bancoDeDados.query('SELECT st_exclusao_pendente AS exclusao FROM tb_salao WHERE id_salao=:idSalao', { replacements: { idSalao }, type: QueryTypes.SELECT });
    if (!salao || salao.exclusao) throw falha('A exclusão da conta está em andamento.', 'EXCLUSAO_PENDENTE');
    if (checkout.status !== 'open' || !checkout.url) throw falha('Este checkout já foi encerrado. Atualize o status da assinatura.', 'CHECKOUT_ENCERRADO');
    return checkout;
  } finally {
    await bancoDeDados.query('UPDATE tb_assinatura_salao SET dt_tentativa_checkout=NULL WHERE id_assinatura_salao=:id', { replacements: { id: registro.idAssinatura } });
  }
}

export async function cancelarRecursosContratacao(registro, imediato = false) {
  let idAssinatura = registro.idAssinaturaProvedor;
  if (registro.idCheckout) {
    const checkout = await consultarCheckoutStripe(registro.idCheckout);
    if (checkout.status === 'open') {
      try { await obterClienteStripe().checkout.sessions.expire(checkout.id); }
      catch (erro) {
        // O pagamento pode ter concluído entre a consulta e a expiração.
        const atualizado = await consultarCheckoutStripe(checkout.id);
        if (atualizado.status === 'open') throw erro;
      }
    }
    const atualizado = await consultarCheckoutStripe(checkout.id);
    const idRemoto = typeof atualizado.subscription === 'string' ? atualizado.subscription : atualizado.subscription?.id;
    if (idAssinatura && idRemoto && idAssinatura !== idRemoto) throw falha('Os vínculos da assinatura precisam de conciliação.', 'ASSINATURA_EM_CONFLITO', 502);
    idAssinatura = idRemoto ?? idAssinatura;
  }
  if (idAssinatura) {
    const assinatura = imediato ? await encerrarAssinaturaStripe(idAssinatura) : await cancelarAssinaturaStripe(idAssinatura);
    return { idAssinatura, assinatura };
  }
  return { idAssinatura: null, assinatura: null };
}
