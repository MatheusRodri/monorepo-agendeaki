import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { jest } from '@jest/globals';
import { beforeEach, test } from '@jest/globals';
import { mockarBanco, silenciarConsole } from './auxiliares/ambiente.js';

const banco = mockarBanco();
const cancelarRecursosContratacao = jest.fn();
const administrativo = { auth: { admin: { getUserById: jest.fn(), deleteUser: jest.fn(), updateUserById: jest.fn() } } };
jest.unstable_mockModule('../src/servicos/contratacoes.js', () => ({ cancelarRecursosContratacao }));
jest.unstable_mockModule('../src/configuracoes/supabase.js', () => ({
  obterClienteAdministrativoSupabase: () => administrativo,
  obterClienteSupabase: () => ({ auth: { getUser: async (token) => (token === 'valido' ? { data: { user: { id: 'sup-1' } }, error: null } : { data: null, error: { message: 'x' } }) } }),
}));
const agenda = await import('../src/servicos/agendaSalao.js');
const exclusao = await import('../src/servicos/exclusaoContaSalao.js');
const excel = await import('../src/servicos/dashboardExcel.js');
const analitico = await import('../src/servicos/dashboardAnalitico.js');
const promocoes = await import('../src/servicos/metricasPromocoes.js');
const slugs = await import('../src/servicos/slugs.js');
const { autenticarRequisicao } = await import('../src/servicos/autorizacaoUsuarios.js');

beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  cancelarRecursosContratacao.mockReset();
  for (const funcao of Object.values(administrativo.auth.admin)) funcao.mockReset();
});

// ---- agenda do salão ----

test('normalizar consulta da agenda valida tipo, período e paginação', () => {
  const agora = new Date('2026-10-30T15:00:00Z');
  const padrao = agenda.normalizarConsultaAgenda({}, agora);
  assert.equal(padrao.tipo, 'futuros');
  assert.equal(padrao.inicioPeriodo, null);
  const hoje = agenda.normalizarConsultaAgenda({ periodo: 'hoje' }, agora);
  assert.equal(hoje.inicioPeriodo, '2026-10-30 00:00:00');
  assert.equal(hoje.fimPeriodo, '2026-10-31 00:00:00');
  assert.equal(agenda.normalizarConsultaAgenda({ periodo: 'amanha' }, agora).inicioPeriodo, '2026-10-31 00:00:00');
  assert.equal(agenda.normalizarConsultaAgenda({ periodo: '7dias', tipo: 'historico', pagina: '2', porPagina: '25' }, agora).fimPeriodo, '2026-11-06 00:00:00');
  for (const invalida of [{ tipo: 'x' }, { periodo: 'x' }, { pagina: '0' }, { pagina: 'a' }, { porPagina: '20' }]) {
    assert.throws(() => agenda.normalizarConsultaAgenda(invalida, agora), { status: 400 });
  }
});

test('consultar agenda do salão pagina, calcula permissões e inclui extras', async () => {
  banco.responder(/SELECT COUNT\(\*\) AS total\s+FROM tb_agendamento a INNER JOIN tb_unidade u/, [{ total: '12' }]);
  banco.responder(/SELECT a.id_agendamento AS idAgendamento,\s+a.fk_unidade/, [{ idAgendamento: 1, status: 'AGENDADO', dataHoraInicio: '2020-01-01 10:00:00', valor: '30.00' }]);
  const futuros = await agenda.consultarAgendaSalao(1, agenda.normalizarConsultaAgenda({ pagina: '9', periodo: 'hoje' }));
  assert.equal(futuros.pagina, 2);
  assert.equal(futuros.totalPaginas, 2);
  assert.equal(futuros.agendamentos[0].podeConcluir, true);
  const historico = await agenda.consultarAgendaSalao(1, agenda.normalizarConsultaAgenda({ tipo: 'historico' }));
  assert.equal(historico.tipo, 'historico');
});

// ---- exclusão de conta do salão ----

const operacao = (etapa) => ({ idOperacao: 'op', idUsuario: 1, idSalao: 1, idAutenticacaoExterna: 'ext', etapa });
function sequenciaEtapas(...etapas) {
  let indice = 0;
  banco.responder(/FROM tb_exclusao_conta_salao WHERE id_autenticacao_externa/, () => [operacao(etapas[Math.min(indice++, etapas.length - 1)])]);
}

