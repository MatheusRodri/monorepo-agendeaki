import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';

// Usa exclusivamente uma instância descartável por socket em /tmp, nunca o .env do projeto.
const socket = process.env.TEST_MYSQL_SOCKET ?? '/tmp/agendeaki-metricas-mysql/mysql.sock';
assert.match(socket, /^\/tmp\/[a-zA-Z0-9_./-]+\.sock$/);
const nomeBanco = `test_promocoes_${randomUUID().replaceAll('-', '')}`;
let bancoCriado = false;
Object.assign(process.env, { MYSQL_DATABASE: nomeBanco, MYSQL_USER: 'root', MYSQL_PASSWORD: '', MYSQL_SOCKET: socket, MYSQL_HOST: 'localhost' });
const { bancoDeDados: db } = await import('../src/configuracoes/bancoDeDados.js');
const { consultarAnalitico, normalizarConsultaAnalitica, exportarAnaliticoCsv } = await import('../src/servicos/dashboardAnalitico.js');
const { consultarMetricasPromocoes } = await import('../src/servicos/metricasPromocoes.js');
const { criarReservasCliente, salvarServicosAdicionais } = await import('../src/servicos/agendamentos.js');
const { exportarAnaliticoExcel } = await import('../src/servicos/dashboardExcel.js');
const { default: ExcelJS } = await import('exceljs');
jest.unstable_mockModule('../src/servicos/autorizacaoUsuarios.js', () => ({
  autenticarRequisicao: async (req, res) => {
    if (!req.usuario) { res.status(401).json({ mensagem: 'Sem sessão' }); return null; }
    return req.usuario;
  },
}));
const notificacoes = await import('../src/servicos/notificacoesPush.js');
jest.unstable_mockModule('../src/servicos/notificacoesPush.js', () => ({ ...notificacoes, notificarSalaoDoAgendamento: async () => {} }));
const { default: router } = await import('../src/rotas/salao.js');
const { default: routerCliente } = await import('../src/rotas/cliente.js');
const limpezas = [];
afterEach(async () => { for (const limpar of limpezas.splice(0)) await limpar(); });
const q = async (sql, replacements = {}) => (await db.query(sql, { replacements }))[0];
const inicio = '2026-10-01', fim = '2026-10-30';
const consulta = (extra = {}) => normalizarConsultaAnalitica({ dataInicio: inicio, dataFim: fim, recorte: 'realizados', ...extra }, 1);
async function indicadores(extra = {}) {
  return rota(router, '/indicadores/premium', 'get', { query: { dataInicio: inicio, dataFim: fim, ...extra } });
}
async function rota(roteador, caminho, metodo, req = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const handler = roteador.stack.find((item) => item.route?.path === caminho && item.route.methods[metodo]).route.stack[0].handle;
  await handler({ usuario: { idUsuario: 1 }, query: {}, params: {}, body: {}, headers: {}, ...req }, res);
  return res;
}
function respostaArquivo() {
  const partes = [];
  const headers = {};
  const stream = new Writable({ write(chunk, _encoding, done) { partes.push(Buffer.from(chunk)); done(); } });
  stream.setHeader = (nome, valor) => { headers[nome] = valor; };
  stream.arquivo = () => Buffer.concat(partes);
  stream.headers = headers;
  return stream;
}

