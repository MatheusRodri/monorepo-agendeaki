import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

// Sem o analisador de JSON o Express não cria req.body: os roteadores precisam tolerar corpo indefinido.
Object.assign(process.env, {
  DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64'),
  SUPABASE_URL: 'https://supabase.teste', SUPABASE_ANON_KEY: 'anon',
});
const ambiente = await iniciarRota('rotas/autenticacao.js', { montagem: '/api', analisarCorpo: false });
const { banco } = ambiente;
afterAll(() => ambiente.parar());
beforeEach(() => { banco.reiniciar(); silenciarConsole(); });

const rotas = [...readFileSync(new URL('../src/rotas/autenticacao.js', import.meta.url), 'utf8')
  .matchAll(/roteadorAutenticacao\.(get|post)\('([^']+)'/g)].map(([, metodo, caminho]) => [metodo, caminho]);

test('rotas de autenticação sem corpo respondem com validação, sem erro de servidor', async () => {
  for (const [metodo, caminho] of rotas.filter(([, c]) => c !== '/documentos-legais')) {
    const resposta = await ambiente[metodo](`/api${caminho}`, { ignorado: true });
    assert.ok(resposta.status >= 200 && resposta.status < 500, `${metodo} ${caminho} -> ${resposta.status}`);
  }
});
