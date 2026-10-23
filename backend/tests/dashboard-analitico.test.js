import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { consultarAnalitico, consultarLinhasAnaliticas, exportarAnaliticoCsv, linhaCsv, normalizarConsultaAnalitica } from '../src/servicos/dashboardAnalitico.js';

const agora = new Date('2026-10-23T02:30:00Z');
const normalizar = (query = {}) => normalizarConsultaAnalitica(query, 8, agora);
function simularBanco(t, executar) {
  const transaction = { connection: {} };
  t.mock.method(bancoDeDados, 'transaction', async (opcoes, trabalho) => trabalho(transaction));
  t.mock.method(bancoDeDados.connectionManager, 'getConnection', async () => ({}));
  t.mock.method(bancoDeDados.connectionManager, 'releaseConnection', async () => {});
  t.mock.method(bancoDeDados.dialect.Query.prototype, 'run', async function (sql) { return executar(sql, this.options); });
}

test('normaliza datas pelo fuso de São Paulo e fixa a referência da previsão', () => {
  const consulta = normalizar();
  assert.equal(consulta.filtros.dataInicio, '2026-09-23');
  assert.equal(consulta.filtros.dataFim, '2026-10-22');
  assert.equal(consulta.filtros.agora, '2026-10-22 23:30:00');
  assert.equal(consulta.porPagina, 25);
  assert.equal(consulta.ordenarPor, 'dataInicio');
  assert.equal(consulta.visualizarPor, 'atendimento');
});

test('recusa campos de ordenação, recortes, datas e paginação inválidos', () => {
  for (const query of [{ ordenarPor: 'valor DESC; DROP TABLE tb_agendamento' }, { visualizarPor: 'outro' }, { ordenarPor: 'tipoItem' }, { recorte: 'outro' }, { direcao: 'random' }, { pagina: '0' }, { pagina: '1.5' }, { porPagina: '500' }, { idUnidade: '-1' }, { dataInicio: '2026-13-01' }, { dataInicio: '2026-02-31' }, { dataInicio: '2026-10-24', dataFim: '2026-10-23' }]) assert.throws(() => normalizar(query), { status: 400 });
});

