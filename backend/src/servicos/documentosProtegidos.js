import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

function obterChave(nome) {
  const valor = process.env[nome];
  const chave = valor ? Buffer.from(valor, 'base64') : null;
  if (!chave || chave.length !== 32 || chave.toString('base64') !== valor) {
    throw new Error(`${nome} deve conter uma chave aleatória de 32 bytes em base64.`);
  }
  return chave;
}

export function validarChavesDocumentos() {
  obterChave('DOCUMENT_ENCRYPTION_KEY');
  obterChave('DOCUMENT_HMAC_KEY');
}

export function prepararDocumento(tipo, numero) {
  if (!numero) return { documentoCifrado: null, documentoIndice: null };
  if (!['CPF', 'CNPJ'].includes(tipo)) throw new Error('Tipo de documento inválido.');
  const normalizado = String(numero).replace(/\D/g, '');
  const nonce = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', obterChave('DOCUMENT_ENCRYPTION_KEY'), nonce);
  const cifra = Buffer.concat([cifrador.update(normalizado, 'utf8'), cifrador.final()]);
  const documentoCifrado = ['v1', nonce.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifra.toString('base64url')].join(':');
  const documentoIndice = createHmac('sha256', obterChave('DOCUMENT_HMAC_KEY')).update(`${tipo}:${normalizado}`).digest('hex');
  return { documentoCifrado, documentoIndice };
}

export function decifrarDocumento(valor) {
  if (!valor) return null;
  const partes = String(valor).split(':');
  if (partes.length !== 4 || !/^[A-Za-z0-9_-]+$/.test(partes[0])) throw new Error('Formato do documento protegido inválido.');
  const [id, nonce, etiqueta, cifra] = partes;
  if (id !== 'v1') throw new Error('Versão de proteção do documento não suportada.');
  const decifrador = createDecipheriv('aes-256-gcm', obterChave('DOCUMENT_ENCRYPTION_KEY'), Buffer.from(nonce, 'base64url'));
  decifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
  return Buffer.concat([decifrador.update(Buffer.from(cifra, 'base64url')), decifrador.final()]).toString('utf8');
}
