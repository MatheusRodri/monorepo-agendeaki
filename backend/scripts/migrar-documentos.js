import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { decifrarDocumento, prepararDocumento, validarChavesDocumentos } from '../src/servicos/documentosProtegidos.js';

async function colunaExiste(nome) {
  const linhas = await bancoDeDados.query(
    `SELECT COUNT(*) AS quantidade FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_usuario' AND COLUMN_NAME=:nome`,
    { replacements: { nome }, type: QueryTypes.SELECT },
  );
  return Number(linhas[0].quantidade) > 0;
}

async function indiceExiste(nome) {
  const linhas = await bancoDeDados.query(
    `SELECT COUNT(*) AS quantidade FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tb_usuario' AND INDEX_NAME=:nome`,
    { replacements: { nome }, type: QueryTypes.SELECT },
  );
  return Number(linhas[0].quantidade) > 0;
}

async function migrar() {
  validarChavesDocumentos();
  await bancoDeDados.authenticate();
  if (!(await colunaExiste('ds_documento_cifrado'))) {
    await bancoDeDados.query('ALTER TABLE tb_usuario ADD COLUMN ds_documento_cifrado VARCHAR(255) NULL');
  }
  if (!(await colunaExiste('ds_documento_indice'))) {
    await bancoDeDados.query('ALTER TABLE tb_usuario ADD COLUMN ds_documento_indice CHAR(64) NULL');
  }
  if (!(await colunaExiste('nu_documento')) || !(await colunaExiste('nu_cpf'))) {
    throw new Error('As colunas antigas não foram encontradas. Esta migração é apenas para bases legadas.');
  }

  const usuarios = await bancoDeDados.query(
    `SELECT id_usuario AS idUsuario, tp_documento AS tipoDocumento, nu_documento AS documento,
            nu_cpf AS cpf, ds_documento_cifrado AS documentoCifrado, ds_documento_indice AS documentoIndice
     FROM tb_usuario ORDER BY id_usuario`,
    { type: QueryTypes.SELECT },
  );
  let convertidos = 0;
  for (const usuario of usuarios) {
    const numero = usuario.documento || usuario.cpf;
    if (!numero) continue;
    const tipo = usuario.tipoDocumento || (usuario.cpf ? 'CPF' : null);
    if (usuario.documentoCifrado || usuario.documentoIndice) {
      const existente = decifrarDocumento(usuario.documentoCifrado);
      const indiceEsperado = existente ? prepararDocumento(tipo, existente).documentoIndice : null;
      if (!existente || usuario.documentoIndice !== indiceEsperado || existente !== String(numero).replace(/\D/g, '')) {
        throw new Error(`Documento protegido inconsistente no usuário ${usuario.idUsuario}.`);
      }
      continue;
    }
    const protegido = prepararDocumento(tipo, numero);
    await bancoDeDados.query(
      `UPDATE tb_usuario SET tp_documento=:tipo, ds_documento_cifrado=:documentoCifrado,
         ds_documento_indice=:documentoIndice WHERE id_usuario=:idUsuario
         AND ds_documento_cifrado IS NULL AND ds_documento_indice IS NULL`,
      { replacements: { ...protegido, idUsuario: usuario.idUsuario, tipo } },
    );
    convertidos += 1;
  }

  const pendentes = await bancoDeDados.query(
    `SELECT COUNT(*) AS quantidade FROM tb_usuario
     WHERE (nu_documento IS NOT NULL OR nu_cpf IS NOT NULL)
       AND (ds_documento_cifrado IS NULL OR ds_documento_indice IS NULL)`,
    { type: QueryTypes.SELECT },
  );
  if (Number(pendentes[0].quantidade)) throw new Error('A conversão ficou incompleta. As colunas antigas foram preservadas.');
  if (!(await indiceExiste('uk_usuario_documento_indice'))) {
    await bancoDeDados.query('ALTER TABLE tb_usuario ADD UNIQUE INDEX uk_usuario_documento_indice (ds_documento_indice)');
  }
  console.info(`Documentos convertidos: ${convertidos}. Documentos pendentes: 0.`);
}

migrar().catch((erro) => {
  console.error(`Migração interrompida: ${erro.message}`);
  process.exitCode = 1;
}).finally(() => bancoDeDados.close());
