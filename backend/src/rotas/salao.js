import { QueryTypes } from 'sequelize';
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterClienteAdministrativoSupabase, obterClienteSupabase } from '../configuracoes/supabase.js';
import { cnpjValido, dataNascimentoValida, normalizarCnpj, somenteNumeros } from '../servicos/documentos.js';
import { decifrarDocumento, prepararDocumento, prepararIndiceRaizCnpj } from '../servicos/documentosProtegidos.js';
import { ativarAssinaturaPremium } from '../servicos/assinaturas.js';
import { atualizarPeriodicidadeStripe, cancelarAssinaturaStripe, cancelarCheckoutStripe, criarCheckoutAssinatura, obterDadosPlanoPremium, obterOfertaPremium, obterPrecoStripe, consultarCheckoutStripe } from '../servicos/stripe.js';
import { sincronizarAssinaturaStripe } from '../servicos/sincronizarAssinaturaStripe.js';
import { criarSlugSalaoUnico, criarSlugUnidadeUnico } from '../servicos/slugs.js';
import { atualizarDadosCadastraisUsuario, obterDadosCadastraisUsuario, sincronizarUsuario } from '../servicos/usuarios.js';
import { bloquearRecursosAgenda, criarTransacaoAgenda, listarHorariosDisponiveis, resolverReserva } from '../servicos/disponibilidade.js';
import { consultarInscricaoPush, criarNotificacaoCliente, enviarNotificacaoPushCliente, listarNotificacoesSalao, marcarNotificacaoSalaoLida, marcarTodasNotificacoesSalaoLidas, obterChavePublicaPush, removerInscricaoPush, salvarInscricaoPush } from '../servicos/notificacoesPush.js';

import { consultarAnalitico, consultarLinhasAnaliticas, contagemServicosExtrasSql, exportarAnaliticoCsv, normalizarConsultaAnalitica } from '../servicos/dashboardAnalitico.js';
import { exportarAnaliticoExcel } from '../servicos/dashboardExcel.js';
import { salvarServicosAdicionais } from '../servicos/agendamentos.js';
import { consultarAgendaSalao, normalizarConsultaAgenda } from '../servicos/agendaSalao.js';

const roteadorSalao = Router();
const categoriasPermitidas = ['FEMININO', 'MASCULINO', 'UNISSEX', 'OUTRO'];
const duracoesServicoPermitidas = [30, 45, 60, 90, 120];
const motivosCancelamento = {
  BLOQUEIO_AGENDA: 'Bloqueio emergencial da agenda pelo salão',
  INDISPONIBILIDADE_PROFISSIONAL: 'Indisponibilidade do profissional',
  SOLICITACAO_CLIENTE: 'Solicitação do cliente',
  PROBLEMA_UNIDADE: 'Problema na unidade',
  ERRO_AGENDAMENTO: 'Erro no agendamento',
  OUTRO: 'Outro motivo',
};

function codigoErroBanco(erro) {
  return erro?.original?.code ?? erro?.parent?.code ?? erro?.code;
}

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
    const administrador = await sincronizarUsuario({ email: dadosUsuario.user.email, idAutenticacaoExterna: dadosUsuario.user.id, nome: dadosUsuario.user.user_metadata.nome ?? dadosUsuario.user.email, perfil: 'ADMIN_SALAO', telefone: dadosUsuario.user.user_metadata.telefone ?? null });
    return { ...administrador, idAutenticacaoExterna: dadosUsuario.user.id };
  } catch (erro) {
    console.error('[Autenticação salão] Falha inesperada.', { rota: requisicao.originalUrl, mensagem: erro.message });
    resposta.status(500).json({ mensagem: erro.message });
    return null;
  }
}

async function obterSalaoAdministrador(idUsuario) {
  const saloes = await bancoDeDados.query(
    `SELECT s.id_salao AS idSalao, s.nm_salao AS nome, s.ds_slug AS slug,
            u.ds_email AS emailConta
     FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador
     WHERE s.fk_usuario_administrador = :idUsuario AND s.st_ativo = TRUE LIMIT 1`,
    { replacements: { idUsuario }, type: QueryTypes.SELECT },
  );
  return saloes[0] ?? null;
}

async function obterSalaoPremiumAdministrador(idUsuario, resposta, mensagemPremium = 'As notificações são um recurso disponível para assinantes Premium.') {
  const salao = await obterSalaoAdministrador(idUsuario);
  if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return null; }
  const assinatura = await obterAssinaturaSalao(salao.idSalao);
  if (!resumoAssinatura(assinatura).temAcessoPremium) {
    resposta.status(403).json({ mensagem: mensagemPremium });
    return null;
  }
  return salao;
}

async function chavePublicaNotificacoes(_requisicao, resposta) {
  const chavePublica = obterChavePublicaPush();
  if (!chavePublica) { resposta.status(503).json({ mensagem: 'Notificações ainda não foram configuradas neste ambiente.' }); return; }
  resposta.status(200).json({ chavePublica });
}

async function salvarInscricaoNotificacoes(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta); if (!salao) return;
  const inscricao = requisicao.body;
  let endpointValido = false;
  try {
    const endpoint = new URL(inscricao?.endpoint);
    endpointValido = endpoint.protocol === 'https:'
      || (endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname));
  } catch {}
  if (typeof inscricao?.endpoint !== 'string' || inscricao.endpoint.length > 2048 || !endpointValido
    || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
    resposta.status(400).json({ mensagem: 'Inscrição de notificações inválida.' }); return;
  }
  try {
    await salvarInscricaoPush(salao.idSalao, inscricao);
    resposta.status(201).json({ mensagem: 'Notificações ativadas neste dispositivo.' });
  } catch (erro) {
    console.error('[Notificações push] Falha ao salvar inscrição.', { idSalao: salao.idSalao, mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível ativar as notificações. Confira se a tabela tb_inscricao_notificacao existe.' });
  }
}

async function consultarInscricaoNotificacoes(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta); if (!salao) return;
  const endpoint = String(requisicao.query.endpoint ?? '');
  const ativa = await consultarInscricaoPush(salao.idSalao, endpoint);
  resposta.status(200).json({ ativa });
}

async function excluirInscricaoNotificacoes(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta); if (!salao) return;
  const endpoint = requisicao.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) { resposta.status(400).json({ mensagem: 'Informe o dispositivo a desativar.' }); return; }
  await removerInscricaoPush(salao.idSalao, endpoint);
  resposta.status(200).json({ mensagem: 'Notificações desativadas neste dispositivo.' });
}

async function consultarNotificacoes(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta); if (!salao) return;
  resposta.status(200).json(await listarNotificacoesSalao(salao.idSalao));
}

async function marcarNotificacaoComoLida(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta); if (!salao) return;
  const idNotificacao = Number(requisicao.params.idNotificacao);
  if (!Number.isSafeInteger(idNotificacao) || idNotificacao <= 0) { resposta.status(400).json({ mensagem: 'Notificação inválida.' }); return; }
  const atualizada = await marcarNotificacaoSalaoLida(salao.idSalao, idNotificacao);
  if (!atualizada) { resposta.status(404).json({ mensagem: 'Notificação não encontrada ou já lida.' }); return; }
  resposta.status(200).json({ mensagem: 'Notificação marcada como lida.' });
}

async function marcarTodasNotificacoesComoLidas(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta); if (!salao) return;
  await marcarTodasNotificacoesSalaoLidas(salao.idSalao);
  resposta.status(200).json({ mensagem: 'Todas as notificações foram marcadas como lidas.' });
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
  const { nome } = requisicao.body ?? {};
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe o nome do salão.' }); return; }
  const salaoExistente = await obterSalaoAdministrador(administrador.idUsuario);
  if (salaoExistente) { resposta.status(409).json({ mensagem: 'Já existe um salão cadastrado para este responsável.' }); return; }
  const perfil = await obterDadosCadastraisUsuario(administrador.idUsuario);
  if (!cnpjValido(perfil?.documento)) { resposta.status(400).json({ mensagem: 'Informe um CNPJ válido para a empresa antes de cadastrar o salão.' }); return; }
  const slug = await criarSlugSalaoUnico(nome);
  try {
    await bancoDeDados.query('INSERT INTO tb_salao (fk_usuario_administrador, nm_salao, ds_slug, ds_cnpj_raiz_indice) VALUES (:idUsuario, :nome, :slug, :indiceRaizCnpj)', { replacements: { idUsuario: administrador.idUsuario, nome: nome.trim(), slug, indiceRaizCnpj: prepararIndiceRaizCnpj(perfil.documento) } });
  } catch (erro) {
    if (codigoErroBanco(erro) === 'ER_DUP_ENTRY') { resposta.status(409).json({ mensagem: 'A raiz deste CNPJ já está vinculada a uma empresa na plataforma.' }); return; }
    throw erro;
  }
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
  const { nome } = requisicao.body ?? {};
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe o nome do salão.' }); return; }
  const slug = await criarSlugSalaoUnico(nome, { idSalao: salao.idSalao });
  await bancoDeDados.query('UPDATE tb_salao SET nm_salao = :nome, ds_slug = :slug WHERE id_salao = :idSalao', { replacements: { idSalao: salao.idSalao, nome: nome.trim(), slug } });
  resposta.status(200).json({ mensagem: 'Informações do salão atualizadas.' });
}

async function consultarPerfil(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const perfil = await obterDadosCadastraisUsuario(administrador.idUsuario);
  resposta.status(200).json({ perfil, cadastroIncompleto: !perfil?.dataNascimento || !perfil?.tipoDocumento || !perfil?.documento || !perfil?.telefone });
}

