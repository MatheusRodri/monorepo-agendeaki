import { QueryTypes } from 'sequelize';
import { Router } from 'express';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteAdministrativoSupabase, obterClienteSupabase } from '../configuracoes/supabase.js';
import { cnpjValido, cpfValido, dataNascimentoValida, somenteNumeros } from '../servicos/documentos.js';
import { atualizarDadosCadastraisUsuario, obterDadosCadastraisUsuario, sincronizarUsuario } from '../servicos/usuarios.js';

const roteadorSalao = Router();
const categoriasPermitidas = ['FEMININO', 'MASCULINO', 'UNISSEX', 'OUTRO'];

function extrairTokenAcesso(requisicao) {
  const cabecalhoAutorizacao = requisicao.headers.authorization;
  return cabecalhoAutorizacao?.startsWith('Bearer ') ? cabecalhoAutorizacao.slice(7) : null;
}

async function obterAdministradorAutenticado(requisicao, resposta) {
  const tokenAcesso = extrairTokenAcesso(requisicao);
  if (!tokenAcesso) {
    console.warn('[Autenticação salão] Token ausente.', { rota: requisicao.originalUrl });
    resposta.status(401).json({ mensagem: 'Informe o token de acesso.' });
    return null;
  }

  try {
    const clienteSupabase = obterClienteSupabase(tokenAcesso);
    const { data: dadosUsuario, error: erroUsuario } = await clienteSupabase.auth.getUser(tokenAcesso);
    if (erroUsuario || !dadosUsuario.user) {
      console.warn('[Autenticação salão] Token recusado pelo Supabase.', { rota: requisicao.originalUrl, motivo: erroUsuario?.message ?? 'Usuário não encontrado' });
      resposta.status(401).json({ mensagem: 'A sessão informada é inválida ou expirou.' });
      return null;
    }
    if (dadosUsuario.user.user_metadata?.perfil !== 'ADMIN_SALAO') {
      console.warn('[Autenticação salão] Perfil sem permissão.', { rota: requisicao.originalUrl, perfil: dadosUsuario.user.user_metadata?.perfil ?? null });
      resposta.status(403).json({ mensagem: 'Esta área é exclusiva para responsáveis de salão.' });
      return null;
    }
    console.info('[Autenticação salão] Usuário autenticado.', { rota: requisicao.originalUrl, idUsuario: dadosUsuario.user.id });
    const administrador = await sincronizarUsuario({ email: dadosUsuario.user.email, idAutenticacaoExterna: dadosUsuario.user.id, nome: dadosUsuario.user.user_metadata.nome ?? dadosUsuario.user.email, perfil: 'ADMIN_SALAO' });
    return { ...administrador, idAutenticacaoExterna: dadosUsuario.user.id };
  } catch (erro) {
    console.error('[Autenticação salão] Falha inesperada.', { rota: requisicao.originalUrl, mensagem: erro.message });
    resposta.status(500).json({ mensagem: erro.message });
    return null;
  }
}

async function obterSalaoAdministrador(idUsuario) {
  const saloes = await bancoDeDados.query(
    `SELECT s.id_salao AS idSalao, s.nm_salao AS nome, s.ds_email AS email, s.nu_telefone AS telefone,
            u.ds_email AS emailConta
     FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador
     WHERE s.fk_usuario_administrador = :idUsuario AND s.st_ativo = TRUE LIMIT 1`,
    { replacements: { idUsuario }, type: QueryTypes.SELECT },
  );
  return saloes[0] ?? null;
}

async function consultarEnderecoPorCep(cep) {
  const cepNormalizado = String(cep ?? '').replace(/\D/g, '');
  if (cepNormalizado.length !== 8) throw new Error('Informe um CEP com 8 números.');
  const respostaCep = await fetch(`https://viacep.com.br/ws/${cepNormalizado}/json/`);
  const endereco = await respostaCep.json();
  if (!respostaCep.ok || endereco.erro) throw new Error('CEP não encontrado.');
  return {
    cep: cepNormalizado,
    rua: endereco.logradouro,
    bairro: endereco.bairro,
    municipio: endereco.localidade,
    estado: endereco.uf,
  };
}

async function buscarEnderecosHere(endereco) {
  const chaveHere = process.env.HERE_API_KEY;
  if (!chaveHere) throw new Error('A busca de endereços ainda não foi configurada. Configure a chave da HERE.');

  // A busca estruturada mantém o número separado da rua, evitando a aproximação
  // por CEP/trecho de via que acontecia no geocodificador anterior.
  const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
  const partesConsulta = [
    ['houseNumber', endereco.numero],
    ['street', endereco.rua],
    ['district', endereco.bairro],
    ['city', endereco.municipio],
    ['state', endereco.estado],
    ['postalCode', endereco.cep],
    ['country', 'BRA'],
  ].filter(([, valor]) => valor).map(([campo, valor]) => `${campo}=${valor}`);
  url.search = new URLSearchParams({
    apiKey: chaveHere,
    lang: 'pt-BR',
    limit: '5',
    qq: partesConsulta.join(';'),
    types: 'address,houseNumber,street',
  }).toString();

  let respostaHere;
  try {
    respostaHere = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Não foi possível consultar a localização agora. Tente novamente.');
  }
  if (!respostaHere.ok) {
    console.error('[HERE] Falha ao geocodificar endereço.', { status: respostaHere.status });
    throw new Error('Não foi possível consultar a localização agora. Tente novamente.');
  }

  const dados = await respostaHere.json();
  return (dados.items ?? []).map((resultado) => {
    const latitude = Number(resultado.position?.lat);
    const longitude = Number(resultado.position?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      id: String(resultado.id ?? `${latitude},${longitude}`),
      latitude,
      longitude,
      endereco: resultado.title ?? resultado.address?.label ?? [endereco.numero, endereco.rua, endereco.municipio, endereco.estado, endereco.cep].filter(Boolean).join(', '),
    };
  }).filter(Boolean);
}

