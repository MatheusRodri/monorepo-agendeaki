import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

let atualizacaoSenhaOk = true;
const servidorSupabase = await new Promise((resolver) => {
  const s = http.createServer((requisicao, resposta) => { resposta.statusCode = atualizacaoSenhaOk ? 200 : 400; resposta.end('{}'); });
  s.listen(0, '127.0.0.1', () => resolver(s));
});
Object.assign(process.env, {
  DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64'),
  SUPABASE_URL: `http://127.0.0.1:${servidorSupabase.address().port}`, SUPABASE_ANON_KEY: 'anon',
  FRONTEND_URL: 'https://app.teste/',
});

const ambiente = await iniciarRota('rotas/autenticacao.js', { montagem: '/api/autenticacao' });
const { banco, supabase } = ambiente;
const { sincronizarUsuario, obterPendenciasUsuario, registrarAceitePendente, atualizarDadosCadastraisUsuario, validarPerfilLocal,
  publicarPerfilConfiavel, obterDadosCadastraisUsuario } = await import('../src/servicos/usuarios.js');
const protegidos = await import('../src/servicos/documentosProtegidos.js');
afterAll(async () => { await ambiente.parar(); await new Promise((r) => servidorSupabase.close(r)); });

const base = '/api/autenticacao';
const cliente = { nome: 'Maria', email: 'maria@teste.com', senha: '123456', confirmacaoSenha: '123456', dataNascimento: '1990-05-20', telefone: '11987654321', aceitouDocumentos: true };
const salao = { nomeResponsavel: 'João', nomeSalao: 'Studio J', email: 'joao@teste.com', senha: '123456', confirmacaoSenha: '123456',
  dataNascimento: '1985-01-10', telefoneResponsavel: '11987654321', tipoDocumento: 'CNPJ', documento: '11.222.333/0001-81', aceitouDocumentos: true };

function usuarioLogado(perfil = 'CLIENTE', extra = {}) {
  banco.responder(/FROM tb_usuario WHERE id_autenticacao_externa=:idAutenticacaoExterna/, [{ idUsuario: 1, perfil, ativo: 1, ...extra }]);
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1, nome: 'Maria', email: 'm@x.com', telefone: '11999999999',
    dataNascimento: '1990-05-20', tipoDocumento: perfil === 'ADMIN_SALAO' ? 'CNPJ' : null, documentoCifrado: null }]);
  banco.responder(/FROM tb_aceite_documento_legal/, [{ cd_documento: 'TERMOS_USO' }, { cd_documento: 'POLITICA_PRIVACIDADE' }]);
}

beforeEach(() => {
  banco.reiniciar();
  supabase.estado.respostas = {};
  supabase.estado.chamadas.length = 0;
  atualizacaoSenhaOk = true;
  silenciarConsole();
});

test('documentos legais são servidos com versão', async () => {
  const resposta = await ambiente.get(`${base}/documentos-legais`);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.termosDeUso.versao, '1.0');
  assert.ok(resposta.corpo.politicaPrivacidade.texto.length > 10);
});

test('cadastro exige aceite dos documentos', async () => {
  const resposta = await ambiente.post(`${base}/clientes/cadastro`, { ...cliente, aceitouDocumentos: false });
  assert.equal(resposta.status, 400);
});

test('cadastro valida campos de cliente e de salão', async () => {
  const casos = [
    [{ ...cliente, nome: '' }, /obrigatórios/], [{ ...cliente, email: 'ruim' }, /e-mail válido/], [{ ...cliente, senha: '123', confirmacaoSenha: '123' }, /6 caracteres/],
    [{ ...cliente, confirmacaoSenha: 'outra1' }, /confirmação/], [{ ...cliente, dataNascimento: '2020-01-01' }, /18 anos/], [{ ...cliente, telefone: '123' }, /telefone/],
  ];
  for (const [corpo, padrao] of casos) {
    const resposta = await ambiente.post(`${base}/clientes/cadastro`, corpo);
    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.mensagem, padrao);
  }
  const casosSalao = [
    [{ ...salao, nomeSalao: ' ' }, /nome do salão/], [{ ...salao, telefoneResponsavel: '1' }, /telefone/], [{ ...salao, tipoDocumento: 'CPF' }, /CNPJ/], [{ ...salao, documento: '11.111.111/1111-11' }, /CNPJ válido/],
  ];
  for (const [corpo, padrao] of casosSalao) {
    const resposta = await ambiente.post(`${base}/saloes/cadastro`, corpo);
    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.mensagem, padrao);
  }
});

