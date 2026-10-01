import axios from 'axios';
import { obterTokenAcesso, obterUrlApi } from './respostaApi';

const clienteApi = axios.create({
  headers: { Accept: 'application/json' },
  timeout: 10_000,
});

clienteApi.interceptors.request.use((configuracao) => {
  configuracao.baseURL = obterUrlApi();

  const tokenAcesso = obterTokenAcesso();
  if (tokenAcesso && !configuracao.headers.Authorization) {
    configuracao.headers.Authorization = `Bearer ${tokenAcesso}`;
  }

  return configuracao;
});

export async function requisitarApi(caminho, { dados, metodo = 'GET', parametros, tokenAcesso } = {}) {
  try {
    const resposta = await clienteApi({
      data: dados,
      headers: tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : undefined,
      method: metodo,
      params: parametros,
      url: caminho,
    });

    return resposta.data;
  } catch (causa) {
    const erro = new Error(
      causa.response?.data?.mensagem
      ?? (causa.code === 'ECONNABORTED'
        ? 'A API demorou para responder. Tente novamente.'
        : 'Não foi possível conversar com a API agora. Verifique se o servidor está em execução e tente novamente.'),
    );
    erro.status = causa.response?.status;
    throw erro;
  }
}