function normalizarHorariosUnidade(horarios) {
  if (!Array.isArray(horarios) || horarios.length !== 7) throw new Error('Informe os horários dos sete dias da semana.');

  const diasInformados = new Set();
  return horarios.map((horario) => {
    const diaSemana = Number(horario.diaSemana);
    const fechado = Boolean(horario.fechado);
    const abertura = horario.abertura ? String(horario.abertura).slice(0, 5) : null;
    const fechamento = horario.fechamento ? String(horario.fechamento).slice(0, 5) : null;

    if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6 || diasInformados.has(diaSemana)) throw new Error('Os dias da semana informados são inválidos.');
    diasInformados.add(diaSemana);

    if (!fechado && (!/^\d{2}:\d{2}$/.test(abertura) || !/^\d{2}:\d{2}$/.test(fechamento) || abertura >= fechamento)) {
      throw new Error('Informe horários de abertura e fechamento válidos.');
    }

    return { abertura: fechado ? null : abertura, diaSemana, fechado, fechamento: fechado ? null : fechamento };
  });
}

async function salvarHorariosUnidade(idUnidade, horarios, transacao) {
  await bancoDeDados.query('DELETE FROM tb_horario_unidade WHERE fk_unidade = :idUnidade', { replacements: { idUnidade }, transaction: transacao });

  for (const horario of horarios) {
    await bancoDeDados.query(
      'INSERT INTO tb_horario_unidade (fk_unidade, nr_dia_semana, hr_abertura, hr_fechamento, st_fechado) VALUES (:idUnidade, :diaSemana, :abertura, :fechamento, :fechado)',
      { replacements: { ...horario, idUnidade }, transaction: transacao },
    );
  }
}

async function consultarCep(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta);
  if (!administrador) return;
  const endereco = await consultarEnderecoPorCep(requisicao.params.cep);
  resposta.status(200).json(endereco);
}

async function consultarCoordenadasFilial(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta);
  if (!administrador) return;
  const numero = String(requisicao.query.numero ?? '').trim();
  if (!numero) { resposta.status(400).json({ mensagem: 'Informe o número do endereço para localizar a filial.' }); return; }

  try {
    const endereco = await consultarEnderecoPorCep(requisicao.query.cep);
    const sugestoes = await buscarEnderecosHere({ ...endereco, numero });
    if (!sugestoes.length) {
      resposta.status(404).json({ mensagem: 'Nenhum endereço foi encontrado. Confira o CEP e o número.' });
      return;
    }
    resposta.status(200).json({ endereco, sugestoes });
  } catch (erro) {
    resposta.status(422).json({ mensagem: erro.message });
  }
}

async function criarSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const { email = null, nome, telefone = null } = requisicao.body ?? {};
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe o nome do salão.' }); return; }
  const salaoExistente = await obterSalaoAdministrador(administrador.idUsuario);
  if (salaoExistente) { resposta.status(409).json({ mensagem: 'Já existe um salão cadastrado para este responsável.' }); return; }
  await bancoDeDados.query('INSERT INTO tb_salao (fk_usuario_administrador, nm_salao, ds_email, nu_telefone) VALUES (:idUsuario, :nome, :email, :telefone)', { replacements: { idUsuario: administrador.idUsuario, nome: nome.trim(), email: email?.trim() || null, telefone: telefone?.trim() || null } });
  resposta.status(201).json({ mensagem: 'Salão criado com sucesso.' });
}

async function consultarSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario);
  if (!salao) { resposta.status(404).json({ mensagem: 'Cadastre seu salão para continuar.' }); return; }
  resposta.status(200).json({ salao });
}

async function atualizarSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario);
  if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const { email = null, nome, telefone = null } = requisicao.body ?? {};
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe o nome do salão.' }); return; }
  await bancoDeDados.query('UPDATE tb_salao SET nm_salao = :nome, ds_email = :email, nu_telefone = :telefone WHERE id_salao = :idSalao', { replacements: { idSalao: salao.idSalao, nome: nome.trim(), email: email?.trim() || null, telefone: telefone?.trim() || null } });
  resposta.status(200).json({ mensagem: 'Informações do salão atualizadas.' });
}

