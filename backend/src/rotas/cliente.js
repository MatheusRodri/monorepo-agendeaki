import { QueryTypes } from 'sequelize';
import { Router } from 'express';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteAdministrativoSupabase, obterClienteSupabase } from '../configuracoes/supabase.js';
import { cpfValido, dataNascimentoValida, somenteNumeros } from '../servicos/documentos.js';
import { listarHorariosDisponiveis, resolverReserva } from '../servicos/disponibilidade.js';
import { atualizarDadosCadastraisUsuario, obterDadosCadastraisUsuario, sincronizarUsuario } from '../servicos/usuarios.js';
import {
  criarNotificacaoCliente,
  consultarInscricaoPushCliente,
  enviarNotificacaoPushCliente,
  listarNotificacoesCliente,
  marcarNotificacaoClienteLida,
  marcarTodasNotificacoesClienteLidas,
  obterChavePublicaPush,
  removerInscricaoPushCliente,
  salvarInscricaoPushCliente,
  notificarSalaoDoAgendamento,
} from '../servicos/notificacoesPush.js';

const roteadorCliente = Router();
const raiosPermitidos = [0, 1, 5, 10];

function extrairTokenAcesso(requisicao) {
  const cabecalhoAutorizacao = requisicao.headers.authorization;
  return cabecalhoAutorizacao?.startsWith('Bearer ') ? cabecalhoAutorizacao.slice(7) : null;
}

async function obterClienteAutenticado(requisicao, resposta) {
  const tokenAcesso = extrairTokenAcesso(requisicao);

  if (!tokenAcesso) {
    resposta.status(401).json({ mensagem: 'Informe o token de acesso.' });
    return null;
  }

  try {
    const clienteSupabase = obterClienteSupabase(tokenAcesso);
    const { data: dadosUsuario, error: erroUsuario } = await clienteSupabase.auth.getUser(tokenAcesso);

    if (erroUsuario || !dadosUsuario.user) {
      resposta.status(401).json({ mensagem: 'A sessão informada é inválida ou expirou.' });
      return null;
    }

    if (dadosUsuario.user.user_metadata?.perfil !== 'CLIENTE') {
      resposta.status(403).json({ mensagem: 'Esta área é exclusiva para clientes.' });
      return null;
    }

    const cliente = await sincronizarUsuario({
      email: dadosUsuario.user.email,
      idAutenticacaoExterna: dadosUsuario.user.id,
      nome: dadosUsuario.user.user_metadata.nome ?? dadosUsuario.user.email,
      perfil: 'CLIENTE',
    });
    return { ...cliente, idAutenticacaoExterna: dadosUsuario.user.id };
  } catch (erro) {
    resposta.status(500).json({ mensagem: erro.message });
    return null;
  }
}

async function localizarCidade(cidade) {
  const chaveHere = process.env.HERE_API_KEY;
  if (!chaveHere) throw new Error('A busca de localização ainda não foi configurada. Configure a chave da HERE.');

  const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
  url.search = new URLSearchParams({
    apiKey: chaveHere,
    lang: 'pt-BR',
    limit: '1',
    qq: `city=${cidade};country=BRA`,
    types: 'city',
  }).toString();

  let resposta;
  try {
    resposta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error('Não foi possível localizar essa cidade agora. Tente novamente.');
  }
  const dados = await resposta.json();
  const resultado = dados.items?.[0];
  if (!resposta.ok || !resultado?.position) throw new Error('Não foi possível localizar essa cidade.');
  return { latitude: Number(resultado.position.lat), longitude: Number(resultado.position.lng) };
}

async function obterCoordenadas(requisicao) {
  const cidade = String(requisicao.query.cidade ?? '').trim();
  const coordenadasCidade = cidade ? await localizarCidade(cidade) : null;
  const latitude = coordenadasCidade?.latitude ?? Number(requisicao.query.latitude);
  const longitude = coordenadasCidade?.longitude ?? Number(requisicao.query.longitude);
  const raioKm = Number(requisicao.query.raioKm ?? 5);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { mensagem: 'Informe latitude e longitude válidas.' };
  }

  if (!raiosPermitidos.includes(raioKm)) {
    return { mensagem: 'A distância deve ser sem limite, 1 km, 5 km ou 10 km.' };
  }

  return { cidade, latitude, longitude, raioKm };
}

async function consultarPerfil(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const perfil = await obterDadosCadastraisUsuario(cliente.idUsuario);
  resposta.status(200).json({
    perfil,
    cadastroIncompleto: !perfil?.cpf || !perfil?.dataNascimento,
  });
}

