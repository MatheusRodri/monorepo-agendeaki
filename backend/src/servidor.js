import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { bancoDeDados } from './configuracoes/bancoDeDados.js';
import roteadorAutenticacao from './rotas/autenticacao.js';
import roteadorAdmin from './rotas/admin.js';
import roteadorCliente from './rotas/cliente.js';
import roteadorPublico from './rotas/publico.js';
import roteadorSalao from './rotas/salao.js';
import roteadorWebhooks from './rotas/webhooks.js';
import { validarChavesDocumentos } from './servicos/documentosProtegidos.js';

const aplicacao = express();
const porta = Number(process.env.PORT ?? 3001);
const urlFrontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const origemFrontend = new URL(urlFrontend).origin;

aplicacao.use(cors({
  origin: (origem, callback) => callback(null, origem === origemFrontend),
}));
aplicacao.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
aplicacao.use(express.json());
aplicacao.use((requisicao, resposta, proximo) => {
  const cabecalhoAutorizacao = requisicao.headers.authorization;
  const possuiTokenBearer = cabecalhoAutorizacao?.startsWith('Bearer ') ?? false;

  console.info('[API] Requisição recebida', {
    metodo: requisicao.method,
    rota: requisicao.originalUrl,
    possuiCabecalhoAutorizacao: Boolean(cabecalhoAutorizacao),
    possuiTokenBearer,
    tamanhoDoToken: possuiTokenBearer ? cabecalhoAutorizacao.slice(7).length : 0,
  });

  resposta.on('finish', () => {
    console.info('[API] Resposta enviada', {
      metodo: requisicao.method,
      rota: requisicao.originalUrl,
      status: resposta.statusCode,
    });
  });

  proximo();
});
aplicacao.use('/api', roteadorAutenticacao);
aplicacao.use('/api/admin', roteadorAdmin);
aplicacao.use('/api/clientes', roteadorCliente);
aplicacao.use('/api/publico', roteadorPublico);
aplicacao.use('/api/salao', roteadorSalao);
aplicacao.use('/api/webhooks', roteadorWebhooks);

aplicacao.get('/saude', (_requisicao, resposta) => {
  resposta.status(200).json({ status: 'online' });
});

aplicacao.use((erro, _requisicao, resposta, _proximaFuncao) => {
  console.error(erro);
  resposta.status(500).json({ mensagem: 'Ocorreu um erro inesperado ao processar a solicitação.' });
});

async function iniciarServidor() {
  try {
    validarChavesDocumentos();
    await bancoDeDados.authenticate();
    console.log('Conexão com o banco de dados validada com sucesso.');

    aplicacao.listen(porta, () => {
      console.log(`Servidor disponível em http://localhost:${porta}`);
    });
  } catch (erro) {
    console.error('Não foi possível iniciar o servidor.');
    console.error(erro.message);
    process.exitCode = 1;
  } finally {
    if (process.exitCode === 1) {
      await bancoDeDados.close();
    }
  }
}

iniciarServidor();