async function consultarPerfil(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const perfil = await obterDadosCadastraisUsuario(administrador.idUsuario);
  resposta.status(200).json({ perfil, cadastroIncompleto: !perfil?.dataNascimento || !perfil?.tipoDocumento || !perfil?.documento });
}

async function atualizarPerfil(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const { dataNascimento, nome, tipoDocumento } = requisicao.body ?? {};
  const documento = somenteNumeros(requisicao.body?.documento);
  const documentoValido = tipoDocumento === 'CPF' ? cpfValido(documento) : tipoDocumento === 'CNPJ' && cnpjValido(documento);
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe o nome do responsável.' }); return; }
  if (!dataNascimentoValida(dataNascimento)) { resposta.status(400).json({ mensagem: 'Informe uma data de nascimento válida.' }); return; }
  if (!documentoValido) { resposta.status(400).json({ mensagem: `Informe um ${tipoDocumento === 'CNPJ' ? 'CNPJ' : 'CPF'} válido.` }); return; }
  try {
    const perfil = await atualizarDadosCadastraisUsuario(administrador.idUsuario, { cpf: tipoDocumento === 'CPF' ? documento : null, dataNascimento, documento, nome, tipoDocumento });
    resposta.status(200).json({ mensagem: 'Informações da conta atualizadas.', perfil, cadastroIncompleto: false });
  } catch (erro) { resposta.status(400).json({ mensagem: erro.name === 'SequelizeUniqueConstraintError' ? 'Este documento já está em uso.' : 'Não foi possível atualizar suas informações.' }); }
}

async function alterarSenha(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
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

async function excluirConta(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta);
  if (!administrador) return;

  let clienteAdministrativo;
  try {
    clienteAdministrativo = obterClienteAdministrativoSupabase();
  } catch (erro) {
    resposta.status(503).json({ mensagem: erro.message });
    return;
  }

  const transacao = await bancoDeDados.transaction();
  try {
    const saloes = await bancoDeDados.query(
      'SELECT id_salao AS idSalao FROM tb_salao WHERE fk_usuario_administrador = :idUsuario',
      { replacements: administrador, transaction: transacao, type: QueryTypes.SELECT },
    );
    const idsSaloes = saloes.map((salao) => salao.idSalao);
    const unidades = idsSaloes.length
      ? await bancoDeDados.query('SELECT id_unidade AS idUnidade FROM tb_unidade WHERE fk_salao IN (:idsSaloes)', { replacements: { idsSaloes }, transaction: transacao, type: QueryTypes.SELECT })
      : [];
    const idsUnidades = unidades.map((unidade) => unidade.idUnidade);
    const condicoesAgendamento = ['fk_usuario = :idUsuario'];
    if (idsUnidades.length) condicoesAgendamento.push('fk_unidade IN (:idsUnidades)');
    const agendamentos = await bancoDeDados.query(
      `SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE ${condicoesAgendamento.join(' OR ')}`,
      { replacements: { idUsuario: administrador.idUsuario, idsUnidades }, transaction: transacao, type: QueryTypes.SELECT },
    );
    const idsAgendamentos = agendamentos.map((agendamento) => agendamento.idAgendamento);

    await bancoDeDados.query('UPDATE tb_agendamento SET fk_usuario_cancelamento = NULL WHERE fk_usuario_cancelamento = :idUsuario', { replacements: administrador, transaction: transacao });
    if (idsAgendamentos.length) {
      await bancoDeDados.query('DELETE FROM tb_pagamento WHERE fk_agendamento IN (:idsAgendamentos)', { replacements: { idsAgendamentos }, transaction: transacao });
      await bancoDeDados.query('DELETE FROM tb_agendamento WHERE id_agendamento IN (:idsAgendamentos)', { replacements: { idsAgendamentos }, transaction: transacao });
    }
    if (idsUnidades.length) {
      await bancoDeDados.query('DELETE FROM tb_funcionario WHERE fk_unidade IN (:idsUnidades)', { replacements: { idsUnidades }, transaction: transacao });
      await bancoDeDados.query('DELETE FROM tb_servico WHERE fk_unidade IN (:idsUnidades)', { replacements: { idsUnidades }, transaction: transacao });
      await bancoDeDados.query('DELETE FROM tb_unidade WHERE id_unidade IN (:idsUnidades)', { replacements: { idsUnidades }, transaction: transacao });
    }
    if (idsSaloes.length) await bancoDeDados.query('DELETE FROM tb_salao WHERE id_salao IN (:idsSaloes)', { replacements: { idsSaloes }, transaction: transacao });
    await bancoDeDados.query('DELETE FROM tb_usuario WHERE id_usuario = :idUsuario', { replacements: administrador, transaction: transacao });

    const { error: erroSupabase } = await clienteAdministrativo.auth.admin.deleteUser(administrador.idAutenticacaoExterna);
    if (erroSupabase) throw new Error('Não foi possível excluir a conta no Supabase. Nenhum dado local foi removido.');

    await transacao.commit();
    resposta.status(200).json({ mensagem: 'Conta e todos os dados vinculados foram excluídos.' });
  } catch (erro) {
    await transacao.rollback();
    console.error('[Exclusão de conta] Falha ao excluir conta.', { idUsuario: administrador.idUsuario, mensagem: erro.message });
    resposta.status(500).json({ mensagem: erro.message });
  }
}