async function atualizarPerfil(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const { dataNascimento, nome } = requisicao.body ?? {};
  const cpf = somenteNumeros(requisicao.body?.cpf);
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe seu nome.' }); return; }
  if (!cpfValido(cpf)) { resposta.status(400).json({ mensagem: 'Informe um CPF válido.' }); return; }
  if (!dataNascimentoValida(dataNascimento)) { resposta.status(400).json({ mensagem: 'Você precisa ter pelo menos 18 anos.' }); return; }
  try {
    const perfil = await atualizarDadosCadastraisUsuario(cliente.idUsuario, { cpf, dataNascimento, documento: cpf, nome, tipoDocumento: 'CPF' });
    resposta.status(200).json({ mensagem: 'Informações da conta atualizadas.', perfil, cadastroIncompleto: false });
  } catch (erro) {
    resposta.status(400).json({ mensagem: erro.name === 'SequelizeUniqueConstraintError' ? 'Este CPF já está em uso.' : 'Não foi possível atualizar suas informações.' });
  }
}

async function alterarSenha(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const senha = requisicao.body?.senha;
  const confirmacaoSenha = requisicao.body?.confirmacaoSenha;
  if (!senha || senha.length < 6) { resposta.status(400).json({ mensagem: 'A nova senha deve possuir pelo menos 6 caracteres.' }); return; }
  if (senha !== confirmacaoSenha) { resposta.status(400).json({ mensagem: 'As senhas precisam ser iguais.' }); return; }
  const tokenAcesso = extrairTokenAcesso(requisicao);
  try {
    const atualizacao = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT', headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${tokenAcesso}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: senha }),
    });
    if (!atualizacao.ok) throw new Error();
    resposta.status(200).json({ mensagem: 'Senha alterada com sucesso.' });
  } catch { resposta.status(400).json({ mensagem: 'Não foi possível alterar a senha agora.' }); }
}

function agruparServicos(linhasServicos) {
  const servicosPorId = new Map();

  linhasServicos.forEach((linhaServico) => {
    if (!servicosPorId.has(linhaServico.idServico)) {
      servicosPorId.set(linhaServico.idServico, {
        idServico: linhaServico.idServico,
        nome: linhaServico.nome,
        descricao: linhaServico.descricao,
        valor: Number(linhaServico.valor),
        duracaoMinutos: linhaServico.duracaoMinutos,
        profissionais: [],
      });
    }

    if (linhaServico.idFuncionario) {
      servicosPorId.get(linhaServico.idServico).profissionais.push({
        idFuncionario: linhaServico.idFuncionario,
        nome: linhaServico.nomeFuncionario,
      });
    }
  });

  return [...servicosPorId.values()];
}

