import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

export async function sincronizarUsuario({ email, idAutenticacaoExterna, nome, perfil }) {
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
           tp_usuario = :perfil
       WHERE id_usuario = :idUsuario`,
      {
        replacements: {
          idAutenticacaoExterna,
          idUsuario: usuariosPorEmail[0].idUsuario,
          nome,
          perfil,
        },
      },
    );

    return usuariosPorEmail[0];
  }

  await bancoDeDados.query(
    `INSERT INTO tb_usuario (nm_usuario, ds_email, tp_usuario, id_autenticacao_externa)
     VALUES (:nome, :email, :perfil, :idAutenticacaoExterna)`,
    {
      replacements: { email, idAutenticacaoExterna, nome, perfil },
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