beforeAll(async () => {
  const schema = readFileSync(new URL('../../database/script.sql', import.meta.url), 'utf8').replaceAll('tccsalao', nomeBanco);
  execFileSync('mysql', ['--no-defaults', `--socket=${socket}`, '-uroot'], { input: schema });
  bancoCriado = true;
  await q(`INSERT INTO tb_usuario (id_usuario,nm_usuario,ds_email,tp_usuario) VALUES
    (1,'Administrador','admin@teste.invalid','ADMIN_SALAO'), (2,'Cliente','cliente@teste.invalid','CLIENTE'),
    (3,'Outro administrador','outro@teste.invalid','ADMIN_SALAO')`);
  await q(`INSERT INTO tb_salao (id_salao,fk_usuario_administrador,nm_salao,ds_slug,ds_cnpj_raiz_indice)
    VALUES (1,1,'Salão Teste','teste',REPEAT('1',64)), (2,3,'Outro salão','outro',REPEAT('2',64))`);
  for (const id of [1, 2]) {
    await q(`INSERT INTO tb_unidade (id_unidade,fk_salao,nm_unidade,ds_slug,tp_categoria,ds_rua,nu_endereco,
      ds_bairro,ds_municipio,ds_estado,nu_cep,ds_email,tp_documento,ds_documento_cifrado,ds_documento_indice,ds_cnpj_raiz_indice,nu_telefone)
      VALUES (:id,:id,'Unidade','unidade','UNISSEX','Rua','1','Centro','São Paulo','SP','01000000','teste@teste.invalid','CNPJ','teste',REPEAT(:id,64),REPEAT(:id,64),'11999999999')`, { id });
    await q(`INSERT INTO tb_funcionario (id_funcionario,fk_unidade,nm_funcionario) VALUES (:id,:id,'Profissional')`, { id });
    await q(`INSERT INTO tb_cliente_salao (id_cliente_salao,fk_salao,nm_cliente) VALUES (:id,:id,'Cliente local')`, { id });
    await q(`INSERT INTO tb_assinatura_salao (fk_salao,cd_periodicidade,cd_status,vl_assinatura,id_preco_provedor,ds_referencia_externa)
      VALUES (:id,'MENSAL','AUTORIZADA',50,'teste',UUID())`, { id });
    await q(`INSERT INTO tb_servico (id_servico,fk_unidade,nm_servico,ds_servico,vl_servico,nu_duracao_minutos,tp_promocao,vl_promocao,st_promocao_ativa)
      VALUES (:id,:id,'Corte','Teste',50,30,'PERCENTUAL',20,TRUE)`, { id });
    await q(`INSERT INTO tb_funcionario_servico (fk_funcionario,fk_servico) VALUES (:id,:id)`, { id });
  }
  await q(`INSERT INTO tb_funcionario (id_funcionario,fk_unidade,nm_funcionario) VALUES (3,1,'Outro profissional')`);
  await q(`INSERT INTO tb_funcionario_servico (fk_funcionario,fk_servico) VALUES (3,1)`);
  await q(`INSERT INTO tb_servico (id_servico,fk_unidade,nm_servico,ds_servico,vl_servico,nu_duracao_minutos)
    VALUES (3,1,'Barba','Teste',30,30)`);
  await q(`INSERT INTO tb_funcionario_servico (fk_funcionario,fk_servico) VALUES (1,3),(3,3)`);
  for (let dia = 0; dia < 7; dia++) {
    await q(`INSERT INTO tb_horario_unidade (fk_unidade,nr_dia_semana,hr_abertura,hr_fechamento) VALUES (1,:dia,'08:00','18:00')`, { dia });
    await q(`INSERT INTO tb_disponibilidade_funcionario (fk_funcionario,nr_dia_semana,hr_inicio,hr_fim) VALUES (1,:dia,'08:00','18:00'),(3,:dia,'08:00','18:00')`, { dia });
  }
  for (const [id, status, realizado, valor, conhecido, salao] of [
    [1,'REALIZADO','2026-10-15',40,true,1], [2,'REALIZADO','2026-10-16',50,false,1],
    [3,'REALIZADO','2026-09-15',40,true,1], [4,'CANCELADO',null,40,true,1],
    [5,'NAO_COMPARECEU',null,40,true,1], [6,'REALIZADO','2026-10-15',40,true,2],
    [7,'REALIZADO','2026-06-01',40,true,1],
  ]) {
    await q(`INSERT INTO tb_agendamento (id_agendamento,fk_cliente_salao,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,
      dt_realizacao,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos,cd_status,
      vl_preco_normal,vl_preco_vigente,st_promocao_aplicada,tp_promocao_aplicada,vl_promocao_aplicada)
      VALUES (:id,:salao,:salao,:salao,:salao,:agendado,DATE_ADD(:agendado,INTERVAL 30 MINUTE),:realizado,'Corte',:valor,30,:status,
      :normal,:vigente,:promo,:tipo,:config)`, { id, salao, status, valor, agendado: `${realizado ?? '2026-10-17'} 10:00:00`,
      realizado: realizado ? `${realizado} 11:00:00` : null, normal: conhecido ? 50 : null, vigente: conhecido ? 40 : null,
      promo: conhecido ? true : null, tipo: conhecido ? 'PERCENTUAL' : null, config: conhecido ? 20 : null });
  }
  await q(`UPDATE tb_agendamento SET fk_cliente_salao=NULL,fk_usuario=2 WHERE id_agendamento=7`);
  const transaction = await db.transaction();
  await salvarServicosAdicionais({ idAgendamento: 1, idUnidade: 1, transaction, servicosAdicionais: [
    { idServico: 1, idFuncionario: 3, valorCobrado: 35, valorEsperado: 40, observacaoAjuste: 'Cortesia no fechamento.' },
    { idServico: 1, idFuncionario: 1, valorCobrado: 40, valorEsperado: 40 },
    { idServico: 1, idFuncionario: 1, valorCobrado: 45, valorEsperado: 40, observacaoAjuste: 'Acabamento especial.' },
    { idServico: 3, idFuncionario: 3, valorCobrado: 35, valorEsperado: 30 },
  ] });
  await transaction.commit();
  // Um extra legado conserva a diferença histórica, mas não é classificado como desconto manual.
  await q(`INSERT INTO tb_agendamento_servico_adicional
    (fk_agendamento,fk_servico,fk_funcionario,nm_servico,nm_funcionario,vl_referencia,vl_cobrado,nu_duracao_minutos)
    VALUES (2,3,1,'Barba','Profissional',30,25,30)`);
});