test('exclusão percorre preparação, cobrança, dados locais e identidade', async () => {
  sequenciaEtapas('PREPARACAO', 'COBRANCA', 'DADOS_LOCAIS', 'IDENTIDADE', 'CONCLUIDA');
  administrativo.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: 'ext', app_metadata: {} } }, error: null });
  administrativo.auth.admin.updateUserById.mockResolvedValue({ error: null });
  administrativo.auth.admin.deleteUser.mockResolvedValue({ error: null });
  banco.responder(/FROM tb_assinatura_salao a INNER JOIN tb_salao s/, [{ referencia: 'r1', idAssinatura: 1 }, { referencia: 'r2', idAssinatura: 2 }]);
  banco.responder(/SELECT id_salao AS idSalao FROM tb_salao WHERE fk_usuario_administrador/, [{ idSalao: 1 }]);
  banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE fk_salao IN/, [{ idUnidade: 5 }]);
  banco.responder(/SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE/, [{ idAgendamento: 7 }]);
  const resultado = await exclusao.retomarExclusaoSalao('ext');
  assert.equal(resultado.etapa, 'CONCLUIDA');
  assert.equal(cancelarRecursosContratacao.mock.calls.length, 2);
  for (const alvo of ['DELETE FROM tb_pagamento', 'DELETE FROM tb_funcionario', 'DELETE FROM tb_servico', 'DELETE FROM tb_unidade', 'DELETE FROM tb_cliente_salao', 'DELETE FROM tb_salao', 'DELETE FROM tb_usuario']) {
    assert.ok(banco.sqls().some((sql) => sql.includes(alvo)), alvo);
  }
});

test('exclusão sem salão nem agendamentos remove apenas o usuário', async () => {
  sequenciaEtapas('DADOS_LOCAIS', 'CONCLUIDA');
  const resultado = await exclusao.retomarExclusaoSalao('ext');
  assert.equal(resultado.etapa, 'CONCLUIDA');
  assert.equal(banco.chamou(/DELETE FROM tb_salao/), false);
  assert.ok(banco.chamou(/DELETE FROM tb_usuario/));
});

test('exclusão informa operação inexistente e falhas pendentes retomáveis', async () => {
  await assert.rejects(() => exclusao.retomarExclusaoSalao('ext'), { status: 404 });
  sequenciaEtapas('PREPARACAO');
  administrativo.auth.admin.getUserById.mockResolvedValue({ data: null, error: { message: 'x' } });
  await assert.rejects(() => exclusao.retomarExclusaoSalao('ext'), { codigo: 'EXCLUSAO_PENDENTE', cobrancaEncerrada: false, etapa: 'PREPARACAO' });
  assert.ok(banco.chamou(/SET ds_erro_codigo=:codigo/));
  banco.reiniciar();
  sequenciaEtapas('IDENTIDADE');
  administrativo.auth.admin.deleteUser.mockResolvedValue({ error: { status: 500, code: 'erro' } });
  await assert.rejects(() => exclusao.retomarExclusaoSalao('ext'), { cobrancaEncerrada: true });
});

test('exclusão tolera identidade já removida no provedor', async () => {
  sequenciaEtapas('IDENTIDADE', 'CONCLUIDA');
  administrativo.auth.admin.deleteUser.mockResolvedValue({ error: { status: 404 } });
  assert.equal((await exclusao.retomarExclusaoSalao('ext')).etapa, 'CONCLUIDA');
  banco.reiniciar();
  sequenciaEtapas('IDENTIDADE', 'CONCLUIDA');
  administrativo.auth.admin.deleteUser.mockResolvedValue({ error: { code: 'user_not_found' } });
  assert.equal((await exclusao.retomarExclusaoSalao('ext')).etapa, 'CONCLUIDA');
});

test('iniciar exclusão registra a operação, marca o salão e retoma', async () => {
  banco.responder(/SELECT id_salao AS idSalao FROM tb_salao WHERE fk_usuario_administrador=:idUsuario FOR UPDATE/, [{ idSalao: 3 }]);
  sequenciaEtapas('CONCLUIDA');
  const resultado = await exclusao.iniciarExclusaoSalao({ idUsuario: 1, idAutenticacaoExterna: 'ext' });
  assert.equal(resultado.etapa, 'CONCLUIDA');
  assert.ok(banco.chamou(/INSERT IGNORE INTO tb_exclusao_conta_salao/));
  assert.ok(banco.chamou(/st_exclusao_pendente=TRUE/));
  banco.reiniciar();
  sequenciaEtapas('CONCLUIDA');
  await exclusao.iniciarExclusaoSalao({ idUsuario: 1, idAutenticacaoExterna: 'ext' });
  assert.equal(banco.chamadas.find((c) => /INSERT IGNORE/.test(c.sql)).opcoes.replacements.salao, null);
});