async function listarFiliais(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const filiais = await bancoDeDados.query(`SELECT id_unidade AS idUnidade, nm_unidade AS nome, tp_categoria AS categoria, ds_rua AS rua, nu_endereco AS numero, ds_complemento AS complemento, ds_bairro AS bairro, ds_municipio AS municipio, ds_estado AS estado, nu_cep AS cep, nu_telefone AS telefone, nu_latitude AS latitude, nu_longitude AS longitude FROM tb_unidade WHERE fk_salao = :idSalao AND st_ativo = TRUE ORDER BY nm_unidade`, { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT });
  const idsUnidades = filiais.map((filial) => filial.idUnidade);
  const horarios = idsUnidades.length
    ? await bancoDeDados.query('SELECT fk_unidade AS idUnidade, nr_dia_semana AS diaSemana, hr_abertura AS abertura, hr_fechamento AS fechamento, st_fechado AS fechado FROM tb_horario_unidade WHERE fk_unidade IN (:idsUnidades) ORDER BY nr_dia_semana', { replacements: { idsUnidades }, type: QueryTypes.SELECT })
    : [];
  const horariosPorUnidade = new Map(idsUnidades.map((idUnidade) => [idUnidade, []]));
  horarios.forEach((horario) => horariosPorUnidade.get(horario.idUnidade)?.push(horario));
  filiais.forEach((filial) => { filial.horarios = horariosPorUnidade.get(filial.idUnidade) ?? []; });
  console.info('[Gestão salão] Filiais ativas carregadas.', {
    quantidadeFiliais: filiais.length,
    filiais: filiais.map((filial) => ({
      idUnidade: filial.idUnidade,
      nome: filial.nome,
      possuiCoordenadas: filial.latitude !== null && filial.longitude !== null,
    })),
  });
  resposta.status(200).json({ filiais });
}