afterAll(async () => {
  try {
    if (bancoCriado) {
      await q(`DROP DATABASE IF EXISTS ${nomeBanco}_legado`);
      await q(`DROP DATABASE ${nomeBanco}`);
    }
  } finally { await db.close(); }
});

test('concilia cards, ranking, série diária, comparação anterior e Analítico sem multiplicar atendimentos', async () => {
  const res = await indicadores();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const dados = res.body;
  assert.equal(Number(dados.resumo.atendimentosRealizados), 2);
  assert.equal(Number(dados.resumo.quantidadeServicosRealizados), 7);
  assert.equal(Number(dados.resumo.receitaRealizada), 270);
  assert.ok(dados.clientesInativos.some((item) => item.idCliente === 'U:2'));
  assert.deepEqual(dados.promocoes.resumo, { servicosConhecidos: 5, servicosNaoInformados: 2, servicosComPromocao: 4,
    receitaComPromocao: 160, descontosPromocionais: 40, descontosAdicionais: 5, acrescimos: 10, participacaoPromocoes: 80 });
  assert.equal(dados.promocoes.comparacaoAnterior.receitaComPromocao, 40);
  assert.equal(Number(dados.promocoes.receitaPorDia[0].valor), 160);
  assert.equal(Number(dados.promocoes.ranking[0].utilizacoes), 4);
  const analitico = await consultarAnalitico(consulta({ visualizarPor: 'servico' }));
  assert.equal(analitico.totalAtendimentos, 2);
  assert.equal(analitico.total, 7);
  assert.equal(analitico.agendamentos.reduce((total, item) => total + Number(item.valor), 0), 270);
  const porAtendimento = await consultarAnalitico(consulta());
  for (const item of porAtendimento.agendamentos) {
    assert.equal(item.servicos.reduce((soma, servico) => soma + Number(servico.valorItem), 0), Number(item.valor));
    assert.ok(item.servicos.every((servico) => Number(servico.duracaoMinutos) > 0));
  }
  assert.equal(porAtendimento.agendamentos.find((item) => item.idAgendamento === 1).promocaoAplicada, 'MISTA');
  const antigo = porAtendimento.agendamentos.find((item) => item.idAgendamento === 2);
  assert.equal(antigo.promocaoAplicada, 'NAO_INFORMADO');
  assert.equal(antigo.precoNormal, null);
});

