import assert from 'node:assert/strict';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, {
  ADMIN_SESSION_SECRET: 'x'.repeat(40), ADMIN_EMAIL: 'admin@agendeaki.com', ADMIN_PASSWORD: 'senha-forte', ADMIN_NAME: 'Chefe',
});
const ambiente = await iniciarRota('rotas/admin.js', { montagem: '/api/admin' });
const { banco } = ambiente;
const { compararSeguramente, criarServicoSessoesAdmin } = await import('../src/servicos/sessoesAdmin.js');
afterAll(() => ambiente.parar());

let sessaoGravada;
beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  sessaoGravada = null;
  banco.responder(/INSERT INTO tb_sessao_admin/, (opcoes) => { sessaoGravada = opcoes.replacements; return [[], {}]; });
  banco.responder(/FROM tb_sessao_admin/, () => (sessaoGravada ? [{ versao: sessaoGravada.versao, revogada: null }] : []));
});

async function entrar() {
  const resposta = await ambiente.post('/api/admin/login', { email: 'ADMIN@agendeaki.com', senha: 'senha-forte' });
  return resposta.corpo.tokenAcesso;
}
const autorizar = (token) => ({ authorization: `Bearer ${token}` });

test('login recusa quando o acesso administrativo não está configurado', async () => {
  const segredo = process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_SESSION_SECRET;
  try { assert.equal((await ambiente.post('/api/admin/login', {})).status, 503); }
  finally { process.env.ADMIN_SESSION_SECRET = segredo; }
});

test('login recusa credenciais inválidas e aceita as corretas ignorando a caixa do e-mail', async () => {
  assert.equal((await ambiente.post('/api/admin/login', { email: 'outro@x.com', senha: 'senha-forte' })).status, 401);
  assert.equal((await ambiente.post('/api/admin/login', { email: 'admin@agendeaki.com', senha: 'errada' })).status, 401);
  const resposta = await ambiente.post('/api/admin/login', { email: 'ADMIN@agendeaki.com', senha: 'senha-forte' });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.usuario.nome, 'Chefe');
  assert.ok(resposta.corpo.tokenAcesso);
});

test('login devolve 503 quando não consegue gravar a sessão', async () => {
  banco.responder(/INSERT INTO tb_sessao_admin/, () => { throw new Error('banco fora'); });
  assert.equal((await ambiente.post('/api/admin/login', { email: 'admin@agendeaki.com', senha: 'senha-forte' })).status, 503);
});

test('perfil exige sessão válida e devolve 503 se a validação falhar', async () => {
  assert.equal((await ambiente.get('/api/admin/perfil', { authorization: '' })).status, 401);
  const token = await entrar();
  const perfil = await ambiente.get('/api/admin/perfil', autorizar(token));
  assert.equal(perfil.status, 200);
  assert.equal(perfil.corpo.perfil.email, 'admin@agendeaki.com');
  banco.responder(/FROM tb_sessao_admin/, () => { throw new Error('banco fora'); });
  assert.equal((await ambiente.get('/api/admin/perfil', autorizar(token))).status, 503);
});

test('logout revoga a sessão e recusa token inválido', async () => {
  assert.equal((await ambiente.post('/api/admin/logout', {}, autorizar('invalido'))).status, 401);
  const token = await entrar();
  assert.equal((await ambiente.post('/api/admin/logout', {}, autorizar(token))).status, 200);
  assert.ok(banco.chamou(/UPDATE tb_sessao_admin SET dt_revogacao/));
  banco.responder(/FROM tb_sessao_admin/, () => { throw new Error('banco fora'); });
  assert.equal((await ambiente.post('/api/admin/logout', {}, autorizar(token))).status, 503);
});