async function salvarFilial(requisicao, resposta, idUnidade = null) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Cadastre o salão antes de cadastrar filiais.' }); return; }
  const dadosFilial = requisicao.body ?? {};
  if (!dadosFilial.nome?.trim() || !dadosFilial.numero?.trim() || !categoriasPermitidas.includes(dadosFilial.categoria)) { resposta.status(400).json({ mensagem: 'Informe nome, número e categoria válidos para a filial.' }); return; }
  let horarios;
  try { horarios = normalizarHorariosUnidade(dadosFilial.horarios); } catch (erro) { resposta.status(400).json({ mensagem: erro.message }); return; }
  const latitude = Number(dadosFilial.latitude);
  const longitude = Number(dadosFilial.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { resposta.status(400).json({ mensagem: 'Selecione um endereço válido para localizar a filial.' }); return; }
  let enderecoCep;
  try {
    enderecoCep = await consultarEnderecoPorCep(dadosFilial.cep);
  } catch (erro) {
    resposta.status(422).json({ mensagem: erro.message });
    return;
  }
  const coordenadas = { latitude, longitude };
  const valores = { ...dadosFilial, ...enderecoCep, ...coordenadas, idSalao: salao.idSalao, idUnidade };
  const transacao = await bancoDeDados.transaction();
  if (idUnidade) {
    try {
      const filiais = await bancoDeDados.query('SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao LIMIT 1', { replacements: valores, transaction: transacao, type: QueryTypes.SELECT });
      if (!filiais.length) { await transacao.rollback(); resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
      await bancoDeDados.query(`UPDATE tb_unidade SET nm_unidade=:nome, tp_categoria=:categoria, ds_rua=:rua, nu_endereco=:numero, ds_complemento=:complemento, ds_bairro=:bairro, ds_municipio=:municipio, ds_estado=:estado, nu_cep=:cep, nu_latitude=:latitude, nu_longitude=:longitude, nu_telefone=:telefone WHERE id_unidade=:idUnidade`, { replacements: valores, transaction: transacao });
      await salvarHorariosUnidade(idUnidade, horarios, transacao);
      await transacao.commit();
      resposta.status(200).json({ mensagem: 'Filial, localização e horários atualizados.', coordenadas }); return;
    } catch (erro) { await transacao.rollback(); resposta.status(500).json({ mensagem: erro.message }); return; }
  }
  try {
    await bancoDeDados.query(`INSERT INTO tb_unidade (fk_salao, nm_unidade, tp_categoria, ds_rua, nu_endereco, ds_complemento, ds_bairro, ds_municipio, ds_estado, nu_cep, nu_latitude, nu_longitude, nu_telefone) VALUES (:idSalao, :nome, :categoria, :rua, :numero, :complemento, :bairro, :municipio, :estado, :cep, :latitude, :longitude, :telefone)`, { replacements: valores, transaction: transacao });
    const unidadesCriadas = await bancoDeDados.query('SELECT LAST_INSERT_ID() AS idUnidade', { transaction: transacao, type: QueryTypes.SELECT });
    const idUnidadeCriada = Number(unidadesCriadas[0]?.idUnidade);
    if (!idUnidadeCriada) throw new Error('Não foi possível identificar a filial criada.');
    await salvarHorariosUnidade(idUnidadeCriada, horarios, transacao);
    await transacao.commit();
    resposta.status(201).json({ mensagem: 'Filial criada com localização e horários salvos.', coordenadas });
  } catch (erro) { await transacao.rollback(); console.error('[Cadastro filial] Falha ao salvar.', { mensagem: erro.message }); resposta.status(500).json({ mensagem: erro.message }); }
}

async function criarServico(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const { descricao = null, duracaoMinutos, idUnidade, nome, valor } = requisicao.body ?? {};
  if (!nome?.trim() || !Number(idUnidade) || Number(valor) < 0 || Number(duracaoMinutos) <= 0) { resposta.status(400).json({ mensagem: 'Informe filial, nome, valor e duração válidos.' }); return; }
  const filial = await bancoDeDados.query('SELECT id_unidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao AND st_ativo=TRUE LIMIT 1', { replacements: { idUnidade, idSalao: salao.idSalao }, type: QueryTypes.SELECT }); if (!filial.length) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  await bancoDeDados.query('INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos) VALUES (:idUnidade, :nome, :descricao, :valor, :duracaoMinutos)', { replacements: { idUnidade, nome: nome.trim(), descricao: descricao?.trim() || null, valor, duracaoMinutos } }); resposta.status(201).json({ mensagem: 'Serviço criado com sucesso.' });
}

async function listarServicos(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const servicos = await bancoDeDados.query(`SELECT s.id_servico AS idServico, s.nm_servico AS nome, s.ds_servico AS descricao, s.vl_servico AS valor, s.nu_duracao_minutos AS duracaoMinutos, u.id_unidade AS idUnidade, u.nm_unidade AS filial FROM tb_servico s INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade WHERE u.fk_salao=:idSalao AND s.st_ativo=TRUE ORDER BY u.nm_unidade, s.nm_servico`, { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }); resposta.status(200).json({ servicos });
}

async function obterFilialDoSalao(idUnidade, idSalao, transacao) {
  const filiais = await bancoDeDados.query(
    'SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao AND st_ativo = TRUE LIMIT 1',
    { replacements: { idUnidade, idSalao }, transaction: transacao, type: QueryTypes.SELECT },
  );
  return filiais[0] ?? null;
}

async function atualizarServico(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idServico = Number(requisicao.params.idServico);
  const { descricao = null, duracaoMinutos, idUnidade, nome, valor } = requisicao.body ?? {};
  if (!idServico || !nome?.trim() || !Number(idUnidade) || Number(valor) < 0 || Number(duracaoMinutos) <= 0) { resposta.status(400).json({ mensagem: 'Informe filial, nome, valor e duração válidos.' }); return; }
  if (!await obterFilialDoSalao(Number(idUnidade), salao.idSalao)) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  const [resultado] = await bancoDeDados.query(
    `UPDATE tb_servico s INNER JOIN tb_unidade u ON u.id_unidade = s.fk_unidade
     SET s.fk_unidade=:idUnidade, s.nm_servico=:nome, s.ds_servico=:descricao, s.vl_servico=:valor, s.nu_duracao_minutos=:duracaoMinutos
     WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE`,
    { replacements: { idServico, idSalao: salao.idSalao, idUnidade, nome: nome.trim(), descricao: descricao?.trim() || null, valor, duracaoMinutos } },
  );
  if (!resultado.affectedRows) { resposta.status(404).json({ mensagem: 'Serviço não encontrado.' }); return; }
  resposta.status(200).json({ mensagem: 'Serviço atualizado com sucesso.' });
}

async function excluirServico(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const [resultado] = await bancoDeDados.query(
    `UPDATE tb_servico s INNER JOIN tb_unidade u ON u.id_unidade = s.fk_unidade SET s.st_ativo = FALSE
     WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE`,
    { replacements: { idServico: Number(requisicao.params.idServico), idSalao: salao.idSalao } },
  );
  if (!resultado.affectedRows) { resposta.status(404).json({ mensagem: 'Serviço não encontrado.' }); return; }
  resposta.status(200).json({ mensagem: 'Serviço removido do catálogo. O histórico foi preservado.' });
}

async function criarFuncionario(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const { idUnidade, idsServicos = [], nome, ativo = true } = requisicao.body ?? {};
  if (!nome?.trim() || !Number(idUnidade) || !Array.isArray(idsServicos) || !idsServicos.length) { resposta.status(400).json({ mensagem: 'Informe nome, filial e ao menos um serviço.' }); return; }
  const transacao = await bancoDeDados.transaction();
  try {
    if (!await obterFilialDoSalao(Number(idUnidade), salao.idSalao, transacao)) throw new Error('Filial não encontrada.');
    const servicos = await bancoDeDados.query(`SELECT id_servico AS idServico FROM tb_servico WHERE fk_unidade=:idUnidade AND st_ativo=TRUE AND id_servico IN (:idsServicos)`, { replacements: { idUnidade, idsServicos }, transaction: transacao, type: QueryTypes.SELECT });
    if (servicos.length !== idsServicos.length) throw new Error('Selecione apenas serviços da filial informada.');
    await bancoDeDados.query('INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo) VALUES (:idUnidade, :nome, :ativo)', { replacements: { idUnidade, nome: nome.trim(), ativo }, transaction: transacao });
    const identificadores = await bancoDeDados.query('SELECT LAST_INSERT_ID() AS idFuncionario', { transaction: transacao, type: QueryTypes.SELECT });
    const idFuncionario = Number(identificadores[0]?.idFuncionario);
    if (!Number.isInteger(idFuncionario) || idFuncionario <= 0) throw new Error('Não foi possível identificar o profissional recém-criado.');
    console.info('[Cadastro funcionário] Profissional criado.', { idFuncionario, quantidadeServicos: servicos.length });
    for (const servico of servicos) await bancoDeDados.query('INSERT INTO tb_funcionario_servico (fk_funcionario, fk_servico) VALUES (:idFuncionario, :idServico)', { replacements: { idFuncionario, idServico: servico.idServico }, transaction: transacao });
    const horariosUnidade = await bancoDeDados.query('SELECT nr_dia_semana AS diaSemana, hr_abertura AS horaInicio, hr_fechamento AS horaFim FROM tb_horario_unidade WHERE fk_unidade = :idUnidade AND st_fechado = FALSE', { replacements: { idUnidade }, transaction: transacao, type: QueryTypes.SELECT });
    for (const horario of horariosUnidade) await bancoDeDados.query('INSERT INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim) VALUES (:idFuncionario, :diaSemana, :horaInicio, :horaFim)', { replacements: { idFuncionario, ...horario }, transaction: transacao });
    await transacao.commit(); resposta.status(201).json({ mensagem: 'Funcionário criado com sucesso.' });
  } catch (erro) { await transacao.rollback(); console.error('[Cadastro funcionário] Falha ao salvar.', { mensagem: erro.message }); resposta.status(400).json({ mensagem: erro.message }); }
}

async function listarFuncionarios(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  try {
    const funcionarios = await bancoDeDados.query(
      `SELECT f.id_funcionario AS idFuncionario, f.nm_funcionario AS nome, f.st_ativo AS ativo, u.id_unidade AS idUnidade, u.nm_unidade AS filial
       FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade
       WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE ORDER BY u.nm_unidade, f.nm_funcionario`,
      { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT },
    );
    const idsFuncionarios = funcionarios.map((funcionario) => funcionario.idFuncionario);
    const vinculos = idsFuncionarios.length ? await bancoDeDados.query(
      `SELECT fs.fk_funcionario AS idFuncionario, s.id_servico AS idServico, s.nm_servico AS nomeServico
       FROM tb_funcionario_servico fs INNER JOIN tb_servico s ON s.id_servico=fs.fk_servico
       WHERE fs.fk_funcionario IN (:idsFuncionarios) ORDER BY s.nm_servico`,
      { replacements: { idsFuncionarios }, type: QueryTypes.SELECT },
    ) : [];
    const servicosPorFuncionario = new Map(idsFuncionarios.map((idFuncionario) => [idFuncionario, []]));
    vinculos.forEach((vinculo) => servicosPorFuncionario.get(vinculo.idFuncionario)?.push(vinculo));
    funcionarios.forEach((funcionario) => {
      const servicos = servicosPorFuncionario.get(funcionario.idFuncionario) ?? [];
      funcionario.idsServicos = servicos.map((servico) => Number(servico.idServico));
      funcionario.servicos = servicos.map((servico) => servico.nomeServico).join(' · ');
    });
    resposta.status(200).json({ funcionarios });
  } catch (erro) {
    console.error('[Listagem funcionários] Falha ao carregar.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar os profissionais cadastrados.' });
  }
}