test('aplica filtros ao mesmo serviço, mantendo totais e clientes coerentes', async () => {
  const extra = { promocao: 'com', ajusteValor: 'acrescimo' };
  const res = await indicadores(extra);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(Number(res.body.resumo.receitaRealizada), 45);
  assert.equal(Number(res.body.resumo.atendimentosRealizados), 1);
  assert.equal(res.body.promocoes.resumo.participacaoPromocoes, 100);
  assert.equal(Number(res.body.profissionais.reduce((total, item) => total + Number(item.receitaRealizada), 0)), 45);
  const porServico = await consultarAnalitico(consulta({ ...extra, visualizarPor: 'servico' }));
  assert.equal(porServico.total, 1);
  assert.equal(Number(porServico.agendamentos[0].valor), 45);
  const atendimentoFiltrado = await consultarAnalitico(consulta(extra));
  assert.equal(atendimentoFiltrado.agendamentos[0].servicos.length, 1);
  assert.equal(Number(atendimentoFiltrado.agendamentos[0].servicos[0].valorItem), 45);
  assert.equal(atendimentoFiltrado.agendamentos[0].servicos[0].observacaoAjuste, 'Acabamento especial.');
  const impossivel = await consultarAnalitico(consulta({ promocao: 'com', ajusteValor: 'acrescimo', idFuncionario: 3 }));
  assert.equal(impossivel.total, 0); // profissional 3 só tem promoção com desconto e extra sem promoção com acréscimo.
  const filtrado = await indicadores({ promocao: 'com', idFuncionario: 3 });
  assert.equal(Number(filtrado.body.resumo.receitaRealizada), 35);
  assert.equal(Number(filtrado.body.clientes.clientesAtendidos), 1);
  assert.equal(Number(filtrado.body.clientes.clientesRecorrentes), 1); // primeira visita em setembro, preservada.
});

test('histórico desconhecido não vira ausência de promoção nem ajuste manual', async () => {
  const desconhecido = await indicadores({ promocao: 'naoInformado' });
  assert.equal(desconhecido.statusCode, 200, JSON.stringify(desconhecido.body));
  assert.equal(desconhecido.body.promocoes.resumo.participacaoPromocoes, null);
  assert.equal(desconhecido.body.promocoes.resumo.descontosAdicionais, 0);
  const sem = await consultarAnalitico(consulta({ promocao: 'sem', visualizarPor: 'servico' }));
  assert.equal(sem.total, 1);
  assert.equal(Number(sem.agendamentos[0].valor), 35);
  const semAjuste = await consultarAnalitico(consulta({ ajusteValor: 'sem', visualizarPor: 'servico' }));
  assert.equal(semAjuste.total, 2); // reservado e extra de R$40.
  assert.equal((await consultarAnalitico(consulta({ ajusteValor: 'naoInformado', visualizarPor: 'servico' }))).total, 2);
});

test('isola salões, exige Premium e rejeita filtros inválidos', async () => {
  const outro = await consultarAnalitico(normalizarConsultaAnalitica({ dataInicio: inicio, dataFim: fim, recorte: 'realizados' }, 2));
  assert.equal(outro.total, 1);
  assert.equal((await indicadores({ promocao: 'invalido' })).statusCode, 400);
  assert.equal((await indicadores({ ajusteValor: 'invalido' })).statusCode, 400);
  const semSessao = await rota(router, '/indicadores/premium', 'get', { usuario: null });
  assert.equal(semSessao.statusCode, 401);
  await q("UPDATE tb_assinatura_salao SET cd_status='CANCELADA' WHERE fk_salao=1");
  assert.equal((await indicadores()).statusCode, 403);
  assert.equal((await rota(router, '/indicadores/premium/analitico', 'get')).statusCode, 403);
  assert.equal((await rota(router, '/indicadores/premium/analitico/exportar', 'get')).statusCode, 403);
  await q("UPDATE tb_assinatura_salao SET cd_status='AUTORIZADA' WHERE fk_salao=1");
});