async function listarSaloesProximos(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;

  let coordenadas;
  try { coordenadas = await obterCoordenadas(requisicao); } catch (erro) { resposta.status(400).json({ mensagem: erro.message }); return; }
  if (coordenadas.mensagem) {
    resposta.status(400).json(coordenadas);
    return;
  }

  const busca = String(requisicao.query.busca ?? '').trim();
  const idUnidade = Number(requisicao.query.idUnidade);
  const buscaPorUnidadeSelecionada = Number.isSafeInteger(idUnidade) && idUnidade > 0;
  const saloes = await bancoDeDados.query(
    `SELECT u.id_unidade AS idUnidade,
            s.id_salao AS idSalao,
            s.nm_salao AS nomeSalao,
            s.ds_slug AS slugSalao,
            u.nm_unidade AS nomeUnidade,
            u.ds_slug AS slugFilial,
            u.tp_categoria AS categoria,
            u.ds_rua AS rua,
            u.nu_endereco AS numeroEndereco,
            u.ds_complemento AS complemento,
            u.ds_bairro AS bairro,
            u.ds_municipio AS municipio,
            u.ds_estado AS estado,
            u.nu_cep AS cep,
            u.nu_latitude AS latitude,
            u.nu_longitude AS longitude,
            CASE WHEN ass.cd_status IN ('AUTORIZADA', 'EM_TESTE')
              OR (ass.cd_status IN ('CANCELADA', 'CANCELAMENTO_AGENDADO')
                  AND ass.dt_proxima_cobranca > NOW())
              THEN TRUE ELSE FALSE END AS proAtivo,
            COALESCE(av.quantidade, 0) AS quantidadeAvaliacoes,
            av.mediaSalao AS mediaAvaliacao,
            (6371 * ACOS(
              COS(RADIANS(:latitude)) * COS(RADIANS(u.nu_latitude)) *
              COS(RADIANS(u.nu_longitude) - RADIANS(:longitude)) +
              SIN(RADIANS(:latitude)) * SIN(RADIANS(u.nu_latitude))
            )) AS distanciaKm
     FROM tb_unidade u
     INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
     LEFT JOIN tb_assinatura_salao ass ON ass.id_assinatura_salao = (
       SELECT ultima.id_assinatura_salao FROM tb_assinatura_salao ultima
       WHERE ultima.fk_salao=s.id_salao ORDER BY ultima.dt_criacao DESC, ultima.id_assinatura_salao DESC LIMIT 1
     )
     LEFT JOIN (
       SELECT fk_unidade, COUNT(*) AS quantidade, ROUND(AVG(nu_nota_salao),1) AS mediaSalao
       FROM tb_avaliacao GROUP BY fk_unidade
     ) av ON av.fk_unidade=u.id_unidade
     WHERE u.st_ativo = TRUE
       AND s.st_ativo = TRUE
       AND u.nu_latitude IS NOT NULL
       AND u.nu_longitude IS NOT NULL
       AND (
         (:idUnidade > 0 AND u.id_unidade = :idUnidade)
         OR (:idUnidade = 0 AND (:busca = '' OR s.nm_salao LIKE :buscaComCuringa OR u.nm_unidade LIKE :buscaComCuringa OR u.ds_municipio LIKE :buscaComCuringa))
       )
       HAVING (:buscaPorUnidadeSelecionada = TRUE OR :raioKm = 0 OR distanciaKm <= :raioKm)
     ORDER BY distanciaKm, s.nm_salao, u.nm_unidade`,
    {
      replacements: { ...coordenadas, busca, buscaComCuringa: `%${busca}%`, idUnidade: buscaPorUnidadeSelecionada ? idUnidade : 0, buscaPorUnidadeSelecionada },
      type: QueryTypes.SELECT,
    },
  );

  let filialMaisProxima = null;

  if (!saloes.length) {
    const filiaisMaisProximas = await bancoDeDados.query(
      `SELECT u.nm_unidade AS nomeUnidade,
              (6371 * ACOS(
                COS(RADIANS(:latitude)) * COS(RADIANS(u.nu_latitude)) *
                COS(RADIANS(u.nu_longitude) - RADIANS(:longitude)) +
                SIN(RADIANS(:latitude)) * SIN(RADIANS(u.nu_latitude))
              )) AS distanciaKm
       FROM tb_unidade u
       INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
       WHERE u.st_ativo = TRUE
         AND s.st_ativo = TRUE
         AND u.nu_latitude IS NOT NULL
         AND u.nu_longitude IS NOT NULL
       ORDER BY distanciaKm
       LIMIT 1`,
      {
        replacements: coordenadas,
        type: QueryTypes.SELECT,
      },
    );

    filialMaisProxima = filiaisMaisProximas[0]
      ? {
        distanciaKm: Number(filiaisMaisProximas[0].distanciaKm).toFixed(1),
        nomeUnidade: filiaisMaisProximas[0].nomeUnidade,
      }
      : null;
  }

  console.info('[Descoberta cliente] Busca concluída.', {
    idCliente: cliente.idUsuario,
    raioKm: coordenadas.raioKm,
    quantidadeSaloesEncontrados: saloes.length,
    filialMaisProxima,
  });

  resposta.status(200).json({ centroBusca: { latitude: coordenadas.latitude, longitude: coordenadas.longitude }, cliente, cidade: coordenadas.cidade || null, raioKm: coordenadas.raioKm, saloes });
}

async function sugerirSaloes(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const termo = String(requisicao.query.termo ?? '').trim();
  const cidade = String(requisicao.query.cidade ?? '').trim();
  if (termo.length < 2) { resposta.status(200).json({ sugestoes: [] }); return; }
  const sugestoes = await bancoDeDados.query(
    `SELECT DISTINCT u.id_unidade AS idUnidade, s.nm_salao AS nomeSalao, u.nm_unidade AS nomeUnidade, u.ds_municipio AS municipio
     FROM tb_unidade u INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
     WHERE u.st_ativo = TRUE AND s.st_ativo = TRUE
       AND (s.nm_salao LIKE :termo OR u.nm_unidade LIKE :termo)
       AND (:cidade = '' OR u.ds_municipio LIKE :cidadeComCuringa)
     ORDER BY s.nm_salao, u.nm_unidade LIMIT 6`,
    { replacements: { cidade, cidadeComCuringa: `%${cidade}%`, termo: `%${termo}%` }, type: QueryTypes.SELECT },
  );
  resposta.status(200).json({ sugestoes });
}