async function atualizarFuncionario(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idFuncionario = Number(requisicao.params.idFuncionario); const { idUnidade, idsServicos = [], nome } = requisicao.body ?? {};
  if (!idFuncionario || !nome?.trim() || !Number(idUnidade) || !Array.isArray(idsServicos) || !idsServicos.length) { resposta.status(400).json({ mensagem: 'Informe nome, filial e ao menos um serviço.' }); return; }
  const transacao = await bancoDeDados.transaction();
  try {
    if (!await obterFilialDoSalao(Number(idUnidade), salao.idSalao, transacao)) throw new Error('Filial não encontrada.');
    const [resultado] = await bancoDeDados.query(`UPDATE tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade SET f.fk_unidade=:idUnidade, f.nm_funcionario=:nome WHERE f.id_funcionario=:idFuncionario AND u.fk_salao=:idSalao AND f.st_ativo=TRUE`, { replacements: { idFuncionario, idUnidade, nome: nome.trim(), idSalao: salao.idSalao }, transaction: transacao });
    if (!resultado.affectedRows) throw new Error('Profissional não encontrado.');
    const servicos = await bancoDeDados.query('SELECT id_servico AS idServico FROM tb_servico WHERE fk_unidade=:idUnidade AND st_ativo=TRUE AND id_servico IN (:idsServicos)', { replacements: { idUnidade, idsServicos }, transaction: transacao, type: QueryTypes.SELECT });
    if (servicos.length !== idsServicos.length) throw new Error('Selecione apenas serviços ativos da filial informada.');
    await bancoDeDados.query('DELETE FROM tb_funcionario_servico WHERE fk_funcionario=:idFuncionario', { replacements: { idFuncionario }, transaction: transacao });
    for (const servico of servicos) await bancoDeDados.query('INSERT INTO tb_funcionario_servico (fk_funcionario, fk_servico) VALUES (:idFuncionario, :idServico)', { replacements: { idFuncionario, idServico: servico.idServico }, transaction: transacao });
    await transacao.commit(); resposta.status(200).json({ mensagem: 'Profissional atualizado com sucesso.' });
  } catch (erro) { await transacao.rollback(); resposta.status(400).json({ mensagem: erro.message }); }
}

