import { createClient } from '@supabase/supabase-js';

export function obterClienteSupabase(tokenAcesso) {
  const urlSupabase = process.env.SUPABASE_URL;
  const chaveAnonimaSupabase = process.env.SUPABASE_ANON_KEY;

  if (!urlSupabase || !chaveAnonimaSupabase) {
    throw new Error('As variáveis SUPABASE_URL e SUPABASE_ANON_KEY precisam ser configuradas.');
  }

  const opcoes = tokenAcesso
    ? { global: { headers: { Authorization: `Bearer ${tokenAcesso}` } } }
    : undefined;

  return createClient(urlSupabase, chaveAnonimaSupabase, opcoes);
}
