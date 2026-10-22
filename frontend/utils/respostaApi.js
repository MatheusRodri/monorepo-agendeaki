const perfisValidos = ['cliente', 'salao', 'admin'];

function obterPerfilAtual() {
  if (typeof window === 'undefined') return null;
  if (window.location.pathname.startsWith('/admin')) return 'admin';
  return window.location.pathname.startsWith('/salao') ? 'salao' : 'cliente';
}

function obterChaves(perfilUsuario) {
  const sufixo = perfilUsuario === 'salao' ? 'Salao' : perfilUsuario === 'admin' ? 'Admin' : 'Cliente';
  return {
    tokenAcesso: `tokenAcesso${sufixo}`,
    tokenAtualizacao: `tokenAtualizacao${sufixo}`,
  };
}

function migrarSessaoLegada() {
  if (typeof window === 'undefined') return;

  const perfilLegado = localStorage.getItem('perfilUsuario');
  const tokenLegado = localStorage.getItem('tokenAcesso') || sessionStorage.getItem('tokenAcesso');
  if (perfisValidos.includes(perfilLegado) && tokenLegado) {
    const chaves = obterChaves(perfilLegado);
    if (!localStorage.getItem(chaves.tokenAcesso) && !sessionStorage.getItem(chaves.tokenAcesso)) {
      localStorage.setItem(chaves.tokenAcesso, tokenLegado);
    }
  }

  localStorage.removeItem('tokenAcesso');
  localStorage.removeItem('perfilUsuario');
  sessionStorage.removeItem('tokenAcesso');
  sessionStorage.removeItem('perfilUsuario');
}

export function obterUrlApi() {
  const estaEmAmbienteLocal = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (estaEmAmbienteLocal) {
    return 'http://localhost:3001';
  }

  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

export function armazenarSessao(tokenAcesso, tokenAtualizacao, perfilUsuario, manterConectado = true) {
  if (typeof window === 'undefined' || !perfisValidos.includes(perfilUsuario)) return;
  migrarSessaoLegada();
  const chaves = obterChaves(perfilUsuario);
  localStorage.removeItem(chaves.tokenAcesso);
  localStorage.removeItem(chaves.tokenAtualizacao);
  sessionStorage.removeItem(chaves.tokenAcesso);
  sessionStorage.removeItem(chaves.tokenAtualizacao);
  const armazenamento = manterConectado ? localStorage : sessionStorage;
  armazenamento.setItem(chaves.tokenAcesso, tokenAcesso);
  if (tokenAtualizacao) armazenamento.setItem(chaves.tokenAtualizacao, tokenAtualizacao);
}

export function obterTokenAcesso(perfilUsuario = obterPerfilAtual()) {
  if (typeof window === 'undefined' || !perfisValidos.includes(perfilUsuario)) return null;
  migrarSessaoLegada();
  const chave = obterChaves(perfilUsuario).tokenAcesso;
  return localStorage.getItem(chave) || sessionStorage.getItem(chave);
}

export function obterTokenAtualizacao(perfilUsuario) {
  if (typeof window === 'undefined' || !perfisValidos.includes(perfilUsuario)) return null;
  migrarSessaoLegada();
  const chave = obterChaves(perfilUsuario).tokenAtualizacao;
  return localStorage.getItem(chave) || sessionStorage.getItem(chave);
}

export function sessaoPersistente(perfilUsuario) {
  if (typeof window === 'undefined' || !perfisValidos.includes(perfilUsuario)) return true;
  migrarSessaoLegada();
  const chaves = obterChaves(perfilUsuario);
  return Boolean(localStorage.getItem(chaves.tokenAcesso) || localStorage.getItem(chaves.tokenAtualizacao));
}

export function limparSessao(perfilUsuario) {
  if (typeof window === 'undefined') return;
  migrarSessaoLegada();

  const perfisParaLimpar = perfisValidos.includes(perfilUsuario) ? [perfilUsuario] : perfisValidos;
  perfisParaLimpar.forEach((perfil) => {
    const chaves = obterChaves(perfil);
    localStorage.removeItem(chaves.tokenAcesso);
    localStorage.removeItem(chaves.tokenAtualizacao);
    sessionStorage.removeItem(chaves.tokenAcesso);
    sessionStorage.removeItem(chaves.tokenAtualizacao);
  });
}