async function excluirFuncionario(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const [resultado] = await bancoDeDados.query(`UPDATE tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade SET f.st_ativo=FALSE WHERE f.id_funcionario=:idFuncionario AND u.fk_salao=:idSalao AND f.st_ativo=TRUE`, { replacements: { idFuncionario: Number(requisicao.params.idFuncionario), idSalao: salao.idSalao } });
  if (!resultado.affectedRows) { resposta.status(404).json({ mensagem: 'Profissional não encontrado.' }); return; }
  resposta.status(200).json({ mensagem: 'Profissional removido da agenda. O histórico foi preservado.' });
}

async function excluirFilial(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const [resultado] = await bancoDeDados.query('UPDATE tb_unidade SET st_ativo=FALSE WHERE id_unidade=:idUnidade AND fk_salao=:idSalao AND st_ativo=TRUE', { replacements: { idUnidade: Number(requisicao.params.idUnidade), idSalao: salao.idSalao } });
  if (!resultado.affectedRows) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  resposta.status(200).json({ mensagem: 'Filial removida da descoberta. O histórico foi preservado.' });
}

async function listarClientes(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return; const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const clientes = await bancoDeDados.query(`SELECT DISTINCT u.id_usuario AS idUsuario, u.nm_usuario AS nome, u.ds_email AS email, MAX(a.dt_inicio) AS ultimoAgendamento FROM tb_agendamento a INNER JOIN tb_unidade un ON un.id_unidade=a.fk_unidade INNER JOIN tb_usuario u ON u.id_usuario=a.fk_usuario WHERE un.fk_salao=:idSalao GROUP BY u.id_usuario, u.nm_usuario, u.ds_email ORDER BY ultimoAgendamento DESC`, { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }); resposta.status(200).json({ clientes });
}

async function listarAgendamentos(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return; const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const futuros = requisicao.query.tipo !== 'historico'; const condicao = futuros ? "a.dt_inicio >= NOW() AND a.cd_status='AGENDADO'" : "a.dt_inicio < NOW() OR a.cd_status IN ('REALIZADO', 'CANCELADO')";
  const agendamentos = await bancoDeDados.query(`SELECT a.id_agendamento AS idAgendamento, a.dt_inicio AS dataHoraInicio, a.dt_fim AS dataHoraFim, a.cd_status AS status, a.nm_servico_agendado AS servico, a.vl_servico_agendado AS valor, a.ds_observacao AS observacao, c.nm_usuario AS cliente, c.ds_email AS emailCliente, f.nm_funcionario AS funcionario, u.nm_unidade AS filial, COALESCE(p.cd_status_pagamento, 'PENDENTE') AS statusPagamento, CASE WHEN p.cd_status_pagamento = 'APROVADO' THEN TRUE ELSE FALSE END AS pago FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade INNER JOIN tb_usuario c ON c.id_usuario=a.fk_usuario INNER JOIN tb_funcionario f ON f.id_funcionario=a.fk_funcionario LEFT JOIN (SELECT p1.fk_agendamento, p1.cd_status_pagamento FROM tb_pagamento p1 INNER JOIN (SELECT fk_agendamento, MAX(id_pagamento) AS idPagamento FROM tb_pagamento GROUP BY fk_agendamento) ultimo ON ultimo.idPagamento=p1.id_pagamento) p ON p.fk_agendamento=a.id_agendamento WHERE u.fk_salao=:idSalao AND (${condicao}) ORDER BY a.dt_inicio ${futuros ? 'ASC' : 'DESC'}`, { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }); resposta.status(200).json({ agendamentos });
}