async function atualizarPerfil(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const { dataNascimento, nome, telefone, tipoDocumento } = requisicao.body ?? {};
  const documento = normalizarCnpj(requisicao.body?.documento);
  if (!nome?.trim()) { resposta.status(400).json({ mensagem: 'Informe o nome do responsável.' }); return; }
  const telefoneNormalizado = somenteNumeros(telefone);
  if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 11) { resposta.status(400).json({ mensagem: 'Informe um telefone válido para o responsável.' }); return; }
  if (!dataNascimentoValida(dataNascimento)) { resposta.status(400).json({ mensagem: 'Você precisa ter pelo menos 18 anos.' }); return; }
  if (tipoDocumento !== 'CNPJ' || !cnpjValido(documento)) { resposta.status(400).json({ mensagem: 'Informe um CNPJ válido para a empresa.' }); return; }
  const protegido = prepararDocumento('CNPJ', documento);
  const indiceRaizCnpj = prepararIndiceRaizCnpj(documento);
  const salao = await obterSalaoAdministrador(administrador.idUsuario);
  const transacao = await bancoDeDados.transaction();
  try {
    if (salao) {
      const saloes = await bancoDeDados.query(
        'SELECT ds_cnpj_raiz_indice AS indiceRaizCnpj FROM tb_salao WHERE id_salao=:idSalao FOR UPDATE',
        { replacements: { idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
      );
      const raizAlterada = saloes[0]?.indiceRaizCnpj !== indiceRaizCnpj;
      if (raizAlterada) {
        const unidades = await bancoDeDados.query(
          'SELECT id_unidade FROM tb_unidade WHERE fk_salao=:idSalao LIMIT 1',
          { replacements: { idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
        );
        if (unidades.length) {
          await transacao.rollback();
          resposta.status(409).json({ mensagem: 'Não é possível alterar a raiz do CNPJ enquanto o salão possui unidades cadastradas.' });
          return;
        }
      }
      const unidadeComMesmoCnpj = await bancoDeDados.query(
        'SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice AND fk_salao<>:idSalao LIMIT 1',
        { replacements: { documentoIndice: protegido.documentoIndice, idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
      );
      if (unidadeComMesmoCnpj.length) {
        await transacao.rollback();
        resposta.status(409).json({ mensagem: 'Este CNPJ já está cadastrado em outra unidade da plataforma.' });
        return;
      }
    } else {
      const unidadeComMesmoCnpj = await bancoDeDados.query(
        'SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice LIMIT 1',
        { replacements: { documentoIndice: protegido.documentoIndice }, transaction: transacao, type: QueryTypes.SELECT },
      );
      if (unidadeComMesmoCnpj.length) {
        await transacao.rollback();
        resposta.status(409).json({ mensagem: 'Este CNPJ já está cadastrado em uma unidade da plataforma.' });
        return;
      }
    }
    await atualizarDadosCadastraisUsuario(administrador.idUsuario, { dataNascimento, documento, nome, telefone: telefoneNormalizado, tipoDocumento: 'CNPJ', transaction: transacao });
    if (salao) {
      await bancoDeDados.query(
        'UPDATE tb_salao SET ds_cnpj_raiz_indice=:indiceRaizCnpj WHERE id_salao=:idSalao',
        { replacements: { idSalao: salao.idSalao, indiceRaizCnpj }, transaction: transacao },
      );
    }
    await transacao.commit();
    const perfil = await obterDadosCadastraisUsuario(administrador.idUsuario);
    resposta.status(200).json({ mensagem: 'Informações da conta atualizadas.', perfil, cadastroIncompleto: false });
  } catch (erro) {
    if (!transacao.finished) await transacao.rollback();
    const duplicado = codigoErroBanco(erro) === 'ER_DUP_ENTRY';
    resposta.status(duplicado ? 409 : 400).json({ mensagem: duplicado ? 'Este CNPJ ou a raiz deste CNPJ já está vinculado a uma empresa na plataforma.' : erro.message || 'Não foi possível atualizar suas informações.' });
  }
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
    if (idsSaloes.length) await bancoDeDados.query('DELETE FROM tb_cliente_salao WHERE fk_salao IN (:idsSaloes)', { replacements: { idsSaloes }, transaction: transacao });
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
  const filiais = await bancoDeDados.query(`SELECT id_unidade AS idUnidade, nm_unidade AS nome, ds_slug AS slugFilial, tp_categoria AS categoria, ds_rua AS rua, nu_endereco AS numero, ds_complemento AS complemento, ds_bairro AS bairro, ds_municipio AS municipio, ds_estado AS estado, nu_cep AS cep, ds_email AS email, tp_documento AS tipoDocumento, ds_documento_cifrado AS documentoCifrado, nu_telefone AS telefone, nu_latitude AS latitude, nu_longitude AS longitude, :slugSalao AS slugSalao, (SELECT COUNT(DISTINCT se.id_servico) FROM tb_servico se INNER JOIN tb_funcionario_servico fs ON fs.fk_servico=se.id_servico INNER JOIN tb_funcionario f ON f.id_funcionario=fs.fk_funcionario AND f.fk_unidade=tb_unidade.id_unidade WHERE se.fk_unidade=tb_unidade.id_unidade AND se.st_ativo=TRUE AND f.st_ativo=TRUE) AS quantidadeOpcoesAgendamento FROM tb_unidade WHERE fk_salao = :idSalao AND st_ativo = TRUE ORDER BY nm_unidade`, { replacements: { idSalao: salao.idSalao, slugSalao: salao.slug }, type: QueryTypes.SELECT });
  filiais.forEach((filial) => {
    filial.documento = decifrarDocumento(filial.documentoCifrado);
    delete filial.documentoCifrado;
  });
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
  const dadosEmpresa = await bancoDeDados.query('SELECT ds_cnpj_raiz_indice AS indiceRaizCnpj FROM tb_salao WHERE id_salao=:idSalao LIMIT 1', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT });
  const indiceRaizEmpresa = dadosEmpresa[0]?.indiceRaizCnpj;
  const dadosFilial = requisicao.body ?? {};
  if (!dadosFilial.nome?.trim() || !dadosFilial.numero?.trim() || !categoriasPermitidas.includes(dadosFilial.categoria)) { resposta.status(400).json({ mensagem: 'Informe nome, número e categoria válidos para a filial.' }); return; }
  const email = String(dadosFilial.email ?? '').trim();
  const telefone = somenteNumeros(dadosFilial.telefone);
  const documento = normalizarCnpj(dadosFilial.documento);
  const documentoValido = cnpjValido(documento);
  if (!/^\S+@\S+\.\S+$/.test(email)) { resposta.status(400).json({ mensagem: 'Informe um e-mail válido para a filial.' }); return; }
  if (telefone.length < 10 || telefone.length > 11) { resposta.status(400).json({ mensagem: 'Informe um telefone válido para a filial.' }); return; }
  if (dadosFilial.tipoDocumento !== 'CNPJ' || !documentoValido) { resposta.status(400).json({ mensagem: 'Informe um CNPJ válido para a filial.' }); return; }
  const protegido = prepararDocumento('CNPJ', documento);
  const indiceRaizCnpj = prepararIndiceRaizCnpj(documento);
  if (indiceRaizCnpj !== indiceRaizEmpresa) { resposta.status(409).json({ mensagem: 'O CNPJ da filial precisa pertencer à mesma empresa do salão.' }); return; }
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
  const valores = { ...dadosFilial, ...enderecoCep, ...coordenadas, ...protegido, email, telefone, documento, tipoDocumento: 'CNPJ', indiceRaizCnpj, idSalao: salao.idSalao, idUnidade };
  const transacao = await bancoDeDados.transaction();
  async function validarCnpjUnico() {
    const cnpjsEmUnidades = await bancoDeDados.query(
      'SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice AND (:idUnidade IS NULL OR id_unidade<>:idUnidade) LIMIT 1',
      { replacements: { documentoIndice: protegido.documentoIndice, idUnidade }, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (cnpjsEmUnidades.length) throw Object.assign(new Error('Este CNPJ já está cadastrado em outra unidade da plataforma.'), { status: 409 });
    const cnpjDeOutraEmpresa = await bancoDeDados.query(
      'SELECT id_usuario FROM tb_usuario WHERE ds_documento_indice=:documentoIndice AND id_usuario<>:idUsuario LIMIT 1',
      { replacements: { documentoIndice: protegido.documentoIndice, idUsuario: administrador.idUsuario }, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (cnpjDeOutraEmpresa.length) throw Object.assign(new Error('Este CNPJ já está cadastrado em outra empresa da plataforma.'), { status: 409 });
  }
  if (idUnidade) {
    try {
      const [salaoAtual] = await bancoDeDados.query('SELECT ds_cnpj_raiz_indice AS indiceRaizCnpj FROM tb_salao WHERE id_salao=:idSalao FOR UPDATE', { replacements: { idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT });
      if (salaoAtual?.indiceRaizCnpj !== indiceRaizCnpj) { await transacao.rollback(); resposta.status(409).json({ mensagem: 'O CNPJ da filial precisa pertencer à mesma empresa do salão.' }); return; }
      await validarCnpjUnico();
      const filiais = await bancoDeDados.query('SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao LIMIT 1', { replacements: valores, transaction: transacao, type: QueryTypes.SELECT });
      if (!filiais.length) { await transacao.rollback(); resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
      const agendamentosFuturos = await bancoDeDados.query(
        `SELECT DAYOFWEEK(dt_inicio)-1 AS diaSemana,
                TIME_FORMAT(dt_inicio, '%H:%i') AS inicio,
                TIME_FORMAT(dt_fim, '%H:%i') AS fim
         FROM tb_agendamento WHERE fk_unidade=:idUnidade
           AND cd_status='AGENDADO' AND dt_inicio>NOW()`,
        { replacements: { idUnidade }, transaction: transacao, type: QueryTypes.SELECT },
      );
      const conflitoExpediente = agendamentosFuturos.find((agendamento) => {
        const horario = horarios.find((item) => item.diaSemana === Number(agendamento.diaSemana));
        return !horario || horario.fechado || agendamento.inicio < horario.abertura || agendamento.fim > horario.fechamento;
      });
      if (conflitoExpediente) { await transacao.rollback(); resposta.status(409).json({ mensagem: 'O novo expediente deixaria um agendamento confirmado fora do horário.' }); return; }
      valores.slug = await criarSlugUnidadeUnico(dadosFilial.nome, salao.idSalao, { idUnidade, transaction: transacao });
      await bancoDeDados.query(`UPDATE tb_unidade SET nm_unidade=:nome, ds_slug=:slug, tp_categoria=:categoria, ds_rua=:rua, nu_endereco=:numero, ds_complemento=:complemento, ds_bairro=:bairro, ds_municipio=:municipio, ds_estado=:estado, nu_cep=:cep, ds_email=:email, tp_documento='CNPJ', ds_documento_cifrado=:documentoCifrado, ds_documento_indice=:documentoIndice, ds_cnpj_raiz_indice=:indiceRaizCnpj, nu_latitude=:latitude, nu_longitude=:longitude, nu_telefone=:telefone WHERE id_unidade=:idUnidade`, { replacements: valores, transaction: transacao });
      await salvarHorariosUnidade(idUnidade, horarios, transacao);
      await transacao.commit();
      resposta.status(200).json({ mensagem: 'Filial, localização e horários atualizados.', coordenadas }); return;
    } catch (erro) { await transacao.rollback(); const duplicado = codigoErroBanco(erro) === 'ER_DUP_ENTRY'; resposta.status(erro.status ?? (duplicado ? 409 : 500)).json({ mensagem: duplicado ? 'Este CNPJ já está cadastrado na plataforma.' : erro.message }); return; }
  }
  let etapa = 'gerar slug';
  let idUnidadeCriada = null;
  let transacaoConfirmada = false;
  const responderCriacaoConcluida = () => {
    if (!resposta.headersSent) resposta.status(201).json({ mensagem: 'Filial criada com localização e horários salvos.', idUnidade: idUnidadeCriada, coordenadas });
  };
  try {
    const [salaoAtual] = await bancoDeDados.query('SELECT ds_cnpj_raiz_indice AS indiceRaizCnpj FROM tb_salao WHERE id_salao=:idSalao FOR UPDATE', { replacements: { idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT });
    if (salaoAtual?.indiceRaizCnpj !== indiceRaizCnpj) throw Object.assign(new Error('O CNPJ da filial precisa pertencer à mesma empresa do salão.'), { status: 409 });
    const assinatura = await obterAssinaturaSalao(salao.idSalao);
    const premiumAtivo = resumoAssinatura(assinatura).temAcessoPremium;
    const unidadesAtivas = await bancoDeDados.query(
      'SELECT COUNT(*) AS quantidade FROM tb_unidade WHERE fk_salao=:idSalao AND st_ativo=TRUE',
      { replacements: { idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (!premiumAtivo && Number(unidadesAtivas[0]?.quantidade ?? 0) >= 1) {
      await transacao.rollback();
      resposta.status(409).json({ mensagem: 'O plano Básico permite uma unidade. Assine o Premium para cadastrar unidades ilimitadas.' });
      return;
    }
    await validarCnpjUnico();
    valores.slug = await criarSlugUnidadeUnico(dadosFilial.nome, salao.idSalao, { transaction: transacao });
    etapa = 'inserir filial';
    const [resultadoInsercao] = await bancoDeDados.query(`INSERT INTO tb_unidade (fk_salao, nm_unidade, ds_slug, tp_categoria, ds_rua, nu_endereco, ds_complemento, ds_bairro, ds_municipio, ds_estado, nu_cep, ds_email, tp_documento, ds_documento_cifrado, ds_documento_indice, ds_cnpj_raiz_indice, nu_latitude, nu_longitude, nu_telefone) VALUES (:idSalao, :nome, :slug, :categoria, :rua, :numero, :complemento, :bairro, :municipio, :estado, :cep, :email, 'CNPJ', :documentoCifrado, :documentoIndice, :indiceRaizCnpj, :latitude, :longitude, :telefone)`, { replacements: valores, transaction: transacao });
    idUnidadeCriada = Number(resultadoInsercao?.insertId) || null;
    etapa = 'identificar filial criada';
    const unidadesCriadas = await bancoDeDados.query('SELECT LAST_INSERT_ID() AS idUnidade', { transaction: transacao, type: QueryTypes.SELECT });
    idUnidadeCriada = Number(unidadesCriadas[0]?.idUnidade) || idUnidadeCriada;
    if (!idUnidadeCriada) throw new Error('Não foi possível identificar a filial criada.');
    etapa = 'salvar horários';
    await salvarHorariosUnidade(idUnidadeCriada, horarios, transacao);
    etapa = 'confirmar transação';
    await transacao.commit();
    transacaoConfirmada = true;
    etapa = 'responder sucesso';
    responderCriacaoConcluida();
  } catch (erro) {
    if (!transacao.finished) {
      try { await transacao.rollback(); } catch (erroRollback) {
        console.error('[Cadastro filial] Falha ao desfazer transação.', { etapa, mensagem: erroRollback.message });
      }
    }
    let filialPersistida = transacaoConfirmada;
    if (!filialPersistida && idUnidadeCriada) {
      try {
        const filiaisPersistidas = await bancoDeDados.query(
          'SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao LIMIT 1',
          { replacements: { idUnidade: idUnidadeCriada, idSalao: salao.idSalao }, type: QueryTypes.SELECT },
        );
        filialPersistida = filiaisPersistidas.length > 0;
      } catch (erroVerificacao) {
        console.error('[Cadastro filial] Não foi possível verificar a persistência após a falha.', { mensagem: erroVerificacao.message });
      }
    }
    if (filialPersistida) {
      console.error('[Cadastro filial] A filial foi persistida, mas houve falha ao concluir a resposta.', {
        idUnidade: idUnidadeCriada,
        etapa,
        tipoErro: erro.name,
        mensagem: erro.message,
        stack: erro.stack,
      });
      responderCriacaoConcluida();
      return;
    }
    console.error('[Cadastro filial] Falha ao salvar.', {
      etapa,
      tipoErro: erro.name,
      mensagem: erro.message,
      detalhesValidacao: erro.errors?.map((item) => ({ campo: item.path, mensagem: item.message })),
      stack: erro.stack,
    });
    if (!resposta.headersSent) {
      const conflitoNome = erro.name === 'SequelizeUniqueConstraintError'
        && erro.errors?.some((item) => item.path === 'uk_unidade_nome_salao');
      const conflitoDocumento = codigoErroBanco(erro) === 'ER_DUP_ENTRY';
      resposta.status(erro.status ?? (conflitoNome || conflitoDocumento ? 409 : 500)).json({
        mensagem: conflitoNome
          ? 'Já existe uma filial com esse nome neste salão. Confira a lista de filiais, inclusive as removidas da descoberta.'
          : conflitoDocumento ? 'Este CNPJ já está cadastrado na plataforma.' : erro.message,
      });
    }
  }
}

async function criarServico(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const { descricao = null, duracaoMinutos, idUnidade, nome, valor } = requisicao.body ?? {};
  if (!nome?.trim() || !Number(idUnidade) || Number(valor) < 0 || !duracoesServicoPermitidas.includes(Number(duracaoMinutos))) { resposta.status(400).json({ mensagem: 'Informe filial, nome, valor e uma duração permitida.' }); return; }
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
  if (!idServico || !nome?.trim() || !Number(idUnidade) || Number(valor) < 0 || !duracoesServicoPermitidas.includes(Number(duracaoMinutos))) { resposta.status(400).json({ mensagem: 'Informe filial, nome, valor e uma duração permitida.' }); return; }
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
    const profissionais = await bancoDeDados.query(
      `SELECT f.id_funcionario AS idFuncionario FROM tb_funcionario f
       INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade
       WHERE f.id_funcionario=:idFuncionario AND u.fk_salao=:idSalao AND f.st_ativo=TRUE
       LIMIT 1 FOR UPDATE`,
      { replacements: { idFuncionario, idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (!profissionais.length) throw Object.assign(new Error('Profissional não encontrado.'), { status: 404 });
    const servicos = await bancoDeDados.query('SELECT id_servico AS idServico FROM tb_servico WHERE fk_unidade=:idUnidade AND st_ativo=TRUE AND id_servico IN (:idsServicos)', { replacements: { idUnidade, idsServicos }, transaction: transacao, type: QueryTypes.SELECT });
    if (servicos.length !== idsServicos.length) throw new Error('Selecione apenas serviços ativos da filial informada.');
    // Nome e filial podem permanecer iguais em uma alteração apenas dos serviços.
    await bancoDeDados.query('UPDATE tb_funcionario SET fk_unidade=:idUnidade, nm_funcionario=:nome WHERE id_funcionario=:idFuncionario', { replacements: { idFuncionario, idUnidade, nome: nome.trim() }, transaction: transacao });
    await bancoDeDados.query('DELETE FROM tb_funcionario_servico WHERE fk_funcionario=:idFuncionario', { replacements: { idFuncionario }, transaction: transacao });
    for (const servico of servicos) await bancoDeDados.query('INSERT INTO tb_funcionario_servico (fk_funcionario, fk_servico) VALUES (:idFuncionario, :idServico)', { replacements: { idFuncionario, idServico: servico.idServico }, transaction: transacao });
    await transacao.commit(); resposta.status(200).json({ mensagem: 'Profissional atualizado com sucesso.' });
  } catch (erro) { await transacao.rollback(); resposta.status(erro.status ?? 400).json({ mensagem: erro.message }); }
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

function normalizarPeriodosFuncionario(periodos) {
  if (!Array.isArray(periodos)) throw new Error('Informe os períodos de disponibilidade.');
  const normalizados = periodos.map((periodo) => ({
    diaSemana: Number(periodo.diaSemana),
    fim: String(periodo.fim ?? '').slice(0, 5),
    inicio: String(periodo.inicio ?? '').slice(0, 5),
  }));
  for (const periodo of normalizados) {
    if (!Number.isInteger(periodo.diaSemana) || periodo.diaSemana < 0 || periodo.diaSemana > 6
      || !/^\d{2}:\d{2}$/.test(periodo.inicio) || !/^\d{2}:\d{2}$/.test(periodo.fim)
      || periodo.inicio >= periodo.fim) throw new Error('Há um período de disponibilidade inválido.');
  }
  normalizados.sort((a, b) => a.diaSemana - b.diaSemana || a.inicio.localeCompare(b.inicio));
  for (let indice = 1; indice < normalizados.length; indice += 1) {
    const anterior = normalizados[indice - 1];
    const atual = normalizados[indice];
    if (anterior.diaSemana === atual.diaSemana && atual.inicio < anterior.fim) throw new Error('Os períodos de um mesmo dia não podem se sobrepor.');
  }
  return normalizados;
}

async function listarDisponibilidade(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idUnidade = Number(requisicao.query.idUnidade);
  if (!Number.isInteger(idUnidade) || !await obterFilialDoSalao(idUnidade, salao.idSalao)) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  const funcionarios = await bancoDeDados.query(
    `SELECT f.id_funcionario AS idFuncionario, f.nm_funcionario AS nome
     FROM tb_funcionario f WHERE f.fk_unidade=:idUnidade AND f.st_ativo=TRUE ORDER BY f.nm_funcionario`,
    { replacements: { idUnidade }, type: QueryTypes.SELECT },
  );
  const idsFuncionarios = funcionarios.map((item) => item.idFuncionario);
  const periodos = idsFuncionarios.length ? await bancoDeDados.query(
    `SELECT fk_funcionario AS idFuncionario, nr_dia_semana AS diaSemana,
            hr_inicio AS inicio, hr_fim AS fim
     FROM tb_disponibilidade_funcionario
     WHERE fk_funcionario IN (:idsFuncionarios) AND st_ativo=TRUE
     ORDER BY nr_dia_semana, hr_inicio`,
    { replacements: { idsFuncionarios }, type: QueryTypes.SELECT },
  ) : [];
  const bloqueios = await bancoDeDados.query(
    `SELECT b.id_bloqueio AS idBloqueio, b.fk_funcionario AS idFuncionario,
            f.nm_funcionario AS profissional, b.dt_inicio AS dataHoraInicio,
            b.dt_fim AS dataHoraFim, b.ds_motivo AS motivo
     FROM tb_bloqueio_agenda b LEFT JOIN tb_funcionario f ON f.id_funcionario=b.fk_funcionario
     WHERE b.fk_unidade=:idUnidade AND b.st_ativo=TRUE AND b.dt_fim>=NOW()
     ORDER BY b.dt_inicio`,
    { replacements: { idUnidade }, type: QueryTypes.SELECT },
  );
  funcionarios.forEach((funcionario) => {
    funcionario.periodos = periodos.filter((periodo) => Number(periodo.idFuncionario) === Number(funcionario.idFuncionario));
  });
  resposta.status(200).json({ bloqueios, funcionarios });
}

async function salvarDisponibilidadeFuncionario(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idFuncionario = Number(requisicao.params.idFuncionario);
  let periodos;
  try { periodos = normalizarPeriodosFuncionario(requisicao.body?.periodos); } catch (erro) { resposta.status(400).json({ mensagem: erro.message }); return; }
  const profissionais = await bancoDeDados.query(
    `SELECT f.id_funcionario AS idFuncionario, f.fk_unidade AS idUnidade
     FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade
     WHERE f.id_funcionario=:idFuncionario AND f.st_ativo=TRUE AND u.fk_salao=:idSalao LIMIT 1`,
    { replacements: { idFuncionario, idSalao: salao.idSalao }, type: QueryTypes.SELECT },
  );
  if (!profissionais.length) { resposta.status(404).json({ mensagem: 'Profissional não encontrado.' }); return; }
  const agendamentos = await bancoDeDados.query(
    `SELECT id_agendamento AS idAgendamento, DAYOFWEEK(dt_inicio)-1 AS diaSemana,
            TIME_FORMAT(dt_inicio, '%H:%i') AS inicio, TIME_FORMAT(dt_fim, '%H:%i') AS fim
     FROM tb_agendamento WHERE fk_funcionario=:idFuncionario
       AND cd_status='AGENDADO' AND dt_inicio>NOW()`,
    { replacements: { idFuncionario }, type: QueryTypes.SELECT },
  );
  const foraDaNovaAgenda = agendamentos.find((agendamento) => !periodos.some((periodo) =>
    periodo.diaSemana === Number(agendamento.diaSemana) && agendamento.inicio >= periodo.inicio && agendamento.fim <= periodo.fim));
  if (foraDaNovaAgenda) { resposta.status(409).json({ mensagem: 'A nova jornada deixaria um agendamento confirmado fora do expediente.' }); return; }
  const transacao = await bancoDeDados.transaction();
  try {
    await bancoDeDados.query('DELETE FROM tb_disponibilidade_funcionario WHERE fk_funcionario=:idFuncionario', { replacements: { idFuncionario }, transaction: transacao });
    for (const periodo of periodos) await bancoDeDados.query(
      `INSERT INTO tb_disponibilidade_funcionario
       (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
       VALUES (:idFuncionario, :diaSemana, :inicio, :fim)`,
      { replacements: { idFuncionario, ...periodo }, transaction: transacao },
    );
    await transacao.commit();
    resposta.status(200).json({ mensagem: 'Disponibilidade atualizada com sucesso.' });
  } catch (erro) { await transacao.rollback(); resposta.status(400).json({ mensagem: erro.message }); }
}

function dataHoraBanco(valor) {
  const texto = String(valor ?? '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto) ? `${texto.replace('T', ' ')}:00` : null;
}

async function criarBloqueio(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idUnidade = Number(requisicao.body?.idUnidade);
  const idFuncionario = requisicao.body?.idFuncionario ? Number(requisicao.body.idFuncionario) : null;
  const dataHoraInicio = dataHoraBanco(requisicao.body?.dataHoraInicio);
  const dataHoraFim = dataHoraBanco(requisicao.body?.dataHoraFim);
  if (!Number.isInteger(idUnidade) || !dataHoraInicio || !dataHoraFim || dataHoraInicio >= dataHoraFim) { resposta.status(400).json({ mensagem: 'Informe filial e período válidos para o bloqueio.' }); return; }
  if (!await obterFilialDoSalao(idUnidade, salao.idSalao)) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  if (idFuncionario) {
    const profissionais = await bancoDeDados.query('SELECT id_funcionario FROM tb_funcionario WHERE id_funcionario=:idFuncionario AND fk_unidade=:idUnidade AND st_ativo=TRUE LIMIT 1', { replacements: { idFuncionario, idUnidade }, type: QueryTypes.SELECT });
    if (!profissionais.length) { resposta.status(404).json({ mensagem: 'Profissional não encontrado nesta filial.' }); return; }
  }
  const codigoMotivo = requisicao.body?.codigoMotivo;
  const detalheMotivo = typeof requisicao.body?.detalheMotivo === 'string' ? requisicao.body.detalheMotivo.trim() : '';
  if (!Object.hasOwn(motivosCancelamento, codigoMotivo) || (codigoMotivo === 'OUTRO' && !detalheMotivo)) {
    resposta.status(400).json({ mensagem: 'Selecione o motivo do bloqueio e descreva o motivo quando escolher “Outro”.' }); return;
  }
  if (detalheMotivo.length > 200) { resposta.status(400).json({ mensagem: 'O detalhe do motivo deve ter até 200 caracteres.' }); return; }
  const motivo = `${motivosCancelamento[codigoMotivo]}${detalheMotivo ? `: ${detalheMotivo}` : ''}`;
  const transacao = await criarTransacaoAgenda();
  const notificacoes = [];
  try {
    await bloquearRecursosAgenda({ idsUnidades: [idUnidade], transaction: transacao });
    const conflitos = await bancoDeDados.query(
      `SELECT id_agendamento AS idAgendamento, fk_usuario AS idUsuario
       FROM tb_agendamento
       WHERE fk_unidade=:idUnidade AND cd_status='AGENDADO'
         AND (:idFuncionario IS NULL OR fk_funcionario=:idFuncionario)
       AND dt_inicio < :dataHoraFim AND dt_fim > :dataHoraInicio
         AND dt_fim>NOW() FOR UPDATE`,
      { replacements: { dataHoraFim, dataHoraInicio, idFuncionario, idUnidade }, transaction: transacao, type: QueryTypes.SELECT },
    );
    const idsAgendamentos = conflitos.map((item) => item.idAgendamento);
    if (idsAgendamentos.length) {
      await bancoDeDados.query(
        `UPDATE tb_agendamento SET cd_status='CANCELADO', dt_cancelamento=NOW(),
                fk_usuario_cancelamento=:idUsuario,
                cd_origem_cancelamento='SALAO',
                cd_motivo_cancelamento=:codigoMotivo,
                ds_motivo_cancelamento=:motivoCancelamento
         WHERE id_agendamento IN (:idsAgendamentos) AND cd_status='AGENDADO'`,
        {
          replacements: {
            idUsuario: administrador.idUsuario,
            codigoMotivo,
            idsAgendamentos,
            motivoCancelamento: motivo,
          },
          transaction: transacao,
        },
      );
      for (const agendamento of conflitos) {
        if (!agendamento.idUsuario) continue;
        const titulo = 'Agendamento cancelado';
        const mensagem = `Seu agendamento foi cancelado pelo salão. Motivo: ${motivo}`;
        const link = `/cliente/agendamentos?historico=${agendamento.idAgendamento}`;
        const idNotificacao = await criarNotificacaoCliente(agendamento.idUsuario, agendamento.idAgendamento, {
          tipo: 'CANCELAMENTO', titulo, mensagem, link,
        }, transacao);
        notificacoes.push({ idUsuario: agendamento.idUsuario, idNotificacao, titulo, mensagem, link });
      }
    }
    await bancoDeDados.query(
      `INSERT INTO tb_bloqueio_agenda
       (fk_unidade, fk_funcionario, dt_inicio, dt_fim, ds_motivo)
       VALUES (:idUnidade, :idFuncionario, :dataHoraInicio, :dataHoraFim, :motivo)`,
      { replacements: { dataHoraFim, dataHoraInicio, idFuncionario, idUnidade, motivo }, transaction: transacao },
    );
    await transacao.commit();
    notificacoes.forEach((item) => {
      void enviarNotificacaoPushCliente(item.idUsuario, item.titulo, item.mensagem, item.idNotificacao, item.link);
    });
    resposta.status(201).json({
      mensagem: idsAgendamentos.length
        ? `Bloqueio criado e ${idsAgendamentos.length} agendamento(s) cancelado(s).`
        : 'Bloqueio criado com sucesso.',
      quantidadeAgendamentosCancelados: idsAgendamentos.length,
    });
  } catch (erro) {
    await transacao.rollback();
    resposta.status(500).json({ mensagem: 'Não foi possível bloquear a agenda agora.' });
  }
}

async function excluirBloqueio(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const [resultado] = await bancoDeDados.query(
    `UPDATE tb_bloqueio_agenda b INNER JOIN tb_unidade u ON u.id_unidade=b.fk_unidade
     SET b.st_ativo=FALSE WHERE b.id_bloqueio=:idBloqueio AND u.fk_salao=:idSalao AND b.st_ativo=TRUE`,
    { replacements: { idBloqueio: Number(requisicao.params.idBloqueio), idSalao: salao.idSalao } },
  );
  if (!resultado.affectedRows) { resposta.status(404).json({ mensagem: 'Bloqueio não encontrado.' }); return; }
  resposta.status(200).json({ mensagem: 'Bloqueio removido.' });
}

async function listarHorariosAgendamento(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idUnidade = Number(requisicao.query.idUnidade);
  const idServico = Number(requisicao.query.idServico);
  const idFuncionario = requisicao.query.idFuncionario ? Number(requisicao.query.idFuncionario) : null;
  if (!Number.isInteger(idUnidade) || !Number.isInteger(idServico) || (idFuncionario !== null && !Number.isInteger(idFuncionario))) {
    resposta.status(400).json({ mensagem: 'Informe filial, serviço e profissional válidos.' }); return;
  }
  if (!await obterFilialDoSalao(idUnidade, salao.idSalao)) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  try {
    const disponibilidade = await listarHorariosDisponiveis({
      data: String(requisicao.query.data ?? ''), idFuncionario, idServico, idUnidade,
    });
    resposta.status(200).json(disponibilidade);
  } catch (erro) { resposta.status(erro.status ?? 500).json({ mensagem: erro.message }); }
}

async function criarAgendamentoSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const dados = requisicao.body ?? {};
  const idUnidade = Number(dados.idUnidade);
  const idServico = Number(dados.idServico);
  const idFuncionario = dados.idFuncionario ? Number(dados.idFuncionario) : null;
  const idClienteSalao = dados.idClienteSalao ? Number(dados.idClienteSalao) : null;
  const nome = String(dados.cliente?.nome ?? '').trim();
  const email = String(dados.cliente?.email ?? '').trim() || null;
  const telefone = String(dados.cliente?.telefone ?? '').trim() || null;

  if (![idUnidade, idServico].every(Number.isInteger) || (idFuncionario !== null && !Number.isInteger(idFuncionario))) {
    resposta.status(400).json({ mensagem: 'Informe filial, serviço, profissional e horário válidos.' }); return;
  }
  if (idClienteSalao !== null && !Number.isInteger(idClienteSalao)) {
    resposta.status(400).json({ mensagem: 'Selecione um cliente válido.' }); return;
  }
  if ((idClienteSalao && nome) || (!idClienteSalao && !nome)) {
    resposta.status(400).json({ mensagem: 'Selecione um cliente existente ou informe o nome de um novo cliente.' }); return;
  }
  if (nome.length > 120 || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || (telefone && telefone.length > 20)) {
    resposta.status(400).json({ mensagem: 'Confira o nome, email e telefone informados.' }); return;
  }
  if (!await obterFilialDoSalao(idUnidade, salao.idSalao)) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }

  const transacao = await criarTransacaoAgenda();
  try {
    let clienteId = idClienteSalao;
    if (clienteId) {
      const clientes = await bancoDeDados.query(
        'SELECT id_cliente_salao AS idClienteSalao FROM tb_cliente_salao WHERE id_cliente_salao=:idClienteSalao AND fk_salao=:idSalao LIMIT 1',
        { replacements: { idClienteSalao: clienteId, idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
      );
      if (!clientes.length) { const erro = new Error('Cliente não encontrado neste salão.'); erro.status = 404; throw erro; }
    } else {
      await bancoDeDados.query(
        'INSERT INTO tb_cliente_salao (fk_salao, nm_cliente, ds_email, nu_telefone) VALUES (:idSalao, :nome, :email, :telefone)',
        { replacements: { idSalao: salao.idSalao, nome, email, telefone }, transaction: transacao },
      );
      const clientes = await bancoDeDados.query('SELECT LAST_INSERT_ID() AS idClienteSalao', { transaction: transacao, type: QueryTypes.SELECT });
      clienteId = clientes[0].idClienteSalao;
    }

    await bloquearRecursosAgenda({ idClienteSalao: clienteId, idsUnidades: [idUnidade], transaction: transacao });
    const reserva = await resolverReserva({
      dataHoraInicio: dados.dataHoraInicio, idFuncionario, idServico, idUnidade, idClienteSalao: clienteId, transaction: transacao,
    });
    const conflitos = await bancoDeDados.query(
      `SELECT id_agendamento FROM tb_agendamento
       WHERE fk_funcionario=:idFuncionario AND cd_status='AGENDADO'
       AND dt_inicio < :dataFimBanco AND dt_fim > :dataInicioBanco FOR UPDATE`,
      { replacements: reserva, transaction: transacao, type: QueryTypes.SELECT },
    );
    if (conflitos.length) { const erro = new Error('Este horário acabou de ser reservado. Escolha outro horário.'); erro.status = 409; throw erro; }

    await bancoDeDados.query(
      `INSERT INTO tb_agendamento (
        fk_usuario, fk_cliente_salao, fk_unidade, fk_funcionario, fk_servico,
        dt_inicio, dt_fim, nm_servico_agendado, vl_servico_agendado,
        nu_duracao_minutos, ds_observacao
      ) VALUES (
        NULL, :idClienteSalao, :idUnidade, :idFuncionario, :idServico,
        :dataInicioBanco, :dataFimBanco, :nomeServico, :valorServico,
        :duracaoMinutos, :observacao
      )`,
      { replacements: { ...reserva, idClienteSalao: clienteId, idUnidade, idServico, observacao: String(dados.observacao ?? '').trim() || null }, transaction: transacao },
    );
    await transacao.commit();
    resposta.status(201).json({ mensagem: 'Agendamento criado com sucesso.', dataHoraInicio: reserva.dataInicioBanco, idFuncionario: reserva.idFuncionario });
  } catch (erro) {
    await transacao.rollback();
    resposta.status(erro.status ?? 500).json({ mensagem: erro.message });
  }
}

async function listarClientes(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const busca = String(requisicao.query.busca ?? '').trim();
  const filtroBusca = busca ? 'WHERE (cliente.nome LIKE :busca OR cliente.email LIKE :busca OR cliente.telefone LIKE :busca)' : '';
  const clientes = await bancoDeDados.query(
    `SELECT cliente.idClienteSalao, cliente.idUsuario, cliente.nome, cliente.email, cliente.telefone,
            MAX(cliente.ultimoAgendamento) AS ultimoAgendamento
     FROM (
       SELECT NULL AS idClienteSalao, u.id_usuario AS idUsuario, u.nm_usuario AS nome,
              u.ds_email AS email, NULL AS telefone, MAX(a.dt_inicio) AS ultimoAgendamento
       FROM tb_agendamento a
       INNER JOIN tb_unidade un ON un.id_unidade=a.fk_unidade
       INNER JOIN tb_usuario u ON u.id_usuario=a.fk_usuario
       WHERE un.fk_salao=:idSalao
       GROUP BY u.id_usuario, u.nm_usuario, u.ds_email
       UNION ALL
       SELECT c.id_cliente_salao AS idClienteSalao, NULL AS idUsuario, c.nm_cliente AS nome,
              c.ds_email AS email, c.nu_telefone AS telefone, MAX(a.dt_inicio) AS ultimoAgendamento
       FROM tb_cliente_salao c
       LEFT JOIN tb_agendamento a ON a.fk_cliente_salao=c.id_cliente_salao
       WHERE c.fk_salao=:idSalao
       GROUP BY c.id_cliente_salao, c.nm_cliente, c.ds_email, c.nu_telefone
     ) cliente
     ${filtroBusca}
     GROUP BY cliente.idClienteSalao, cliente.idUsuario, cliente.nome, cliente.email, cliente.telefone
     ORDER BY MAX(cliente.ultimoAgendamento) DESC, cliente.nome`,
    { replacements: { idSalao: salao.idSalao, busca: `%${busca}%` }, type: QueryTypes.SELECT },
  );
  resposta.status(200).json({ clientes });
}

async function listarAgendamentos(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return; const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  try {
    const consulta = normalizarConsultaAgenda(requisicao.query);
    resposta.status(200).json(await consultarAgendaSalao(salao.idSalao, consulta));
  } catch (erro) {
    if (erro.status === 400) { resposta.status(400).json({ mensagem: erro.message }); return; }
    console.error('[Agenda salão] Falha ao consultar agendamentos.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar os agendamentos.' });
  }
}

async function confirmarAtendimentoAgendamento(requisicao, resposta) {
  return registrarResultadoAgendamento(requisicao, resposta, 'REALIZADO');
}

async function registrarAusenciaAgendamento(requisicao, resposta) {
  return registrarResultadoAgendamento(requisicao, resposta, 'NAO_COMPARECEU');
}

async function registrarResultadoAgendamento(requisicao, resposta, status) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario);
  if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idAgendamento = Number(requisicao.params.idAgendamento);
  if (!Number.isSafeInteger(idAgendamento) || idAgendamento <= 0) { resposta.status(400).json({ mensagem: 'Agendamento inválido.' }); return; }
  const transacao = await criarTransacaoAgenda();
  let dadosNotificacao = null;
  try {
    const [contexto] = await bancoDeDados.query(`SELECT a.fk_unidade AS idUnidade,
      a.fk_usuario AS idUsuario, a.fk_cliente_salao AS idClienteSalao
      FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
      WHERE a.id_agendamento=:idAgendamento AND u.fk_salao=:idSalao`, {
      replacements: { idAgendamento, idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT,
    });
    if (!contexto) throw Object.assign(new Error('Agendamento não encontrado.'), { status: 404 });
    await bloquearRecursosAgenda({ ...contexto, idsUnidades: [contexto.idUnidade], transaction: transacao });
    const [agendamento] = await bancoDeDados.query(`SELECT cd_status AS status, dt_inicio AS dataHoraInicio,
      nm_servico_agendado AS servico, fk_unidade AS idUnidade FROM tb_agendamento
      WHERE id_agendamento=:idAgendamento FOR UPDATE`, {
      replacements: { idAgendamento }, transaction: transacao, type: QueryTypes.SELECT,
    });
    if (agendamento.status !== 'AGENDADO') throw Object.assign(new Error('Este agendamento já recebeu um resultado.'), { status: 409 });
    // Revalidar a unidade após os locks, inclusive se houve reagendamento concorrente.
    if (Number(agendamento.idUnidade) !== Number(contexto.idUnidade)) throw Object.assign(new Error('O agendamento foi alterado. Atualize a agenda.'), { status: 409 });
    if (status === 'NAO_COMPARECEU' && new Date(agendamento.dataHoraInicio) > new Date()) {
      throw Object.assign(new Error('A ausência só pode ser registrada após o horário agendado.'), { status: 409 });
    }
    if (status === 'REALIZADO') await salvarServicosAdicionais({ idAgendamento, idUnidade: contexto.idUnidade,
      servicosAdicionais: requisicao.body?.servicosAdicionais, transaction: transacao });
    await bancoDeDados.query(`UPDATE tb_agendamento SET cd_status = :status,
      dt_realizacao = CASE WHEN :status = 'REALIZADO' THEN NOW() ELSE dt_realizacao END
      WHERE id_agendamento = :idAgendamento`, { replacements: { idAgendamento, status }, transaction: transacao });
    if (status === 'REALIZADO' && contexto.idUsuario) {
      const titulo = 'Como foi seu atendimento?';
      const mensagem = `Seu atendimento de ${agendamento.servico} foi marcado como realizado. Avalie sua experiência.`;
      const link = `/cliente/agendamentos?avaliar=${idAgendamento}`;
      const idNotificacao = await criarNotificacaoCliente(contexto.idUsuario, idAgendamento, { titulo, mensagem, link }, transacao);
      dadosNotificacao = { idUsuario: contexto.idUsuario, idNotificacao, titulo, mensagem, link };
    }
    await transacao.commit();
  } catch (erro) {
    await transacao.rollback();
    resposta.status(erro.status ?? 500).json({ mensagem: erro.message }); return;
  }
  if (dadosNotificacao) void enviarNotificacaoPushCliente(dadosNotificacao.idUsuario, dadosNotificacao.titulo, dadosNotificacao.mensagem, dadosNotificacao.idNotificacao, dadosNotificacao.link);
  resposta.status(200).json({ mensagem: status === 'REALIZADO' ? 'Atendimento confirmado como realizado.' : 'Ausência registrada.' });
}

async function cancelarAgendamentoSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario);
  if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idAgendamento = Number(requisicao.params.idAgendamento);
  if (!Number.isSafeInteger(idAgendamento) || idAgendamento <= 0) {
    resposta.status(400).json({ mensagem: 'Agendamento inválido.' }); return;
  }
  const codigoMotivo = requisicao.body?.codigoMotivo;
  const detalheMotivo = typeof requisicao.body?.detalheMotivo === 'string' ? requisicao.body.detalheMotivo.trim() : '';
  if (!Object.hasOwn(motivosCancelamento, codigoMotivo) || (codigoMotivo === 'OUTRO' && !detalheMotivo)) {
    resposta.status(400).json({ mensagem: 'Selecione o motivo do cancelamento e descreva o motivo quando escolher “Outro”.' }); return;
  }
  if (detalheMotivo.length > 200) {
    resposta.status(400).json({ mensagem: 'O detalhe do motivo deve ter até 200 caracteres.' }); return;
  }
  const motivo = `${motivosCancelamento[codigoMotivo]}${detalheMotivo ? `: ${detalheMotivo}` : ''}`;

  const transacao = await bancoDeDados.transaction();
  let dadosNotificacao = null;
  try {
    const linhas = await bancoDeDados.query(
      `SELECT a.fk_usuario AS idUsuario
       FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
       WHERE a.id_agendamento=:idAgendamento AND u.fk_salao=:idSalao
         AND a.cd_status='AGENDADO' LIMIT 1 FOR UPDATE`,
      { replacements: { idAgendamento, idSalao: salao.idSalao }, transaction: transacao, type: QueryTypes.SELECT },
    );
    const agendamento = linhas[0];
    if (!agendamento) {
      await transacao.rollback();
      resposta.status(409).json({ mensagem: 'Este agendamento não está mais disponível para cancelamento.' });
      return;
    }
    const [resultado] = await bancoDeDados.query(
      `UPDATE tb_agendamento SET cd_status='CANCELADO', dt_cancelamento=NOW(),
         fk_usuario_cancelamento=:idUsuario, cd_origem_cancelamento='SALAO',
         cd_motivo_cancelamento=:codigoMotivo, ds_motivo_cancelamento=:motivo
       WHERE id_agendamento=:idAgendamento AND cd_status='AGENDADO'`,
      { replacements: { codigoMotivo, idAgendamento, idUsuario: administrador.idUsuario, motivo }, transaction: transacao },
    );
    if (!resultado.affectedRows) {
      await transacao.rollback();
      resposta.status(409).json({ mensagem: 'Este agendamento mudou de status antes do cancelamento.' });
      return;
    }
    if (agendamento.idUsuario) {
      const titulo = 'Agendamento cancelado';
      const mensagem = `Seu agendamento foi cancelado pelo salão. Motivo: ${motivo}`;
      const link = `/cliente/agendamentos?historico=${idAgendamento}`;
      const idNotificacao = await criarNotificacaoCliente(agendamento.idUsuario, idAgendamento, {
        tipo: 'CANCELAMENTO', titulo, mensagem, link,
      }, transacao);
      dadosNotificacao = { idUsuario: agendamento.idUsuario, idNotificacao, titulo, mensagem, link };
    }
    await transacao.commit();
  } catch (erro) {
    await transacao.rollback();
    throw erro;
  }
  if (dadosNotificacao) {
    void enviarNotificacaoPushCliente(dadosNotificacao.idUsuario, dadosNotificacao.titulo, dadosNotificacao.mensagem, dadosNotificacao.idNotificacao, dadosNotificacao.link);
  }
  resposta.status(200).json({ mensagem: 'Agendamento cancelado com sucesso.' });
}

async function obterAgendamentoReagendavel(idAgendamento, idSalao, transaction) {
  const agendamentos = await bancoDeDados.query(
    `SELECT a.id_agendamento AS idAgendamento, a.fk_usuario AS idUsuario, a.fk_cliente_salao AS idClienteSalao,
            a.fk_unidade AS idUnidade, a.fk_servico AS idServico,
            a.fk_funcionario AS idFuncionario,
            DATE_FORMAT(a.dt_inicio, '%Y-%m-%d %H:%i:%s') AS dataHoraInicio,
            a.nm_servico_agendado AS servico, a.nu_duracao_minutos AS duracaoMinutos
     FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
     WHERE a.id_agendamento=:idAgendamento AND u.fk_salao=:idSalao
       AND a.cd_status='AGENDADO' LIMIT 1 ${transaction ? 'FOR UPDATE' : ''}`,
    { replacements: { idAgendamento, idSalao }, transaction, type: QueryTypes.SELECT },
  );
  return agendamentos[0] ?? null;
}

async function horariosReagendamentoSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idAgendamento = Number(requisicao.params.idAgendamento);
  if (!Number.isSafeInteger(idAgendamento) || idAgendamento <= 0) { resposta.status(400).json({ mensagem: 'Agendamento inválido.' }); return; }
  const agendamento = await obterAgendamentoReagendavel(idAgendamento, salao.idSalao);
  if (!agendamento) { resposta.status(404).json({ mensagem: 'Agendamento indisponível para reagendamento.' }); return; }
  const idFuncionario = requisicao.query.idFuncionario && requisicao.query.idFuncionario !== 'qualquer'
    ? Number(requisicao.query.idFuncionario) : null;
  if (idFuncionario !== null && (!Number.isSafeInteger(idFuncionario) || idFuncionario <= 0)) {
    resposta.status(400).json({ mensagem: 'Profissional inválido.' }); return;
  }
  try {
    const horarios = await listarHorariosDisponiveis({
      data: String(requisicao.query.data ?? ''), idUnidade: agendamento.idUnidade,
      idServico: agendamento.idServico, idFuncionario, ignorarIdAgendamento: idAgendamento,
      duracaoMinutos: agendamento.duracaoMinutos, idUsuario: agendamento.idUsuario, idClienteSalao: agendamento.idClienteSalao,
    });
    resposta.status(200).json(horarios);
  } catch (erro) { resposta.status(erro.status ?? 400).json({ mensagem: erro.message }); }
}

async function reagendarAgendamentoSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idAgendamento = Number(requisicao.params.idAgendamento);
  const idFuncionario = requisicao.body?.idFuncionario ? Number(requisicao.body.idFuncionario) : null;
  if (!Number.isSafeInteger(idAgendamento) || idAgendamento <= 0
    || (idFuncionario !== null && (!Number.isSafeInteger(idFuncionario) || idFuncionario <= 0))) {
    resposta.status(400).json({ mensagem: 'Agendamento ou profissional inválido.' }); return;
  }
  const transaction = await criarTransacaoAgenda();
  let dadosNotificacao = null;
  try {
    const contexto = await obterAgendamentoReagendavel(idAgendamento, salao.idSalao);
    if (!contexto) throw Object.assign(new Error('Agendamento indisponível para reagendamento.'), { status: 409 });
    await bloquearRecursosAgenda({ ...contexto, idsUnidades: [contexto.idUnidade], transaction });
    const agendamento = await obterAgendamentoReagendavel(idAgendamento, salao.idSalao, transaction);
    if (!agendamento) { const erro = new Error('Agendamento indisponível para reagendamento.'); erro.status = 409; throw erro; }
    if (Number(agendamento.idUnidade) !== Number(contexto.idUnidade)) throw Object.assign(new Error('A filial do agendamento mudou. Atualize a agenda.'), { status: 409 });
    const reserva = await resolverReserva({
      dataHoraInicio: requisicao.body?.dataHoraInicio, idFuncionario,
      idServico: agendamento.idServico, idUnidade: agendamento.idUnidade,
      idUsuario: agendamento.idUsuario, idClienteSalao: agendamento.idClienteSalao, ignorarIdAgendamento: idAgendamento, duracaoMinutos: agendamento.duracaoMinutos, transaction,
    });
    const conflitos = await bancoDeDados.query(
      `SELECT id_agendamento FROM tb_agendamento WHERE fk_funcionario = :idFuncionario
       AND id_agendamento <> :idAgendamento AND cd_status = 'AGENDADO'
       AND dt_inicio < :dataFimBanco AND dt_fim > :dataInicioBanco FOR UPDATE`,
      { replacements: { ...reserva, idAgendamento }, transaction, type: QueryTypes.SELECT },
    );
    if (conflitos.length) { const erro = new Error('Este horário acabou de ser reservado.'); erro.status = 409; throw erro; }
    await bancoDeDados.query(
      `UPDATE tb_agendamento SET fk_funcionario=:idFuncionario, dt_inicio=:dataInicioBanco,
         dt_fim=:dataFimBanco WHERE id_agendamento=:idAgendamento AND cd_status='AGENDADO'`,
      { replacements: { ...reserva, idAgendamento }, transaction },
    );
    const houveAlteracao = Number(agendamento.idFuncionario) !== Number(reserva.idFuncionario)
      || agendamento.dataHoraInicio !== reserva.dataInicioBanco;
    if (houveAlteracao && agendamento.idUsuario) {
      const titulo = 'Agendamento reagendado';
      const [dataNova, horarioNovo] = reserva.dataInicioBanco.split(' ');
      const [ano, mes, dia] = dataNova.split('-');
      const mensagem = `O salão reagendou seu atendimento de ${agendamento.servico} para ${dia}/${mes}/${ano} às ${horarioNovo.slice(0, 5)}.`;
      const link = `/cliente/agendamentos?agendamento=${idAgendamento}`;
      const idNotificacao = await criarNotificacaoCliente(agendamento.idUsuario, idAgendamento, {
        tipo: 'REAGENDAMENTO', titulo, mensagem, link,
      }, transaction);
      dadosNotificacao = { idUsuario: agendamento.idUsuario, idNotificacao, titulo, mensagem, link };
    }
    await transaction.commit();
    if (dadosNotificacao) {
      void enviarNotificacaoPushCliente(dadosNotificacao.idUsuario, dadosNotificacao.titulo, dadosNotificacao.mensagem, dadosNotificacao.idNotificacao, dadosNotificacao.link);
    }
    resposta.status(200).json({ mensagem: 'Agendamento reagendado com sucesso.' });
  } catch (erro) {
    await transaction.rollback();
    resposta.status(erro.status ?? 400).json({ mensagem: erro.message });
  }
}

async function listarAvaliacoesSalao(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const idUnidade = requisicao.query.idUnidade ? Number(requisicao.query.idUnidade) : 0;
  if (!Number.isSafeInteger(idUnidade) || idUnidade < 0) { resposta.status(400).json({ mensagem: 'Filial inválida.' }); return; }
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(requisicao.query.pagina, 10) || 1));
  const filtro = idUnidade ? 'AND av.fk_unidade=:idUnidade' : '';
  const replacements = { idSalao: salao.idSalao, idUnidade };
  const [resumo] = await bancoDeDados.query(
    `SELECT COUNT(*) AS quantidade, ROUND(AVG(av.nu_nota_salao),1) AS mediaSalao,
            ROUND(AVG(av.nu_nota_servico),1) AS mediaServico
     FROM tb_avaliacao av INNER JOIN tb_unidade u ON u.id_unidade=av.fk_unidade
     WHERE u.fk_salao=:idSalao ${filtro}`,
    { replacements, type: QueryTypes.SELECT },
  );
  const avaliacoes = await bancoDeDados.query(
    `SELECT av.id_avaliacao AS idAvaliacao, av.nu_nota_salao AS notaSalao,
            av.nu_nota_servico AS notaServico, av.ds_comentario AS comentario,
            av.dt_criacao AS dataAvaliacao, a.nm_servico_agendado AS servico,
            u.nm_unidade AS filial, SUBSTRING_INDEX(TRIM(c.nm_usuario), ' ', 1) AS primeiroNome
     FROM tb_avaliacao av INNER JOIN tb_agendamento a ON a.id_agendamento=av.fk_agendamento
     INNER JOIN tb_unidade u ON u.id_unidade=av.fk_unidade
     INNER JOIN tb_usuario c ON c.id_usuario=av.fk_usuario
     WHERE u.fk_salao=:idSalao ${filtro}
     ORDER BY av.dt_criacao DESC, av.id_avaliacao DESC LIMIT 30 OFFSET :deslocamento`,
    { replacements: { ...replacements, deslocamento: (pagina - 1) * 30 }, type: QueryTypes.SELECT },
  );
  resposta.status(200).json({ resumo, avaliacoes, pagina, temMais: pagina * 30 < Number(resumo.quantidade) });
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
  const resumo = await bancoDeDados.query(`SELECT COALESCE(SUM(CASE WHEN a.cd_status IN ('AGENDADO','REALIZADO') THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosAtivos, COALESCE(SUM(CASE WHEN a.cd_status='CANCELADO' THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosCancelados, COALESCE(SUM(CASE WHEN a.cd_status='NAO_COMPARECEU' THEN 1 ELSE 0 END),0) AS quantidadeNaoCompareceu, COALESCE(SUM(CASE WHEN a.cd_status='AGENDADO' THEN a.vl_servico_agendado ELSE 0 END),0) AS faturamento FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade WHERE ${condicaoFiltros}`, { replacements: filtros, type: QueryTypes.SELECT });
  const servicosMaisSolicitados = await bancoDeDados.query(`SELECT a.nm_servico_agendado AS servico, COUNT(*) AS quantidade FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade WHERE ${condicaoFiltros} GROUP BY a.nm_servico_agendado ORDER BY quantidade DESC LIMIT 3`, { replacements: filtros, type: QueryTypes.SELECT });
  const proximosAtendimentos = await bancoDeDados.query(`SELECT a.dt_inicio AS dataHoraInicio, a.nm_servico_agendado AS servico, COALESCE(c.nm_usuario, cs.nm_cliente) AS cliente FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade LEFT JOIN tb_usuario c ON c.id_usuario=a.fk_usuario LEFT JOIN tb_cliente_salao cs ON cs.id_cliente_salao=a.fk_cliente_salao WHERE ${condicaoFiltros} AND a.dt_inicio>=NOW() AND a.cd_status='AGENDADO' ORDER BY a.dt_inicio LIMIT 5`, { replacements: filtros, type: QueryTypes.SELECT });
  const [filiais, servicos, funcionarios] = await Promise.all([bancoDeDados.query('SELECT id_unidade AS idUnidade, nm_unidade AS nome FROM tb_unidade WHERE fk_salao=:idSalao AND st_ativo=TRUE ORDER BY nm_unidade', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }), bancoDeDados.query('SELECT s.id_servico AS idServico, s.nm_servico AS nome FROM tb_servico s INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade WHERE u.fk_salao=:idSalao AND s.st_ativo=TRUE ORDER BY s.nm_servico', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }), bancoDeDados.query('SELECT f.id_funcionario AS idFuncionario, f.nm_funcionario AS nome FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE ORDER BY f.nm_funcionario', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT })]);
  resposta.status(200).json({ resumo: resumo[0], servicosMaisSolicitados, proximosAtendimentos, filtros: { dataInicio, dataFim, idUnidade, idServico, idFuncionario }, opcoesFiltros: { filiais, servicos, funcionarios } });
  } catch (erro) {
    console.error('[Indicadores salão] Falha ao carregar.', { mensagem: erro.message, parametros: requisicao.query });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar os indicadores do salão.' });
  }
}

function dataAtualSaoPaulo() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function deslocarDataIso(dataIso, quantidadeDias) {
  const data = new Date(`${dataIso}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + quantidadeDias);
  return data.toISOString().slice(0, 10);
}

function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

async function indicadoresPremium(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario);
  if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const assinatura = await obterAssinaturaSalao(salao.idSalao);
  if (!resumoAssinatura(assinatura).temAcessoPremium) {
    resposta.status(403).json({ mensagem: 'O dashboard avançado está disponível para assinantes Premium.' }); return;
  }
  try {
    const idUnidade = Number(requisicao.query.idUnidade) || 0;
    const idServico = Number(requisicao.query.idServico) || 0;
    const idFuncionario = Number(requisicao.query.idFuncionario) || 0;
    const hoje = dataAtualSaoPaulo();
    let dataInicio = dataIsoValida(requisicao.query.dataInicio) ? requisicao.query.dataInicio : null;
    let dataFim = dataIsoValida(requisicao.query.dataFim) ? requisicao.query.dataFim : null;
    if (!dataInicio && !dataFim) { dataFim = hoje; dataInicio = deslocarDataIso(hoje, -29); }
    else if (!dataInicio) dataInicio = deslocarDataIso(dataFim, -29);
    else if (!dataFim) dataFim = hoje;
    if (dataInicio > dataFim) { resposta.status(400).json({ mensagem: 'A data inicial deve ser anterior ou igual à data final.' }); return; }
    const quantidadeDiasPeriodo = Math.floor((new Date(`${dataFim}T00:00:00.000Z`) - new Date(`${dataInicio}T00:00:00.000Z`)) / 86_400_000) + 1;
    const dataFimAnterior = deslocarDataIso(dataInicio, -1);
    const dataInicioAnterior = deslocarDataIso(dataFimAnterior, -(quantidadeDiasPeriodo - 1));
    const filtros = { idSalao: salao.idSalao, idServico, idFuncionario };
    const condicoes = ['u.fk_salao=:idSalao'];
    if (idUnidade) { filtros.idUnidade = idUnidade; condicoes.push('a.fk_unidade=:idUnidade'); }
    const filtroItem = '(:idServico = 0 OR item.fk_servico=:idServico) AND (:idFuncionario = 0 OR item.fk_funcionario=:idFuncionario)';
    if (idServico || idFuncionario) condicoes.push(`EXISTS (SELECT 1 FROM vw_servico_atendimento item WHERE item.id_agendamento=a.id_agendamento AND ${filtroItem})`);
    const valorAtendimento = `(SELECT SUM(item.valor) FROM vw_servico_atendimento item WHERE item.id_agendamento=a.id_agendamento AND ${filtroItem})`;
    const quantidadeServicos = `(SELECT COUNT(*) FROM vw_servico_atendimento item WHERE item.id_agendamento=a.id_agendamento AND ${filtroItem})`;
    const valorExtras = `(SELECT COALESCE(SUM(item.vl_cobrado),0) FROM tb_agendamento_servico_adicional item WHERE item.fk_agendamento=a.id_agendamento AND ${filtroItem})`;
    const condicoesItens = ['u.fk_salao=:idSalao', filtroItem, ...(idUnidade ? ['a.fk_unidade=:idUnidade'] : [])];
    const condicaoBase = condicoes.join(' AND ');
    const condicoesAgendamentos = [...condicoes];
    if (dataInicio) { filtros.dataInicio = dataInicio; condicoesAgendamentos.push('DATE(a.dt_inicio)>=:dataInicio'); }
    if (dataFim) { filtros.dataFim = dataFim; condicoesAgendamentos.push('DATE(a.dt_inicio)<=:dataFim'); }
    const condicaoAgendamentos = condicoesAgendamentos.join(' AND ');
    const periodoAgendamento = [dataInicio ? 'DATE(a.dt_inicio)>=:dataInicio' : null, dataFim ? 'DATE(a.dt_inicio)<=:dataFim' : null].filter(Boolean).join(' AND ');
    const restricaoAgendamento = periodoAgendamento ? ` AND ${periodoAgendamento}` : '';
    const periodoCancelamento = [dataInicio ? 'DATE(COALESCE(a.dt_cancelamento,a.dt_inicio))>=:dataInicio' : null, dataFim ? 'DATE(COALESCE(a.dt_cancelamento,a.dt_inicio))<=:dataFim' : null].filter(Boolean).join(' AND ');
    const restricaoCancelamento = periodoCancelamento ? ` AND ${periodoCancelamento}` : '';
    const periodoRealizacao = [dataInicio ? 'DATE(a.dt_realizacao)>=:dataInicio' : null, dataFim ? 'DATE(a.dt_realizacao)<=:dataFim' : null].filter(Boolean).join(' AND ');
    const restricaoRealizacao = periodoRealizacao ? ` AND ${periodoRealizacao}` : '';
    const condicaoRealizacoes = [...condicoes, 'a.cd_status=\'REALIZADO\'', ...(dataInicio ? ['DATE(a.dt_realizacao)>=:dataInicio'] : []), ...(dataFim ? ['DATE(a.dt_realizacao)<=:dataFim'] : [])].join(' AND ');
    const periodoAnteriorAgendamentos = 'DATE(a.dt_inicio) BETWEEN :dataInicioAnterior AND :dataFimAnterior';
    const periodoAnteriorCancelamentos = 'DATE(COALESCE(a.dt_cancelamento,a.dt_inicio)) BETWEEN :dataInicioAnterior AND :dataFimAnterior';
    const periodoAnteriorRealizacoes = 'DATE(a.dt_realizacao) BETWEEN :dataInicioAnterior AND :dataFimAnterior';
    const filtrosComparacao = { ...filtros, dataInicioAnterior, dataFimAnterior };
    const idClienteSql = "COALESCE(CONCAT('U:',a.fk_usuario),CONCAT('S:',a.fk_cliente_salao))";
    const [resumo, receitaPrevista, comparacaoAnterior, receitaPorDia, receitaPorServico, receitaPorServicoAnterior, agendamentosPorDia, mapaCalor, clientes, clientesInativos, profissionais, disponibilidade, filiais, servicos, funcionarios, cancelamentosPorMotivo, analiseAgendamentos] = await Promise.all([
      bancoDeDados.query(`SELECT
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN ${valorAtendimento} ELSE 0 END),0) AS receitaRealizada,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN 1 ELSE 0 END),0) AS atendimentosRealizados,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN ${contagemServicosExtrasSql} ELSE 0 END),0) AS quantidadeServicosExtras,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN ${quantidadeServicos} ELSE 0 END),0) AS quantidadeServicosRealizados,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN ${valorExtras} ELSE 0 END),0) AS receitaServicosExtras,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeComparecimentos,
        COALESCE(SUM(CASE WHEN a.cd_status IN ('AGENDADO','REALIZADO')${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosAtivos,
        COALESCE(SUM(CASE WHEN a.cd_status='CANCELADO'${restricaoCancelamento} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosCancelados,
        COALESCE(SUM(CASE WHEN a.cd_status='NAO_COMPARECEU'${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeNaoCompareceu,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosRealizados,
        COALESCE(SUM(CASE WHEN a.cd_status='AGENDADO'${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosMarcados,
        COALESCE(SUM(CASE WHEN a.cd_status='AGENDADO' AND a.dt_inicio<NOW()${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeAtendimentosAConfirmar,
        COALESCE(SUM(CASE WHEN 1=1${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosTotal,
        COALESCE(SUM(CASE WHEN (a.dt_inicio<=NOW() OR a.cd_status='CANCELADO')${restricaoAgendamento} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosElegiveis
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        WHERE ${condicaoBase}`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT COALESCE(SUM(a.vl_servico_agendado),0) AS receitaPrevista
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        WHERE ${condicaoBase} AND a.cd_status='AGENDADO' AND a.dt_inicio>=NOW()
          AND a.dt_inicio<DATE_ADD(NOW(), INTERVAL 30 DAY)`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT
        COALESCE(SUM(CASE WHEN ${periodoAnteriorRealizacoes} AND a.cd_status='REALIZADO' THEN ${valorAtendimento} ELSE 0 END),0) AS receitaRealizada,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorRealizacoes} AND a.cd_status='REALIZADO' THEN 1 ELSE 0 END),0) AS atendimentosRealizados,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorRealizacoes} AND a.cd_status='REALIZADO' THEN ${contagemServicosExtrasSql} ELSE 0 END),0) AS quantidadeServicosExtras,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorRealizacoes} AND a.cd_status='REALIZADO' THEN ${quantidadeServicos} ELSE 0 END),0) AS quantidadeServicosRealizados,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorRealizacoes} AND a.cd_status='REALIZADO' THEN ${valorExtras} ELSE 0 END),0) AS receitaServicosExtras,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorAgendamentos} AND a.cd_status='REALIZADO' THEN 1 ELSE 0 END),0) AS quantidadeComparecimentos,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorAgendamentos} AND a.cd_status='NAO_COMPARECEU' THEN 1 ELSE 0 END),0) AS quantidadeNaoCompareceu,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorAgendamentos} THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosTotal,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorAgendamentos} AND a.cd_status='AGENDADO' AND a.dt_inicio<NOW() THEN 1 ELSE 0 END),0) AS quantidadeAtendimentosAConfirmar,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorAgendamentos} AND (a.dt_inicio<=NOW() OR a.cd_status='CANCELADO') THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosElegiveis,
        COALESCE(SUM(CASE WHEN ${periodoAnteriorCancelamentos} AND a.cd_status='CANCELADO' THEN 1 ELSE 0 END),0) AS quantidadeAgendamentosCancelados
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        WHERE ${condicaoBase}`, { replacements: filtrosComparacao, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT DATE_FORMAT(a.dt_realizacao,'%Y-%m-%d') AS data, SUM(item.valor) AS valor
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        INNER JOIN vw_servico_atendimento item ON item.id_agendamento=a.id_agendamento
        WHERE ${condicoesItens.join(' AND ')} AND a.cd_status='REALIZADO'${restricaoRealizacao}
        GROUP BY DATE_FORMAT(a.dt_realizacao,'%Y-%m-%d') ORDER BY DATE_FORMAT(a.dt_realizacao,'%Y-%m-%d')`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT item.servico, SUM(item.valor) AS valor
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        INNER JOIN vw_servico_atendimento item ON item.id_agendamento=a.id_agendamento
        WHERE ${condicoesItens.join(' AND ')} AND a.cd_status='REALIZADO'${restricaoRealizacao}
        GROUP BY item.servico ORDER BY valor DESC LIMIT 8`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT item.servico, SUM(item.valor) AS valor
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        INNER JOIN vw_servico_atendimento item ON item.id_agendamento=a.id_agendamento
        WHERE ${condicoesItens.join(' AND ')} AND ${periodoAnteriorRealizacoes} AND a.cd_status='REALIZADO'
        GROUP BY item.servico ORDER BY valor DESC LIMIT 8`, { replacements: filtrosComparacao, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT DATE_FORMAT(a.dt_inicio,'%Y-%m-%d') AS data, COUNT(*) AS quantidade
        , SUM(CASE WHEN a.cd_status='AGENDADO' THEN 1 ELSE 0 END) AS agendados
        , SUM(CASE WHEN a.cd_status='REALIZADO' THEN 1 ELSE 0 END) AS realizados
        , SUM(CASE WHEN a.cd_status='CANCELADO' THEN 1 ELSE 0 END) AS cancelados
        , SUM(CASE WHEN a.cd_status='NAO_COMPARECEU' THEN 1 ELSE 0 END) AS naoCompareceram
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        WHERE ${condicaoAgendamentos}
        GROUP BY DATE_FORMAT(a.dt_inicio,'%Y-%m-%d') ORDER BY DATE_FORMAT(a.dt_inicio,'%Y-%m-%d')`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT DAYOFWEEK(a.dt_inicio)-1 AS diaSemana, HOUR(a.dt_inicio) AS hora,
        SUM(CASE WHEN a.cd_status IN ('AGENDADO','REALIZADO') THEN 1 ELSE 0 END) AS quantidade,
        SUM(CASE WHEN a.cd_status='CANCELADO' THEN 1 ELSE 0 END) AS cancelados
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        WHERE ${condicaoAgendamentos}
        GROUP BY DAYOFWEEK(a.dt_inicio)-1, HOUR(a.dt_inicio)
        ORDER BY DAYOFWEEK(a.dt_inicio)-1, HOUR(a.dt_inicio)`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT COUNT(*) AS clientesAtendidos,
        COALESCE(SUM(CASE WHEN DATE(h.primeiroAtendimento) BETWEEN :dataInicio AND :dataFim THEN 1 ELSE 0 END),0) AS clientesNovos,
        COALESCE(SUM(CASE WHEN DATE(h.primeiroAtendimento) < :dataInicio THEN 1 ELSE 0 END),0) AS clientesRecorrentes
        FROM (SELECT DISTINCT ${idClienteSql} AS idCliente
          FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
          WHERE ${condicaoRealizacoes}
            AND (a.fk_usuario IS NOT NULL OR a.fk_cliente_salao IS NOT NULL)) periodo
        INNER JOIN (SELECT COALESCE(CONCAT('U:',a.fk_usuario),CONCAT('S:',a.fk_cliente_salao)) AS idCliente,
            MIN(a.dt_realizacao) AS primeiroAtendimento
          FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
          WHERE u.fk_salao=:idSalao AND a.cd_status='REALIZADO'
            AND (a.fk_usuario IS NOT NULL OR a.fk_cliente_salao IS NOT NULL)
          GROUP BY COALESCE(CONCAT('U:',a.fk_usuario),CONCAT('S:',a.fk_cliente_salao))) h ON h.idCliente=periodo.idCliente`, { replacements: filtros, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT COALESCE(CONCAT('U:',a.fk_usuario),CONCAT('S:',a.fk_cliente_salao)) AS idCliente,
          MAX(COALESCE(c.nm_usuario,cs.nm_cliente)) AS cliente,
          MAX(COALESCE(c.ds_email,cs.ds_email)) AS email,
          MAX(cs.nu_telefone) AS telefone,
          MAX(a.dt_realizacao) AS ultimoAtendimento
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        LEFT JOIN tb_usuario c ON c.id_usuario=a.fk_usuario
        LEFT JOIN tb_cliente_salao cs ON cs.id_cliente_salao=a.fk_cliente_salao
        WHERE u.fk_salao=:idSalao AND a.cd_status='REALIZADO'
          AND (a.fk_usuario IS NOT NULL OR a.fk_cliente_salao IS NOT NULL)
        GROUP BY COALESCE(CONCAT('U:',a.fk_usuario),CONCAT('S:',a.fk_cliente_salao))
        HAVING MAX(a.dt_realizacao)<DATE_SUB(NOW(), INTERVAL 90 DAY)
        ORDER BY ultimoAtendimento ASC LIMIT 20`, { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT f.id_funcionario AS idFuncionario, f.nm_funcionario AS profissional,
        COUNT(DISTINCT CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN a.id_agendamento END) AS atendimentosRealizados,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN item.minutos_reservados ELSE 0 END),0) AS minutosAtendimentoRealizado,
        COUNT(DISTINCT CASE WHEN a.cd_status='CANCELADO'${restricaoCancelamento} THEN a.id_agendamento END) AS cancelamentos,
        COALESCE(SUM(CASE WHEN a.cd_status='REALIZADO'${restricaoRealizacao} THEN item.valor ELSE 0 END),0) AS receitaRealizada
        FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade
        LEFT JOIN vw_servico_atendimento item ON item.fk_funcionario=f.id_funcionario
          AND (:idServico = 0 OR item.fk_servico=:idServico)
        LEFT JOIN tb_agendamento a ON a.id_agendamento=item.id_agendamento
        WHERE u.fk_salao=:idSalao AND (:idUnidade = 0 OR f.fk_unidade=:idUnidade)
          AND (:idFuncionario = 0 OR f.id_funcionario=:idFuncionario)
        GROUP BY f.id_funcionario, f.nm_funcionario ORDER BY atendimentosRealizados DESC, receitaRealizada DESC`,
        { replacements: { ...filtros, idUnidade }, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT f.id_funcionario AS idFuncionario, d.nr_dia_semana AS diaSemana,
        SUM(TIME_TO_SEC(TIMEDIFF(d.hr_fim,d.hr_inicio))/60) AS minutosDisponiveis
        FROM tb_disponibilidade_funcionario d INNER JOIN tb_funcionario f ON f.id_funcionario=d.fk_funcionario
        INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade
        WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE AND d.st_ativo=TRUE
          AND (:idUnidade = 0 OR f.fk_unidade = :idUnidade) AND (:idFuncionario = 0 OR f.id_funcionario = :idFuncionario)
        GROUP BY f.id_funcionario, d.nr_dia_semana`, { replacements: { idSalao: salao.idSalao, idUnidade, idFuncionario }, type: QueryTypes.SELECT }),
      bancoDeDados.query('SELECT id_unidade AS idUnidade, nm_unidade AS nome FROM tb_unidade WHERE fk_salao=:idSalao AND st_ativo=TRUE ORDER BY nm_unidade', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }),
      bancoDeDados.query('SELECT s.id_servico AS idServico, s.nm_servico AS nome FROM tb_servico s INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade WHERE u.fk_salao=:idSalao AND s.st_ativo=TRUE ORDER BY s.nm_servico', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }),
      bancoDeDados.query('SELECT f.id_funcionario AS idFuncionario, f.nm_funcionario AS nome FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE ORDER BY f.nm_funcionario', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT }),
      bancoDeDados.query(`SELECT
        CASE a.cd_motivo_cancelamento
          WHEN 'BLOQUEIO_AGENDA' THEN 'Bloqueio da agenda'
          WHEN 'INDISPONIBILIDADE_PROFISSIONAL' THEN 'Indisponibilidade do profissional'
          WHEN 'SOLICITACAO_CLIENTE' THEN 'Solicitação do cliente'
          WHEN 'PROBLEMA_UNIDADE' THEN 'Problema na unidade'
          WHEN 'ERRO_AGENDAMENTO' THEN 'Erro no agendamento'
          WHEN 'OUTRO' THEN 'Outro motivo'
          ELSE 'Sem classificação'
        END AS motivo,
        COUNT(*) AS quantidade
        FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
        WHERE ${condicaoBase} AND a.cd_status='CANCELADO'${restricaoCancelamento}
        GROUP BY motivo ORDER BY quantidade DESC, motivo`, { replacements: filtros, type: QueryTypes.SELECT }),
      requisicao.query.incluirAnalise === 'false' ? Promise.resolve([]) : consultarLinhasAnaliticas(
        normalizarConsultaAnalitica({ dataInicio, dataFim, idUnidade, idServico, idFuncionario }, salao.idSalao),
      ),
    ]);
    const ocorrenciasSemana = Array(7).fill(Math.floor(quantidadeDiasPeriodo / 7));
    const diasRestantes = quantidadeDiasPeriodo % 7;
    const diaSemanaInicial = new Date(`${dataInicio}T12:00:00.000Z`).getUTCDay();
    for (let indice = 0; indice < diasRestantes; indice += 1) ocorrenciasSemana[(diaSemanaInicial + indice) % 7] += 1;
    const minutosDisponiveisPorProfissional = new Map();
    for (const linha of disponibilidade) {
      const id = String(linha.idFuncionario);
      const minutos = Number(linha.minutosDisponiveis ?? 0) * ocorrenciasSemana[Number(linha.diaSemana)];
      minutosDisponiveisPorProfissional.set(id, (minutosDisponiveisPorProfissional.get(id) ?? 0) + minutos);
    }
    const desempenhoProfissionais = profissionais.map((profissional) => {
      const minutosDisponiveis = minutosDisponiveisPorProfissional.get(String(profissional.idFuncionario)) ?? 0;
      const horasDisponiveis = minutosDisponiveis / 60;
      const minutosAtendidos = Number(profissional.minutosAtendimentoRealizado ?? 0);
      return {
        ...profissional,
        ticketMedio: Number(profissional.atendimentosRealizados) ? Number(profissional.receitaRealizada) / Number(profissional.atendimentosRealizados) : 0,
        horasDisponiveisEstimadas: horasDisponiveis,
        ocupacaoEstimada: minutosDisponiveis ? (minutosAtendidos / minutosDisponiveis) * 100 : null,
      };
    });
    resumo[0].receitaPrevista = receitaPrevista[0].receitaPrevista;
    // Comparecimento usa a mesma data agendada para realizados e ausências.
    // Os agregados partem dos atendimentos, evitando multiplicação pelos extras.
    for (const periodo of [resumo[0], comparacaoAnterior[0]]) {
      const realizados = Number(periodo.quantidadeComparecimentos);
      const encerrados = realizados + Number(periodo.quantidadeNaoCompareceu);
      periodo.taxaComparecimento = encerrados ? realizados / encerrados * 100 : null;
    }
    const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const insights = [];
    const taxaCancelamentoAtual = Number(resumo[0].quantidadeAgendamentosElegiveis)
      ? (Number(resumo[0].quantidadeAgendamentosCancelados) / Number(resumo[0].quantidadeAgendamentosElegiveis)) * 100 : 0;
    const taxaCancelamentoPassada = Number(comparacaoAnterior[0].quantidadeAgendamentosElegiveis)
      ? (Number(comparacaoAnterior[0].quantidadeAgendamentosCancelados) / Number(comparacaoAnterior[0].quantidadeAgendamentosElegiveis)) * 100 : 0;
    if (Number(resumo[0].quantidadeAtendimentosAConfirmar) > 0) {
      insights.push({ tipo: 'acao', titulo: 'Confirme atendimentos concluídos', descricao: `${resumo[0].quantidadeAtendimentosAConfirmar} agendamento(s) passado(s) ainda aguardam confirmação na Agenda.` });
    }
    if (taxaCancelamentoAtual >= 15 && taxaCancelamentoAtual > taxaCancelamentoPassada) {
      insights.push({ tipo: 'alerta', titulo: 'Cancelamentos em alta', descricao: `A taxa está em ${taxaCancelamentoAtual.toFixed(1).replace('.', ',')}%, ${ (taxaCancelamentoAtual - taxaCancelamentoPassada).toFixed(1).replace('.', ',')} p.p. acima do período anterior.` });
    }
    const horarioMaisProcurado = [...mapaCalor].sort((a, b) => Number(b.quantidade) - Number(a.quantidade))[0];
    if (horarioMaisProcurado && Number(horarioMaisProcurado.quantidade) > 0) {
      insights.push({ tipo: 'info', titulo: 'Horário com maior procura', descricao: `O pico foi ${diasSemana[Number(horarioMaisProcurado.diaSemana)]}, às ${String(horarioMaisProcurado.hora).padStart(2, '0')}h, com ${horarioMaisProcurado.quantidade} atendimento(s) não cancelado(s).` });
    }
    const receitaAnteriorPorServico = new Map(receitaPorServicoAnterior.map((item) => [item.servico, Number(item.valor)]));
    const variacoesServico = receitaPorServico.map((item) => {
      const anteriorServico = receitaAnteriorPorServico.get(item.servico);
      return anteriorServico > 0 ? { ...item, variacao: ((Number(item.valor) - anteriorServico) / anteriorServico) * 100 } : null;
    }).filter((item) => item && Math.abs(item.variacao) >= 20).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));
    for (const servico of variacoesServico.slice(0, 2)) {
      insights.push({ tipo: servico.variacao > 0 ? 'positivo' : 'alerta', titulo: servico.variacao > 0 ? 'Serviço em crescimento' : 'Serviço em queda', descricao: `${servico.servico}: receita ${servico.variacao > 0 ? 'subiu' : 'caiu'} ${Math.abs(servico.variacao).toFixed(0)}% em relação ao período anterior.` });
    }
    const profissionaisComBaixaOcupacao = desempenhoProfissionais.filter((item) => item.ocupacaoEstimada !== null && item.horasDisponiveisEstimadas >= 10 && item.ocupacaoEstimada < 30);
    if (profissionaisComBaixaOcupacao.length) {
      const nomes = profissionaisComBaixaOcupacao.slice(0, 3).map((item) => item.profissional).join(', ');
      insights.push({ tipo: 'acao', titulo: 'Revise horários disponíveis', descricao: `${nomes} tiveram ocupação estimada abaixo de 30% da disponibilidade semanal cadastrada.` });
    }
    if (clientesInativos.length) {
      insights.push({ tipo: 'acao', titulo: 'Retome contato com clientes inativos', descricao: `A lista mostra até 20 clientes sem atendimento concluído há pelo menos 90 dias.` });
    }
    if (!insights.length) insights.push({ tipo: 'positivo', titulo: 'Nenhum alerta para este período', descricao: 'Não encontramos variações relevantes pelas regras atuais do dashboard.' });
    resposta.status(200).json({
      resumo: resumo[0], comparacaoAnterior: comparacaoAnterior[0], receitaPorDia, receitaPorServico,
      receitaPorServicoAnterior, agendamentosPorDia, mapaCalor, clientes: clientes[0], clientesInativos,
      cancelamentosPorMotivo, analiseAgendamentos,
      profissionais: desempenhoProfissionais, insights,
      periodoComparacao: { dataInicioAnterior, dataFimAnterior },
      filtros: { dataInicio, dataFim, idUnidade, idServico, idFuncionario },
      opcoesFiltros: { filiais, servicos, funcionarios },
    });
  } catch (erro) {
    console.error('[Dashboard Premium salão] Falha ao carregar.', { mensagem: erro.message, parametros: requisicao.query });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar o dashboard Premium.' });
  }
}