// ---- exportações ----

const linhasAnaliticas = [
  { idAgendamento: 1, idUnidade: 5, idServico: 1, idFuncionario: 9, cliente: '=cmd()', valor: '50.00', status: 'REALIZADO' },
  { idAgendamento: 2, idUnidade: 5, idServico: 1, idFuncionario: 9, cliente: 'Ana', valor: '30.00', status: 'REALIZADO' },
];
const itensAnaliticos = [
  { idAgendamento: 1, tipoItem: 'ORIGINAL', idServico: 1, idFuncionario: 9, nomeServico: 'Corte', nomeFuncionario: 'Ana', valorItem: '50.00', precoNormal: '50.00' },
  { idAgendamento: 1, tipoItem: 'EXTRA', idExtra: 3, idServico: 2, idFuncionario: 9, nomeServico: 'Barba', nomeFuncionario: 'Ana', valorItem: '20.00' },
  { idAgendamento: 2, tipoItem: 'ORIGINAL', idServico: 1, idFuncionario: 9, nomeServico: 'Corte', nomeFuncionario: 'Ana', valorItem: '30.00' },
];
function prepararExportacao() {
  banco.responder(/./, (opcoes, sql) => {
    if (/id_agendamento IN \(:ids\)/.test(sql)) return itensAnaliticos;
    if (/FROM tb_servico s INNER JOIN tb_unidade u/.test(sql)) return [{ idServico: 1, idUnidade: 5, servico: 'Corte', valorReferencia: '50', duracaoMinutos: 30, ativo: 1 }];
    if (/FROM tb_funcionario f INNER JOIN tb_unidade u/.test(sql)) return [{ idFuncionario: 9, idUnidade: 5, profissional: 'Ana', ativo: 1 }];
    if (/FROM tb_unidade\s+WHERE fk_salao/.test(sql)) return [{ idUnidade: 5, filial: 'Centro', ativo: 1 }];
    return (opcoes.replacements?.offset ?? 0) === 0 ? linhasAnaliticas : [];
  });
  return analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30', recorte: 'realizados' }, 1);
}

test('exportar CSV protege fórmulas, formata valores e cabeçalhos', async () => {
  const consulta = prepararExportacao();
  const partes = [];
  const resposta = new Writable({ write(pedaco, _enc, cb) { partes.push(pedaco.toString()); cb(); } });
  const cabecalhos = {};
  resposta.setHeader = (nome, valor) => { cabecalhos[nome] = valor; };
  await analitico.exportarAnaliticoCsv(consulta, resposta);
  const csv = partes.join('');
  assert.ok(csv.startsWith('﻿"id_agendamento"'));
  assert.ok(csv.includes('"\'=cmd()"'));
  assert.ok(csv.includes('"50.00"'));
  assert.match(cabecalhos['Content-Disposition'], /analitico-bi-2026-10-01-2026-10-30\.csv/);
});

test('exportar CSV interrompe quando a resposta já foi destruída', async () => {
  const consulta = prepararExportacao();
  const resposta = new Writable({ write(_p, _e, cb) { cb(); } });
  resposta.setHeader = () => {};
  resposta.destroy();
  await assert.rejects(() => analitico.exportarAnaliticoCsv(consulta, resposta), /interrompida/);
});

test('exportar Excel gera um arquivo xlsx com abas de cadastro', async () => {
  const consulta = prepararExportacao();
  const partes = [];
  const resposta = new PassThrough();
  resposta.setHeader = jest.fn();
  resposta.on('data', (pedaco) => partes.push(pedaco));
  await excel.exportarAnaliticoExcel(consulta, resposta);
  const arquivo = Buffer.concat(partes);
  assert.equal(arquivo.subarray(0, 2).toString(), 'PK');
  assert.ok(arquivo.length > 1000);
  assert.match(resposta.setHeader.mock.calls[0][1], /spreadsheetml/);
});

test('exportar Excel falha quando a resposta é destruída antes de consultar', async () => {
  const consulta = prepararExportacao();
  const resposta = new PassThrough();
  resposta.setHeader = jest.fn();
  resposta.destroy();
  await assert.rejects(() => excel.exportarAnaliticoExcel(consulta, resposta), /interrompida/);
});

// ---- métricas de promoções, slugs e autorização ----