async function listarServicosSalao(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;

  const idUnidade = Number(requisicao.params.idUnidade);
  if (!Number.isInteger(idUnidade)) {
    resposta.status(400).json({ mensagem: 'Informe uma unidade válida.' });
    return;
  }

  const linhasServicos = await bancoDeDados.query(
    `SELECT s.id_servico AS idServico,
            s.nm_servico AS nome,
            s.ds_servico AS descricao,
            s.vl_servico AS valor,
            s.nu_duracao_minutos AS duracaoMinutos,
            f.id_funcionario AS idFuncionario,
            f.nm_funcionario AS nomeFuncionario
     FROM tb_servico s
     LEFT JOIN tb_funcionario_servico fs ON fs.fk_servico = s.id_servico
     LEFT JOIN tb_funcionario f ON f.id_funcionario = fs.fk_funcionario AND f.st_ativo = TRUE
     WHERE s.fk_unidade = :idUnidade AND s.st_ativo = TRUE
     ORDER BY s.nm_servico, f.nm_funcionario`,
    { replacements: { idUnidade }, type: QueryTypes.SELECT },
  );

  resposta.status(200).json({ idUnidade, servicos: agruparServicos(linhasServicos) });
}

async function criarAgendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;

  const dadosAgendamento = requisicao.body ?? {};
  const idUnidade = Number(dadosAgendamento.idUnidade);
  const idServico = Number(dadosAgendamento.idServico);
  const idFuncionario = dadosAgendamento.idFuncionario == null || dadosAgendamento.idFuncionario === ''
    ? null
    : Number(dadosAgendamento.idFuncionario);

  if (![idUnidade, idServico].every(Number.isInteger) || (idFuncionario !== null && !Number.isInteger(idFuncionario))) {
    resposta.status(400).json({ mensagem: 'Informe unidade, serviço, profissional e horário válidos.' });
    return;
  }

  const transacao = await bancoDeDados.transaction();

  try {
    const reserva = await resolverReserva({
      dataHoraInicio: dadosAgendamento.dataHoraInicio,
      idFuncionario,
      idServico,
      idUnidade,
      transaction: transacao,
    });
    const conflitos = await bancoDeDados.query(
      `SELECT id_agendamento FROM tb_agendamento
       WHERE fk_funcionario = :idFuncionario AND cd_status = 'AGENDADO'
         AND dt_inicio < :dataFimBanco AND dt_fim > :dataInicioBanco FOR UPDATE`,
      { replacements: reserva, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (conflitos.length) { const erro = new Error('Este horário acabou de ser reservado. Escolha outro horário.'); erro.status = 409; throw erro; }

    const [idAgendamentoCriado] = await bancoDeDados.query(
      `INSERT INTO tb_agendamento (
        fk_usuario, fk_unidade, fk_funcionario, fk_servico, dt_inicio, dt_fim,
        nm_servico_agendado, vl_servico_agendado, nu_duracao_minutos, ds_observacao
      ) VALUES (
        :idUsuario, :idUnidade, :idFuncionario, :idServico, :dataInicioBanco, :dataFimBanco,
        :nomeServico, :valorServico, :duracaoMinutos, :observacao
      )`,
      {
        replacements: {
          idUsuario: cliente.idUsuario,
          idUnidade,
          idFuncionario: reserva.idFuncionario,
          idServico,
          dataInicioBanco: reserva.dataInicioBanco,
          dataFimBanco: reserva.dataFimBanco,
          nomeServico: reserva.nomeServico,
          valorServico: reserva.valorServico,
          duracaoMinutos: reserva.duracaoMinutos,
          observacao: dadosAgendamento.observacao?.trim() || null,
        },
        transaction: transacao,
      },
    );

    await transacao.commit();
    void notificarSalaoDoAgendamento(Number(idAgendamentoCriado), 'Novo agendamento', 'Um cliente acabou de agendar um horário.');
    resposta.status(201).json({ mensagem: 'Agendamento realizado com sucesso.', dataHoraInicio: reserva.dataInicioBanco, dataHoraFim: reserva.dataFimBanco, idFuncionario: reserva.idFuncionario, nomeFuncionario: reserva.nomeFuncionario });
  } catch (erro) {
    await transacao.rollback();
    resposta.status(erro.status ?? 500).json({ mensagem: erro.message });
  }
}

async function listarAgendamentos(requisicao, resposta, tipoListagem) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;

  const condicaoData = tipoListagem === 'futuros'
    ? "a.dt_inicio >= NOW() AND a.cd_status = 'AGENDADO'"
    : "a.dt_inicio < NOW() OR a.cd_status IN ('REALIZADO', 'CANCELADO', 'NAO_COMPARECEU')";
  const ordenacao = tipoListagem === 'futuros' ? 'ASC' : 'DESC';
  const agendamentos = await bancoDeDados.query(
    `SELECT a.id_agendamento AS idAgendamento,
            a.fk_unidade AS idUnidade,
            a.fk_servico AS idServico,
            a.fk_funcionario AS idFuncionario,
            a.dt_inicio AS dataHoraInicio,
            a.dt_fim AS dataHoraFim,
            a.nm_servico_agendado AS servico,
            a.vl_servico_agendado AS valor,
            a.ds_observacao AS observacao,
            a.ds_motivo_cancelamento AS motivoCancelamento,
            a.cd_status AS status,
            av.id_avaliacao AS idAvaliacao,
            CASE WHEN a.cd_status='REALIZADO' AND av.id_avaliacao IS NULL THEN TRUE ELSE FALSE END AS podeAvaliar,
            f.nm_funcionario AS profissional,
            s.nm_salao AS salao,
            u.nm_unidade AS unidade,
            u.ds_municipio AS municipio
     FROM tb_agendamento a
     INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario
     INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
     INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
     LEFT JOIN tb_avaliacao av ON av.fk_agendamento = a.id_agendamento
     WHERE a.fk_usuario = :idUsuario AND (${condicaoData})
     ORDER BY a.dt_inicio ${ordenacao}`,
    { replacements: { idUsuario: cliente.idUsuario }, type: QueryTypes.SELECT },
  );

  resposta.status(200).json({ agendamentos });
}