test('dashboard monta resumo, série dos 12 meses e listas', async () => {
  const token = await entrar();
  const mesAtual = new Date().toISOString().slice(0, 7);
  banco.responder(/tp_usuario='CLIENTE'\s+FROM|FROM tb_usuario WHERE tp_usuario='CLIENTE'/, [{ total: '10', ativos: '8' }]);
  banco.responder(/FROM tb_salao`|FROM tb_salao$/, [{ total: '4', ativos: '3' }]);
  banco.responder(/assinaturasAtivas/, [{ assinaturasAtivas: '2', emTeste: '1', pagamentoPendente: '0', mrrEstimado: '59.8' }]);
  banco.responder(/COUNT\(\*\) AS quantidade, COALESCE\(SUM\(vl_pago_centavos\)/, [{ quantidade: '3', receitaCentavos: '8970' }]);
  banco.responder(/GROUP BY mes/, [{ mes: `${mesAtual}-01`, total: '5' }, { mes: '1999-01-01', total: '9' }]);
  const resposta = await ambiente.get('/api/admin/dashboard', autorizar(token));
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.serieMensal.length, 12);
  assert.equal(resposta.corpo.serieMensal.at(-1).clientes, 5);
  assert.equal(resposta.corpo.resumo.receitaConfirmada, 89.7);
  assert.equal(resposta.corpo.resumo.assinaturas.ativas, 2);
});

test('dashboard devolve 500 quando uma consulta falha e 401 sem sessão', async () => {
  assert.equal((await ambiente.get('/api/admin/dashboard', { authorization: '' })).status, 401);
  const token = await entrar();
  banco.responder(/FROM tb_salao s INNER JOIN tb_usuario u/, () => { throw new Error('falha'); });
  assert.equal((await ambiente.get('/api/admin/dashboard', autorizar(token))).status, 500);
});

for (const [caminho, rotulo] of [['clientes', 'clientes'], ['saloes', 'salões'], ['unidades', 'unidades'], ['assinaturas', 'assinaturas']]) {
  test(`lista de ${rotulo} pagina, filtra por busca e limita parâmetros`, async () => {
    const token = await entrar();
    banco.responder(/LIMIT :limite OFFSET :deslocamento/, [{ id: 1 }]);
    banco.responder(/SELECT COUNT\(\*\) AS total/, [{ total: '45' }]);
    const resposta = await ambiente.get(`/api/admin/${caminho}?pagina=2&limite=999&busca=${'a'.repeat(150)}`, autorizar(token));
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.limite, 50);
    assert.equal(resposta.corpo.totalPaginas, 1);
    const consulta = banco.chamadas.find((c) => /LIMIT :limite/.test(c.sql));
    assert.equal(consulta.opcoes.replacements.deslocamento, 50);
    assert.equal(consulta.opcoes.replacements.termo.length, 102);
    assert.match(consulta.sql, /LIKE :termo/);
    const semBusca = await ambiente.get(`/api/admin/${caminho}`, autorizar(token));
    assert.equal(semBusca.corpo.pagina, 1);
    assert.equal(semBusca.corpo.limite, 20);
  });

  test(`lista de ${rotulo} exige sessão e devolve 500 quando o banco falha`, async () => {
    assert.equal((await ambiente.get(`/api/admin/${caminho}`, { authorization: '' })).status, 401);
    const token = await entrar();
    banco.responder(/LIMIT :limite OFFSET :deslocamento/, () => { throw new Error('falha'); });
    assert.equal((await ambiente.get(`/api/admin/${caminho}`, autorizar(token))).status, 500);
  });
}

test('serviço de sessões: valida expiração, assinatura, e-mail alterado e credencial trocada', async () => {
  let agora = 1_700_000_000_000;
  const registros = new Map();
  const banco2 = {
    async query(sql, { replacements }) {
      if (sql.startsWith('INSERT')) registros.set(replacements.hash, { versao: replacements.versao, revogada: null });
      if (sql.startsWith('SELECT')) { const r = registros.get(replacements.hash); return r ? [r] : []; }
      if (sql.startsWith('UPDATE')) registros.get(replacements.hash).revogada = new Date();
      return [];
    },
  };
  const env = { ADMIN_SESSION_SECRET: 'k'.repeat(40), ADMIN_EMAIL: 'a@a.com', ADMIN_PASSWORD: 'p' };
  const servico = criarServicoSessoesAdmin({ banco: banco2, ambiente: env, agora: () => agora });
  assert.equal(servico.configurado(), true);
  const token = await servico.criar('a@a.com');
  assert.deepEqual(await servico.validar(token), { email: 'a@a.com' });
  assert.equal(await servico.validar(`${token}.extra`), null);
  assert.equal(await servico.validar(`${token.split('.')[0]}.assinaturaerrada`), null);
  assert.equal(await servico.validar(undefined), null);
  assert.equal(await servico.validar('x'.repeat(5000)), null);
  env.ADMIN_PASSWORD = 'outra';
  assert.equal(await servico.validar(token), null);
  env.ADMIN_PASSWORD = 'p';
  env.ADMIN_EMAIL = 'b@b.com';
  assert.equal(await servico.validar(token), null);
  env.ADMIN_EMAIL = 'a@a.com';
  assert.equal(await servico.revogar(token), true);
  assert.equal(await servico.validar(token), null);
  assert.equal(await servico.revogar('lixo'), false);
  agora += 9 * 60 * 60 * 1000;
  assert.equal(await servico.validar(token, true), null);
  assert.equal(criarServicoSessoesAdmin({ banco: banco2, ambiente: { ADMIN_SESSION_SECRET: 'curto' } }).configurado(), false);
  assert.equal(compararSeguramente('a', 'ab'), false);
  assert.equal(compararSeguramente('ab', 'ab'), true);
});

test('dashboard e listas assumem zero quando o banco devolve campos vazios', async () => {
  const token = await entrar();
  banco.responder(/tp_usuario='CLIENTE'\s+FROM|FROM tb_usuario WHERE tp_usuario='CLIENTE'/, [{}]);
  banco.responder(/FROM tb_salao`|FROM tb_salao$/, [{}]);
  banco.responder(/assinaturasAtivas/, [{}]);
  banco.responder(/COUNT\(\*\) AS quantidade, COALESCE\(SUM\(vl_pago_centavos\)/, [{}]);
  const dashboard = await ambiente.get('/api/admin/dashboard', autorizar(token));
  assert.equal(dashboard.status, 200);
  assert.deepEqual(dashboard.corpo.resumo.clientes, { total: 0, ativos: 0 });
  assert.equal(dashboard.corpo.resumo.mrrEstimado, 0);
  assert.equal(dashboard.corpo.resumo.receitaConfirmada, 0);
  const lista = await ambiente.get('/api/admin/clientes', autorizar(token));
  assert.equal(lista.corpo.total, 0);
});

test('login sem corpo é recusado e o nome padrão aparece quando ADMIN_NAME não existe', async () => {
  const nome = process.env.ADMIN_NAME;
  delete process.env.ADMIN_NAME;
  try {
    assert.equal((await ambiente.post('/api/admin/login', {})).status, 401);
    const resposta = await ambiente.post('/api/admin/login', { email: 'admin@agendeaki.com', senha: 'senha-forte' });
    assert.equal(resposta.corpo.usuario.nome, 'Administrador');
    const perfil = await ambiente.get('/api/admin/perfil', autorizar(resposta.corpo.tokenAcesso));
    assert.equal(perfil.corpo.perfil.nome, 'Administrador');
  } finally { process.env.ADMIN_NAME = nome; }
});
