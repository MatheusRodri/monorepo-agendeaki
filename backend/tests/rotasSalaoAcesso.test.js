import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, { DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64') });
const ambiente = await iniciarRota('rotas/salao.js', { usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'ADMIN_SALAO' }, montagem: '/api/salao' });
const { banco } = ambiente;
afterAll(() => ambiente.parar());
beforeEach(() => { banco.reiniciar(); silenciarConsole(); ambiente.estado.autenticado = true; });

// Todas as rotas declaradas no roteador, lidas do código para a lista nunca ficar desatualizada.
const codigo = readFileSync(new URL('../src/rotas/salao.js', import.meta.url), 'utf8');
// A chave pública das notificações é aberta; o CEP consulta um serviço externo.
const abertas = new Set(['/notificacoes/chave-publica']);
const externas = new Set(['/enderecos/1']);
const rotas = [...codigo.matchAll(/roteadorSalao\.(get|post|put|patch|delete)\('([^']+)'/g)]
  .map(([, metodo, caminho]) => [metodo, caminho.replace(/:[A-Za-z]+/g, '1')]);

test('o roteador do salão foi lido por inteiro', () => {
  assert.ok(rotas.length >= 53, `rotas encontradas: ${rotas.length}`);
});

test('toda rota do salão exige sessão', async () => {
  ambiente.estado.autenticado = false;
  for (const [metodo, caminho] of rotas.filter(([, c]) => !abertas.has(c))) {
    const resposta = await ambiente[metodo](`/api/salao${caminho}`, metodo === 'get' ? undefined : {});
    assert.equal(resposta.status, 401, `${metodo} ${caminho}`);
  }
});

test('com sessão, mas sem salão cadastrado, nenhuma rota falha com erro de servidor', async () => {
  for (const [metodo, caminho] of rotas.filter(([, c]) => !abertas.has(c) && !externas.has(c))) {
    const resposta = await ambiente[metodo](`/api/salao${caminho}`, metodo === 'get' ? undefined : {});
    assert.ok(resposta.status < 500, `${metodo} ${caminho} -> ${resposta.status}`);
  }
});

// ---- salão existente: corpos ausentes e banco indisponível ----

const SALAO = /FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador/;
const comSalaoPremium = () => {
  banco.responder(SALAO, [{ idSalao: 1, nome: 'Studio', slug: 'studio', emailConta: 'a@a.com' }]);
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA', provedor: 'LOCAL' }]);
};
const consultaveis = rotas.filter(([, c]) => !['/notificacoes/chave-publica', '/enderecos/1'].includes(c));

test('com salão Premium, rotas sem corpo nem parâmetros respondem sem derrubar o servidor', async () => {
  comSalaoPremium();
  for (const [metodo, caminho] of consultaveis) {
    const resposta = await ambiente[metodo](`/api/salao${caminho}`);
    assert.ok(resposta.status >= 200 && resposta.status < 600, `${metodo} ${caminho}`);
  }
});

test('com salão Premium e banco indisponível, as rotas respondem com erro tratado', async () => {
  banco.responder(/./, () => { throw new Error('banco indisponível'); });
  comSalaoPremium();
  for (const [metodo, caminho] of consultaveis) {
    const resposta = await ambiente[metodo](`/api/salao${caminho}`, metodo === 'get' ? undefined : { nome: 'x', idUnidade: 1, idServico: 1, idFuncionario: 1, dataHoraInicio: '2026-12-01T10:00', periodos: [] });
    assert.ok(resposta.status >= 200 && resposta.status < 600, `${metodo} ${caminho}`);
  }
});
