import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { obterVersoesDocumentosLegais } from './documentosLegais.js';
import { decifrarDocumento, prepararDocumento } from './documentosProtegidos.js';

const erroAcesso = (mensagem, codigo = 'PERFIL_SEM_PERMISSAO', status = 403) => Object.assign(new Error(mensagem), { status, codigo });

export function validarPerfilLocal(usuario, perfil) {
  if (!usuario?.ativo || usuario.perfil !== perfil) throw erroAcesso('Esta conta não possui acesso a esta área.');
  return usuario;
}

export async function publicarPerfilConfiavel(clienteAdministrativo, identidade, perfil, situacao = 'ATIVA', cadastroConcluido = true) {
  const { error } = await clienteAdministrativo.auth.admin.updateUserById(identidade.id, {
    app_metadata: { ...identidade.app_metadata, agendeaki: { versao: 1, perfil, situacao, cadastroConcluido } },
  });
  if (error) throw Object.assign(new Error('Não foi possível atualizar o perfil confiável no provedor.'), { status: 502 });
}

export async function consultarExclusao(idAutenticacaoExterna) {
  const [operacao] = await bancoDeDados.query(`SELECT id_operacao AS idOperacao, id_usuario AS idUsuario,
    id_salao AS idSalao, id_autenticacao_externa AS idAutenticacaoExterna, cd_etapa AS etapa
    FROM tb_exclusao_conta_salao WHERE id_autenticacao_externa=:idAutenticacaoExterna LIMIT 1`, {
    replacements: { idAutenticacaoExterna }, type: QueryTypes.SELECT,
  });
  return operacao ?? null;
}

export async function sincronizarUsuario({ usuarioSupabase, perfil, permitirExclusao = false }) {
  if (!usuarioSupabase?.id) throw erroAcesso('Sessão inválida.', 'SESSAO_INVALIDA', 401);
  const idAutenticacaoExterna = usuarioSupabase.id;
  const exclusao = await consultarExclusao(idAutenticacaoExterna);
  if (exclusao) {
    if (permitirExclusao && perfil === 'ADMIN_SALAO') return { ...exclusao, exclusaoPendente: true };
    throw erroAcesso('A exclusão desta conta está em andamento.', 'EXCLUSAO_PENDENTE');
  }
  const confiavel = usuarioSupabase.app_metadata?.agendeaki;
  if (confiavel && confiavel.situacao !== 'ATIVA') throw erroAcesso('Esta conta não está ativa.');
  const buscar = () => bancoDeDados.query(`SELECT id_usuario AS idUsuario, tp_usuario AS perfil, st_ativo AS ativo
    FROM tb_usuario WHERE id_autenticacao_externa=:idAutenticacaoExterna LIMIT 1`, {
    replacements: { idAutenticacaoExterna }, type: QueryTypes.SELECT,
  });
  let [usuario] = await buscar();
  if (!usuario) {
    if (!['CLIENTE','ADMIN_SALAO'].includes(perfil)) {
      throw erroAcesso('Esta conta não possui acesso a esta área.', 'PERFIL_SEM_PERMISSAO');
    }
    // Contas criadas antes do perfil confiável podem ser recuperadas pelo dono da
    // identidade autenticada. O perfil solicitado fica vinculado ao UID no MySQL.
    if (confiavel && (confiavel.versao !== 1 || confiavel.perfil !== perfil || confiavel.cadastroConcluido !== true)) {
      throw erroAcesso('Esta conta não possui acesso a esta área.', 'PERFIL_SEM_PERMISSAO');
    }
    const email = usuarioSupabase.email;
    const nome = String(usuarioSupabase.user_metadata?.nome || email).slice(0, 120);
    try {
      await bancoDeDados.query(`INSERT INTO tb_usuario (nm_usuario, ds_email, tp_usuario, id_autenticacao_externa)
        VALUES (:nome, :email, :perfil, :idAutenticacaoExterna)`, {
        replacements: { nome, email, perfil, idAutenticacaoExterna },
      });
    } catch (erro) {
      // Outra requisição pode ter restaurado a mesma identidade. Nunca reassocia por e-mail.
      if ((erro.original?.code ?? erro.parent?.code) !== 'ER_DUP_ENTRY') throw erro;
    }
    [usuario] = await buscar();
    if (!usuario) throw erroAcesso('Este e-mail já está vinculado a outra identidade.', 'IDENTIDADE_EM_CONFLITO', 409);
  }
  validarPerfilLocal(usuario, perfil);
  return { ...usuario, idAutenticacaoExterna };
}