async function analiticoPremium(requisicao, resposta, exportar = false) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoPremiumAdministrador(administrador.idUsuario, resposta, 'O dashboard avançado está disponível para assinantes Premium.');
  if (!salao) return;
  try {
    const consulta = normalizarConsultaAnalitica(requisicao.query, salao.idSalao);
    if (exportar) {
      const formato = requisicao.query.formato ?? 'csv';
      if (!['csv', 'xlsx'].includes(formato)) throw Object.assign(new Error('Formato de exportação inválido.'), { status: 400 });
      if (formato === 'xlsx') await exportarAnaliticoExcel(consulta, resposta);
      else await exportarAnaliticoCsv(consulta, resposta);
    }
    else resposta.status(200).json(await consultarAnalitico(consulta));
  } catch (erro) {
    console.error('[Analítico Premium] Falha na consulta.', { mensagem: erro.message });
    if (resposta.headersSent) { resposta.destroy(erro); return; }
    resposta.status(erro.status ?? 500).json({ mensagem: erro.status === 400 ? erro.message : 'Não foi possível carregar o analítico Premium.' });
  }
}

function resumoAssinatura(assinatura) {
  if (!assinatura) return { plano: 'BASICO', status: 'BASICO', temAcessoPremium: false };
  const dataFimAcesso = assinatura.dataProximaCobranca ? new Date(assinatura.dataProximaCobranca) : null;
  const canceladaComCicloVigente = ['CANCELADA', 'CANCELAMENTO_AGENDADO'].includes(assinatura.status)
    && dataFimAcesso && dataFimAcesso > new Date();
  const temAcessoPremium = ['AUTORIZADA', 'EM_TESTE'].includes(assinatura.status) || canceladaComCicloVigente;
  return { ...assinatura, plano: temAcessoPremium ? 'PREMIUM' : 'BASICO', temAcessoPremium };
}