test('cadastro de cliente cria identidade, registros locais e envia confirmação', async () => {
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 7 }]);
  const resposta = await ambiente.post(`${base}/clientes/cadastro`, cliente);
  assert.equal(resposta.status, 201);
  assert.equal(resposta.corpo.usuario.perfil, 'CLIENTE');
  assert.ok(banco.chamou(/INSERT INTO tb_usuario/));
  assert.ok(banco.chamou(/INSERT INTO tb_aceite_documento_legal/));
  assert.equal(banco.chamou(/INSERT INTO tb_salao/), false);
});

test('cadastro de salão cria também o salão com slug e raiz do CNPJ', async () => {
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  const resposta = await ambiente.post(`${base}/saloes/cadastro`, salao);
  assert.equal(resposta.status, 201);
  const insercao = banco.chamadas.find((c) => /INSERT INTO tb_salao/.test(c.sql));
  assert.equal(insercao.opcoes.replacements.slug, 'studio-j');
  assert.equal(insercao.opcoes.replacements.indiceRaizCnpj.length, 64);
});

test('cadastro de salão recusa CNPJ já cadastrado antes de criar a identidade', async () => {
  banco.responder(/SELECT id_unidade FROM tb_unidade/, [{ id_unidade: 1 }]);
  assert.equal((await ambiente.post(`${base}/saloes/cadastro`, salao)).status, 409);
  banco.reiniciar();
  banco.responder(/SELECT id_salao FROM tb_salao WHERE ds_cnpj_raiz_indice/, [{ id_salao: 1 }]);
  const resposta = await ambiente.post(`${base}/saloes/cadastro`, salao);
  assert.match(resposta.corpo.mensagem, /já possui um salão/);
  assert.equal(supabase.estado.chamadas.length, 0);
});

test('cadastro propaga erro do provedor e e-mail já existente', async () => {
  supabase.estado.respostas.createUser = { data: null, error: { message: 'e-mail inválido no provedor' } };
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`, cliente)).status, 400);
  supabase.estado.respostas.createUser = { data: { user: {} }, error: null };
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`, cliente)).status, 500);
  supabase.estado.respostas.createUser = undefined;
  banco.responder(/SELECT id_usuario FROM tb_usuario WHERE ds_email/, [{ id_usuario: 1 }]);
  const resposta = await ambiente.post(`${base}/clientes/cadastro`, cliente);
  assert.equal(resposta.status, 409);
  assert.ok(supabase.estado.chamadas.some(([nome]) => nome === 'deleteUser'));
});

test('cadastro de salão recusa documento já existente em usuário ou unidade (dentro da transação)', async () => {
  banco.responder(/SELECT id_usuario FROM tb_usuario WHERE ds_documento_indice/, (opcoes) => (opcoes.transaction ? [{ id_usuario: 2 }] : []));
  assert.match((await ambiente.post(`${base}/saloes/cadastro`, salao)).corpo.mensagem, /CNPJ já está cadastrado/);
  banco.reiniciar();
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice/, (opcoes) => (opcoes.transaction ? [{ id_unidade: 2 }] : []));
  assert.match((await ambiente.post(`${base}/saloes/cadastro`, salao)).corpo.mensagem, /unidade da plataforma/);
});

test('cadastro de salão traduz duplicidade do banco em 409', async () => {
  banco.responder(/INSERT INTO tb_salao/, () => { throw Object.assign(new Error('dup'), { original: { code: 'ER_DUP_ENTRY' } }); });
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  const resposta = await ambiente.post(`${base}/saloes/cadastro`, salao);
  assert.equal(resposta.status, 409);
});

