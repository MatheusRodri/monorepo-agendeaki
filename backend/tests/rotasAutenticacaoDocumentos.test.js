import assert from 'node:assert/strict';
import { afterAll, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

const ambiente = await iniciarRota('rotas/autenticacao.js', {
  montagem: '/api/autenticacao',
  extras: { 'servicos/documentosLegais.js': () => ({
    obterDocumentosLegais: async () => { throw new Error('arquivo ausente'); },
    obterVersoesDocumentosLegais: () => ({ termosDeUso: '1.0', politicaPrivacidade: '1.0' }),
  }) },
});
afterAll(() => ambiente.parar());

test('documentos legais devolvem 500 quando os arquivos não podem ser lidos', async () => {
  silenciarConsole();
  const resposta = await ambiente.get('/api/autenticacao/documentos-legais');
  assert.equal(resposta.status, 500);
  assert.match(resposta.corpo.mensagem, /documentos legais/);
});
