import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

// Sem o analisador de JSON o Express não cria req.body: os roteadores precisam tolerar corpo indefinido.
Object.assign(process.env, { SUPABASE_URL: 'https://supabase.teste', SUPABASE_ANON_KEY: 'anon' });
const ambiente = await iniciarRota('rotas/cliente.js', { usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'CLIENTE' }, montagem: '/api/cliente', analisarCorpo: false });
const { banco } = ambiente;
afterAll(() => ambiente.parar());
beforeEach(() => { banco.reiniciar(); silenciarConsole(); });

const rotas = [...readFileSync(new URL('../src/rotas/cliente.js', import.meta.url), 'utf8')
  .matchAll(/roteadorCliente\.(get|post|put|patch|delete)\('([^']+)'/g)]
  .map(([, metodo, caminho]) => [metodo, caminho.replace(/:[A-Za-z]+/g, '1')])
  .filter(([, caminho]) => !['/saloes-proximos', '/notificacoes/chave-publica'].includes(caminho));

test('rotas do cliente sem corpo respondem sem derrubar o servidor', async () => {
  for (const [metodo, caminho] of rotas) {
    const resposta = await ambiente[metodo](`/api/cliente${caminho}`, metodo === 'get' ? undefined : { ignorado: true });
    assert.ok(resposta.status >= 200 && resposta.status < 600, `${metodo} ${caminho}`);
  }
});