function assinaturaBloqueiaNovaContratacao(assinatura) {
  return ['PENDENTE', 'PAUSADA', 'PAGAMENTO_PENDENTE'].includes(assinatura?.status)
    || (assinatura?.status === 'CANCELAMENTO_AGENDADO' && resumoAssinatura(assinatura).temAcessoPremium);
}

async function obterAssinaturaSalao(idSalao) {
  const assinaturas = await bancoDeDados.query(
    `SELECT id_assinatura_salao AS idAssinatura, cd_periodicidade AS periodicidade,
            cd_periodicidade_pendente AS periodicidadePendente, cd_status AS status,
            vl_assinatura AS valor, st_teste_gratis AS testeGratis,
            ds_provedor AS provedor, id_preco_provedor AS idPrecoProvedor,
            id_assinatura_provedor AS idAssinaturaProvedor, id_checkout_provedor AS idCheckoutProvedor,
            dt_inicio AS dataInicio,
            dt_proxima_cobranca AS dataProximaCobranca, dt_cancelamento_solicitado AS dataCancelamentoSolicitado
     FROM tb_assinatura_salao WHERE fk_salao=:idSalao
     ORDER BY dt_criacao DESC, id_assinatura_salao DESC LIMIT 1`,
    { replacements: { idSalao }, type: QueryTypes.SELECT },
  );
  return assinaturas[0] ?? null;
}