test('consultar métricas de promoções agrega resumo, comparação e rankings', async () => {
  banco.responder(/COUNT\(item.st_promocao_aplicada\) AS servicosConhecidos/, [{ servicosConhecidos: '10', servicosComPromocao: '4', receitaComPromocao: '200' }]);
  banco.responder(/GROUP BY DATE_FORMAT/, [{ data: '2026-10-01', valor: '10' }]);
  banco.responder(/LIMIT 10/, [{ idServico: 1, utilizacoes: 3 }]);
  banco.responder(/item.id_extra IS NOT NULL/, [{ idServico: 2 }]);
  const resultado = await promocoes.consultarMetricasPromocoes({ idSalao: 1, idUnidade: 0, dataInicio: '2026-10-01', dataFim: '2026-10-30' }, '2026-09-01', '2026-09-30');
  assert.equal(resultado.resumo.participacaoPromocoes, 40);
  assert.equal(resultado.receitaPorDia.length, 1);
  assert.equal(resultado.ranking[0].utilizacoes, 3);
  assert.equal(resultado.ajustesPorServico.length, 1);
});

test('slug único acrescenta sufixo enquanto houver colisão', async () => {
  let consultas = 0;
  banco.responder(/FROM tb_salao\s+WHERE ds_slug/, () => (++consultas <= 2 ? [{ idSalao: 1 }] : []));
  assert.equal(await slugs.criarSlugSalaoUnico('Studio J'), 'studio-j-3');
  consultas = 10;
  assert.equal(await slugs.criarSlugSalaoUnico('Studio J', { idSalao: 1 }), 'studio-j');
  let tentativas = 0;
  banco.responder(/FROM tb_unidade\s+WHERE fk_salao/, () => (++tentativas === 1 ? [{ idUnidade: 1 }] : []));
  assert.equal(await slugs.criarSlugUnidadeUnico('Centro', 1), 'centro-2');
});

function respostaFalsa() {
  return { codigo: null, corpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.corpo = b; return this; } };
}

test('autenticar requisição valida token, sessão, perfil e cadastro completo', async () => {
  const req = (token, extra = {}) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, path: '/agendamentos', method: 'GET', ...extra });
  let res = respostaFalsa();
  assert.equal(await autenticarRequisicao(req(null), res, 'CLIENTE'), null);
  assert.equal(res.codigo, 401);
  res = respostaFalsa();
  assert.equal(await autenticarRequisicao(req('invalido'), res, 'CLIENTE'), null);
  assert.match(res.corpo.mensagem, /inválida ou expirou/);

  banco.responder(/FROM tb_usuario WHERE id_autenticacao_externa=:idAutenticacaoExterna/, [{ idUsuario: 1, perfil: 'CLIENTE', ativo: 1 }]);
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1, telefone: null }]);
  res = respostaFalsa();
  assert.equal(await autenticarRequisicao(req('valido'), res, 'CLIENTE'), null);
  assert.equal(res.corpo.codigo, 'CADASTRO_INCOMPLETO');
  for (const extra of [{ path: '/perfil' }, { path: '/saloes/atual' }, { path: '/notificacoes/inscricao', method: 'DELETE' }]) {
    res = respostaFalsa();
    assert.equal((await autenticarRequisicao(req('valido', extra), res, 'CLIENTE')).idUsuario, 1);
  }
  res = respostaFalsa();
  assert.equal(await autenticarRequisicao(req('valido', { path: '/saloes/atual', method: 'POST' }), res, 'CLIENTE'), null);

  res = respostaFalsa();
  assert.equal(await autenticarRequisicao(req('valido'), res, 'ADMIN_SALAO'), null);
  assert.equal(res.codigo, 403);
  banco.responder(/FROM tb_usuario WHERE id_autenticacao_externa/, () => { throw new Error('banco'); });
  res = respostaFalsa();
  await autenticarRequisicao(req('valido'), res, 'CLIENTE');
  assert.equal(res.codigo, 500);

  banco.reiniciar();
  banco.responder(/FROM tb_exclusao_conta_salao/, [{ idOperacao: 'x', idUsuario: 1 }]);
  res = respostaFalsa();
  const pendente = await autenticarRequisicao(req('valido'), res, 'ADMIN_SALAO', { permitirExclusao: true });
  assert.equal(pendente.exclusaoPendente, true);
});

// ---- lacunas: agendamentos e exportações em lote ----

