import axios from 'axios';
import {
  armazenarSessao,
  limparSessao,
  obterTokenAcesso,
  obterTokenAtualizacao,
  obterUrlApi,
  sessaoPersistente,
} from './respostaApi';

const clienteApi = axios.create({
  headers: { Accept: 'application/json' },
  timeout: 10_000,
});

const renovacoesEmAndamento = new Map();

function obterPerfilDaRota(caminho) {
  const caminhoRelativo = caminho.split('?')[0];
  if (caminhoRelativo.startsWith('/api/admin/')) return 'admin';
  if (caminhoRelativo.startsWith('/api/salao/') || caminhoRelativo.startsWith('/api/saloes/')) return 'salao';
  if (caminhoRelativo.startsWith('/api/clientes/') || caminhoRelativo.startsWith('/api/cliente/')) return 'cliente';
  return null;
}

function permiteRenovacao(caminho) {
  return !/\/(cadastro|login|logout|refresh|recuperar-senha|redefinir-senha)$/.test(caminho.split('?')[0]);
}

function criarErroApi(causa) {
  const erro = new Error(
    causa.response?.data?.mensagem
    ?? (causa.code === 'ECONNABORTED'
      ? 'A API demorou para responder. Tente novamente.'
      : 'Não foi possível conversar com a API agora. Verifique se o servidor está em execução e tente novamente.'),
  );
  erro.status = causa.response?.status;
  erro.codigo = causa.response?.data?.codigo;
  erro.indiceItem = causa.response?.data?.indiceItem;
  return erro;
}

async function enviarRequisicao(caminho, { dados, metodo = 'GET', parametros, tokenAcesso, tipoResposta, timeout } = {}) {
  try {
    const resposta = await clienteApi({
      baseURL: obterUrlApi(),
      data: dados,
      headers: {
        ...(tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : {}),
      },
      method: metodo,
      params: parametros,
      responseType: tipoResposta,
      ...(timeout !== undefined ? { timeout } : {}),
      url: caminho,
    });

    return resposta.data;
  } catch (causa) {
    if (typeof Blob !== 'undefined' && causa.response?.data instanceof Blob && causa.response.data.type.includes('json')) {
      try { causa.response.data = JSON.parse(await causa.response.data.text()); } catch {}
    }
    throw criarErroApi(causa);
  }
}

async function renovarSessao(perfilUsuario) {
  if (perfilUsuario === 'admin') {
    limparSessao(perfilUsuario);
    return null;
  }

  const renovacaoEmAndamento = renovacoesEmAndamento.get(perfilUsuario);
  if (renovacaoEmAndamento) return renovacaoEmAndamento;

  const tokenAtualizacao = obterTokenAtualizacao(perfilUsuario);
  if (!tokenAtualizacao) {
    if (obterTokenAcesso(perfilUsuario)) limparSessao(perfilUsuario);
    return null;
  }

  const caminhoRefresh = perfilUsuario === 'cliente' ? '/api/clientes/refresh' : perfilUsuario === 'salao' ? '/api/saloes/refresh' : '/api/admin/refresh';
  const promessaRenovacao = enviarRequisicao(caminhoRefresh, {
    dados: { tokenAtualizacao },
    metodo: 'POST',
  })
    .then((dados) => {
      if (!dados.tokenAcesso || !dados.tokenAtualizacao) {
        throw new Error('A API não retornou uma sessão renovada válida.');
      }
      if (obterTokenAtualizacao(perfilUsuario) !== tokenAtualizacao) {
        return obterTokenAcesso(perfilUsuario);
      }
      armazenarSessao(dados.tokenAcesso, dados.tokenAtualizacao, perfilUsuario, sessaoPersistente(perfilUsuario));
      return dados.tokenAcesso;
    })
    .catch((erro) => {
      if (obterTokenAtualizacao(perfilUsuario) !== tokenAtualizacao) {
        return obterTokenAcesso(perfilUsuario);
      }
      if ([401, 403].includes(erro.status)) {
        limparSessao(perfilUsuario);
        return null;
      }
      throw erro;
    })
    .finally(() => {
      renovacoesEmAndamento.delete(perfilUsuario);
    });

  renovacoesEmAndamento.set(perfilUsuario, promessaRenovacao);
  return promessaRenovacao;
}

export async function requisitarApi(caminho, opcoes = {}) {
  const perfilUsuario = opcoes.perfilUsuario ?? obterPerfilDaRota(caminho);
  const tokenAcesso = opcoes.tokenAcesso ?? obterTokenAcesso(perfilUsuario);

  try {
    return await enviarRequisicao(caminho, { ...opcoes, tokenAcesso });
  } catch (erro) {
    if (
      erro.status !== 401
      || !perfilUsuario
      || opcoes.tokenAcesso
      || !permiteRenovacao(caminho)
    ) {
      throw erro;
    }

    const novoTokenAcesso = await renovarSessao(perfilUsuario);
    if (!novoTokenAcesso) throw erro;

    return enviarRequisicao(caminho, { ...opcoes, tokenAcesso: novoTokenAcesso });
  }
}
