export async function lerRespostaApi(resposta) {
  const tipoConteudo = resposta.headers.get('content-type');

  if (!tipoConteudo?.includes('application/json')) {
    return {
      dados: {},
      mensagem: 'Não foi possível conversar com a API agora. Verifique se o servidor está em execução e tente novamente.',
    };
  }

  return { dados: await resposta.json(), mensagem: null };
}

export function obterUrlApi() {
  const estaEmAmbienteLocal = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (estaEmAmbienteLocal) {
    return 'http://localhost:3001';
  }

  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

export function armazenarSessao(tokenAcesso, perfilUsuario) {
  sessionStorage.setItem('tokenAcesso', tokenAcesso);
  sessionStorage.setItem('perfilUsuario', perfilUsuario);
  localStorage.setItem('tokenAcesso', tokenAcesso);
  localStorage.setItem('perfilUsuario', perfilUsuario);
}

export function obterTokenAcesso() {
  return sessionStorage.getItem('tokenAcesso') || localStorage.getItem('tokenAcesso');
}

export function limparSessao() {
  sessionStorage.removeItem('tokenAcesso');
  sessionStorage.removeItem('perfilUsuario');
  localStorage.removeItem('tokenAcesso');
  localStorage.removeItem('perfilUsuario');
}