test('CSV e Excel exportam os mesmos serviços filtrados e preservam valores monetários', async () => {
  const filtros = consulta({ promocao: 'com', ajusteValor: 'acrescimo' });
  const csv = respostaArquivo();
  await exportarAnaliticoCsv(filtros, csv);
  const texto = csv.arquivo().toString('utf8');
  assert.equal(texto.trim().split('\r\n').length, 2);
  assert.match(texto, /"preco_normal";"preco_vigente";"desconto_promocional";"desconto_adicional";"acrescimo"/);
  assert.match(texto, /"COM";"50.00";"40.00";"10.00";"0.00";"5.00"/);
  assert.match(texto, /"observacao_ajuste"/);
  assert.match(texto, /"Acabamento especial\."/);
  const xlsx = respostaArquivo();
  await exportarAnaliticoExcel(filtros, xlsx);
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(xlsx.arquivo());
  assert.equal(livro.worksheets.length, 4);
  const aba = livro.getWorksheet('Analítico');
  assert.equal(aba.rowCount, 2);
  const cabecalho = aba.getRow(1).values;
  assert.equal(aba.getRow(2).getCell(cabecalho.indexOf('acrescimo')).value, 5);
  assert.equal(aba.getRow(2).getCell(cabecalho.indexOf('observacao_ajuste')).value, 'Acabamento especial.');
  assert.equal(aba.getRow(2).getCell(cabecalho.indexOf('preco_vigente')).numFmt, '#,##0.00');
  const porServico = respostaArquivo();
  await exportarAnaliticoCsv({ ...filtros, visualizarPor: 'servico' }, porServico);
  assert.equal(porServico.arquivo().toString('utf8'), texto);
});

test('conflito de preço no fechamento retorna 409 e não salva extras parcialmente', async () => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await q(`INSERT INTO tb_agendamento (id_agendamento,fk_cliente_salao,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,
    nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos) VALUES (20,1,1,1,1,:inicio,DATE_ADD(:inicio,INTERVAL 30 MINUTE),'Corte',40,30)`, { inicio: `${hoje} 10:00:00` });
  const res = await rota(router, '/agendamentos/:idAgendamento/confirmar-atendimento', 'patch', {
    params: { idAgendamento: '20' }, body: { servicosAdicionais: [
      { idServico: 1, idFuncionario: 1, valorCobrado: 35, valorEsperado: 40 },
      { idServico: 3, idFuncionario: 1, valorCobrado: 25, valorEsperado: 20 },
    ] },
  });
  assert.equal(res.statusCode, 409, JSON.stringify(res.body));
  assert.equal(res.body.codigo, 'PRECO_ALTERADO');
  assert.equal(res.body.precosAtualizados[0].precoVigente, 30);
  assert.equal((await q('SELECT COUNT(*) AS quantidade FROM tb_agendamento_servico_adicional WHERE fk_agendamento=20'))[0].quantidade, 0);
  assert.equal((await q('SELECT cd_status FROM tb_agendamento WHERE id_agendamento=20'))[0].cd_status, 'AGENDADO');
});

test('preços cadastrados depois não recalculam serviços históricos', async () => {
  const antes = await consultarMetricasPromocoes(consulta().filtros, '2026-09-01', '2026-09-30');
  await q('UPDATE tb_servico SET vl_servico=80, vl_promocao=50 WHERE id_servico=1');
  const depois = await consultarMetricasPromocoes(consulta().filtros, '2026-09-01', '2026-09-30');
  assert.deepEqual(depois, antes);
  await q('UPDATE tb_servico SET vl_servico=50, vl_promocao=20 WHERE id_servico=1');
});

