import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

// Sem o analisador de JSON o Express não cria req.body: os roteadores precisam tolerar corpo indefinido.
Object.assign(process.env, { DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64') });
const ambiente = await iniciarRota('rotas/salao.js', { usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'ADMIN_SALAO' }, montagem: '/api/salao', analisarCorpo: false });
const { banco } = ambiente;
afterAll(() => ambiente.parar());
beforeEach(() => { banco.reiniciar(); silenciarConsole(); });

const codigo = readFileSync(new URL('../src/rotas/salao.js', import.meta.url), 'utf8');
const rotas = [...codigo.matchAll(/roteadorSalao\.(get|post|put|patch|delete)\('([^']+)'/g)]
  .map(([, metodo, caminho]) => [metodo, caminho.replace(/:[A-Za-z]+/g, '1')])
  .filter(([, caminho]) => !['/notificacoes/chave-publica', '/enderecos/1'].includes(caminho));

test('rotas do salão com corpo indefinido respondem com validação, sem erro de servidor', async () => {
  banco.responder(/FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador/, [{ idSalao: 1, nome: 'Studio', slug: 'studio', emailConta: 'a@a.com' }]);
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA', provedor: 'LOCAL' }]);
  for (const [metodo, caminho] of rotas) {
    const resposta = await ambiente[metodo](`/api/salao${caminho}`, metodo === 'get' ? undefined : { ignorado: true });
    assert.ok(resposta.status >= 200 && resposta.status < 600, `${metodo} ${caminho}`);
  }
});