async function consultarNotificacoesCliente(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  resposta.status(200).json(await listarNotificacoesCliente(cliente.idUsuario));
}

async function marcarNotificacaoClienteComoLida(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idNotificacao = Number(requisicao.params.idNotificacao);
  if (!Number.isSafeInteger(idNotificacao) || idNotificacao <= 0) {
    resposta.status(400).json({ mensagem: 'Notificação inválida.' });
    return;
  }
  const atualizada = await marcarNotificacaoClienteLida(cliente.idUsuario, idNotificacao);
  if (!atualizada) {
    const existentes = await bancoDeDados.query(
      'SELECT id_notificacao FROM tb_notificacao_cliente WHERE id_notificacao=:idNotificacao AND fk_usuario=:idUsuario LIMIT 1',
      { replacements: { idNotificacao, idUsuario: cliente.idUsuario }, type: QueryTypes.SELECT },
    );
    if (!existentes.length) {
      resposta.status(404).json({ mensagem: 'Notificação não encontrada.' });
      return;
    }
  }
  resposta.status(200).json({ mensagem: 'Notificação marcada como lida.' });
}

async function marcarNotificacaoAgendamentoClienteComoLida(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  if (!Number.isSafeInteger(idAgendamento) || idAgendamento <= 0) {
    resposta.status(400).json({ mensagem: 'Agendamento inválido.' });
    return;
  }
  const [resultado] = await bancoDeDados.query(
    `UPDATE tb_notificacao_cliente SET st_lida=TRUE
     WHERE fk_usuario=:idUsuario AND fk_agendamento=:idAgendamento
       AND cd_tipo='AVALIACAO' AND st_lida=FALSE`,
    { replacements: { idUsuario: cliente.idUsuario, idAgendamento } },
  );
  if (!resultado.affectedRows) {
    const existentes = await bancoDeDados.query(
      `SELECT id_notificacao FROM tb_notificacao_cliente
       WHERE fk_usuario=:idUsuario AND fk_agendamento=:idAgendamento AND cd_tipo='AVALIACAO' LIMIT 1`,
      { replacements: { idUsuario: cliente.idUsuario, idAgendamento }, type: QueryTypes.SELECT },
    );
    if (!existentes.length) {
      resposta.status(404).json({ mensagem: 'Notificação não encontrada.' });
      return;
    }
  }
  resposta.status(200).json({ mensagem: 'Notificação marcada como lida.' });
}

async function marcarTodasNotificacoesClienteComoLidas(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  await marcarTodasNotificacoesClienteLidas(cliente.idUsuario);
  resposta.status(200).json({ mensagem: 'Notificações marcadas como lidas.' });
}

function inscricaoPushValida(inscricao) {
  let endpointValido = false;
  try {
    const endpoint = new URL(inscricao?.endpoint);
    endpointValido = endpoint.protocol === 'https:'
      || (endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname));
  } catch {}
  return typeof inscricao?.endpoint === 'string' && inscricao.endpoint.length <= 2048
    && endpointValido && Boolean(inscricao?.keys?.p256dh) && Boolean(inscricao?.keys?.auth);
}

async function chavePublicaNotificacoesCliente(_requisicao, resposta) {
  const chavePublica = obterChavePublicaPush();
  if (!chavePublica) {
    resposta.status(503).json({ mensagem: 'Notificações ainda não foram configuradas neste ambiente.' });
    return;
  }
  resposta.status(200).json({ chavePublica });
}