test('grava histórico na reserva do cliente e do salão e preserva preço nos reagendamentos', async () => {
  limpezas.push(() => q('UPDATE tb_servico SET vl_servico=50 WHERE id_servico=1'));
  const amanha = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [reserva] = await criarReservasCliente({ idUsuario: 2, idUnidade: 1, itens: [{ idServico: 1, idFuncionario: 1, dataHoraInicio: `${amanha}T09:00`, valorEsperado: 40 }] });
  const [salvo] = await q('SELECT vl_preco_normal,vl_preco_vigente,st_promocao_aplicada FROM tb_agendamento WHERE id_agendamento=:id', { id: reserva.idAgendamento });
  assert.equal(Number(salvo.vl_preco_normal), 50);
  assert.equal(Number(salvo.vl_preco_vigente), 40);
  assert.equal(salvo.st_promocao_aplicada, 1);
  const criado = await rota(router, '/agendamentos', 'post', { body: { idUnidade: 1, idServico: 1, idFuncionario: 3, idClienteSalao: 1,
    dataHoraInicio: `${amanha}T09:00`, valorEsperado: 40 } });
  assert.equal(criado.statusCode, 201, JSON.stringify(criado.body));
  const [salao] = await q('SELECT * FROM tb_agendamento WHERE fk_cliente_salao=1 AND dt_inicio=:inicio', { inicio: `${amanha} 09:00:00` });
  assert.equal(Number(salao.vl_preco_vigente), 40);
  await q('UPDATE tb_servico SET vl_servico=100 WHERE id_servico=1');
  const reagendado = await rota(router, '/agendamentos/:idAgendamento/reagendar', 'patch', { params: { idAgendamento: salao.id_agendamento }, body: { dataHoraInicio: `${amanha}T10:00`, idFuncionario: 3 } });
  assert.equal(reagendado.statusCode, 200, JSON.stringify(reagendado.body));
  const [preservado] = await q('SELECT vl_servico_agendado,vl_preco_normal FROM tb_agendamento WHERE id_agendamento=:id', { id: salao.id_agendamento });
  assert.equal(Number(preservado.vl_servico_agendado), 40);
  assert.equal(Number(preservado.vl_preco_normal), 50);
  const caminhoCliente = routerCliente.stack.find((item) => item.route?.methods.patch && item.route.path === '/agendamentos/:idAgendamento').route.path;
  const mesmo = await rota(routerCliente, caminhoCliente, 'patch', { usuario: { idUsuario: 2 }, params: { idAgendamento: reserva.idAgendamento },
    body: { idUnidade: 1, idServico: 1, idFuncionario: 1, dataHoraInicio: `${amanha}T11:00` } });
  assert.equal(mesmo.statusCode, 200, JSON.stringify(mesmo.body));
  assert.equal(Number((await q('SELECT vl_preco_normal FROM tb_agendamento WHERE id_agendamento=:id', { id: reserva.idAgendamento }))[0].vl_preco_normal), 50);
  const trocado = await rota(routerCliente, caminhoCliente, 'patch', { usuario: { idUsuario: 2 }, params: { idAgendamento: reserva.idAgendamento },
    body: { idUnidade: 1, idServico: 3, idFuncionario: 1, dataHoraInicio: `${amanha}T11:00` } });
  assert.equal(trocado.statusCode, 200, JSON.stringify(trocado.body));
  const [novo] = await q('SELECT vl_preco_normal,st_promocao_aplicada FROM tb_agendamento WHERE id_agendamento=:id', { id: reserva.idAgendamento });
  assert.equal(Number(novo.vl_preco_normal), 30);
  assert.equal(novo.st_promocao_aplicada, 0);
});

test('agregados com serviços conhecidos e antigos sinalizam valores parciais', async () => {
  const [resultado] = await db.query(`INSERT INTO tb_agendamento_servico_adicional
    (fk_agendamento,fk_servico,fk_funcionario,nm_servico,nm_funcionario,vl_referencia,vl_cobrado,nu_duracao_minutos)
    VALUES (1,3,1,'Barba antiga','Profissional',30,20,30)`);
  try {
    const linhas = await consultarAnalitico(consulta());
    const misto = linhas.agendamentos.find((item) => item.idAgendamento === 1);
    assert.equal(misto.promocaoAplicada, 'NAO_INFORMADO');
    assert.equal(Number(misto.totaisParciais), 1);
    assert.equal(Number(misto.valor), 215);
    assert.equal(Number(misto.descontoPromocional), 40);
    assert.equal(Number(misto.descontoAdicional), 5);
  } finally {
    await q('DELETE FROM tb_agendamento_servico_adicional WHERE id_servico_adicional=:id', { id: resultado });
  }
});

