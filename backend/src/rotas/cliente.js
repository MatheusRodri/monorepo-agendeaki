import { QueryTypes } from 'sequelize';
import { Router } from 'express';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteAdministrativoSupabase, obterClienteSupabase } from '../configuracoes/supabase.js';
import { cpfValido, dataNascimentoValida, somenteNumeros } from '../servicos/documentos.js';
import { atualizarDadosCadastraisUsuario, obterDadosCadastraisUsuario, sincronizarUsuario } from '../servicos/usuarios.js';

const roteadorCliente = Router();
const raiosPermitidos = [1, 5, 10];

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
    return { mensagem: 'O raio deve ser de 1 km, 5 km ou 10 km.' };
  }

  return { cidade, latitude, longitude, raioKm };
}

function formatarDataHoraBanco(data) {
  const preencher = (valor) => String(valor).padStart(2, '0');

  return `${data.getFullYear()}-${preencher(data.getMonth() + 1)}-${preencher(data.getDate())} ${preencher(data.getHours())}:${preencher(data.getMinutes())}:00`;
}

function formatarHora(data) {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}:00`;
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
  if (!dataNascimentoValida(dataNascimento)) { resposta.status(400).json({ mensagem: 'Informe uma data de nascimento válida.' }); return; }
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
  const saloes = await bancoDeDados.query(
    `SELECT u.id_unidade AS idUnidade,
            s.id_salao AS idSalao,
            s.nm_salao AS nomeSalao,
            u.nm_unidade AS nomeUnidade,
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
       AND (:busca = '' OR s.nm_salao LIKE :buscaComCuringa OR u.nm_unidade LIKE :buscaComCuringa OR u.ds_municipio LIKE :buscaComCuringa)
     HAVING distanciaKm <= :raioKm
     ORDER BY distanciaKm, s.nm_salao, u.nm_unidade`,
    {
      replacements: { ...coordenadas, busca, buscaComCuringa: `%${busca}%` },
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
    `SELECT DISTINCT s.nm_salao AS nomeSalao, u.nm_unidade AS nomeUnidade, u.ds_municipio AS municipio
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
  const idFuncionario = Number(dadosAgendamento.idFuncionario);
  const dataInicio = new Date(dadosAgendamento.dataHoraInicio);

  if (![idUnidade, idServico, idFuncionario].every(Number.isInteger) || Number.isNaN(dataInicio.getTime())) {
    resposta.status(400).json({ mensagem: 'Informe unidade, serviço, profissional e horário válidos.' });
    return;
  }

  if (dataInicio <= new Date()) {
    resposta.status(400).json({ mensagem: 'Escolha um horário futuro para o agendamento.' });
    return;
  }

  const transacao = await bancoDeDados.transaction();

  try {
    const servicosDisponiveis = await bancoDeDados.query(
      `SELECT s.nm_servico AS nomeServico,
              s.vl_servico AS valorServico,
              s.nu_duracao_minutos AS duracaoMinutos
       FROM tb_servico s
       INNER JOIN tb_funcionario_servico fs ON fs.fk_servico = s.id_servico
       INNER JOIN tb_funcionario f ON f.id_funcionario = fs.fk_funcionario
       WHERE s.id_servico = :idServico
         AND s.fk_unidade = :idUnidade
         AND s.st_ativo = TRUE
         AND f.id_funcionario = :idFuncionario
         AND f.st_ativo = TRUE
       LIMIT 1`,
      { replacements: { idUnidade, idServico, idFuncionario }, transaction: transacao, type: QueryTypes.SELECT },
    );

    if (!servicosDisponiveis.length) {
      await transacao.rollback();
      resposta.status(400).json({ mensagem: 'O profissional selecionado não atende este serviço nesta unidade.' });
      return;
    }

    const servico = servicosDisponiveis[0];
    const dataFim = new Date(dataInicio.getTime() + servico.duracaoMinutos * 60000);
    const diaSemana = dataInicio.getDay();
    const horaInicio = formatarHora(dataInicio);
    const horaFim = formatarHora(dataFim);
    const disponibilidades = await bancoDeDados.query(
      `SELECT hr_inicio AS horaInicio, hr_fim AS horaFim
       FROM tb_disponibilidade_funcionario
       WHERE fk_funcionario = :idFuncionario
         AND nr_dia_semana = :diaSemana
         AND st_ativo = TRUE`,
      { replacements: { diaSemana, idFuncionario }, transaction: transacao, type: QueryTypes.SELECT },
    );
    const horariosUnidade = disponibilidades.length
      ? disponibilidades
      : await bancoDeDados.query(
        `SELECT hr_abertura AS horaInicio, hr_fechamento AS horaFim
         FROM tb_horario_unidade
         WHERE fk_unidade = :idUnidade AND nr_dia_semana = :diaSemana AND st_fechado = FALSE`,
        { replacements: { diaSemana, idUnidade }, transaction: transacao, type: QueryTypes.SELECT },
      );
    const estaDisponivel = horariosUnidade.some((horario) => horaInicio >= horario.horaInicio && horaFim <= horario.horaFim);

    if (!estaDisponivel) {
      await transacao.rollback();
      resposta.status(400).json({ mensagem: 'O horário escolhido está fora da disponibilidade do profissional ou do funcionamento da filial.' });
      return;
    }

    const dataInicioBanco = formatarDataHoraBanco(dataInicio);
    const dataFimBanco = formatarDataHoraBanco(dataFim);
    const conflitos = await bancoDeDados.query(
      `SELECT id_agendamento AS idAgendamento
       FROM tb_agendamento
       WHERE fk_funcionario = :idFuncionario
         AND cd_status = 'AGENDADO'
         AND dt_inicio < :dataFimBanco
         AND dt_fim > :dataInicioBanco
       LIMIT 1`,
      { replacements: { dataFimBanco, dataInicioBanco, idFuncionario }, transaction: transacao, type: QueryTypes.SELECT },
    );

    if (conflitos.length) {
      await transacao.rollback();
      resposta.status(409).json({ mensagem: 'Este horário acabou de ser reservado. Escolha outro horário.' });
      return;
    }

    await bancoDeDados.query(
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
          idFuncionario,
          idServico,
          dataInicioBanco,
          dataFimBanco,
          nomeServico: servico.nomeServico,
          valorServico: servico.valorServico,
          duracaoMinutos: servico.duracaoMinutos,
          observacao: dadosAgendamento.observacao?.trim() || null,
        },
        transaction: transacao,
      },
    );

    await transacao.commit();
    resposta.status(201).json({ mensagem: 'Agendamento realizado com sucesso.', dataHoraInicio: dataInicioBanco, dataHoraFim: dataFimBanco });
  } catch (erro) {
    await transacao.rollback();
    resposta.status(500).json({ mensagem: erro.message });
  }
}