test('valorMonetario aceita valores com até duas casas e rejeita o restante', async () => {
  const { valorMonetario, salvarServicosAdicionais } = await import('../src/servicos/agendamentos.js');
  assert.equal(valorMonetario(10), '10.00');
  assert.equal(valorMonetario('19.9'), '19.90');
  for (const invalido of [-1, '1.234', 'abc', null, 100000000, {}]) assert.throws(() => valorMonetario(invalido), { status: 400 });
  await assert.rejects(() => salvarServicosAdicionais({ idAgendamento: 1, idUnidade: 5, servicosAdicionais: 'x' }), { status: 400 });
  await assert.rejects(() => salvarServicosAdicionais({ idAgendamento: 1, idUnidade: 5, servicosAdicionais: Array(51).fill({}) }), { status: 400 });
  assert.equal(await salvarServicosAdicionais({ idAgendamento: 1, idUnidade: 5 }), undefined);
});

function lotesGrandes() {
  const linha = (id) => ({ idAgendamento: id, idUnidade: 5, idServico: 1, idFuncionario: 9, cliente: `Cliente ${id}`, valor: '10.00', status: 'REALIZADO' });
  banco.responder(/./, (opcoes, sql) => {
    if (/id_agendamento IN \(:ids\)/.test(sql)) return opcoes.replacements.ids.map((id) => ({ idAgendamento: id, tipoItem: 'ORIGINAL', idServico: 1, idFuncionario: 9, nomeServico: 'Corte', nomeFuncionario: 'Ana', valorItem: '10.00' }));
    if (/FROM tb_servico s INNER JOIN tb_unidade u|FROM tb_funcionario f INNER JOIN tb_unidade u|FROM tb_unidade\s+WHERE fk_salao/.test(sql)) return [];
    const offset = opcoes.replacements?.offset ?? 0;
    if (offset === 0) return Array.from({ length: 500 }, (_, i) => linha(i + 1));
    return offset === 500 ? [linha(501)] : [];
  });
  return analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30', recorte: 'realizados' }, 1);
}

test('exportar CSV percorre mais de um lote de 500 linhas', async () => {
  const consulta = lotesGrandes();
  let linhas = 0;
  const resposta = new Writable({ write(pedaco, _enc, cb) { linhas += pedaco.toString().split('\r\n').length - 1; cb(); } });
  resposta.setHeader = () => {};
  await analitico.exportarAnaliticoCsv(consulta, resposta);
  assert.ok(linhas >= 501, String(linhas));
});

test('exportar Excel percorre mais de um lote de 500 linhas', async () => {
  const consulta = lotesGrandes();
  const resposta = new PassThrough();
  resposta.setHeader = jest.fn();
  resposta.resume();
  await excel.exportarAnaliticoExcel(consulta, resposta);
  assert.ok(resposta.setHeader.mock.calls.length > 0);
});

test('exportar CSV aguarda o dreno quando a resposta fica lenta e falha se for fechada', async () => {
  const consulta = prepararExportacao();
  const partes = [];
  const lenta = new Writable({ highWaterMark: 1, write(pedaco, _enc, cb) { partes.push(pedaco.toString()); setImmediate(cb); } });
  lenta.setHeader = () => {};
  await analitico.exportarAnaliticoCsv(consulta, lenta);
  assert.ok(partes.join('').includes('id_agendamento'));

  const fechada = new Writable({ highWaterMark: 1, write(_p, _e, cb) { setImmediate(() => { fechada.destroy(); cb(); }); } });
  fechada.setHeader = () => {};
  await assert.rejects(() => analitico.exportarAnaliticoCsv(consulta, fechada), /interrompida|destroyed|premature/i);
});

test('exportar CSV propaga erro de escrita ocorrido durante o dreno', async () => {
  const consulta = prepararExportacao();
  const defeituosa = new Writable({ highWaterMark: 1, write(_p, _e, cb) { setImmediate(() => cb(new Error('disco cheio'))); } });
  defeituosa.setHeader = () => {};
  defeituosa.on('error', () => {});
  await assert.rejects(() => analitico.exportarAnaliticoCsv(consulta, defeituosa), /disco cheio|interrompida/);
});

test('exportar Excel falha quando a resposta é destruída depois de gerar o arquivo', async () => {
  const consulta = prepararExportacao();
  const resposta = new PassThrough();
  resposta.setHeader = jest.fn();
  let leituras = 0;
  Object.defineProperty(resposta, 'destroyed', { get: () => ++leituras >= 2 });
  await assert.rejects(() => excel.exportarAnaliticoExcel(consulta, resposta), /interrompida/);
});