test('visão por serviço pagina os itens, conta atendimentos distintos e ordena com desempate por extra', async (t) => {
  simularBanco(t, (sql) => {
    assert.match(sql, /INNER JOIN \(SELECT[^]*UNION ALL SELECT e.fk_agendamento/);
    assert.match(sql, /u.fk_salao = 8/);
    assert.match(sql, /item.fk_servico = 2/); assert.match(sql, /item.fk_funcionario = 3/);
    if (sql.startsWith('SELECT COUNT')) {
      assert.match(sql, /COUNT\(DISTINCT a.id_agendamento\) AS totalAtendimentos/);
      assert.match(sql, /SUM\(CASE WHEN item.tipoItem = 'EXTRA' THEN 1 ELSE 0 END\)/);
      return [{ total: 27, totalAtendimentos: 2, totalServicosExtras: 25 }];
    }
    assert.doesNotMatch(sql, /GROUP_CONCAT/);
    assert.match(sql, /ORDER BY valor IS NULL ASC, valor ASC, idAgendamento DESC, \(tipoItem = 'EXTRA'\) ASC, idExtra ASC LIMIT 25 OFFSET 25$/);
    return [{ idAgendamento: 7, idLinha: 'EXTRA:25', valor: '35.50' }, { idAgendamento: 7, idLinha: 'EXTRA:26', valor: '40.00' }];
  });
  const resultado = await consultarAnalitico(normalizar({ visualizarPor: 'servico', idServico: 2, idFuncionario: 3, ordenarPor: 'valor', direcao: 'asc', pagina: 2 }));
  assert.deepEqual([resultado.total, resultado.totalAtendimentos, resultado.totalServicosExtras, resultado.totalPaginas, resultado.agendamentos.length], [27, 2, 25, 2, 2]);
  assert.equal(resultado.visualizarPor, 'servico');
});

test('CSV da visão por serviço mantém uma linha por item sem expandir novamente o atendimento', async (t) => {
  simularBanco(t, (sql) => {
    assert.ok(sql.startsWith('SELECT analitico.*'));
    assert.match(sql, /AND item.tipoItem = 'EXTRA'/);
    assert.match(sql, /ORDER BY tipoItem IS NULL ASC, tipoItem ASC/);
    return [{ idAgendamento: 7, idLinha: 'EXTRA:1', tipoItem: 'EXTRA', idExtra: 1, idServico: 2, idFuncionario: 3, servico: 'Escova', profissional: 'Bia', valor: '35.50' },
      { idAgendamento: 7, idLinha: 'EXTRA:2', tipoItem: 'EXTRA', idExtra: 2, idServico: 2, idFuncionario: 3, servico: 'Escova', profissional: 'Bia', valor: '0.00' }];
  });
  let arquivo = '';
  const resposta = new Writable({ write(chunk, encoding, callback) { arquivo += chunk.toString(); callback(); } });
  resposta.setHeader = () => {};
  await exportarAnaliticoCsv(normalizar({ visualizarPor: 'servico', recorte: 'extras', ordenarPor: 'tipoItem', direcao: 'asc' }), resposta);
  const linhas = arquivo.trimEnd().split('\r\n');
  assert.equal(linhas.length, 3); assert.match(linhas[1], /"35.50"/); assert.match(linhas[2], /"0.00"/);
});

for (const [recorte, esperado] of [
  ['todos', /CASE WHEN a.cd_status = 'CANCELADO' THEN COALESCE\(a.dt_cancelamento,a.dt_inicio\) ELSE a.dt_inicio END/],
  ['agendamentos', /DATE\(a.dt_inicio\) BETWEEN/],
  ['realizados', /DATE\(a.dt_realizacao\) BETWEEN[^]*a.cd_status = 'REALIZADO'/],
  ['extras', /DATE\(a.dt_realizacao\) BETWEEN[^]*a.cd_status = 'REALIZADO'[^]*FROM tb_agendamento_servico_adicional item[^]* > 0/],
  ['cancelados', /DATE\(COALESCE\(a.dt_cancelamento,a.dt_inicio\)\) BETWEEN[^]*a.cd_status = 'CANCELADO'/],
  ['naoCompareceu', /a.cd_status = 'NAO_COMPARECEU'/],
  ['comparecimento', /DATE\(a.dt_inicio\) BETWEEN[^]*a.cd_status IN \('REALIZADO','NAO_COMPARECEU'\)/],
  ['previstos', /a.dt_inicio >= '2026-10-22 23:30:00' AND a.dt_inicio < DATE_ADD\('2026-10-22 23:30:00', INTERVAL 30 DAY\)/],
]) test(`recorte ${recorte} gera critérios de data e propriedade no SQL final`, async (t) => {
  simularBanco(t, (sql) => {
    assert.match(sql, esperado); assert.match(sql, /u.fk_salao = 8/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM vw_servico_atendimento/);
    assert.doesNotMatch(sql, /:(idSalao|idServico|dataInicio|dataFim|agora)\b/);
    return [];
  });
  await consultarLinhasAnaliticas(normalizar({ recorte, idServico: '2', idFuncionario: '3' }));
});

test('ordena antes do LIMIT, mantém nulos por último e ajusta páginas vazias', async (t) => {
  simularBanco(t, (sql) => {
    if (sql.startsWith('SELECT COUNT')) return [{ total: 53 }];
    assert.match(sql, /ORDER BY dataRealizacao IS NULL ASC, dataRealizacao ASC, idAgendamento DESC LIMIT 25 OFFSET 50$/);
    return [{ idAgendamento: 1 }, { idAgendamento: 2 }, { idAgendamento: 3 }];
  });
  const resultado = await consultarAnalitico(normalizar({ ordenarPor: 'dataRealizacao', direcao: 'asc', pagina: '100' }));
  assert.deepEqual([resultado.total, resultado.totalPaginas, resultado.pagina, resultado.agendamentos.length], [53, 3, 3, 3]);
});

test('CSV escapa separadores, aspas e quebras de linha e mantém ausências vazias', () => {
  assert.equal(linhaCsv(['Corte; cor', 'Nome "teste"\nLinha', null, '35.50']), '"Corte; cor";"Nome ""teste""\nLinha";"";"35.50"\r\n');
  assert.equal(linhaCsv(['=SUM(A1)', '+teste']), '"\'=SUM(A1)";"\'+teste"\r\n');
});

test('recorte de extras usa quantidade por atendimento e exporta apenas os itens adicionais', async (t) => {
  simularBanco(t, (sql) => {
    if (sql.startsWith('SELECT COUNT')) return [{ total: 1, totalServicosExtras: 2 }];
    if (sql.startsWith('SELECT item.*')) {
      assert.match(sql, /AND item.tipoItem = 'EXTRA'/);
      assert.match(sql, /item.idServico = 2/);
      assert.match(sql, /item.idFuncionario = 3/);
      return [{ idAgendamento: 7, tipoItem: 'EXTRA', idExtra: 1, idServico: 2, idFuncionario: 3, valorItem: '10.00' }, { idAgendamento: 7, tipoItem: 'EXTRA', idExtra: 2, idServico: 2, idFuncionario: 3, valorItem: '0.00' }];
    }
    assert.match(sql, /COUNT\(\*\) FROM tb_agendamento_servico_adicional item/);
    assert.match(sql, /SELECT SUM\(item.valor\) FROM \(SELECT[^]*vl_cobrado AS valor FROM tb_agendamento_servico_adicional\)/);
    assert.match(sql, /ORDER BY quantidadeServicosExtras IS NULL ASC, quantidadeServicosExtras DESC/);
    return [{ idAgendamento: 7, quantidadeServicosExtras: 2, valor: '10.00' }];
  });
  const consulta = normalizar({ recorte: 'extras', idServico: '2', idFuncionario: '3', ordenarPor: 'quantidadeServicosExtras' });
  const resultado = await consultarAnalitico(consulta);
  assert.equal(resultado.total, 1); assert.equal(resultado.totalServicosExtras, 2);
  let arquivo = '';
  const resposta = new Writable({ write(chunk, encoding, callback) { arquivo += chunk.toString(); callback(); } });
  resposta.setHeader = () => {};
  await exportarAnaliticoCsv(consulta, resposta);
  assert.equal(arquivo.trimEnd().split('\r\n').length, 3);
  assert.doesNotMatch(arquivo, /ORIGINAL/);
});

test('CSV percorre lotes, preserva ordem e separa extras sem repetir o total', async (t) => {
  const pais = Array.from({ length: 501 }, (_, indice) => ({ idAgendamento: 501 - indice, cliente: 'Ana', idUnidade: 1, status: 'REALIZADO', dataInicio: '2026-10-22T09:00:00-03:00', dataRealizacao: '2026-10-22T11:00:00-03:00', valor: '60.00' }));
  let loteAtual;
  let lotes = 0;
  simularBanco(t, (sql) => {
    if (sql.startsWith('SELECT item.*')) {
      const itens = loteAtual.map((pai) => ({ idAgendamento: pai.idAgendamento, tipoItem: 'ORIGINAL', idServico: 1, nomeServico: 'Corte', idFuncionario: 1, valorItem: '50.00' }));
      if (lotes === 1) itens.push({ idAgendamento: 501, tipoItem: 'EXTRA', idExtra: 9, idServico: 2, nomeServico: 'Escova', idFuncionario: 2, valorItem: '10.00' }, { idAgendamento: 501, tipoItem: 'EXTRA', idExtra: 10, idServico: 2, nomeServico: 'Escova', idFuncionario: 2, valorItem: '0.00' });
      return itens;
    }
    assert.match(sql, /LIMIT 500 OFFSET (0|500)$/);
    loteAtual = pais.slice(lotes * 500, ++lotes * 500);
    return loteAtual;
  });
  let arquivo = '';
  const resposta = new Writable({ highWaterMark: 1, write(chunk, encoding, callback) { arquivo += chunk.toString(); setImmediate(callback); } });
  const cabecalhos = {};
  resposta.setHeader = (nome, valor) => { cabecalhos[nome] = valor; };
  await exportarAnaliticoCsv(normalizar({ recorte: 'realizados', porPagina: 25 }), resposta);
  const linhas = arquivo.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
  assert.equal(lotes, 2); assert.equal(linhas.length, 504);
  assert.match(cabecalhos['Content-Type'], /text\/csv/); assert.ok(arquivo.startsWith('\uFEFF'));
  const headers = linhas[0].split(';').map((item) => item.slice(1, -1));
  assert.ok(headers.includes('valor_item')); assert.ok(!headers.includes('valor_total'));
  assert.match(linhas[1], /^"501";"ORIGINAL"/); assert.match(linhas[2], /^"501";"EXTRA";"9"/); assert.match(linhas[3], /^"501";"EXTRA";"10"/);
  assert.match(linhas.at(-1), /^"1";"ORIGINAL"/);
  assert.equal(linhas.slice(1).reduce((soma, linha) => soma + Number(linha.split(';')[headers.indexOf('valor_item')].replaceAll('"', '')), 0), 25060);
});