test('cadastro desfaz tudo quando falha ao enviar o e-mail de confirmação', async () => {
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  supabase.estado.respostas.resend = { error: { message: 'smtp' } };
  const resposta = await ambiente.post(`${base}/saloes/cadastro`, salao);
  assert.equal(resposta.status, 502);
  assert.ok(banco.chamou(/DELETE FROM tb_salao/));
  assert.ok(banco.chamou(/DELETE FROM tb_usuario/));
});

test('cadastro tolera falha ao remover registros e identidade durante o desfazer', async () => {
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  supabase.estado.respostas.resend = { error: { message: 'smtp' } };
  supabase.estado.respostas.deleteUser = () => { throw new Error('provedor fora'); };
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`, cliente)).status, 502);
  banco.reiniciar();
  supabase.estado.respostas = {};
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  supabase.estado.respostas.updateUserById = { error: { message: 'falha' } };
  banco.responder(/DELETE FROM tb_usuario/, () => { throw new Error('banco fora'); });
  const resposta = await ambiente.post(`${base}/clientes/cadastro`, cliente);
  assert.equal(resposta.status, 502);
});

test('cadastro responde 500 quando o usuário local não é encontrado após o insert', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`, cliente)).status, 500);
});

test('verificar CNPJ informa inválido, disponível e já cadastrado', async () => {
  assert.deepEqual((await ambiente.post(`${base}/saloes/verificar-cnpj`, { documento: '123' })).corpo, { valido: false, disponivel: false });
  assert.deepEqual((await ambiente.post(`${base}/saloes/verificar-cnpj`, { documento: '11.222.333/0001-81' })).corpo, { valido: true, disponivel: true });
  banco.responder(/SELECT id_usuario FROM tb_usuario WHERE ds_documento_indice/, [{ id_usuario: 1 }]);
  const resposta = await ambiente.post(`${base}/saloes/verificar-cnpj`, { documento: '11.222.333/0001-81' });
  assert.equal(resposta.corpo.disponivel, false);
  assert.ok(resposta.corpo.mensagem);
});

test('login valida campos e credenciais', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/login`, { email: '', senha: '' })).status, 400);
  supabase.estado.respostas.signInWithPassword = { data: null, error: { message: 'x' } };
  assert.equal((await ambiente.post(`${base}/clientes/login`, { email: 'a@a.com', senha: 'x' })).status, 401);
  supabase.estado.respostas.signInWithPassword = { data: { user: {}, session: null }, error: null };
  assert.match((await ambiente.post(`${base}/clientes/login`, { email: 'a@a.com', senha: 'x' })).corpo.mensagem, /Confirme seu e-mail/);
});

test('login de cliente devolve tokens, pendências e dados cadastrais', async () => {
  usuarioLogado('CLIENTE');
  const resposta = await ambiente.post(`${base}/clientes/login`, { email: 'a@a.com', senha: '123456' });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.tokenAcesso, 'a');
  assert.equal(resposta.corpo.cadastroIncompleto, false);
  assert.equal(resposta.corpo.nomeSalao, null);
});

test('login de salão indica salão incompleto quando não há salão cadastrado', async () => {
  usuarioLogado('ADMIN_SALAO');
  supabase.estado.respostas.signInWithPassword = { data: { user: { id: 'sup-1', email: 's@s.com', user_metadata: { nomeSalao: 'Studio' } }, session: { access_token: 'a', refresh_token: 'r' } }, error: null };
  const resposta = await ambiente.post(`${base}/saloes/login`, { email: 's@s.com', senha: '123456' });
  assert.equal(resposta.corpo.salaoIncompleto, true);
  assert.equal(resposta.corpo.nomeSalao, 'Studio');
  banco.responder(/SELECT id_salao FROM tb_salao WHERE fk_usuario_administrador/, [{ id_salao: 1 }]);
  assert.equal((await ambiente.post(`${base}/saloes/login`, { email: 's@s.com', senha: '123456' })).corpo.salaoIncompleto, false);
});

test('login de salão com exclusão pendente devolve a sessão marcada', async () => {
  banco.responder(/FROM tb_exclusao_conta_salao/, [{ idOperacao: 1, idUsuario: 1, idSalao: 1, idAutenticacaoExterna: 'sup-1', etapa: 'X' }]);
  const resposta = await ambiente.post(`${base}/saloes/login`, { email: 'a@a.com', senha: '123456' });
  assert.equal(resposta.corpo.exclusaoPendente, true);
});

test('login recusa perfil errado e exclusão pendente de cliente com erro do serviço', async () => {
  usuarioLogado('ADMIN_SALAO');
  const resposta = await ambiente.post(`${base}/clientes/login`, { email: 'a@a.com', senha: '123456' });
  assert.equal(resposta.status, 403);
  assert.equal(resposta.corpo.codigo, 'PERFIL_SEM_PERMISSAO');
  banco.responder(/FROM tb_usuario WHERE id_autenticacao_externa/, () => { throw new Error('boom'); });
  assert.equal((await ambiente.post(`${base}/clientes/login`, { email: 'a@a.com', senha: '123456' })).status, 500);
});

test('refresh renova a sessão ou recusa token inválido', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/refresh`, {})).status, 400);
  usuarioLogado('CLIENTE');
  const ok = await ambiente.post(`${base}/clientes/refresh`, { tokenAtualizacao: 'r' });
  assert.deepEqual(ok.corpo, { tokenAcesso: 'a2', tokenAtualizacao: 'r2' });
  supabase.estado.respostas.refreshSession = { data: null, error: { message: 'x' } };
  assert.equal((await ambiente.post(`${base}/clientes/refresh`, { tokenAtualizacao: 'r' })).status, 401);
  supabase.estado.respostas.refreshSession = () => { throw Object.assign(new Error('falhou'), { status: 418 }); };
  assert.equal((await ambiente.post(`${base}/saloes/refresh`, { tokenAtualizacao: 'r' })).status, 418);
});