async function indicadores(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return; const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  try {
  const idUnidade = Number(requisicao.query.idUnidade) || 0; const idServico = Number(requisicao.query.idServico) || 0; const idFuncionario = Number(requisicao.query.idFuncionario) || 0;
  const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(String(requisicao.query.dataInicio ?? '')) ? requisicao.query.dataInicio : null;
  const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(String(requisicao.query.dataFim ?? '')) ? requisicao.query.dataFim : null;
  const filtros = { idSalao: salao.idSalao };
  const condicoesFiltros = ['u.fk_salao=:idSalao'];
  if (idUnidade) { filtros.idUnidade = idUnidade; condicoesFiltros.push('a.fk_unidade=:idUnidade'); }
  if (idServico) { filtros.idServico = idServico; condicoesFiltros.push('a.fk_servico=:idServico'); }
  if (idFuncionario) { filtros.idFuncionario = idFuncionario; condicoesFiltros.push('a.fk_funcionario=:idFuncionario'); }
  if (dataInicio) { filtros.dataInicio = dataInicio; condicoesFiltros.push('DATE(a.dt_inicio)>=:dataInicio'); }
  if (dataFim) { filtros.dataFim = dataFim; condicoesFiltros.push('DATE(a.dt_inicio)<=:dataFim'); }
  const condicaoFiltros = condicoesFiltros.join(' AND ');
  const resumo = await bancoDeDados.query(`SELECT COALESCE(SUM(CASE WHEN a.cd_status IN ('AGENDADO','REALIZADO') THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosAtivos, COALESCE(SUM(CASE WHEN a.cd_status='CANCELADO' THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosCancelados, COALESCE(SUM(CASE WHEN a.cd_status IN ('AGENDADO','REALIZADO') THEN a.vl_servico_agendado ELSE 0 END),0) AS faturamento FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade WHERE ${condicaoFiltros}`, { replacements: filtros, type: QueryTypes.SELECT });
  const servicosMaisSolicitados = await bancoDeDados.query(`SELECT a.nm_servico_agendado AS servico, COUNT(*) AS quantidade FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade WHERE ${condicaoFiltros} GROUP BY a.nm_servico_agendado ORDER BY quantidade DESC LIMIT 3`, { replacements: filtros, type: QueryTypes.SELECT });
  const proximosAtendimentos = await bancoDeDados.query(`SELECT a.dt_inicio AS dataHoraInicio, a.nm_servico_agendado AS servico, c.nm_usuario AS cliente FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade INNER JOIN tb_usuario c ON c.id_usuario=a.fk_usuario WHERE ${condicaoFiltros} AND a.dt_inicio>=NOW() AND a.cd_status='AGENDADO' ORDER BY a.dt_inicio LIMIT 5`, { replacements: filtros, type: QueryTypes.SELECT });
  const [filiais, servicos, funcionarios] = await Promise.all([bancoDeDados.query('SELECT id_unidade AS idUnidade, nm_unidade AS nome FROM tb_unidade WHERE fk_salao=:idSalao AND st_ativo=TRUE ORDER BY nm_unidade', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }), bancoDeDados.query('SELECT s.id_servico AS idServico, s.nm_servico AS nome FROM tb_servico s INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade WHERE u.fk_salao=:idSalao AND s.st_ativo=TRUE ORDER BY s.nm_servico', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }), bancoDeDados.query('SELECT f.id_funcionario AS idFuncionario, f.nm_funcionario AS nome FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE ORDER BY f.nm_funcionario', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT })]);
  resposta.status(200).json({ resumo: resumo[0], servicosMaisSolicitados, proximosAtendimentos, filtros: { dataInicio, dataFim, idUnidade, idServico, idFuncionario }, opcoesFiltros: { filiais, servicos, funcionarios } });
  } catch (erro) {
    console.error('[Indicadores salão] Falha ao carregar.', { mensagem: erro.message, parametros: requisicao.query });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar os indicadores do salão.' });
  }
}

roteadorSalao.get('/enderecos/:cep', consultarCep);
roteadorSalao.get('/coordenadas', consultarCoordenadasFilial);
roteadorSalao.post('/saloes', criarSalao); roteadorSalao.get('/saloes/atual', consultarSalao); roteadorSalao.patch('/saloes/atual', atualizarSalao); roteadorSalao.delete('/conta', excluirConta);
roteadorSalao.get('/perfil', consultarPerfil); roteadorSalao.patch('/perfil', atualizarPerfil); roteadorSalao.patch('/senha', alterarSenha);
roteadorSalao.get('/filiais', listarFiliais); roteadorSalao.post('/filiais', (requisicao, resposta) => salvarFilial(requisicao, resposta)); roteadorSalao.patch('/filiais/:idUnidade', (requisicao, resposta) => salvarFilial(requisicao, resposta, Number(requisicao.params.idUnidade))); roteadorSalao.delete('/filiais/:idUnidade', excluirFilial);
roteadorSalao.post('/servicos', criarServico); roteadorSalao.get('/servicos', listarServicos); roteadorSalao.patch('/servicos/:idServico', atualizarServico); roteadorSalao.delete('/servicos/:idServico', excluirServico);
roteadorSalao.post('/funcionarios', criarFuncionario); roteadorSalao.get('/funcionarios', listarFuncionarios); roteadorSalao.patch('/funcionarios/:idFuncionario', atualizarFuncionario); roteadorSalao.delete('/funcionarios/:idFuncionario', excluirFuncionario);
roteadorSalao.get('/clientes', listarClientes); roteadorSalao.get('/agendamentos', listarAgendamentos); roteadorSalao.get('/indicadores', indicadores);

export default roteadorSalao;
