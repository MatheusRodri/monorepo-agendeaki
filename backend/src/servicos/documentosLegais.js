import { readFile } from 'node:fs/promises';

const documentos = {
  termosDeUso: {
    arquivo: new URL('../../conteudo/termos-de-uso.txt', import.meta.url),
    versao: '1.0',
  },
  politicaPrivacidade: {
    arquivo: new URL('../../conteudo/politica-de-privacidade.txt', import.meta.url),
    versao: '1.0',
  },
};

export async function obterDocumentosLegais() {
  const [textoTermos, textoPolitica] = await Promise.all([
    readFile(documentos.termosDeUso.arquivo, 'utf8'),
    readFile(documentos.politicaPrivacidade.arquivo, 'utf8'),
  ]);

  return {
    termosDeUso: { texto: textoTermos, versao: documentos.termosDeUso.versao },
    politicaPrivacidade: { texto: textoPolitica, versao: documentos.politicaPrivacidade.versao },
  };
}

export function obterVersoesDocumentosLegais() {
  return {
    termosDeUso: documentos.termosDeUso.versao,
    politicaPrivacidade: documentos.politicaPrivacidade.versao,
  };
}