async function consultarAssinatura(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Cadastre seu salão antes de contratar o Premium.' }); return; }
  let assinatura = await obterAssinaturaSalao(salao.idSalao);
  if (assinatura?.status === 'PENDENTE' && assinatura.idCheckoutProvedor && process.env.ASSINATURA_MODO_TESTE !== 'true') {
    try {
      const checkout = await consultarCheckoutStripe(assinatura.idCheckoutProvedor);
      const idAssinatura = typeof checkout.subscription === 'string' ? checkout.subscription : checkout.subscription?.id;
      if (idAssinatura) await sincronizarAssinaturaStripe(idAssinatura, checkout.id);
      else if (checkout.status === 'expired') {
        await bancoDeDados.query("UPDATE tb_assinatura_salao SET cd_status='CANCELADA', dt_cancelamento=NOW(), dt_atualizacao=NOW() WHERE id_assinatura_salao=:idAssinatura", { replacements: { idAssinatura: assinatura.idAssinatura } });
      }
      assinatura = await obterAssinaturaSalao(salao.idSalao);
    } catch (erro) {
      console.error('[Assinatura] Falha ao atualizar o estado no Stripe.', { mensagem: erro.message, idSalao: salao.idSalao });
      resposta.status(502).json({ mensagem: 'Não foi possível atualizar o estado com o Stripe. Tente novamente.' });
      return;
    }
  }
  resposta.status(200).json({
    modoTeste: process.env.ASSINATURA_MODO_TESTE === 'true',
    oferta: obterOfertaPremium(),
    assinatura: resumoAssinatura(assinatura),
  });
}