async function listarAgendamentos(requisicao, resposta, tipoListagem) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;

  const condicaoData = tipoListagem === 'futuros'
    ? "a.dt_inicio >= NOW() AND a.cd_status = 'AGENDADO'"
    : "a.dt_inicio < NOW() OR a.cd_status IN ('REALIZADO', 'CANCELADO')";
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
            a.cd_status AS status,
            f.nm_funcionario AS profissional,
            s.nm_salao AS salao,
            u.nm_unidade AS unidade,
            u.ds_municipio AS municipio
     FROM tb_agendamento a
     INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario
     INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
     INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
     WHERE a.fk_usuario = :idUsuario AND (${condicaoData})
     ORDER BY a.dt_inicio ${ordenacao}`,
    { replacements: { idUsuario: cliente.idUsuario }, type: QueryTypes.SELECT },
  );

  resposta.status(200).json({ agendamentos });
}

async function cancelarAgendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const resultado = await bancoDeDados.query(`UPDATE tb_agendamento SET cd_status = 'CANCELADO' WHERE id_agendamento = :idAgendamento AND fk_usuario = :idUsuario AND cd_status = 'AGENDADO' AND dt_inicio > NOW()`, { replacements: { idAgendamento, idUsuario: cliente.idUsuario } });
  if (!resultado[1]?.affectedRows && !resultado[0]?.affectedRows) { resposta.status(404).json({ mensagem: 'Esse agendamento não pode mais ser cancelado.' }); return; }
  resposta.status(200).json({ mensagem: 'Agendamento cancelado com sucesso.' });
}

async function atualizarAgendamento(requisicao, resposta) {
  const cliente = await obterClienteAutenticado(requisicao, resposta);
  if (!cliente) return;
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const idUnidade = Number(requisicao.body?.idUnidade);
  const idServico = Number(requisicao.body?.idServico);
  const idFuncionario = Number(requisicao.body?.idFuncionario);
  const dataInicio = new Date(requisicao.body?.dataHoraInicio);
  if (![idAgendamento, idUnidade, idServico, idFuncionario].every(Number.isInteger) || Number.isNaN(dataInicio.getTime()) || dataInicio <= new Date()) { resposta.status(400).json({ mensagem: 'Informe um novo horário futuro, serviço e profissional válidos.' }); return; }

  const transacao = await bancoDeDados.transaction();
  try {
    const agendamentos = await bancoDeDados.query(`SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE id_agendamento = :idAgendamento AND fk_usuario = :idUsuario AND cd_status = 'AGENDADO' AND dt_inicio > NOW() LIMIT 1`, { replacements: { idAgendamento, idUsuario: cliente.idUsuario }, transaction: transacao, type: QueryTypes.SELECT });
    if (!agendamentos.length) throw new Error('Esse agendamento não pode mais ser alterado.');
    const servicos = await bancoDeDados.query(`SELECT s.nm_servico AS nomeServico, s.vl_servico AS valorServico, s.nu_duracao_minutos AS duracaoMinutos FROM tb_servico s INNER JOIN tb_funcionario_servico fs ON fs.fk_servico = s.id_servico INNER JOIN tb_funcionario f ON f.id_funcionario = fs.fk_funcionario WHERE s.id_servico = :idServico AND s.fk_unidade = :idUnidade AND s.st_ativo = TRUE AND f.id_funcionario = :idFuncionario AND f.st_ativo = TRUE LIMIT 1`, { replacements: { idFuncionario, idServico, idUnidade }, transaction: transacao, type: QueryTypes.SELECT });
    if (!servicos.length) throw new Error('O profissional selecionado não atende esse serviço nesta filial.');
    const servico = servicos[0];
    const dataFim = new Date(dataInicio.getTime() + servico.duracaoMinutos * 60000);
    const diaSemana = dataInicio.getDay();
    const horaInicio = formatarHora(dataInicio);
    const horaFim = formatarHora(dataFim);
    const horarios = await bancoDeDados.query(`SELECT hr_inicio AS horaInicio, hr_fim AS horaFim FROM tb_disponibilidade_funcionario WHERE fk_funcionario = :idFuncionario AND nr_dia_semana = :diaSemana AND st_ativo = TRUE`, { replacements: { diaSemana, idFuncionario }, transaction: transacao, type: QueryTypes.SELECT });
    const disponibilidade = horarios.length ? horarios : await bancoDeDados.query(`SELECT hr_abertura AS horaInicio, hr_fechamento AS horaFim FROM tb_horario_unidade WHERE fk_unidade = :idUnidade AND nr_dia_semana = :diaSemana AND st_fechado = FALSE`, { replacements: { diaSemana, idUnidade }, transaction: transacao, type: QueryTypes.SELECT });
    if (!disponibilidade.some((horario) => horaInicio >= horario.horaInicio && horaFim <= horario.horaFim)) throw new Error('O horário escolhido está fora da disponibilidade do profissional ou do funcionamento da filial.');
    const dataInicioBanco = formatarDataHoraBanco(dataInicio);
    const dataFimBanco = formatarDataHoraBanco(dataFim);
    const conflitos = await bancoDeDados.query(`SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE fk_funcionario = :idFuncionario AND cd_status = 'AGENDADO' AND id_agendamento <> :idAgendamento AND dt_inicio < :dataFimBanco AND dt_fim > :dataInicioBanco LIMIT 1`, { replacements: { dataFimBanco, dataInicioBanco, idAgendamento, idFuncionario }, transaction: transacao, type: QueryTypes.SELECT });
    if (conflitos.length) throw new Error('Esse horário acabou de ser reservado. Escolha outro.');
    await bancoDeDados.query(`UPDATE tb_agendamento SET fk_unidade=:idUnidade, fk_funcionario=:idFuncionario, fk_servico=:idServico, dt_inicio=:dataInicioBanco, dt_fim=:dataFimBanco, nm_servico_agendado=:nomeServico, vl_servico_agendado=:valorServico, nu_duracao_minutos=:duracaoMinutos, ds_observacao=:observacao WHERE id_agendamento=:idAgendamento`, { replacements: { idAgendamento, idFuncionario, idServico, idUnidade, dataInicioBanco, dataFimBanco, nomeServico: servico.nomeServico, valorServico: servico.valorServico, duracaoMinutos: servico.duracaoMinutos, observacao: requisicao.body?.observacao?.trim() || null }, transaction: transacao });
    await transacao.commit();
    resposta.status(200).json({ mensagem: 'Agendamento atualizado com sucesso.' });
  } catch (erro) { await transacao.rollback(); resposta.status(400).json({ mensagem: erro.message }); }
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
roteadorCliente.get('/perfil', consultarPerfil);
roteadorCliente.patch('/perfil', atualizarPerfil);
roteadorCliente.patch('/senha', alterarSenha);
roteadorCliente.get('/sugestoes-saloes', sugerirSaloes);
roteadorCliente.get('/saloes/:idUnidade/servicos', listarServicosSalao);
roteadorCliente.post('/agendamentos', criarAgendamento);
roteadorCliente.patch('/agendamentos/:idAgendamento', atualizarAgendamento);
roteadorCliente.patch('/agendamentos/:idAgendamento/cancelar', cancelarAgendamento);
roteadorCliente.delete('/conta', excluirConta);
roteadorCliente.get('/agendamentos/futuros', (requisicao, resposta) => listarAgendamentos(requisicao, resposta, 'futuros'));
roteadorCliente.get('/agendamentos/historico', (requisicao, resposta) => listarAgendamentos(requisicao, resposta, 'historico'));

export default roteadorCliente;