export async function obterPendenciasUsuario(idUsuario, perfil) {
  const dados = await obterDadosCadastraisUsuario(idUsuario);
  const versoes = obterVersoesDocumentosLegais();
  const aceites = await bancoDeDados.query(`SELECT cd_documento FROM tb_aceite_documento_legal
    WHERE fk_usuario=:idUsuario AND ((cd_documento='TERMOS_USO' AND ds_versao=:termos)
      OR (cd_documento='POLITICA_PRIVACIDADE' AND ds_versao=:politica))`, {
    replacements: { idUsuario, termos: versoes.termosDeUso, politica: versoes.politicaPrivacidade }, type: QueryTypes.SELECT,
  });
  const aceiteDocumentosPendente = aceites.length !== 2;
  return { dadosCadastrais: dados, aceiteDocumentosPendente,
    cadastroIncompleto: aceiteDocumentosPendente || !dados?.dataNascimento || !dados?.telefone
      || (perfil === 'ADMIN_SALAO' && (!dados.tipoDocumento || !dados.documento)) };
}

export async function registrarAceitePendente(idUsuario, aceitouDocumentos, transaction) {
  const { aceiteDocumentosPendente } = await obterPendenciasUsuario(idUsuario, 'CLIENTE');
  if (!aceiteDocumentosPendente) return;
  if (aceitouDocumentos !== true) throw erroAcesso('Aceite os Termos de Uso e a Política de Privacidade para continuar.', 'ACEITE_PENDENTE', 400);
  const versoes = obterVersoesDocumentosLegais();
  await bancoDeDados.query(`INSERT IGNORE INTO tb_aceite_documento_legal (fk_usuario, cd_documento, ds_versao)
    VALUES (:idUsuario,'TERMOS_USO',:termos), (:idUsuario,'POLITICA_PRIVACIDADE',:politica)`, {
    replacements: { idUsuario, termos: versoes.termosDeUso, politica: versoes.politicaPrivacidade }, transaction,
  });
}

export async function obterDadosCadastraisUsuario(idUsuario) {
  const usuarios = await bancoDeDados.query(
    `SELECT id_usuario AS idUsuario, nm_usuario AS nome, ds_email AS email, nu_telefone AS telefone,
            DATE_FORMAT(dt_nascimento, '%Y-%m-%d') AS dataNascimento,
            tp_documento AS tipoDocumento, ds_documento_cifrado AS documentoCifrado
     FROM tb_usuario WHERE id_usuario = :idUsuario LIMIT 1`,
    { replacements: { idUsuario }, type: QueryTypes.SELECT },
  );
  if (!usuarios[0]) return null;
  const { documentoCifrado, ...perfil } = usuarios[0];
  const documento = decifrarDocumento(documentoCifrado);
  return { ...perfil, cpf: perfil.tipoDocumento === 'CPF' ? documento : null, documento };
}

export async function atualizarDadosCadastraisUsuario(idUsuario, { cpf = null, dataNascimento, documento = null, nome, telefone = null, tipoDocumento = null, transaction = null }) {
  const tipoEfetivo = tipoDocumento ?? (cpf ? 'CPF' : null);
  const protegido = prepararDocumento(tipoEfetivo, documento ?? cpf);
  await bancoDeDados.query(
    `UPDATE tb_usuario
     SET nm_usuario = COALESCE(:nome, nm_usuario),
         nu_telefone = COALESCE(:telefone, nu_telefone),
         dt_nascimento = :dataNascimento,
         tp_documento = COALESCE(:tipoDocumento, tp_documento),
         ds_documento_cifrado = COALESCE(:documentoCifrado, ds_documento_cifrado),
         ds_documento_indice = COALESCE(:documentoIndice, ds_documento_indice)
     WHERE id_usuario = :idUsuario`,
    { replacements: { ...protegido, dataNascimento, idUsuario, nome: nome?.trim() || null, telefone: telefone?.trim() || null, tipoDocumento: tipoEfetivo }, transaction },
  );
  return transaction ? null : obterDadosCadastraisUsuario(idUsuario);
}
