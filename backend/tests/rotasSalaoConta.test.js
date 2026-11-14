import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { afterAll, beforeEach, test } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, {
  DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64'),
  SUPABASE_URL: 'https://supabase.teste', SUPABASE_ANON_KEY: 'anon', HERE_API_KEY: 'chave', ASSINATURA_MODO_TESTE: 'true',
});
const f = {
  atualizarPeriodicidade: jest.fn(), consultarCheckout: jest.fn(), reativar: jest.fn(), encerrar: jest.fn(),
  reservar: jest.fn(), finalizar: jest.fn(), cancelarRecursos: jest.fn(), recuperarCheckout: jest.fn(),
  sincronizar: jest.fn(), iniciarExclusao: jest.fn(),
};
const ambiente = await iniciarRota('rotas/salao.js', {
  usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'ADMIN_SALAO' }, montagem: '/api/salao',
  extras: {
    'servicos/stripe.js': () => ({ obterOfertaPremium: () => ({ premium: {} }), atualizarPeriodicidadeStripe: f.atualizarPeriodicidade,
      consultarCheckoutStripe: f.consultarCheckout, reativarAssinaturaStripe: f.reativar, encerrarAssinaturaStripe: f.encerrar }),
    'servicos/contratacoes.js': () => ({ reservarContratacao: f.reservar, finalizarCheckout: f.finalizar, cancelarRecursosContratacao: f.cancelarRecursos, recuperarCheckout: f.recuperarCheckout }),
    'servicos/sincronizarAssinaturaStripe.js': () => ({ sincronizarAssinaturaStripe: f.sincronizar }),
    'servicos/exclusaoContaSalao.js': () => ({ iniciarExclusaoSalao: f.iniciarExclusao }),
  },
});
const { banco } = ambiente;
afterAll(() => ambiente.parar());
const base = '/api/salao';
const fetchReal = globalThis.fetch;
let externo;

const SALAO = /FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador/;
const ASSINATURA = /FROM tb_assinatura_salao WHERE fk_salao=:idSalao|FROM tb_assinatura_salao\s+WHERE fk_salao=:idSalao/;
const salao = (extra = {}) => banco.responder(SALAO, [{ idSalao: 1, nome: 'Studio', slug: 'studio', testePremiumUtilizado: 0, emailConta: 'a@a.com', ...extra }]);
const assinatura = (extra = {}) => banco.responder(ASSINATURA, [{ idAssinatura: 3, status: 'AUTORIZADA', provedor: 'STRIPE', idAssinaturaProvedor: 'sub_1', periodicidade: 'MENSAL', valor: '50.00', dataProximaCobranca: '2999-01-01', ...extra }]);
const premium = () => { salao(); assinatura(); };

beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  for (const funcao of Object.values(f)) funcao.mockReset();
  ambiente.estado.autenticado = true;
  externo = { cep: { ok: true, json: async () => ({ logradouro: 'Rua A', bairro: 'Centro', localidade: 'SP', uf: 'SP' }) },
    here: { ok: true, json: async () => ({ items: [{ id: 'h1', position: { lat: -23.5, lng: -46.6 }, title: 'Rua A, 10' }, { position: {} }] }) }, senha: { ok: true } };
  jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    const alvo = String(url);
    if (alvo.includes('viacep')) return typeof externo.cep === 'function' ? externo.cep() : Promise.resolve(externo.cep);
    if (alvo.includes('hereapi')) return typeof externo.here === 'function' ? externo.here() : Promise.resolve(externo.here);
    if (alvo.includes('supabase.teste')) return Promise.resolve(externo.senha);
    return fetchReal(url, init);
  });
});

