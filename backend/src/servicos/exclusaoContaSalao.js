import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteAdministrativoSupabase } from '../configuracoes/supabase.js';
import { consultarExclusao, publicarPerfilConfiavel } from './usuarios.js';
import { cancelarRecursosContratacao } from './contratacoes.js';
import { bloquearRecursosAgenda } from './disponibilidade.js';

async function removerDadosLocais(idUsuario, idOperacao) {
  await bancoDeDados.transaction(async (transacao) => {
    const saloes = await bancoDeDados.query(
      'SELECT id_salao AS idSalao FROM tb_salao WHERE fk_usuario_administrador = :idUsuario',
      { replacements: { idUsuario }, transaction: transacao, type: QueryTypes.SELECT },
    );
    const idsSaloes = saloes.map((salao) => salao.idSalao);
    const unidades = idsSaloes.length
      ? await bancoDeDados.query('SELECT id_unidade AS idUnidade FROM tb_unidade WHERE fk_salao IN (:idsSaloes)', { replacements: { idsSaloes }, transaction: transacao, type: QueryTypes.SELECT })
      : [];
    const idsUnidades = unidades.map((unidade) => unidade.idUnidade);
    await bloquearRecursosAgenda({ idUsuario, idsUnidades, transaction: transacao });
    const condicoesAgendamento = ['fk_usuario = :idUsuario'];
    if (idsUnidades.length) condicoesAgendamento.push('fk_unidade IN (:idsUnidades)');
    const agendamentos = await bancoDeDados.query(
      `SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE ${condicoesAgendamento.join(' OR ')}`,
      { replacements: { idUsuario: idUsuario, idsUnidades }, transaction: transacao, type: QueryTypes.SELECT },
    );
    const idsAgendamentos = agendamentos.map((agendamento) => agendamento.idAgendamento);

    await bancoDeDados.query('UPDATE tb_agendamento SET fk_usuario_cancelamento = NULL WHERE fk_usuario_cancelamento = :idUsuario', { replacements: { idUsuario }, transaction: transacao });
    if (idsAgendamentos.length) {
      await bancoDeDados.query('DELETE FROM tb_pagamento WHERE fk_agendamento IN (:idsAgendamentos)', { replacements: { idsAgendamentos }, transaction: transacao });
      await bancoDeDados.query('DELETE FROM tb_agendamento WHERE id_agendamento IN (:idsAgendamentos)', { replacements: { idsAgendamentos }, transaction: transacao });
    }
    if (idsUnidades.length) {
      await bancoDeDados.query('DELETE FROM tb_funcionario WHERE fk_unidade IN (:idsUnidades)', { replacements: { idsUnidades }, transaction: transacao });
      await bancoDeDados.query('DELETE FROM tb_servico WHERE fk_unidade IN (:idsUnidades)', { replacements: { idsUnidades }, transaction: transacao });
      await bancoDeDados.query('DELETE FROM tb_unidade WHERE id_unidade IN (:idsUnidades)', { replacements: { idsUnidades }, transaction: transacao });
    }
    if (idsSaloes.length) await bancoDeDados.query('DELETE FROM tb_cliente_salao WHERE fk_salao IN (:idsSaloes)', { replacements: { idsSaloes }, transaction: transacao });
    if (idsSaloes.length) await bancoDeDados.query('DELETE FROM tb_salao WHERE id_salao IN (:idsSaloes)', { replacements: { idsSaloes }, transaction: transacao });
    await bancoDeDados.query('DELETE FROM tb_usuario WHERE id_usuario = :idUsuario', { replacements: { idUsuario }, transaction: transacao });

    await bancoDeDados.query("UPDATE tb_exclusao_conta_salao SET cd_etapa='IDENTIDADE', ds_erro_codigo=NULL WHERE id_operacao=:idOperacao AND cd_etapa='DADOS_LOCAIS'", { replacements: { idOperacao }, transaction: transacao });
  });
}