async function ativarAssinaturaTeste(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Cadastre seu salão antes de ativar o Premium.' }); return; }
  if (process.env.ASSINATURA_MODO_TESTE !== 'true') {
    resposta.status(403).json({ mensagem: 'A ativação direta está disponível somente no modo de teste.' });
    return;
  }

  const periodicidade = String(requisicao.body?.periodicidade ?? '').toUpperCase();
  try {
    const atual = await obterAssinaturaSalao(salao.idSalao);
    if (resumoAssinatura(atual).temAcessoPremium) { resposta.status(409).json({ mensagem: 'Seu salão já possui uma assinatura Premium ativa.' }); return; }
    if (assinaturaBloqueiaNovaContratacao(atual)) { resposta.status(409).json({ mensagem: 'Já existe uma assinatura em andamento. Atualize o status ou resolva essa assinatura antes de iniciar outra contratação.' }); return; }
    const plano = obterDadosPlanoPremium(periodicidade);
    const assinatura = await ativarAssinaturaPremium({
      idSalao: salao.idSalao,
      periodicidade,
      valor: plano.valor,
    });
    resposta.status(200).json({ mensagem: 'Premium ativado para teste.', assinatura: resumoAssinatura(assinatura) });
  } catch (erro) {
    console.error('[Assinatura] Falha ao ativar Premium para teste.', { mensagem: erro.message, periodicidade, idSalao: salao.idSalao });
    resposta.status(400).json({ mensagem: erro.message });
  }
}