async function salvarInscricaoNotificacoesCliente(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const inscricao = requisicao.body;
  if (!inscricaoPushValida(inscricao)) {
    resposta.status(400).json({ mensagem: 'Inscrição de notificações inválida.' });
    return;
  }
  await salvarInscricaoPushCliente(cliente.idUsuario, inscricao);
  resposta.status(201).json({ mensagem: 'Notificações ativadas neste dispositivo.' });
}

async function consultarInscricaoNotificacoesCliente(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  resposta.status(200).json({ ativa: await consultarInscricaoPushCliente(cliente.idUsuario, String(requisicao.query.endpoint ?? '')) });
}

async function excluirInscricaoNotificacoesCliente(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const endpoint = requisicao.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    resposta.status(400).json({ mensagem: 'Informe o dispositivo a desativar.' });
    return;
  }
  await removerInscricaoPushCliente(cliente.idUsuario, endpoint);
  resposta.status(200).json({ mensagem: 'Notificações desativadas neste dispositivo.' });
}

async function avaliarAgendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const notaSalao = Number(requisicao.body?.notaSalao);
  const notaServico = Number(requisicao.body?.notaServico);
  const comentario = String(requisicao.body?.comentario ?? '').trim();
  if (!Number.isSafeInteger(idAgendamento) || idAgendamento <= 0
    || !Number.isInteger(notaSalao) || notaSalao < 1 || notaSalao > 5
    || !Number.isInteger(notaServico) || notaServico < 1 || notaServico > 5
    || comentario.length > 500) {
    resposta.status(400).json({ mensagem: 'Informe notas de 1 a 5 e comentário de até 500 caracteres.' });
    return;
  }
  const agendamentos = await bancoDeDados.query(
    `SELECT id_agendamento AS idAgendamento, fk_unidade AS idUnidade, fk_servico AS idServico,
            cd_status AS status FROM tb_agendamento
     WHERE id_agendamento=:idAgendamento AND fk_usuario=:idUsuario LIMIT 1`,
    { replacements: { idAgendamento, idUsuario: cliente.idUsuario }, type: QueryTypes.SELECT },
  );
  const agendamento = agendamentos[0];
  if (!agendamento) { resposta.status(404).json({ mensagem: 'Agendamento não encontrado.' }); return; }
  if (agendamento.status !== 'REALIZADO') {
    resposta.status(409).json({ mensagem: 'A avaliação fica disponível após o atendimento ser marcado como realizado.' });
    return;
  }
  try {
    await bancoDeDados.query(
      `INSERT INTO tb_avaliacao (fk_agendamento, fk_usuario, fk_unidade, fk_servico,
         nu_nota_salao, nu_nota_servico, ds_comentario)
       VALUES (:idAgendamento, :idUsuario, :idUnidade, :idServico, :notaSalao, :notaServico, :comentario)`,
      { replacements: { ...agendamento, idUsuario: cliente.idUsuario, notaSalao, notaServico, comentario: comentario || null } },
    );
    resposta.status(201).json({ mensagem: 'Avaliação publicada com sucesso.' });
  } catch (erro) {
    if (erro.name === 'SequelizeUniqueConstraintError') {
      resposta.status(409).json({ mensagem: 'Este agendamento já foi avaliado.' });
      return;
    }
    throw erro;
  }
}

async function cancelarAgendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const resultado = await bancoDeDados.query(`UPDATE tb_agendamento SET cd_status = 'CANCELADO', dt_cancelamento = NOW(), cd_origem_cancelamento = 'CLIENTE', cd_motivo_cancelamento = 'SOLICITACAO_CLIENTE', ds_motivo_cancelamento = 'Solicitação do cliente' WHERE id_agendamento = :idAgendamento AND fk_usuario = :idUsuario AND cd_status = 'AGENDADO' AND dt_inicio > NOW()`, { replacements: { idAgendamento, idUsuario: cliente.idUsuario } });
  if (!resultado[1]?.affectedRows && !resultado[0]?.affectedRows) { resposta.status(404).json({ mensagem: 'Esse agendamento não pode mais ser cancelado.' }); return; }
  void notificarSalaoDoAgendamento(idAgendamento, 'Agendamento cancelado', 'Um cliente cancelou um horário marcado.');
  resposta.status(200).json({ mensagem: 'Agendamento cancelado com sucesso.' });
}