test('notificações exigem salão e Premium', async () => {
  assert.equal((await ambiente.get(`${base}/notificacoes`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/notificacoes`)).status, 403);
  ambiente.estado.autenticado = false;
  assert.equal((await ambiente.get(`${base}/notificacoes`)).status, 401);
});

test('notificações Premium: listar, marcar uma e todas', async () => {
  premium();
  banco.responder(/FROM tb_notificacao_salao WHERE fk_salao=:idSalao\s+ORDER BY/, [{ id: 1 }]);
  banco.responder(/SELECT COUNT\(\*\) AS quantidade FROM tb_notificacao_salao/, [{ quantidade: 2 }]);
  assert.equal((await ambiente.get(`${base}/notificacoes`)).corpo.naoLidas, 2);
  assert.equal((await ambiente.patch(`${base}/notificacoes/zz/lida`, {})).status, 400);
  assert.equal((await ambiente.patch(`${base}/notificacoes/4/lida`, {})).status, 404);
  banco.responder(/UPDATE tb_notificacao_salao SET st_lida=TRUE WHERE id_notificacao/, [{ affectedRows: 1 }]);
  assert.equal((await ambiente.patch(`${base}/notificacoes/4/lida`, {})).status, 200);
  assert.equal((await ambiente.post(`${base}/notificacoes/lidas`, {})).status, 200);
});

test('inscrição de notificações do salão', async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  assert.equal((await ambiente.get(`${base}/notificacoes/chave-publica`)).status, 503);
  process.env.VAPID_PUBLIC_KEY = 'pub';
  assert.equal((await ambiente.get(`${base}/notificacoes/chave-publica`)).status, 200);
  premium();
  const valida = { endpoint: 'https://push.exemplo/1', keys: { p256dh: 'p', auth: 'a' } };
  for (const invalida of [{}, { ...valida, endpoint: 'http://inseguro/x' }, { ...valida, keys: {} }]) assert.equal((await ambiente.post(`${base}/notificacoes/inscricao`, invalida)).status, 400);
  const salva = await ambiente.post(`${base}/notificacoes/inscricao`, valida);
  assert.equal(salva.status, 201);
  assert.equal(salva.corpo.audience, 'salao');
  assert.equal((await ambiente.post(`${base}/notificacoes/inscricao`, { ...valida, endpoint: 'http://localhost:1/x' })).status, 201);
  banco.responder(/INSERT INTO tb_inscricao_notificacao/, () => { throw new Error('tabela'); });
  assert.equal((await ambiente.post(`${base}/notificacoes/inscricao`, valida)).status, 500);
  assert.equal((await ambiente.get(`${base}/notificacoes/inscricao?endpoint=x`)).corpo.ativa, false);
  banco.responder(/id_vinculo_dispositivo AS idVinculo FROM tb_inscricao_notificacao/, [{ idVinculo: 'v' }]);
  assert.equal((await ambiente.get(`${base}/notificacoes/inscricao?endpoint=x`)).corpo.ativa, true);
  assert.equal((await ambiente.delete(`${base}/notificacoes/inscricao`, {})).status, 400);
  assert.equal((await ambiente.delete(`${base}/notificacoes/inscricao`, { endpoint: valida.endpoint })).status, 200);
  banco.reiniciar();
  assert.equal((await ambiente.delete(`${base}/notificacoes/inscricao`, { endpoint: 'x' })).status, 404);
});

test('consulta de CEP e coordenadas da unidade', async () => {
  assert.equal((await ambiente.get(`${base}/enderecos/123`)).status, 500);
  assert.equal((await ambiente.get(`${base}/enderecos/01001-000`)).corpo.rua, 'Rua A');
  externo.cep = { ok: true, json: async () => ({ erro: true }) };
  assert.equal((await ambiente.get(`${base}/enderecos/01001000`)).status, 500);
  externo.cep = { ok: true, json: async () => ({ logradouro: 'Rua A', bairro: 'Centro', localidade: 'SP', uf: 'SP' }) };

  assert.equal((await ambiente.get(`${base}/coordenadas?cep=01001000`)).status, 400);
  const ok = await ambiente.get(`${base}/coordenadas?cep=01001000&numero=10`);
  assert.equal(ok.corpo.sugestoes.length, 1);
  assert.equal(ok.corpo.sugestoes[0].endereco, 'Rua A, 10');
  externo.here = { ok: true, json: async () => ({}) };
  assert.equal((await ambiente.get(`${base}/coordenadas?cep=01001000&numero=10`)).status, 404);
  externo.here = { ok: false, status: 500 };
  assert.equal((await ambiente.get(`${base}/coordenadas?cep=01001000&numero=10`)).status, 422);
  externo.here = () => Promise.reject(new Error('rede'));
  assert.equal((await ambiente.get(`${base}/coordenadas?cep=01001000&numero=10`)).status, 422);
  const chave = process.env.HERE_API_KEY;
  delete process.env.HERE_API_KEY;
  try { assert.equal((await ambiente.get(`${base}/coordenadas?cep=01001000&numero=10`)).status, 422); } finally { process.env.HERE_API_KEY = chave; }
  assert.equal((await ambiente.get(`${base}/coordenadas?cep=1&numero=10`)).status, 422);
});

test('criar, consultar e atualizar o salão', async () => {
  assert.equal((await ambiente.post(`${base}/saloes`, { nome: ' ' })).status, 400);
  salao();
  assert.equal((await ambiente.post(`${base}/saloes`, { nome: 'Novo' })).status, 409);
  banco.reiniciar();
  assert.equal((await ambiente.post(`${base}/saloes`, { nome: 'Novo' })).status, 400);
  const { prepararDocumento } = await import('../src/servicos/documentosProtegidos.js');
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1, tipoDocumento: 'CNPJ', documentoCifrado: prepararDocumento('CNPJ', '11.222.333/0001-81').documentoCifrado }]);
  assert.equal((await ambiente.post(`${base}/saloes`, { nome: 'Novo' })).status, 201);
  banco.responder(/INSERT INTO tb_salao/, () => { throw Object.assign(new Error('dup'), { original: { code: 'ER_DUP_ENTRY' } }); });
  assert.equal((await ambiente.post(`${base}/saloes`, { nome: 'Novo' })).status, 409);
  banco.responder(/INSERT INTO tb_salao/, () => { throw new Error('outro'); });
  assert.equal((await ambiente.post(`${base}/saloes`, { nome: 'Novo' })).status, 500);

  banco.reiniciar();
  assert.equal((await ambiente.get(`${base}/saloes/atual`)).status, 404);
  assert.equal((await ambiente.patch(`${base}/saloes/atual`, { nome: 'X' })).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/saloes/atual`)).corpo.salao.nome, 'Studio');
  assert.equal((await ambiente.patch(`${base}/saloes/atual`, { nome: '' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/saloes/atual`, { nome: 'Outro Nome' })).status, 200);
  assert.equal(banco.chamadas.find((c) => /UPDATE tb_salao SET nm_salao/.test(c.sql)).opcoes.replacements.slug, 'outro-nome');
});

const perfilCorpo = { nome: 'João', telefone: '11987654321', dataNascimento: '1985-01-10', tipoDocumento: 'CNPJ', documento: '11.222.333/0001-81', aceitouDocumentos: true };

test('perfil do responsável: consulta e validações', async () => {
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  assert.equal((await ambiente.get(`${base}/perfil`)).status, 200);
  for (const [alteracao, status] of [[{ nome: '' }, 400], [{ telefone: '1' }, 400], [{ dataNascimento: '2020-01-01' }, 400], [{ tipoDocumento: 'CPF' }, 400], [{ documento: '1' }, 400]]) {
    assert.equal((await ambiente.patch(`${base}/perfil`, { ...perfilCorpo, ...alteracao })).status, status);
  }
});

test('perfil do responsável: conflitos de CNPJ e sucesso com e sem salão', async () => {
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  banco.responder(/FROM tb_aceite_documento_legal/, [{}, {}]);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice LIMIT 1/, [{ id_unidade: 1 }]);
  assert.match((await ambiente.patch(`${base}/perfil`, perfilCorpo)).corpo.mensagem, /uma unidade da plataforma/);
  assert.ok(banco.revertidas > 0);
  banco.reiniciar();
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  banco.responder(/FROM tb_aceite_documento_legal/, [{}, {}]);
  assert.equal((await ambiente.patch(`${base}/perfil`, perfilCorpo)).status, 200);

  salao();
  banco.responder(/SELECT ds_cnpj_raiz_indice AS indiceRaizCnpj FROM tb_salao/, [{ indiceRaizCnpj: 'outra-raiz' }]);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE fk_salao=:idSalao LIMIT 1/, [{ id_unidade: 1 }]);
  assert.match((await ambiente.patch(`${base}/perfil`, perfilCorpo)).corpo.mensagem, /raiz do CNPJ/);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE fk_salao=:idSalao LIMIT 1/, []);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice AND fk_salao<>:idSalao/, [{ id_unidade: 9 }]);
  assert.match((await ambiente.patch(`${base}/perfil`, perfilCorpo)).corpo.mensagem, /outra unidade/);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice AND fk_salao<>:idSalao/, []);
  assert.equal((await ambiente.patch(`${base}/perfil`, perfilCorpo)).status, 200);
  assert.ok(banco.chamou(/UPDATE tb_salao SET ds_cnpj_raiz_indice/));
});

test('perfil do responsável: erros do banco viram 409 ou 400', async () => {
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  banco.responder(/FROM tb_aceite_documento_legal/, [{}, {}]);
  banco.responder(/UPDATE tb_usuario/, () => { throw Object.assign(new Error('dup'), { parent: { code: 'ER_DUP_ENTRY' } }); });
  assert.equal((await ambiente.patch(`${base}/perfil`, perfilCorpo)).status, 409);
  banco.responder(/UPDATE tb_usuario/, () => { throw new Error('falha qualquer'); });
  assert.equal((await ambiente.patch(`${base}/perfil`, perfilCorpo)).status, 400);
});

test('senha e exclusão de conta', async () => {
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: '1' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: '123456', confirmacaoSenha: 'x' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: 'Senha123!', confirmacaoSenha: 'Senha123!' })).status, 200);
  externo.senha = { ok: false };
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: 'Senha123!', confirmacaoSenha: 'Senha123!' })).status, 400);

  assert.deepEqual((await ambiente.get(`${base}/conta/exclusao`)).corpo, { pendente: false, etapa: null });
  banco.responder(/FROM tb_exclusao_conta_salao WHERE id_autenticacao_externa/, [{ etapa: 'COBRANCA' }]);
  assert.equal((await ambiente.get(`${base}/conta/exclusao`)).corpo.pendente, true);
  f.iniciarExclusao.mockResolvedValue({ etapa: 'CONCLUIDA' });
  assert.equal((await ambiente.delete(`${base}/conta`)).corpo.etapa, 'CONCLUIDA');
  f.iniciarExclusao.mockRejectedValue(Object.assign(new Error('pendente'), { codigo: 'EXCLUSAO_PENDENTE', etapa: 'COBRANCA', cobrancaEncerrada: false }));
  assert.equal((await ambiente.delete(`${base}/conta`)).corpo.codigo, 'EXCLUSAO_PENDENTE');
});

// ---- assinatura ----

test('consultar assinatura: básico, estados Stripe e falha de sincronização', async () => {
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 404);
  salao();
  const basico = await ambiente.get(`${base}/assinatura`);
  assert.equal(basico.corpo.assinatura.plano, 'BASICO');
  assert.equal(basico.corpo.modoTeste, true);
  assinatura({ provedor: 'LOCAL' });
  assert.equal((await ambiente.get(`${base}/assinatura`)).corpo.assinatura.plano, 'PREMIUM');
  assinatura({ status: 'CANCELAMENTO_AGENDADO' });
  f.sincronizar.mockResolvedValue(true);
  const agendada = await ambiente.get(`${base}/assinatura`);
  assert.equal(agendada.corpo.assinatura.podeReativar, true);
  assert.equal('parametrosCheckout' in agendada.corpo.assinatura, false);
  f.sincronizar.mockResolvedValue(false);
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 502);
});

test('consultar assinatura pendente recupera ou consulta o checkout', async () => {
  salao();
  assinatura({ status: 'PENDENTE', idAssinaturaProvedor: null, idCheckoutProvedor: null, parametrosCheckout: '{}', criadaEm: new Date() });
  f.recuperarCheckout.mockResolvedValue({ id: 'cs_1' });
  f.consultarCheckout.mockResolvedValue({ id: 'cs_1', status: 'open', subscription: null });
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 200);
  assert.equal(f.recuperarCheckout.mock.calls.length, 1);
  assinatura({ status: 'PENDENTE', idAssinaturaProvedor: null, idCheckoutProvedor: 'cs_1', parametrosCheckout: null });
  f.consultarCheckout.mockResolvedValue({ id: 'cs_1', subscription: 'sub_9' });
  f.sincronizar.mockResolvedValue(true);
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 200);
  f.consultarCheckout.mockResolvedValue({ id: 'cs_1', subscription: { id: 'sub_9' } });
  f.sincronizar.mockResolvedValue(false);
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 502);
  f.consultarCheckout.mockResolvedValue({ id: 'cs_1', status: 'expired', subscription: null });
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 200);
  assert.ok(banco.chamou(/SET cd_status='CANCELADA', dt_cancelamento=NOW\(\)/));
  f.consultarCheckout.mockResolvedValue({ id: 'cs_1', status: 'open', subscription: null });
  assert.equal((await ambiente.get(`${base}/assinatura`)).status, 200);
});

test('ativar assinatura em modo de teste', async () => {
  assert.equal((await ambiente.post(`${base}/assinatura/ativar`, {})).status, 404);
  salao();
  process.env.ASSINATURA_MODO_TESTE = 'false';
  try { assert.equal((await ambiente.post(`${base}/assinatura/ativar`, { periodicidade: 'mensal' })).status, 403); } finally { process.env.ASSINATURA_MODO_TESTE = 'true'; }
  f.reservar.mockResolvedValue({});
  assert.equal((await ambiente.post(`${base}/assinatura/ativar`, { periodicidade: 'mensal' })).status, 200);
  assert.equal(f.reservar.mock.calls[0][0].periodicidade, 'MENSAL');
  f.reservar.mockRejectedValue(new Error('plano'));
  assert.equal((await ambiente.post(`${base}/assinatura/ativar`, {})).status, 400);
});

test('iniciar checkout cria (201) ou retoma (200) e traduz erros', async () => {
  assert.equal((await ambiente.post(`${base}/assinatura/checkout`, {})).status, 404);
  salao();
  f.reservar.mockResolvedValue({ nova: true });
  f.finalizar.mockResolvedValue({ url: 'https://pay/1' });
  const criado = await ambiente.post(`${base}/assinatura/checkout`, { periodicidade: 'anual' });
  assert.equal(criado.status, 201);
  assert.equal(criado.corpo.checkoutUrl, 'https://pay/1');
  f.reservar.mockResolvedValue({ nova: false });
  assert.equal((await ambiente.post(`${base}/assinatura/checkout`, { periodicidade: 'anual' })).status, 200);
  f.finalizar.mockRejectedValue(Object.assign(new Error('encerrado'), { status: 409, codigo: 'CHECKOUT_ENCERRADO' }));
  assert.equal((await ambiente.post(`${base}/assinatura/checkout`, {})).status, 409);
  f.finalizar.mockRejectedValue(new Error('rede'));
  assert.equal((await ambiente.post(`${base}/assinatura/checkout`, {})).status, 502);
});

test('cancelar assinatura: sem registro, Stripe, local e falha', async () => {
  assert.equal((await ambiente.patch(`${base}/assinatura/cancelar`, {})).status, 404);
  salao();
  assert.equal((await ambiente.patch(`${base}/assinatura/cancelar`, {})).status, 404);
  const registro = /id_checkout_provedor AS idCheckout,\s+js_parametros_checkout AS parametros/;
  banco.responder(registro, [{ idAssinatura: 3, provedor: 'STRIPE' }]);
  assinatura({ status: 'CANCELAMENTO_AGENDADO' });
  f.cancelarRecursos.mockResolvedValue({ idAssinatura: 'sub_1' });
  f.sincronizar.mockResolvedValue(true);
  assert.match((await ambiente.patch(`${base}/assinatura/cancelar`, {})).corpo.mensagem, /Renovação cancelada/);
  banco.responder(registro, [{ idAssinatura: 3, provedor: 'LOCAL' }]);
  assinatura({ status: 'CANCELADA', provedor: 'LOCAL' });
  assert.match((await ambiente.patch(`${base}/assinatura/cancelar`, {})).corpo.mensagem, /encerrada imediatamente/);
  assert.ok(banco.chamou(/UPDATE tb_assinatura_salao SET cd_status='CANCELADA'/));
  banco.responder(registro, [{ idAssinatura: 3, provedor: 'STRIPE' }]);
  f.cancelarRecursos.mockRejectedValue(Object.assign(new Error('conflito'), { status: 502, codigo: 'ASSINATURA_EM_CONFLITO' }));
  assert.equal((await ambiente.patch(`${base}/assinatura/cancelar`, {})).corpo.codigo, 'ASSINATURA_EM_CONFLITO');
  f.cancelarRecursos.mockRejectedValue(new Error('rede'));
  assert.equal((await ambiente.patch(`${base}/assinatura/cancelar`, {})).status, 502);
});

test('reativar assinatura cobre todos os desfechos', async () => {
  assert.equal((await ambiente.patch(`${base}/assinatura/reativar`, {})).status, 404);
  salao();
  assert.match((await ambiente.patch(`${base}/assinatura/reativar`, {})).corpo.mensagem, /Não há uma assinatura/);
  assinatura();
  f.sincronizar.mockResolvedValue(true);
  assert.match((await ambiente.patch(`${base}/assinatura/reativar`, {})).corpo.mensagem, /já está ativa/);
  assinatura({ status: 'CANCELADA' });
  assert.equal((await ambiente.patch(`${base}/assinatura/reativar`, {})).status, 409);
  assinatura({ status: 'CANCELAMENTO_AGENDADO' });
  f.reativar.mockResolvedValue({});
  assert.match((await ambiente.patch(`${base}/assinatura/reativar`, {})).corpo.mensagem, /ainda não foi confirmada/);
  let consultas = 0;
  banco.responder(ASSINATURA, () => [{ idAssinatura: 3, provedor: 'STRIPE', idAssinaturaProvedor: 'sub_1', dataProximaCobranca: '2999-01-01', status: ++consultas === 1 ? 'CANCELAMENTO_AGENDADO' : 'AUTORIZADA' }]);
  assert.equal((await ambiente.patch(`${base}/assinatura/reativar`, {})).status, 200);
  assinatura({ status: 'CANCELAMENTO_AGENDADO' });
  f.reativar.mockRejectedValue(Object.assign(new Error('fora do período'), { status: 409 }));
  assert.equal((await ambiente.patch(`${base}/assinatura/reativar`, {})).status, 409);
  f.reativar.mockRejectedValue(new Error('rede'));
  assert.equal((await ambiente.patch(`${base}/assinatura/reativar`, {})).status, 502);
});

test('reativar encerra a assinatura quando a exclusão da conta começou no meio', async () => {
  let consultasSalao = 0;
  banco.responder(SALAO, () => (++consultasSalao <= 1 ? [{ idSalao: 1, slug: 's', emailConta: 'a@a.com' }] : []));
  assinatura({ status: 'CANCELAMENTO_AGENDADO' });
  f.sincronizar.mockResolvedValue(true);
  f.reativar.mockResolvedValue({});
  const resposta = await ambiente.patch(`${base}/assinatura/reativar`, {});
  assert.equal(resposta.status, 409);
  assert.equal(f.encerrar.mock.calls.length, 1);
});

test('alterar periodicidade valida estado e agenda a troca', async () => {
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, {})).status, 404);
  salao();
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'anual' })).status, 404);
  assinatura({ status: 'CANCELAMENTO_AGENDADO' });
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'anual' })).status, 409);
  assinatura({ periodicidadePendente: 'ANUAL' });
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'MENSAL' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'ANUAL' })).status, 409);
  assinatura();
  f.atualizarPeriodicidade.mockResolvedValue({});
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'anual' })).status, 200);
  assert.ok(banco.chamou(/cd_periodicidade_pendente=:periodicidade WHERE/));
  f.atualizarPeriodicidade.mockRejectedValue(new Error('stripe'));
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'anual' })).status, 400);
});

test('alterar periodicidade desfaz a troca quando a exclusão da conta começou', async () => {
  let consultasSalao = 0;
  banco.responder(SALAO, () => (++consultasSalao <= 1 ? [{ idSalao: 1, slug: 's' }] : []));
  assinatura();
  f.atualizarPeriodicidade.mockResolvedValue({});
  assert.equal((await ambiente.patch(`${base}/assinatura/periodicidade`, { periodicidade: 'anual' })).status, 400);
  assert.equal(f.encerrar.mock.calls.length, 1);
});

test('consultar assinatura sem vínculo no provedor devolve o registro como está', async () => {
  salao();
  assinatura({ idAssinaturaProvedor: null, status: 'AUTORIZADA' });
  const resposta = await ambiente.get(`${base}/assinatura`);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.assinatura.plano, 'PREMIUM');
});

test('reativar assinatura confirma quando o Stripe já refletiu a renovação', async () => {
  salao();
  let consultas = 0;
  banco.responder(ASSINATURA, () => [{ idAssinatura: 3, provedor: 'STRIPE', idAssinaturaProvedor: 'sub_1', dataProximaCobranca: '2999-01-01', status: ++consultas >= 4 ? 'AUTORIZADA' : 'CANCELAMENTO_AGENDADO' }]);
  f.sincronizar.mockResolvedValue(true);
  f.reativar.mockResolvedValue({});
  const resposta = await ambiente.patch(`${base}/assinatura/reativar`, {});
  assert.equal(resposta.status, 200);
  assert.match(resposta.corpo.mensagem, /reativada/);
});

// ---- ramificações restantes ----

test('coordenadas: resultado sem identificador, título nem rótulo usa valores derivados', async () => {
  externo.here = { ok: true, json: async () => ({ items: [{ position: { lat: -23.5, lng: -46.6 } }, { id: 'h2', position: { lat: -23.6, lng: -46.7 }, address: { label: 'Rótulo HERE' } }] }) };
  const resposta = await ambiente.get(`${base}/coordenadas?cep=01001000&numero=10`);
  assert.equal(resposta.corpo.sugestoes[0].id, '-23.5,-46.6');
  assert.match(resposta.corpo.sugestoes[0].endereco, /Rua A/);
  assert.equal(resposta.corpo.sugestoes[1].endereco, 'Rótulo HERE');
});

test('perfil: erro sem mensagem devolve o texto padrão', async () => {
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  banco.responder(/FROM tb_aceite_documento_legal/, [{}, {}]);
  banco.responder(/UPDATE tb_usuario/, () => { throw new Error(''); });
  const resposta = await ambiente.patch(`${base}/perfil`, perfilCorpo);
  assert.equal(resposta.status, 400);
  assert.equal(resposta.corpo.mensagem, 'Não foi possível atualizar suas informações.');
});

test('senha: cabeçalho sem Bearer ainda chega ao provedor', async () => {
  const resposta = await ambiente.patch(`${base}/senha`, { senha: 'Senha123!', confirmacaoSenha: 'Senha123!' }, { authorization: 'Basic abc' });
  assert.equal(resposta.status, 200);
});
