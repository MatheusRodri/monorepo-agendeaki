import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

export function criarSlug(valor) {
  const slug = String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);

  return slug || 'sem-nome';
}

export async function criarSlugSalaoUnico(nome, { idSalao = null, transaction } = {}) {
  const base = criarSlug(nome);
  let tentativa = base;
  let sufixo = 2;

  while (true) {
    const encontrados = await bancoDeDados.query(
      `SELECT id_salao AS idSalao FROM tb_salao
       WHERE ds_slug = :slug AND (:idSalao IS NULL OR id_salao <> :idSalao) LIMIT 1`,
      { replacements: { idSalao, slug: tentativa }, transaction, type: QueryTypes.SELECT },
    );
    if (!encontrados.length) return tentativa;
    tentativa = `${base.slice(0, 140 - String(sufixo).length - 1)}-${sufixo}`;
    sufixo += 1;
  }
}

export async function criarSlugUnidadeUnico(nome, idSalao, { idUnidade = null, transaction } = {}) {
  const base = criarSlug(nome);
  let tentativa = base;
  let sufixo = 2;

  while (true) {
    const encontrados = await bancoDeDados.query(
      `SELECT id_unidade AS idUnidade FROM tb_unidade
       WHERE fk_salao = :idSalao AND ds_slug = :slug
         AND (:idUnidade IS NULL OR id_unidade <> :idUnidade) LIMIT 1`,
      { replacements: { idSalao, idUnidade, slug: tentativa }, transaction, type: QueryTypes.SELECT },
    );
    if (!encontrados.length) return tentativa;
    tentativa = `${base.slice(0, 140 - String(sufixo).length - 1)}-${sufixo}`;
    sufixo += 1;
  }
}