async function listarHorariosReagendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta); if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const agendamentos = await bancoDeDados.query(
    `SELECT id_agendamento AS idAgendamento, fk_servico AS idServico,
            nu_duracao_minutos AS duracaoMinutos
     FROM tb_agendamento WHERE id_agendamento=:idAgendamento
     AND fk_usuario=:idUsuario AND cd_status='AGENDADO' AND dt_inicio>NOW() LIMIT 1`,
    { replacements: { idAgendamento, idUsuario: cliente.idUsuario }, type: QueryTypes.SELECT },
  );
  if (!agendamentos.length) { resposta.status(404).json({ mensagem: 'Esse agendamento não pode mais ser alterado.' }); return; }
  const idFuncionario = requisicao.query.idFuncionario === 'qualquer' ? null : Number(requisicao.query.idFuncionario);
  const idServico = Number(requisicao.query.idServico);
  const idUnidade = Number(requisicao.query.idUnidade);
  if (!Number.isInteger(idServico) || !Number.isInteger(idUnidade) || (idFuncionario !== null && !Number.isInteger(idFuncionario))) {
    resposta.status(400).json({ mensagem: 'Informe serviço, filial e profissional válidos.' }); return;
  }
  try {
    const disponibilidade = await listarHorariosDisponiveis({
      data: String(requisicao.query.data ?? ''),
      idFuncionario,
      idServico,
      idUnidade,
      ignorarIdAgendamento: idAgendamento,
      duracaoMinutos: Number(agendamentos[0].idServico) === idServico
        ? Number(agendamentos[0].duracaoMinutos) : null,
    });
    resposta.status(200).json(disponibilidade);
  } catch (erro) { resposta.status(erro.status ?? 500).json({ mensagem: erro.message }); }
}

