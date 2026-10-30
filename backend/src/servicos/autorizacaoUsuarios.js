import { obterClienteSupabase } from '../configuracoes/supabase.js';
import { obterPendenciasUsuario, sincronizarUsuario } from './usuarios.js';

export async function autenticarRequisicao(requisicao, resposta, perfil, { permitirExclusao = false } = {}) {
  const cabecalho = requisicao.headers.authorization;
  const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!token) { resposta.status(401).json({ mensagem: 'Informe o token de acesso.' }); return null; }
  try {
    const { data, error } = await obterClienteSupabase(token).auth.getUser(token);
    if (error || !data?.user) {
      resposta.status(401).json({ mensagem: 'A sessão informada é inválida ou expirou.' }); return null;
    }
    const usuario = await sincronizarUsuario({ usuarioSupabase: data.user, perfil, permitirExclusao });
    const caminho = requisicao.path;
    const permiteIncompleto = ['/perfil', '/senha', '/conta', '/conta/exclusao'].includes(caminho)
      || (caminho === '/saloes/atual' && requisicao.method === 'GET')
      || (caminho === '/notificacoes/inscricao' && requisicao.method === 'DELETE');
    if (!permiteIncompleto && !usuario.exclusaoPendente && (await obterPendenciasUsuario(usuario.idUsuario, perfil)).cadastroIncompleto) {
      resposta.status(403).json({ mensagem: 'Complete seu cadastro antes de continuar.', codigo: 'CADASTRO_INCOMPLETO' }); return null;
    }
    return usuario;
  } catch (erro) {
    resposta.status(erro.status ?? 500).json({ mensagem: erro.status ? erro.message : 'Não foi possível validar a conta.', codigo: erro.codigo });
    return null;
  }
}