async function iniciarCheckoutAssinatura(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Cadastre seu salão antes de contratar o Premium.' }); return; }
  const periodicidade = String(requisicao.body?.periodicidade ?? '').toUpperCase();
  let referenciaExterna = null;
  let idCheckoutStripe = null;
  let cancelamentoCheckoutFalhou = false;
  try {
    const atual = await obterAssinaturaSalao(salao.idSalao);
    if (resumoAssinatura(atual).temAcessoPremium) { resposta.status(409).json({ mensagem: 'Seu salão já possui uma assinatura Premium ativa.' }); return; }
    if (assinaturaBloqueiaNovaContratacao(atual)) { resposta.status(409).json({ mensagem: 'Já existe uma assinatura em andamento. Atualize o status ou resolva essa assinatura antes de iniciar outra contratação.' }); return; }
    const dadosPlano = obterDadosPlanoPremium(periodicidade);
    const saloes = await bancoDeDados.query('SELECT st_teste_premium_utilizado AS testeUtilizado FROM tb_salao WHERE id_salao=:idSalao LIMIT 1', { replacements: { idSalao: salao.idSalao }, type: QueryTypes.SELECT });
    const testeGratis = !saloes[0]?.testeUtilizado;
    referenciaExterna = randomUUID();
    await bancoDeDados.query(
      `INSERT INTO tb_assinatura_salao (fk_salao, cd_periodicidade, cd_status, vl_assinatura, st_teste_gratis, ds_provedor, id_preco_provedor, ds_referencia_externa)
       VALUES (:idSalao, :periodicidade, 'PENDENTE', :valor, :testeGratis, 'STRIPE', :idPreco, :referenciaExterna)`,
      { replacements: { idSalao: salao.idSalao, periodicidade, valor: dadosPlano.valor, testeGratis, idPreco: obterPrecoStripe(periodicidade), referenciaExterna } },
    );
    const checkout = await criarCheckoutAssinatura({
      emailPagador: salao.emailConta,
      periodicidade,
      referenciaExterna,
      testeGratis,
      urlRetorno: `${(process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/salao/assinatura?checkout=retorno`,
    });
    if (!checkout.id || !checkout.url) throw new Error('O Stripe não retornou um link de checkout.');
    idCheckoutStripe = String(checkout.id);
    await bancoDeDados.query('UPDATE tb_assinatura_salao SET id_checkout_provedor=:idCheckout WHERE ds_referencia_externa=:referenciaExterna', { replacements: { idCheckout: idCheckoutStripe, referenciaExterna } });
    resposta.status(201).json({ checkoutUrl: checkout.url });
  } catch (erro) {
    if (idCheckoutStripe) {
      try { await cancelarCheckoutStripe(idCheckoutStripe); }
      catch (erroCancelamento) {
        cancelamentoCheckoutFalhou = true;
        console.error('[Assinatura] Não foi possível encerrar um checkout órfão no Stripe.', { mensagem: erroCancelamento.message });
      }
    }
    if (referenciaExterna && !cancelamentoCheckoutFalhou) await bancoDeDados.query("UPDATE tb_assinatura_salao SET cd_status='CANCELADA', dt_cancelamento=NOW() WHERE ds_referencia_externa=:referenciaExterna AND cd_status='PENDENTE'", { replacements: { referenciaExterna } });
    console.error('[Assinatura] Falha ao iniciar checkout.', { mensagem: erro.message, periodicidade, idSalao: salao.idSalao });
    resposta.status(400).json({ mensagem: erro.message });
  }
}