async function atualizarAgendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const idUnidade = Number(requisicao.body?.idUnidade);
  const idServico = Number(requisicao.body?.idServico);
  const idFuncionario = requisicao.body?.idFuncionario == null || requisicao.body?.idFuncionario === ''
    ? null
    : Number(requisicao.body.idFuncionario);
  if (![idAgendamento, idUnidade, idServico].every(Number.isInteger) || (idFuncionario !== null && !Number.isInteger(idFuncionario))) { resposta.status(400).json({ mensagem: 'Informe um novo horário futuro, serviço e profissional válidos.' }); return; }

  const transacao = await bancoDeDados.transaction();
  try {
    const agendamentos = await bancoDeDados.query(`SELECT id_agendamento AS idAgendamento, fk_servico AS idServicoOriginal, nm_servico_agendado AS nomeServico, vl_servico_agendado AS valorServico, nu_duracao_minutos AS duracaoMinutos FROM tb_agendamento WHERE id_agendamento = :idAgendamento AND fk_usuario = :idUsuario AND cd_status = 'AGENDADO' AND dt_inicio > NOW() LIMIT 1 FOR UPDATE`, { replacements: { idAgendamento, idUsuario: cliente.idUsuario }, transaction: transacao, type: QueryTypes.SELECT });
    if (!agendamentos.length) { const erro = new Error('Esse agendamento não pode mais ser alterado.'); erro.status = 404; throw erro; }
    const mesmoServico = Number(agendamentos[0].idServicoOriginal) === idServico;
    const reserva = await resolverReserva({ dataHoraInicio: requisicao.body?.dataHoraInicio, idFuncionario, idServico, idUnidade, ignorarIdAgendamento: idAgendamento, duracaoMinutos: mesmoServico ? Number(agendamentos[0].duracaoMinutos) : null, transaction: transacao });
    if (mesmoServico) {
      reserva.nomeServico = agendamentos[0].nomeServico;
      reserva.valorServico = Number(agendamentos[0].valorServico);
      reserva.duracaoMinutos = Number(agendamentos[0].duracaoMinutos);
    }
    const conflitos = await bancoDeDados.query(
      `SELECT id_agendamento FROM tb_agendamento WHERE fk_funcionario=:idFuncionario
       AND id_agendamento <> :idAgendamento AND cd_status='AGENDADO'
       AND dt_inicio < :dataFimBanco AND dt_fim > :dataInicioBanco FOR UPDATE`,
      { replacements: { ...reserva, idAgendamento }, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (conflitos.length) { const erro = new Error('Esse horário acabou de ser reservado. Escolha outro.'); erro.status = 409; throw erro; }
    await bancoDeDados.query(`UPDATE tb_agendamento SET fk_unidade=:idUnidade, fk_funcionario=:idFuncionario, fk_servico=:idServico, dt_inicio=:dataInicioBanco, dt_fim=:dataFimBanco, nm_servico_agendado=:nomeServico, vl_servico_agendado=:valorServico, nu_duracao_minutos=:duracaoMinutos, ds_observacao=:observacao WHERE id_agendamento=:idAgendamento`, { replacements: { ...reserva, idAgendamento, idServico, idUnidade, observacao: requisicao.body?.observacao?.trim() || null }, transaction: transacao });
    await transacao.commit();
    void notificarSalaoDoAgendamento(idAgendamento, 'Agendamento alterado', 'Um cliente alterou os dados de um horário marcado.');
    resposta.status(200).json({ mensagem: 'Agendamento atualizado com sucesso.' });
  } catch (erro) { await transacao.rollback(); resposta.status(erro.status ?? 400).json({ mensagem: erro.message }); }
}

async function excluirConta(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;

  let clienteAdministrativo;
  try {
    clienteAdministrativo = obterClienteAdministrativoSupabase();
  } catch (erro) {
    resposta.status(503).json({ mensagem: erro.message });
    return;
  }

  const transacao = await bancoDeDados.transaction();
  try {
    const agendamentos = await bancoDeDados.query(
      'SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE fk_usuario = :idUsuario',
      { replacements: cliente, transaction: transacao, type: QueryTypes.SELECT },
    );
    const idsAgendamentos = agendamentos.map((agendamento) => agendamento.idAgendamento);

    await bancoDeDados.query(
      'UPDATE tb_agendamento SET fk_usuario_cancelamento = NULL WHERE fk_usuario_cancelamento = :idUsuario',
      { replacements: cliente, transaction: transacao },
    );
    if (idsAgendamentos.length) {
      await bancoDeDados.query(
        'DELETE FROM tb_pagamento WHERE fk_agendamento IN (:idsAgendamentos)',
        { replacements: { idsAgendamentos }, transaction: transacao },
      );
      await bancoDeDados.query(
        'DELETE FROM tb_agendamento WHERE id_agendamento IN (:idsAgendamentos)',
        { replacements: { idsAgendamentos }, transaction: transacao },
      );
    }
    await bancoDeDados.query(
      'DELETE FROM tb_usuario WHERE id_usuario = :idUsuario',
      { replacements: cliente, transaction: transacao },
    );

    const { error: erroSupabase } = await clienteAdministrativo.auth.admin.deleteUser(cliente.idAutenticacaoExterna);
    if (erroSupabase) throw new Error('Não foi possível excluir a conta no Supabase. Nenhum dado local foi removido.');

    await transacao.commit();
    resposta.status(200).json({ mensagem: 'Conta, agendamentos e dados vinculados foram excluídos.' });
  } catch (erro) {
    await transacao.rollback();
    console.error('[Exclusão de conta cliente] Falha ao excluir conta.', { idUsuario: cliente.idUsuario, mensagem: erro.message });
    resposta.status(500).json({ mensagem: erro.message });
  }
}

roteadorCliente.get('/saloes-proximos', listarSaloesProximos);
roteadorCliente.get('/notificacoes/chave-publica', chavePublicaNotificacoesCliente);
roteadorCliente.get('/notificacoes/inscricao', consultarInscricaoNotificacoesCliente);
roteadorCliente.post('/notificacoes/inscricao', salvarInscricaoNotificacoesCliente);
roteadorCliente.delete('/notificacoes/inscricao', excluirInscricaoNotificacoesCliente);
roteadorCliente.get('/notificacoes', consultarNotificacoesCliente);
roteadorCliente.post('/notificacoes/lidas', marcarTodasNotificacoesClienteComoLidas);
roteadorCliente.patch('/notificacoes/:idNotificacao/lida', marcarNotificacaoClienteComoLida);
roteadorCliente.patch('/notificacoes/agendamentos/:idAgendamento/lida', marcarNotificacaoAgendamentoClienteComoLida);
roteadorCliente.get('/perfil', consultarPerfil);
roteadorCliente.patch('/perfil', atualizarPerfil);
roteadorCliente.patch('/senha', alterarSenha);
roteadorCliente.get('/sugestoes-saloes', sugerirSaloes);
roteadorCliente.get('/saloes/:idUnidade/servicos', listarServicosSalao);
roteadorCliente.post('/agendamentos', criarAgendamento);
roteadorCliente.post('/agendamentos/:idAgendamento/avaliacao', avaliarAgendamento);
roteadorCliente.get('/agendamentos/:idAgendamento/horarios', listarHorariosReagendamento);
roteadorCliente.patch('/agendamentos/:idAgendamento', atualizarAgendamento);
roteadorCliente.patch('/agendamentos/:idAgendamento/cancelar', cancelarAgendamento);
roteadorCliente.delete('/conta', excluirConta);
roteadorCliente.get('/agendamentos/futuros', (requisicao, resposta) => listarAgendamentos(requisicao, resposta, 'futuros'));
roteadorCliente.get('/agendamentos/historico', (requisicao, resposta) => listarAgendamentos(requisicao, resposta, 'historico'));

export default roteadorCliente;
