import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

let vapidConfigurado = false;

function configurarVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigurado) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:suporte@agendeaki.com.br', publicKey, privateKey);
    vapidConfigurado = true;
  }
  return true;
}

export function obterChavePublicaPush() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function criarNotificacaoSalao(idSalao, titulo, corpo) {
  const [idNotificacao] = await bancoDeDados.query(
    `INSERT INTO tb_notificacao_salao (fk_salao, nm_titulo, ds_mensagem, ds_link)
     VALUES (:idSalao, :titulo, :corpo, '/salao/agendamentos')`,
    { replacements: { idSalao, titulo, corpo } },
  );
  return Number(idNotificacao) || null;
}

export async function listarNotificacoesSalao(idSalao) {
  const [notificacoes, contagem] = await Promise.all([
    bancoDeDados.query(
      `SELECT id_notificacao AS id, nm_titulo AS titulo, ds_mensagem AS mensagem,
              ds_link AS link, st_lida AS lida, dt_criacao AS criadaEm
       FROM tb_notificacao_salao WHERE fk_salao=:idSalao
       ORDER BY dt_criacao DESC, id_notificacao DESC LIMIT 50`,
      { replacements: { idSalao }, type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      'SELECT COUNT(*) AS quantidade FROM tb_notificacao_salao WHERE fk_salao=:idSalao AND st_lida=FALSE',
      { replacements: { idSalao }, type: QueryTypes.SELECT },
    ),
  ]);
  return { notificacoes, naoLidas: Number(contagem[0]?.quantidade ?? 0) };
}

export async function marcarNotificacaoSalaoLida(idSalao, idNotificacao) {
  const [resultado] = await bancoDeDados.query(
    'UPDATE tb_notificacao_salao SET st_lida=TRUE WHERE id_notificacao=:idNotificacao AND fk_salao=:idSalao AND st_lida=FALSE',
    { replacements: { idSalao, idNotificacao } },
  );
  return Number(resultado?.affectedRows ?? 0) > 0;
}

export async function marcarTodasNotificacoesSalaoLidas(idSalao) {
  await bancoDeDados.query(
    'UPDATE tb_notificacao_salao SET st_lida=TRUE WHERE fk_salao=:idSalao AND st_lida=FALSE',
    { replacements: { idSalao } },
  );
}

async function salaoTemAcessoPremium(idSalao) {
  const assinaturas = await bancoDeDados.query(
    `SELECT cd_status AS status, dt_proxima_cobranca AS dataFim
     FROM tb_assinatura_salao WHERE fk_salao=:idSalao
     ORDER BY dt_criacao DESC, id_assinatura_salao DESC LIMIT 1`,
    { replacements: { idSalao }, type: QueryTypes.SELECT },
  );
  const assinatura = assinaturas[0];
  if (!assinatura) return false;
  if (['AUTORIZADA', 'EM_TESTE'].includes(assinatura.status)) return true;
  return ['CANCELADA', 'CANCELAMENTO_AGENDADO'].includes(assinatura.status)
    && assinatura.dataFim && new Date(assinatura.dataFim) > new Date();
}

export async function salvarInscricaoPush(idSalao, inscricao) {
  const hashEndpoint = createHash('sha256').update(inscricao.endpoint).digest('hex');
  await bancoDeDados.query(
    `INSERT INTO tb_inscricao_notificacao (fk_salao, ds_endpoint, ds_endpoint_hash, ds_chave_publica, ds_chave_auth)
     VALUES (:idSalao, :endpoint, :hashEndpoint, :chavePublica, :chaveAuth)
     ON DUPLICATE KEY UPDATE fk_salao=VALUES(fk_salao), ds_endpoint=VALUES(ds_endpoint), ds_chave_publica=VALUES(ds_chave_publica), ds_chave_auth=VALUES(ds_chave_auth)`,
    { replacements: { idSalao, endpoint: inscricao.endpoint, hashEndpoint, chavePublica: inscricao.keys.p256dh, chaveAuth: inscricao.keys.auth } },
  );
}

export async function removerInscricaoPush(idSalao, endpoint) {
  await bancoDeDados.query(
    'DELETE FROM tb_inscricao_notificacao WHERE fk_salao=:idSalao AND ds_endpoint=:endpoint',
    { replacements: { idSalao, endpoint } },
  );
}

export async function salvarInscricaoPushCliente(idUsuario, inscricao) {
  const hashEndpoint = createHash('sha256').update(inscricao.endpoint).digest('hex');
  await bancoDeDados.query(
    `INSERT INTO tb_inscricao_notificacao_cliente (fk_usuario, ds_endpoint, ds_endpoint_hash, ds_chave_publica, ds_chave_auth)
     VALUES (:idUsuario, :endpoint, :hashEndpoint, :chavePublica, :chaveAuth)
     ON DUPLICATE KEY UPDATE fk_usuario=VALUES(fk_usuario), ds_endpoint=VALUES(ds_endpoint), ds_chave_publica=VALUES(ds_chave_publica), ds_chave_auth=VALUES(ds_chave_auth)`,
    { replacements: { idUsuario, endpoint: inscricao.endpoint, hashEndpoint, chavePublica: inscricao.keys.p256dh, chaveAuth: inscricao.keys.auth } },
  );
}

export async function removerInscricaoPushCliente(idUsuario, endpoint) {
  await bancoDeDados.query(
    'DELETE FROM tb_inscricao_notificacao_cliente WHERE fk_usuario=:idUsuario AND ds_endpoint=:endpoint',
    { replacements: { idUsuario, endpoint } },
  );
}

export async function consultarInscricaoPushCliente(idUsuario, endpoint) {
  if (!endpoint) return false;
  const hashEndpoint = createHash('sha256').update(endpoint).digest('hex');
  const inscricoes = await bancoDeDados.query(
    'SELECT id_inscricao FROM tb_inscricao_notificacao_cliente WHERE fk_usuario=:idUsuario AND ds_endpoint_hash=:hashEndpoint LIMIT 1',
    { replacements: { idUsuario, hashEndpoint }, type: QueryTypes.SELECT },
  );
  return inscricoes.length > 0;
}

export async function criarNotificacaoCliente(idUsuario, idAgendamento, { titulo, mensagem, link }, transaction) {
  const [idNotificacao] = await bancoDeDados.query(
    `INSERT INTO tb_notificacao_cliente (fk_usuario, fk_agendamento, nm_titulo, ds_mensagem, ds_link)
     VALUES (:idUsuario, :idAgendamento, :titulo, :mensagem, :link)
     ON DUPLICATE KEY UPDATE id_notificacao=LAST_INSERT_ID(id_notificacao)`,
    { replacements: { idUsuario, idAgendamento, titulo, mensagem, link }, transaction },
  );
  return Number(idNotificacao) || null;
}

export async function listarNotificacoesCliente(idUsuario) {
  const [notificacoes, contagem] = await Promise.all([
    bancoDeDados.query(
      `SELECT n.id_notificacao AS id, n.fk_agendamento AS idAgendamento,
              n.nm_titulo AS titulo, n.ds_mensagem AS mensagem, n.ds_link AS link,
              CASE WHEN n.st_lida=TRUE OR av.id_avaliacao IS NOT NULL THEN TRUE ELSE FALSE END AS lida,
              n.dt_criacao AS criadaEm,
              a.cd_status AS statusAgendamento, av.id_avaliacao AS idAvaliacao
       FROM tb_notificacao_cliente n
       INNER JOIN tb_agendamento a ON a.id_agendamento=n.fk_agendamento AND a.fk_usuario=n.fk_usuario
       LEFT JOIN tb_avaliacao av ON av.fk_agendamento=a.id_agendamento
       WHERE n.fk_usuario=:idUsuario
       ORDER BY n.dt_criacao DESC, n.id_notificacao DESC LIMIT 50`,
      { replacements: { idUsuario }, type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT COUNT(*) AS quantidade FROM tb_notificacao_cliente n
       INNER JOIN tb_agendamento a ON a.id_agendamento=n.fk_agendamento AND a.fk_usuario=n.fk_usuario
       LEFT JOIN tb_avaliacao av ON av.fk_agendamento=a.id_agendamento
       WHERE n.fk_usuario=:idUsuario AND n.st_lida=FALSE
         AND a.cd_status='REALIZADO' AND av.id_avaliacao IS NULL`,
      { replacements: { idUsuario }, type: QueryTypes.SELECT },
    ),
  ]);
  return { notificacoes, naoLidas: Number(contagem[0]?.quantidade ?? 0) };
}

export async function marcarNotificacaoClienteLida(idUsuario, idNotificacao) {
  const [resultado] = await bancoDeDados.query(
    'UPDATE tb_notificacao_cliente SET st_lida=TRUE WHERE id_notificacao=:idNotificacao AND fk_usuario=:idUsuario AND st_lida=FALSE',
    { replacements: { idNotificacao, idUsuario } },
  );
  return Number(resultado?.affectedRows ?? 0) > 0;
}

export async function marcarTodasNotificacoesClienteLidas(idUsuario) {
  await bancoDeDados.query(
    'UPDATE tb_notificacao_cliente SET st_lida=TRUE WHERE fk_usuario=:idUsuario AND st_lida=FALSE',
    { replacements: { idUsuario } },
  );
}

export async function enviarNotificacaoPushCliente(idUsuario, titulo, mensagem, idNotificacao, link) {
  try {
    if (!configurarVapid()) {
      console.warn('[Notificações push] VAPID não configurado; aviso de cliente não enviado.', { idUsuario, titulo });
      return;
    }
    const inscricoes = await bancoDeDados.query(
      'SELECT ds_endpoint AS endpoint, ds_chave_publica AS p256dh, ds_chave_auth AS auth FROM tb_inscricao_notificacao_cliente WHERE fk_usuario=:idUsuario',
      { replacements: { idUsuario }, type: QueryTypes.SELECT },
    );
    if (!inscricoes.length) return;
    await Promise.all(inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
          JSON.stringify({ id: idNotificacao, title: titulo, body: mensagem, url: link }),
        );
      } catch (erro) {
        if ([404, 410].includes(erro.statusCode)) {
          await bancoDeDados.query('DELETE FROM tb_inscricao_notificacao_cliente WHERE ds_endpoint_hash=:hashEndpoint', {
            replacements: { hashEndpoint: createHash('sha256').update(inscricao.endpoint).digest('hex') },
          });
        } else {
          console.error('[Notificações push] Falha ao enviar aviso ao cliente.', { idUsuario, status: erro.statusCode, mensagem: erro.message });
        }
      }
    }));
  } catch (erro) {
    console.error('[Notificações push] Falha ao consultar dispositivos do cliente.', { idUsuario, mensagem: erro.message });
  }
}

export async function consultarInscricaoPush(idSalao, endpoint) {
  if (!endpoint) return false;
  const hashEndpoint = createHash('sha256').update(endpoint).digest('hex');
  const inscricoes = await bancoDeDados.query(
    'SELECT id_inscricao FROM tb_inscricao_notificacao WHERE fk_salao=:idSalao AND ds_endpoint_hash=:hashEndpoint LIMIT 1',
    { replacements: { idSalao, hashEndpoint }, type: QueryTypes.SELECT },
  );
  return inscricoes.length > 0;
}

export async function enviarNotificacaoSalao(idSalao, titulo, corpo, idNotificacao = null) {
  try {
    if (!configurarVapid()) {
      console.warn('[Notificações push] VAPID não configurado; aviso não enviado.', { idSalao, titulo });
      return;
    }
    const inscricoes = await bancoDeDados.query(
      'SELECT ds_endpoint AS endpoint, ds_chave_publica AS p256dh, ds_chave_auth AS auth FROM tb_inscricao_notificacao WHERE fk_salao=:idSalao',
      { replacements: { idSalao }, type: QueryTypes.SELECT },
    );
    if (!inscricoes.length) {
      console.info('[Notificações push] Nenhum dispositivo inscrito para receber o aviso.', { idSalao, titulo });
      return;
    }
    const payload = JSON.stringify({ id: idNotificacao, title: titulo, body: corpo, url: '/salao/agendamentos' });
    await Promise.all(inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification({ endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } }, payload);
      } catch (erro) {
        if ([404, 410].includes(erro.statusCode)) {
          await bancoDeDados.query('DELETE FROM tb_inscricao_notificacao WHERE ds_endpoint_hash=:hashEndpoint', { replacements: { hashEndpoint: createHash('sha256').update(inscricao.endpoint).digest('hex') } });
        } else {
          console.error('[Notificações push] Falha ao enviar aviso.', { idSalao, status: erro.statusCode, mensagem: erro.message });
        }
      }
    }));
  } catch (erro) {
    console.error('[Notificações push] Falha ao consultar dispositivos inscritos.', { idSalao, mensagem: erro.message });
  }
}

export async function notificarSalaoDoAgendamento(idAgendamento, titulo, corpo) {
  try {
    const saloes = await bancoDeDados.query(
      `SELECT u.fk_salao AS idSalao,
              COALESCE(cli.nm_usuario, 'Um cliente') AS nomeCliente,
              a.nm_servico_agendado AS nomeServico,
              DATE_FORMAT(a.dt_inicio, '%d/%m/%Y') AS dataAgendamento,
              DATE_FORMAT(a.dt_inicio, '%H:%i') AS horaAgendamento
       FROM tb_agendamento a
       INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
       LEFT JOIN tb_usuario cli ON cli.id_usuario=a.fk_usuario
       WHERE a.id_agendamento=:idAgendamento LIMIT 1`,
      { replacements: { idAgendamento }, type: QueryTypes.SELECT },
    );
    if (saloes.length) {
      const agendamento = saloes[0];
      if (!await salaoTemAcessoPremium(agendamento.idSalao)) return;
      let mensagem = corpo;
      let idNotificacao = null;
      if (agendamento.dataAgendamento && agendamento.horaAgendamento) {
        if (titulo === 'Novo agendamento') {
          mensagem = `${agendamento.nomeCliente} realizou um agendamento para ${agendamento.nomeServico}, dia ${agendamento.dataAgendamento} às ${agendamento.horaAgendamento}.`;
        } else if (titulo === 'Agendamento cancelado') {
          mensagem = `${agendamento.nomeCliente} cancelou o agendamento de ${agendamento.nomeServico}, marcado para dia ${agendamento.dataAgendamento} às ${agendamento.horaAgendamento}.`;
        } else if (titulo === 'Agendamento alterado') {
          mensagem = `${agendamento.nomeCliente} alterou o agendamento de ${agendamento.nomeServico} para dia ${agendamento.dataAgendamento} às ${agendamento.horaAgendamento}.`;
        }
      }
      try { idNotificacao = await criarNotificacaoSalao(agendamento.idSalao, titulo, mensagem); } catch (erroRegistro) {
        console.error('[Notificações] Não foi possível salvar o aviso na central.', { idAgendamento, mensagem: erroRegistro.message });
      }
      await enviarNotificacaoSalao(agendamento.idSalao, titulo, mensagem, idNotificacao);
    }
  } catch (erro) {
    console.error('[Notificações push] Não foi possível notificar o salão.', { idAgendamento, mensagem: erro.message });
  }
}

export async function notificarSalaoDaUnidade(idUnidade, titulo, corpo) {
  try {
    const saloes = await bancoDeDados.query(
      'SELECT fk_salao AS idSalao FROM tb_unidade WHERE id_unidade=:idUnidade LIMIT 1',
      { replacements: { idUnidade }, type: QueryTypes.SELECT },
    );
    if (saloes.length) {
      if (!await salaoTemAcessoPremium(saloes[0].idSalao)) return;
      let idNotificacao = null;
      try { idNotificacao = await criarNotificacaoSalao(saloes[0].idSalao, titulo, corpo); } catch (erroRegistro) {
        console.error('[Notificações] Não foi possível salvar o aviso na central.', { idUnidade, mensagem: erroRegistro.message });
      }
      await enviarNotificacaoSalao(saloes[0].idSalao, titulo, corpo, idNotificacao);
    }
  } catch (erro) {
    console.error('[Notificações push] Não foi possível notificar o salão.', { idUnidade, mensagem: erro.message });
  }
}
