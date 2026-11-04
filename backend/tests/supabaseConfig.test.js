import assert from 'node:assert/strict';
import { beforeEach, test } from '@jest/globals';
import { obterClienteAdministrativoSupabase, obterClienteSupabase } from '../src/configuracoes/supabase.js';

const original = { ...process.env };
beforeEach(() => {
  for (const chave of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[chave];
});

test('cliente público exige URL e chave anônima', () => {
  assert.throws(() => obterClienteSupabase(), /SUPABASE_URL e SUPABASE_ANON_KEY/);
  Object.assign(process.env, { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'anon' });
  assert.ok(obterClienteSupabase().auth);
  assert.ok(obterClienteSupabase('token-de-acesso').auth);
});

test('cliente administrativo aceita chave secreta ou service role', () => {
  assert.throws(() => obterClienteAdministrativoSupabase(), /SUPABASE_SECRET_KEY/);
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  assert.throws(() => obterClienteAdministrativoSupabase(), /SUPABASE_SECRET_KEY/);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  assert.ok(obterClienteAdministrativoSupabase().auth.admin);
  process.env.SUPABASE_SECRET_KEY = 'secreta';
  assert.ok(obterClienteAdministrativoSupabase().auth.admin);
  Object.assign(process.env, original);
});
