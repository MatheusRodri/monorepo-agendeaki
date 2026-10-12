import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { decifrarDocumento, prepararDocumento } from './documentosProtegidos.js';

export async function sincronizarUsuario({ cpf = null, dataNascimento = null, documento = null, email, idAutenticacaoExterna, nome, perfil, telefone = null, tipoDocumento = null }) {
  const tipoEfetivo = tipoDocumento ?? (cpf ? 'CPF' : null);
  const protegido = prepararDocumento(tipoEfetivo, documento ?? cpf);
  const usuariosPorAutenticacao = await bancoDeDados.query(
    'SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa = :idAutenticacaoExterna LIMIT 1',
    {
      replacements: { idAutenticacaoExterna },
      type: QueryTypes.SELECT,
    },
  );

  if (usuariosPorAutenticacao.length) {
    return usuariosPorAutenticacao[0];
  }

  const usuariosPorEmail = await bancoDeDados.query(
    'SELECT id_usuario AS idUsuario FROM tb_usuario WHERE ds_email = :email LIMIT 1',
    {
      replacements: { email },
      type: QueryTypes.SELECT,
    },
  );

  if (usuariosPorEmail.length) {
    await bancoDeDados.query(
      `UPDATE tb_usuario
       SET id_autenticacao_externa = :idAutenticacaoExterna,
           nm_usuario = :nome,
           tp_usuario = :perfil,
           nu_telefone = COALESCE(:telefone, nu_telefone),
           dt_nascimento = COALESCE(:dataNascimento, dt_nascimento),
           tp_documento = COALESCE(:tipoDocumento, tp_documento),
           ds_documento_cifrado = COALESCE(:documentoCifrado, ds_documento_cifrado),
           ds_documento_indice = COALESCE(:documentoIndice, ds_documento_indice)
       WHERE id_usuario = :idUsuario`,
      {
        replacements: {
          idAutenticacaoExterna,
          idUsuario: usuariosPorEmail[0].idUsuario,
          dataNascimento,
          ...protegido,
          nome,
          perfil,
          telefone,
          tipoDocumento: tipoEfetivo,
        },
      },
    );

    return usuariosPorEmail[0];
  }

  await bancoDeDados.query(
    `INSERT INTO tb_usuario (nm_usuario, ds_email, nu_telefone, dt_nascimento, tp_documento, ds_documento_cifrado, ds_documento_indice, tp_usuario, id_autenticacao_externa)
     VALUES (:nome, :email, :telefone, :dataNascimento, :tipoDocumento, :documentoCifrado, :documentoIndice, :perfil, :idAutenticacaoExterna)`,
    {
      replacements: { ...protegido, dataNascimento, email, idAutenticacaoExterna, nome, perfil, telefone, tipoDocumento: tipoEfetivo },
    },
  );

  const usuariosInseridos = await bancoDeDados.query(
    'SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa = :idAutenticacaoExterna LIMIT 1',
    {
      replacements: { idAutenticacaoExterna },
      type: QueryTypes.SELECT,
    },
  );

  return usuariosInseridos[0];
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

export async function atualizarDadosCadastraisUsuario(idUsuario, { cpf = null, dataNascimento, documento = null, nome, telefone = null, tipoDocumento = null }) {
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
    { replacements: { ...protegido, dataNascimento, idUsuario, nome: nome?.trim() || null, telefone: telefone?.trim() || null, tipoDocumento: tipoEfetivo } },
  );
  return obterDadosCadastraisUsuario(idUsuario);
}