test('extras sem Premium usam preço normal e classificam os ajustes sem promoção', async () => {
  await q("UPDATE tb_assinatura_salao SET cd_status='CANCELADA' WHERE fk_salao=1");
  const transaction = await db.transaction();
  try {
    await salvarServicosAdicionais({ idAgendamento: 1, idUnidade: 1, transaction, servicosAdicionais: [{ idServico: 1, idFuncionario: 1, valorEsperado: 50, valorCobrado: 45 }] });
    const [linhas] = await db.query(`SELECT vl_preco_normal,vl_preco_vigente,st_promocao_aplicada FROM tb_agendamento_servico_adicional
      WHERE fk_agendamento=1 ORDER BY id_servico_adicional DESC LIMIT 1`, { transaction });
    assert.equal(Number(linhas[0].vl_preco_normal), 50);
    assert.equal(Number(linhas[0].vl_preco_vigente), 50);
    assert.equal(linhas[0].st_promocao_aplicada, 0);
  } finally {
    await transaction.rollback();
    await q("UPDATE tb_assinatura_salao SET cd_status='AUTORIZADA' WHERE fk_salao=1");
  }
});

test('migração aditiva preserva valores antigos e marca promoção e ajuste como desconhecidos', async () => {
  const legado = `${nomeBanco}_legado`;
  const antigo = readFileSync(new URL('../../database/script.sql', import.meta.url), 'utf8')
    .replaceAll('tccsalao', legado)
    .replace(/^  ds_observacao_ajuste .*\n/gm, '')
    .replace(/^  (vl_preco_normal|vl_preco_vigente|st_promocao_aplicada|tp_promocao_aplicada|vl_promocao_aplicada) .*\n/gm, '')
    .replace(/CREATE OR REPLACE VIEW vw_servico_atendimento AS[\s\S]*?;/, `CREATE OR REPLACE VIEW vw_servico_atendimento AS
      SELECT id_agendamento, fk_servico, fk_funcionario, nm_servico_agendado AS servico, vl_servico_agendado AS valor, nu_duracao_minutos AS minutos_reservados FROM tb_agendamento
      UNION ALL SELECT fk_agendamento, fk_servico, fk_funcionario, nm_servico, vl_cobrado, 0 FROM tb_agendamento_servico_adicional;`);
  execFileSync('mysql', ['--no-defaults', `--socket=${socket}`, '-uroot'], { input: antigo });
  for (const tabela of ['tb_usuario', 'tb_salao', 'tb_unidade', 'tb_funcionario', 'tb_servico', 'tb_cliente_salao']) {
    await q(`INSERT INTO ${legado}.${tabela} SELECT * FROM ${tabela}`);
  }
  await q(`INSERT INTO ${legado}.tb_agendamento (id_agendamento,fk_cliente_salao,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,
    dt_realizacao,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos,cd_status)
    SELECT id_agendamento,fk_cliente_salao,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,dt_realizacao,
      nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos,cd_status FROM tb_agendamento WHERE id_agendamento=1`);
  await q(`INSERT INTO ${legado}.tb_agendamento_servico_adicional
    (fk_agendamento,fk_servico,fk_funcionario,nm_servico,nm_funcionario,vl_referencia,vl_cobrado,nu_duracao_minutos)
    VALUES (1,3,1,'Extra','Profissional',30,25,30)`);
  const migracao = readFileSync(new URL('../../database/migracoes/2026-10-30-historico-precos-promocoes.sql', import.meta.url), 'utf8');
  execFileSync('mysql', ['--no-defaults', `--socket=${socket}`, '-uroot', legado], { input: migracao });
  const migracaoObservacao = readFileSync(new URL('../../database/migracoes/2026-10-30-observacao-ajuste-extras.sql', import.meta.url), 'utf8');
  execFileSync('mysql', ['--no-defaults', `--socket=${socket}`, '-uroot', legado], { input: migracaoObservacao });
  assert.equal((await q(`SELECT ds_observacao_ajuste AS observacao FROM ${legado}.tb_agendamento_servico_adicional`))[0].observacao, null);
  const historico = await q(`SELECT valor,st_promocao_aplicada,desconto_promocional,desconto_adicional,acrescimo
    FROM ${legado}.vw_servico_atendimento ORDER BY tipo_item`);
  assert.equal(historico.length, 2);
  assert.deepEqual(historico.map((item) => Number(item.valor)).sort((a,b) => a-b), [25,40]);
  for (const item of historico) {
    assert.equal(item.st_promocao_aplicada, null);
    assert.equal(item.desconto_promocional, null);
    assert.equal(item.desconto_adicional, null);
    assert.equal(item.acrescimo, null);
  }
});