export async function iniciarExclusaoSalao(usuario) {
  await bancoDeDados.transaction(async (transaction) => {
    const [salao] = await bancoDeDados.query('SELECT id_salao AS idSalao FROM tb_salao WHERE fk_usuario_administrador=:idUsuario FOR UPDATE', {
      replacements: { idUsuario: usuario.idUsuario }, transaction, type: QueryTypes.SELECT,
    });
    await bancoDeDados.query(`INSERT IGNORE INTO tb_exclusao_conta_salao
      (id_operacao,id_autenticacao_externa,id_usuario,id_salao) VALUES (:id,:externo,:usuario,:salao)`, {
      replacements: { id: randomUUID(), externo: usuario.idAutenticacaoExterna, usuario: usuario.idUsuario, salao: salao?.idSalao ?? null }, transaction,
    });
    await bancoDeDados.query('UPDATE tb_salao SET st_exclusao_pendente=TRUE WHERE fk_usuario_administrador=:idUsuario', {
      replacements: { idUsuario: usuario.idUsuario }, transaction,
    });
  });
  return retomarExclusaoSalao(usuario.idAutenticacaoExterna);
}

export async function retomarExclusaoSalao(idAutenticacaoExterna) {
  const administrativo = obterClienteAdministrativoSupabase();
  let operacao = await consultarExclusao(idAutenticacaoExterna);
  if (!operacao) throw Object.assign(new Error('Operação de exclusão não encontrada.'), { status: 404 });
  const avancar = async (de, para) => bancoDeDados.query(`UPDATE tb_exclusao_conta_salao SET cd_etapa=:para, ds_erro_codigo=NULL
    WHERE id_operacao=:id AND cd_etapa=:de`, { replacements: { id: operacao.idOperacao, de, para } });
  try {
    while (operacao.etapa !== 'CONCLUIDA') {
      if (operacao.etapa === 'PREPARACAO') {
        const { data, error } = await administrativo.auth.admin.getUserById(idAutenticacaoExterna);
        if (error || !data?.user) throw new Error('Não foi possível preparar a exclusão no Supabase.');
        await publicarPerfilConfiavel(administrativo, data.user, 'ADMIN_SALAO', 'EXCLUSAO_PENDENTE');
        await avancar('PREPARACAO','COBRANCA');
      } else if (operacao.etapa === 'COBRANCA') {
        const registros = await bancoDeDados.query(`SELECT a.id_assinatura_salao AS idAssinatura,
          a.id_assinatura_provedor AS idAssinaturaProvedor, a.id_checkout_provedor AS idCheckout,
          a.js_parametros_checkout AS parametros, a.dt_criacao AS criadaEm, a.ds_referencia_externa AS referencia
          FROM tb_assinatura_salao a INNER JOIN tb_salao s ON s.id_salao=a.fk_salao
          WHERE s.fk_usuario_administrador=:idUsuario AND a.ds_provedor='STRIPE'`, {
          replacements: { idUsuario: operacao.idUsuario }, type: QueryTypes.SELECT,
        });
        await bancoDeDados.query('UPDATE tb_exclusao_conta_salao SET js_referencias_stripe=:referencias WHERE id_operacao=:id', {
          replacements: { id: operacao.idOperacao, referencias: JSON.stringify(registros.map((r) => r.referencia)) },
        });
        for (const registro of registros) await cancelarRecursosContratacao(registro, true);
        await avancar('COBRANCA','DADOS_LOCAIS');
      } else if (operacao.etapa === 'DADOS_LOCAIS') {
        await removerDadosLocais(operacao.idUsuario, operacao.idOperacao);
      } else if (operacao.etapa === 'IDENTIDADE') {
        const { error } = await administrativo.auth.admin.deleteUser(idAutenticacaoExterna);
        if (error && error.status !== 404 && error.code !== 'user_not_found') throw new Error('Não foi possível concluir a remoção da identidade no Supabase.');
        await avancar('IDENTIDADE','CONCLUIDA');
      }
      operacao = await consultarExclusao(idAutenticacaoExterna);
    }
    return { mensagem: 'Cobranças encerradas e conta excluída.', etapa: 'CONCLUIDA' };
  } catch (erro) {
    operacao = await consultarExclusao(idAutenticacaoExterna);
    await bancoDeDados.query('UPDATE tb_exclusao_conta_salao SET ds_erro_codigo=:codigo WHERE id_operacao=:id', {
      replacements: { id: operacao.idOperacao, codigo: String(erro.codigo ?? erro.code ?? 'FALHA_PROVEDOR').slice(0,80) },
    });
    throw Object.assign(new Error('A exclusão está pendente. Tente retomá-la; cobranças já encerradas não serão reativadas.'), {
      status: erro.status ?? 502, codigo: 'EXCLUSAO_PENDENTE', etapa: operacao.etapa,
      cobrancaEncerrada: ['DADOS_LOCAIS','IDENTIDADE','CONCLUIDA'].includes(operacao.etapa),
    });
  }
}