test('logout valida token, sessão e encerra no provedor', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/logout`, {}, { authorization: '' })).status, 401);
  supabase.estado.respostas.getUser = { data: null, error: { message: 'x' } };
  assert.equal((await ambiente.post(`${base}/clientes/logout`, {})).status, 401);
  supabase.estado.respostas.getUser = undefined;
  supabase.estado.respostas.adminSignOut = { error: { message: 'x' } };
  assert.equal((await ambiente.post(`${base}/clientes/logout`, {})).status, 401);
  supabase.estado.respostas.adminSignOut = undefined;
  assert.equal((await ambiente.post(`${base}/clientes/logout`, { endpointPush: 'https://push/1', idVinculo: 'v' })).status, 204);
  assert.equal((await ambiente.post(`${base}/saloes/logout`, {})).status, 204);
  supabase.estado.respostas.getUser = () => { throw new Error('boom'); };
  assert.equal((await ambiente.post(`${base}/saloes/logout`, {})).status, 500);
});

test('recuperar senha valida e-mail e não revela se existe cadastro', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/recuperar-senha`, { email: 'ruim' })).status, 400);
  assert.equal((await ambiente.post(`${base}/clientes/recuperar-senha`, { email: 'a@a.com' })).status, 200);
  assert.equal(supabase.estado.chamadas.at(-1)[1][1].redirectTo, 'https://app.teste/cliente/redefinir-senha');
  assert.equal((await ambiente.post(`${base}/saloes/recuperar-senha`, { email: 'a@a.com' })).status, 200);
  assert.equal(supabase.estado.chamadas.at(-1)[1][1].redirectTo, 'https://app.teste/salao/redefinir-senha');
  supabase.estado.respostas.resetPasswordForEmail = { error: { message: 'limite' } };
  assert.equal((await ambiente.post(`${base}/clientes/recuperar-senha`, { email: 'a@a.com' })).status, 200);
  supabase.estado.respostas.resetPasswordForEmail = () => { throw new Error('boom'); };
  assert.equal((await ambiente.post(`${base}/clientes/recuperar-senha`, { email: 'a@a.com' })).status, 500);
});

