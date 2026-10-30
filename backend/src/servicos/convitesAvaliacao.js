import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { enviarNotificacaoPushCliente } from './notificacoesPush.js';
import { horarioBanco, podeAvaliarAgendamento } from './regrasTemporaisAgendamento.js';

// A reserva expira em dois minutos para retomar trabalho interrompido por reinício.
export async function processarConvitesAvaliacao({ banco = bancoDeDados, enviar = enviarNotificacaoPushCliente,
  agora = () => new Date(), limite = 50 } = {}) {
  let processados = 0;
  for (let i = 0; i < limite; i++) {
    const referencia = horarioBanco(agora());
    const convite = await banco.transaction(async (transaction) => {
      const [registro] = await banco.query(`SELECT n.id_notificacao AS id, n.fk_usuario AS idUsuario,
        n.fk_agendamento AS idAgendamento, n.nm_titulo AS titulo, n.ds_mensagem AS mensagem, n.ds_link AS link
        FROM tb_notificacao_cliente n WHERE n.cd_tipo='AVALIACAO' AND n.dt_push_processado IS NULL
          AND n.dt_disponivel_em<=:agora
          AND (n.dt_push_reservado IS NULL OR n.dt_push_reservado<=DATE_SUB(:agora,INTERVAL 2 MINUTE))
        ORDER BY n.dt_disponivel_em,n.id_notificacao LIMIT 1 FOR UPDATE SKIP LOCKED`, {
        replacements: { agora: referencia }, type: QueryTypes.SELECT, transaction,
      });
      if (!registro) return null;
      await banco.query('UPDATE tb_notificacao_cliente SET dt_push_reservado=:agora WHERE id_notificacao=:id', {
        replacements: { agora: referencia, id: registro.id }, transaction,
      });
      return registro;
    });
    if (!convite) break;
    try {
      const [agendamento] = await banco.query(`SELECT a.cd_status AS status,a.dt_fim AS dataHoraFim,
        av.id_avaliacao AS idAvaliacao FROM tb_agendamento a
        LEFT JOIN tb_avaliacao av ON av.fk_agendamento=a.id_agendamento
        WHERE a.id_agendamento=:idAgendamento AND a.fk_usuario=:idUsuario`, {
        replacements: convite, type: QueryTypes.SELECT,
      });
      const elegivel = agendamento && podeAvaliarAgendamento(agendamento, agora());
      if (elegivel && await enviar(convite.idUsuario, convite.titulo, convite.mensagem, convite.id, convite.link) === false) {
        continue;
      }
      await banco.query(`UPDATE tb_notificacao_cliente SET dt_push_processado=:agora,dt_push_reservado=NULL
        WHERE id_notificacao=:id AND dt_push_reservado=:reserva`, {
        replacements: { id: convite.id, agora: horarioBanco(agora()), reserva: referencia },
      });
      processados++;
    } catch (erro) {
      console.error('[Convites de avaliação] Falha ao processar aviso.', { idNotificacao: convite.id, mensagem: erro.message });
    }
  }
  return processados;
}

export function iniciarProcessadorConvites({ processar = processarConvitesAvaliacao, intervaloMs = 30000 } = {}) {
  let executando = false;
  const executar = async () => {
    if (executando) return;
    executando = true;
    try { await processar(); }
    catch (erro) { console.error('[Convites de avaliação] Falha no ciclo.', { mensagem: erro.message }); }
    finally { executando = false; }
  };
  const intervalo = setInterval(executar, intervaloMs);
  intervalo.unref();
  void executar();
  return () => clearInterval(intervalo);
}
