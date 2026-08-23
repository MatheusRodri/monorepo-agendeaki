import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

export async function sincronizarUsuario({ cpf = null, dataNascimento = null, documento = null, email, idAutenticacaoExterna, nome, perfil, tipoDocumento = null }) {
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
           nu_cpf = COALESCE(:cpf, nu_cpf),
           dt_nascimento = COALESCE(:dataNascimento, dt_nascimento),
           tp_documento = COALESCE(:tipoDocumento, tp_documento),
           nu_documento = COALESCE(:documento, nu_documento)
       WHERE id_usuario = :idUsuario`,
      {
        replacements: {
          idAutenticacaoExterna,
          idUsuario: usuariosPorEmail[0].idUsuario,
          cpf,
          dataNascimento,
          documento,
          nome,
          perfil,
          tipoDocumento,
        },
      },
    );

    return usuariosPorEmail[0];
  }

  await bancoDeDados.query(
    `INSERT INTO tb_usuario (nm_usuario, ds_email, nu_cpf, dt_nascimento, tp_documento, nu_documento, tp_usuario, id_autenticacao_externa)
     VALUES (:nome, :email, :cpf, :dataNascimento, :tipoDocumento, :documento, :perfil, :idAutenticacaoExterna)`,
    {
      replacements: { cpf, dataNascimento, documento, email, idAutenticacaoExterna, nome, perfil, tipoDocumento },
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
    `SELECT id_usuario AS idUsuario, nm_usuario AS nome, ds_email AS email, nu_cpf AS cpf,
            DATE_FORMAT(dt_nascimento, '%Y-%m-%d') AS dataNascimento,
            tp_documento AS tipoDocumento, nu_documento AS documento
     FROM tb_usuario WHERE id_usuario = :idUsuario LIMIT 1`,
    { replacements: { idUsuario }, type: QueryTypes.SELECT },
  );
  return usuarios[0] ?? null;
}

export async function atualizarDadosCadastraisUsuario(idUsuario, { cpf = null, dataNascimento, documento = null, nome, tipoDocumento = null }) {
  await bancoDeDados.query(
    `UPDATE tb_usuario
     SET nm_usuario = COALESCE(:nome, nm_usuario),
         nu_cpf = COALESCE(:cpf, nu_cpf),
         dt_nascimento = :dataNascimento,
         tp_documento = COALESCE(:tipoDocumento, tp_documento),
         nu_documento = COALESCE(:documento, nu_documento)
     WHERE id_usuario = :idUsuario`,
    { replacements: { cpf, dataNascimento, documento, idUsuario, nome: nome?.trim() || null, tipoDocumento } },
  );
  return obterDadosCadastraisUsuario(idUsuario);
}