test('redefinir senha valida entradas e atualiza no provedor', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/redefinir-senha`, { senha: '123456', confirmacaoSenha: '123456' }, { authorization: '' })).status, 401);
  assert.equal((await ambiente.post(`${base}/clientes/redefinir-senha`, { senha: '123', confirmacaoSenha: '123' })).status, 400);
  assert.equal((await ambiente.post(`${base}/clientes/redefinir-senha`, { senha: '123456', confirmacaoSenha: '654321' })).status, 400);
  supabase.estado.respostas.getUser = { data: { user: null }, error: null };
  assert.equal((await ambiente.post(`${base}/clientes/redefinir-senha`, { senha: '123456', confirmacaoSenha: '123456' })).status, 401);
  supabase.estado.respostas.getUser = undefined;
  usuarioLogado('CLIENTE');
  assert.equal((await ambiente.post(`${base}/clientes/redefinir-senha`, { senha: '123456', confirmacaoSenha: '123456' })).status, 200);
  atualizacaoSenhaOk = false;
  assert.equal((await ambiente.post(`${base}/clientes/redefinir-senha`, { senha: '123456', confirmacaoSenha: '123456' })).status, 400);
  supabase.estado.respostas.getUser = () => { throw new Error('boom'); };
  assert.equal((await ambiente.post(`${base}/saloes/redefinir-senha`, { senha: '123456', confirmacaoSenha: '123456' })).status, 500);
});

// ---- serviços de usuário e documentos protegidos ----

test('sincronizarUsuario cria usuário local para identidade nova e reaproveita o existente', async () => {
  const identidade = { id: 'u-1', email: 'n@n.com', user_metadata: { nome: 'Novo' } };
  let buscas = 0;
  banco.responder(/FROM tb_usuario WHERE id_autenticacao_externa/, () => (++buscas === 1 ? [] : [{ idUsuario: 5, perfil: 'CLIENTE', ativo: 1 }]));
  const usuario = await sincronizarUsuario({ usuarioSupabase: identidade, perfil: 'CLIENTE' });
  assert.equal(usuario.idUsuario, 5);
  assert.ok(banco.chamou(/INSERT INTO tb_usuario/));
});

test('sincronizarUsuario trata sessão inválida, exclusão, conta inativa e conflitos', async () => {
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: null, perfil: 'CLIENTE' }), { status: 401 });
  banco.responder(/FROM tb_exclusao_conta_salao/, [{ idOperacao: 1 }]);
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: { id: 'x' }, perfil: 'CLIENTE', permitirExclusao: true }), { codigo: 'EXCLUSAO_PENDENTE' });
  banco.reiniciar();
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: { id: 'x', app_metadata: { agendeaki: { situacao: 'BLOQUEADA' } } }, perfil: 'CLIENTE' }), { status: 403 });
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: { id: 'x' }, perfil: 'ADMIN_AGENDEAKI' }), { codigo: 'PERFIL_SEM_PERMISSAO' });
  const confiavelErrado = { id: 'x', app_metadata: { agendeaki: { situacao: 'ATIVA', versao: 1, perfil: 'ADMIN_SALAO', cadastroConcluido: true } } };
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: confiavelErrado, perfil: 'CLIENTE' }), { codigo: 'PERFIL_SEM_PERMISSAO' });
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: { id: 'x', email: 'e@e.com' }, perfil: 'CLIENTE' }), { codigo: 'IDENTIDADE_EM_CONFLITO' });
  banco.responder(/INSERT INTO tb_usuario/, () => { throw Object.assign(new Error('x'), { original: { code: 'OUTRO' } }); });
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: { id: 'x', email: 'e@e.com' }, perfil: 'CLIENTE' }), { message: 'x' });
  banco.responder(/INSERT INTO tb_usuario/, () => { throw Object.assign(new Error('dup'), { parent: { code: 'ER_DUP_ENTRY' } }); });
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: { id: 'x', email: 'e@e.com' }, perfil: 'CLIENTE' }), { codigo: 'IDENTIDADE_EM_CONFLITO' });
  assert.throws(() => validarPerfilLocal({ ativo: 0, perfil: 'CLIENTE' }, 'CLIENTE'), { status: 403 });
  assert.equal(validarPerfilLocal({ ativo: 1, perfil: 'CLIENTE' }, 'CLIENTE').perfil, 'CLIENTE');
});

test('publicarPerfilConfiavel falha com 502 quando o provedor recusa', async () => {
  await publicarPerfilConfiavel(supabase.cliente, { id: 'u', app_metadata: {} }, 'CLIENTE');
  supabase.estado.respostas.updateUserById = { error: { message: 'x' } };
  await assert.rejects(() => publicarPerfilConfiavel(supabase.cliente, { id: 'u' }, 'CLIENTE'), { status: 502 });
});

test('obterPendenciasUsuario detecta aceite, nascimento, telefone e documento de salão faltando', async () => {
  usuarioLogado('CLIENTE');
  assert.equal((await obterPendenciasUsuario(1, 'CLIENTE')).cadastroIncompleto, false);
  assert.equal((await obterPendenciasUsuario(1, 'ADMIN_SALAO')).cadastroIncompleto, true);
  banco.responder(/FROM tb_aceite_documento_legal/, [{ cd_documento: 'TERMOS_USO' }]);
  assert.equal((await obterPendenciasUsuario(1, 'CLIENTE')).aceiteDocumentosPendente, true);
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, []);
  assert.equal((await obterPendenciasUsuario(1, 'CLIENTE')).cadastroIncompleto, true);
});

test('registrarAceitePendente exige o aceite quando pendente e grava quando informado', async () => {
  banco.responder(/FROM tb_aceite_documento_legal/, []);
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  await assert.rejects(() => registrarAceitePendente(1, false), { codigo: 'ACEITE_PENDENTE' });
  await registrarAceitePendente(1, true, {});
  assert.ok(banco.chamou(/INSERT IGNORE INTO tb_aceite_documento_legal/));
  usuarioLogado('CLIENTE');
  banco.chamadas.length = 0;
  await registrarAceitePendente(1, false);
  assert.equal(banco.chamou(/INSERT IGNORE/), false);
});

test('dados cadastrais: decifra o documento e atualiza com ou sem transação', async () => {
  const { documentoCifrado } = protegidos.prepararDocumento('CPF', '529.982.247-25');
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1, nome: 'M', tipoDocumento: 'CPF', documentoCifrado }]);
  const dados = await obterDadosCadastraisUsuario(1);
  assert.equal(dados.cpf, '52998224725');
  banco.reiniciar();
  assert.equal(await obterDadosCadastraisUsuario(1), null);
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1, nome: 'M', tipoDocumento: null, documentoCifrado: null }]);
  assert.equal((await atualizarDadosCadastraisUsuario(1, { cpf: '529.982.247-25', dataNascimento: '1990-01-01', nome: ' Ana ', telefone: ' 119 ' })).idUsuario, 1);
  const update = banco.chamadas.find((c) => /UPDATE tb_usuario/.test(c.sql)).opcoes.replacements;
  assert.equal(update.nome, 'Ana');
  assert.equal(update.tipoDocumento, 'CPF');
  assert.equal(await atualizarDadosCadastraisUsuario(1, { dataNascimento: '1990-01-01', transaction: {} }), null);
});

test('documentos protegidos: cifra, decifra e valida chaves e formatos', () => {
  const { documentoCifrado, documentoIndice } = protegidos.prepararDocumento('CNPJ', '11.222.333/0001-81');
  assert.equal(protegidos.decifrarDocumento(documentoCifrado), '11222333000181');
  assert.equal(documentoIndice, protegidos.prepararDocumento('CNPJ', '11222333000181').documentoIndice);
  assert.deepEqual(protegidos.prepararDocumento('CPF', ''), { documentoCifrado: null, documentoIndice: null });
  assert.throws(() => protegidos.prepararDocumento('RG', '123'), /inválido/);
  assert.throws(() => protegidos.prepararIndiceRaizCnpj('123'), /completo/);
  assert.equal(protegidos.decifrarDocumento(null), null);
  assert.throws(() => protegidos.decifrarDocumento('a:b'), /inválido/);
  assert.throws(() => protegidos.decifrarDocumento('v2:a:b:c'), /não suportada/);
  assert.doesNotThrow(() => protegidos.validarChavesDocumentos());
  const chave = process.env.DOCUMENT_HMAC_KEY;
  process.env.DOCUMENT_HMAC_KEY = 'curta';
  try { assert.throws(() => protegidos.validarChavesDocumentos(), /32 bytes/); } finally { process.env.DOCUMENT_HMAC_KEY = chave; }
});

// ---- ramificações restantes ----

test('cadastro e login sem corpo são recusados com 400', async () => {
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`)).status, 400);
  assert.equal((await ambiente.post(`${base}/clientes/login`)).status, 400);
});

