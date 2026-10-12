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

export function obterClienteAdministrativoSupabase() {
  const urlSupabase = process.env.SUPABASE_URL;
  const chaveServicoSupabase = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!urlSupabase || !chaveServicoSupabase) {
    throw new Error('Configure SUPABASE_SECRET_KEY para operações administrativas de autenticação.');
  }

  return createClient(urlSupabase, chaveServicoSupabase, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