async function cancelarAssinatura(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const assinatura = await obterAssinaturaSalao(salao.idSalao);
  const checkoutPendente = assinatura?.status === 'PENDENTE';
  const assinaturaTesteLocal = assinatura?.idPrecoProvedor === 'ATIVACAO_TESTE' && !assinatura.idAssinaturaProvedor;
  if (assinaturaTesteLocal) {
    await bancoDeDados.query(`UPDATE tb_assinatura_salao SET cd_status='CANCELADA', dt_proxima_cobranca=NULL, dt_cancelamento=NOW(), dt_atualizacao=NOW() WHERE id_assinatura_salao=:idAssinatura`, { replacements: { idAssinatura: assinatura.idAssinatura } });
    resposta.status(200).json({ mensagem: 'Assinatura local de teste encerrada. Agora você pode contratar pelo Stripe.', assinatura: resumoAssinatura(await obterAssinaturaSalao(salao.idSalao)) });
    return;
  }
  if (checkoutPendente && assinatura?.idCheckoutProvedor) {
    try {
      const resultado = await cancelarCheckoutStripe(assinatura.idCheckoutProvedor);
      if (resultado.object === 'subscription') {
        await sincronizarAssinaturaStripe(resultado.id, assinatura.idCheckoutProvedor);
        resposta.status(200).json({ mensagem: 'A renovação foi cancelada. O acesso Premium continua até o fim do período vigente.', assinatura: resumoAssinatura(await obterAssinaturaSalao(salao.idSalao)) });
      } else {
        await bancoDeDados.query(`UPDATE tb_assinatura_salao SET cd_status='CANCELADA', dt_cancelamento=NOW(), dt_atualizacao=NOW() WHERE id_assinatura_salao=:idAssinatura`, { replacements: { idAssinatura: assinatura.idAssinatura } });
        resposta.status(200).json({ mensagem: 'Checkout pendente cancelado. Você já pode iniciar uma nova contratação.', assinatura: resumoAssinatura(await obterAssinaturaSalao(salao.idSalao)) });
      }
    } catch (erro) { resposta.status(400).json({ mensagem: erro.message }); }
    return;
  }
  if (!assinatura?.idAssinaturaProvedor || assinatura.provedor !== 'STRIPE' || (!checkoutPendente && !resumoAssinatura(assinatura).temAcessoPremium)) { resposta.status(404).json({ mensagem: 'Não há uma assinatura Premium ativa no Stripe ou checkout pendente para cancelar.' }); return; }
  try {
    const dadosCancelamento = await cancelarAssinaturaStripe(assinatura.idAssinaturaProvedor);
    const fimPeriodo = dadosCancelamento.items?.data?.[0]?.current_period_end ?? dadosCancelamento.current_period_end;
    const dataFimPeriodo = fimPeriodo ? new Date(fimPeriodo * 1000) : assinatura.dataProximaCobranca;
    await bancoDeDados.query(`UPDATE tb_assinatura_salao SET cd_status='CANCELAMENTO_AGENDADO', dt_cancelamento_solicitado=NOW() WHERE id_assinatura_salao=:idAssinatura`, { replacements: { idAssinatura: assinatura.idAssinatura } });
    if (dataFimPeriodo) await bancoDeDados.query('UPDATE tb_assinatura_salao SET dt_proxima_cobranca=:dataFimPeriodo WHERE id_assinatura_salao=:idAssinatura', { replacements: { dataFimPeriodo, idAssinatura: assinatura.idAssinatura } });
    resposta.status(200).json({ mensagem: 'Cancelamento solicitado. O acesso Premium continua até o fim do período já pago.', assinatura: resumoAssinatura(await obterAssinaturaSalao(salao.idSalao)) });
  } catch (erro) { resposta.status(400).json({ mensagem: erro.message }); }
}

async function alterarPeriodicidadeAssinatura(requisicao, resposta) {
  const administrador = await obterAdministradorAutenticado(requisicao, resposta); if (!administrador) return;
  const salao = await obterSalaoAdministrador(administrador.idUsuario); if (!salao) { resposta.status(404).json({ mensagem: 'Salão não encontrado.' }); return; }
  const assinatura = await obterAssinaturaSalao(salao.idSalao);
  const periodicidade = String(requisicao.body?.periodicidade ?? '').toUpperCase();
  if (!assinatura?.idAssinaturaProvedor || assinatura.provedor !== 'STRIPE' || !resumoAssinatura(assinatura).temAcessoPremium) { resposta.status(404).json({ mensagem: 'Não há uma assinatura Premium ativa no Stripe para alterar.' }); return; }
  if (assinatura.periodicidade === periodicidade) { resposta.status(400).json({ mensagem: 'Esta já é a periodicidade da sua assinatura.' }); return; }
  if (assinatura.periodicidadePendente) { resposta.status(409).json({ mensagem: 'Já existe uma troca de periodicidade agendada.' }); return; }
  try {
    await atualizarPeriodicidadeStripe(assinatura.idAssinaturaProvedor, periodicidade);
    await bancoDeDados.query('UPDATE tb_assinatura_salao SET cd_periodicidade_pendente=:periodicidade WHERE id_assinatura_salao=:idAssinatura', { replacements: { periodicidade, idAssinatura: assinatura.idAssinatura } });
    resposta.status(200).json({ mensagem: 'A nova periodicidade será aplicada na próxima renovação.' });
  } catch (erro) { resposta.status(400).json({ mensagem: erro.message }); }
}

roteadorSalao.get('/enderecos/:cep', consultarCep);
roteadorSalao.get('/notificacoes/chave-publica', chavePublicaNotificacoes);
roteadorSalao.get('/notificacoes', consultarNotificacoes);
roteadorSalao.post('/notificacoes/lidas', marcarTodasNotificacoesComoLidas);
roteadorSalao.patch('/notificacoes/:idNotificacao/lida', marcarNotificacaoComoLida);
roteadorSalao.get('/notificacoes/inscricao', consultarInscricaoNotificacoes);
roteadorSalao.post('/notificacoes/inscricao', salvarInscricaoNotificacoes);
roteadorSalao.delete('/notificacoes/inscricao', excluirInscricaoNotificacoes);
roteadorSalao.get('/coordenadas', consultarCoordenadasFilial);
roteadorSalao.post('/saloes', criarSalao); roteadorSalao.get('/saloes/atual', consultarSalao); roteadorSalao.patch('/saloes/atual', atualizarSalao); roteadorSalao.delete('/conta', excluirConta);
roteadorSalao.get('/perfil', consultarPerfil); roteadorSalao.patch('/perfil', atualizarPerfil); roteadorSalao.patch('/senha', alterarSenha);
roteadorSalao.get('/filiais', listarFiliais); roteadorSalao.post('/filiais', (requisicao, resposta) => salvarFilial(requisicao, resposta)); roteadorSalao.patch('/filiais/:idUnidade', (requisicao, resposta) => salvarFilial(requisicao, resposta, Number(requisicao.params.idUnidade))); roteadorSalao.delete('/filiais/:idUnidade', excluirFilial);
roteadorSalao.post('/servicos', criarServico); roteadorSalao.get('/servicos', listarServicos); roteadorSalao.patch('/servicos/:idServico', atualizarServico); roteadorSalao.delete('/servicos/:idServico', excluirServico);
roteadorSalao.post('/funcionarios', criarFuncionario); roteadorSalao.get('/funcionarios', listarFuncionarios); roteadorSalao.patch('/funcionarios/:idFuncionario', atualizarFuncionario); roteadorSalao.delete('/funcionarios/:idFuncionario', excluirFuncionario);
roteadorSalao.get('/disponibilidade', listarDisponibilidade); roteadorSalao.put('/funcionarios/:idFuncionario/disponibilidade', salvarDisponibilidadeFuncionario);
roteadorSalao.post('/bloqueios', criarBloqueio); roteadorSalao.delete('/bloqueios/:idBloqueio', excluirBloqueio);
roteadorSalao.get('/clientes', listarClientes); roteadorSalao.get('/agendamentos', listarAgendamentos); roteadorSalao.get('/agendamentos/horarios', listarHorariosAgendamento); roteadorSalao.post('/agendamentos', criarAgendamentoSalao);
roteadorSalao.patch('/agendamentos/:idAgendamento/confirmar-atendimento', confirmarAtendimentoAgendamento);
roteadorSalao.patch('/agendamentos/:idAgendamento/nao-compareceu', registrarAusenciaAgendamento);
roteadorSalao.patch('/agendamentos/:idAgendamento/cancelar', cancelarAgendamentoSalao);
roteadorSalao.get('/agendamentos/:idAgendamento/horarios-reagendamento', horariosReagendamentoSalao);
roteadorSalao.patch('/agendamentos/:idAgendamento/reagendar', reagendarAgendamentoSalao);
roteadorSalao.get('/avaliacoes', listarAvaliacoesSalao);
roteadorSalao.get('/indicadores/premium/analitico', (req, res) => analiticoPremium(req, res));
roteadorSalao.get('/indicadores/premium/analitico/exportar', (req, res) => analiticoPremium(req, res, true));
roteadorSalao.get('/indicadores', indicadores); roteadorSalao.get('/indicadores/premium', indicadoresPremium);
roteadorSalao.get('/assinatura', consultarAssinatura); roteadorSalao.post('/assinatura/ativar', ativarAssinaturaTeste); roteadorSalao.post('/assinatura/checkout', iniciarCheckoutAssinatura); roteadorSalao.patch('/assinatura/cancelar', cancelarAssinatura); roteadorSalao.patch('/assinatura/periodicidade', alterarPeriodicidadeAssinatura);

export default roteadorSalao;