test('login de salão sem nome do salão nos metadados devolve texto vazio', async () => {
  usuarioLogado('ADMIN_SALAO');
  const resposta = await ambiente.post(`${base}/saloes/login`, { email: 's@s.com', senha: '123456' });
  assert.equal(resposta.corpo.nomeSalao, '');
});

test('recuperar senha usa o endereço local quando FRONTEND_URL não existe', async () => {
  const anterior = process.env.FRONTEND_URL;
  delete process.env.FRONTEND_URL;
  try {
    await ambiente.post(`${base}/clientes/recuperar-senha`, { email: 'a@a.com' });
    assert.equal(supabase.estado.chamadas.at(-1)[1][1].redirectTo, 'http://localhost:3000/cliente/redefinir-senha');
  } finally { process.env.FRONTEND_URL = anterior; }
});

test('desfazer cadastro registra a recusa do provedor ao remover a identidade', async () => {
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  supabase.estado.respostas.resend = { error: { message: 'smtp' } };
  supabase.estado.respostas.deleteUser = { error: { message: 'recusado' } };
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`, cliente)).status, 502);
  assert.ok(console.error.mock.calls.some(([texto, detalhe]) => /remover a identidade/.test(texto) && detalhe === 'recusado'));
});

test('duplicidade informada só pelo código do erro também vira 409 no cadastro de salão', async () => {
  banco.responder(/INSERT INTO tb_salao/, () => { throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }); });
  banco.responder(/SELECT id_usuario AS idUsuario FROM tb_usuario WHERE id_autenticacao_externa/, [{ idUsuario: 8 }]);
  assert.equal((await ambiente.post(`${base}/saloes/cadastro`, salao)).status, 409);
});

test('conta recuperável com cadastro não concluído no perfil confiável é recusada', async () => {
  const incompleto = { id: 'x', app_metadata: { agendeaki: { situacao: 'ATIVA', versao: 1, perfil: 'CLIENTE', cadastroConcluido: false } } };
  await assert.rejects(() => sincronizarUsuario({ usuarioSupabase: incompleto, perfil: 'CLIENTE' }), { codigo: 'PERFIL_SEM_PERMISSAO' });
});

test('refresh e logout sem status devolvem a mensagem genérica; com status repassam a mensagem', async () => {
  supabase.estado.respostas.refreshSession = () => { throw new Error('interno'); };
  const refresh = await ambiente.post(`${base}/clientes/refresh`, { tokenAtualizacao: 'r' });
  assert.equal(refresh.status, 500);
  assert.equal(refresh.corpo.mensagem, 'Não foi possível processar a autenticação.');
  supabase.estado.respostas.getUser = () => { throw Object.assign(new Error('bloqueado'), { status: 423 }); };
  const logout = await ambiente.post(`${base}/clientes/logout`, {});
  assert.equal(logout.status, 423);
  assert.equal(logout.corpo.mensagem, 'bloqueado');
});

test('cadastro que falha antes de gravar o usuário local ainda remove a identidade criada', async () => {
  banco.responder(/INSERT INTO tb_usuario/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.post(`${base}/clientes/cadastro`, cliente)).status, 500);
  assert.ok(supabase.estado.chamadas.some(([nome]) => nome === 'deleteUser'));
});
