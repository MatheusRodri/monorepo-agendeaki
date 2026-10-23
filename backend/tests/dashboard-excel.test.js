import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { normalizarConsultaAnalitica } from '../src/servicos/dashboardAnalitico.js';
import { exportarAnaliticoExcel } from '../src/servicos/dashboardExcel.js';

const normalizar = (query = {}) => normalizarConsultaAnalitica(query, 8, new Date('2026-10-23T12:00:00Z'));
function simularBanco(t, { quantidade = 501, filtrado = false, falhar = false, porServico = false } = {}) {
  const transaction = { connection: {} };
  t.mock.method(bancoDeDados, 'transaction', async (opcoes, executar) => executar(transaction));
  t.mock.method(bancoDeDados.connectionManager, 'getConnection', async () => ({}));
  t.mock.method(bancoDeDados.connectionManager, 'releaseConnection', async () => {});
  const pais = Array.from({ length: quantidade }, (_, indice) => ({ idAgendamento: quantidade - indice, idUnidade: indice % 2 + 1,
    cliente: '=Nome teste', idUsuario: '99999999999999999', telefone: '01199999999', unidade: 'Filial',
    status: 'REALIZADO', dataInicio: '2026-10-22T09:00:00-03:00', dataRealizacao: '2026-10-23T10:00:00-03:00' }));
  const consultas = [];
  let loteAtual = [];
  t.mock.method(bancoDeDados.dialect.Query.prototype, 'run', async function (sql) {
    consultas.push(sql);
    assert.equal(this.options.transaction, transaction);
    if (falhar) throw new Error('Falha na consulta de teste.');
    if (sql.startsWith('SELECT analitico.*')) {
      if (porServico) return [
        { ...pais[0], idLinha: 'ORIGINAL:1', tipoItem: 'ORIGINAL', idServico: 1, idFuncionario: 1, servico: 'Corte', profissional: 'Ana', valor: '50.00' },
        { ...pais[0], idLinha: 'EXTRA:10', tipoItem: 'EXTRA', idExtra: 10, idServico: 3, idFuncionario: 3, servico: 'Escova', profissional: 'Bia', valor: '35.50' },
        { ...pais[0], idLinha: 'EXTRA:11', tipoItem: 'EXTRA', idExtra: 11, idServico: 3, idFuncionario: 3, servico: 'Escova', profissional: 'Bia', valor: '0.00' },
      ];
      const offset = this.options.replacements.offset;
      loteAtual = pais.slice(offset, offset + 500); return loteAtual;
    }
    if (sql.startsWith('SELECT item.*')) {
      assert.equal(porServico, false, 'A visão por serviço já contém cada item e não deve expandi-lo de novo.');
      const itens = filtrado ? [] : loteAtual.map((pai) => ({ idAgendamento: pai.idAgendamento, tipoItem: 'ORIGINAL', idServico: pai.idUnidade, nomeServico: '=Corte; "completo"', idFuncionario: pai.idUnidade, nomeFuncionario: 'Ana', valorItem: '50.00' }));
      if (loteAtual[0]?.idAgendamento === quantidade) itens.push({ idAgendamento: quantidade, tipoItem: 'EXTRA', idExtra: 10, idServico: 3, nomeServico: 'Escova', idFuncionario: 3, nomeFuncionario: 'Bia', valorItem: '35.50' }, { idAgendamento: quantidade, tipoItem: 'EXTRA', idExtra: 11, idServico: 3, nomeServico: 'Escova', idFuncionario: 3, nomeFuncionario: 'Bia', valorItem: '0.00' });
      return itens;
    }
    assert.match(sql, /(?:u\.)?fk_salao = 8/);
    const ids = this.options.replacements.ids.map(Number);
    if (sql.includes('FROM tb_servico s')) return ids.map((id) => ({ idServico: id, idUnidade: id === 2 ? 2 : 1, servico: `Serviço atual ${id}`, valorReferencia: '60.00', duracaoMinutos: 30, ativo: id === 3 ? 0 : 1 }));
    if (sql.includes('FROM tb_funcionario f')) return ids.map((id) => ({ idFuncionario: id, idUnidade: id === 2 ? 2 : 1, profissional: `Profissional ${id}`, ativo: 1 }));
    if (sql.includes('FROM tb_unidade WHERE')) return ids.map((id) => ({ idUnidade: id, filial: `Filial ${id}`, ativo: 1 }));
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  return consultas;
}

function criarResposta() {
  const chunks = [], headers = {};
  const resposta = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  resposta.setHeader = (nome, valor) => { headers[nome] = valor; };
  return { resposta, headers, buffer: () => Buffer.concat(chunks) };
}
function objetos(sheet) {
  const cabecalho = sheet.getRow(1).values.slice(1);
  const registros = [];
  sheet.eachRow((row, indice) => { if (indice > 1) registros.push(Object.fromEntries(cabecalho.map((campo, coluna) => [campo, row.getCell(coluna + 1).value]))); });
  return registros;
}

test('Excel tem quatro abas relacionáveis e exporta todos os lotes com valores numéricos', async (t) => {
  const consultas = simularBanco(t);
  const { resposta, headers, buffer } = criarResposta();
  await exportarAnaliticoExcel(normalizar(), resposta);
  assert.match(headers['Content-Type'], /spreadsheetml/);
  assert.match(headers['Content-Disposition'], /\.xlsx/);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer());
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Analítico', 'Filiais', 'Serviços', 'Profissionais']);
  const analitico = objetos(workbook.getWorksheet('Analítico'));
  assert.equal(analitico.length, 503);
  assert.equal(new Set(analitico.map((linha) => linha.id_agendamento)).size, 501);
  assert.deepEqual(analitico.slice(0, 3).map((linha) => linha.tipo_item), ['ORIGINAL', 'EXTRA', 'EXTRA']);
  assert.equal(analitico.reduce((soma, linha) => soma + linha.valor_item, 0), 25085.5);
  assert.ok(analitico.every((linha) => typeof linha.valor_item === 'number'));
  assert.equal(analitico[0].id_agendamento, '501');
  assert.equal(analitico.at(-1).id_agendamento, '1');
  assert.equal(analitico[0].id_usuario, '99999999999999999');
  assert.equal(analitico[0].telefone, '01199999999');
  assert.equal(analitico[0].cliente, '=Nome teste');
  assert.equal(analitico[0].servico, '=Corte; "completo"');
  assert.equal(analitico[0].data_realizacao, '2026-10-23T10:00:00-03:00');
  assert.equal(objetos(workbook.getWorksheet('Filiais')).length, 2);
  assert.equal(objetos(workbook.getWorksheet('Serviços')).length, 3);
  assert.equal(objetos(workbook.getWorksheet('Profissionais')).length, 3);
  const servicos = new Set(objetos(workbook.getWorksheet('Serviços')).map((linha) => linha.id_servico));
  assert.ok(analitico.every((linha) => servicos.has(linha.id_servico)));
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.views[0].state, 'frozen');
    assert.ok(sheet.autoFilter); assert.equal(sheet.getRow(1).font.bold, true);
  }
  assert.equal(consultas.filter((sql) => sql.startsWith('SELECT analitico.*')).length, 2);
});

test('Excel filtra também as abas de cadastros e inclui serviços inativos vinculados', async (t) => {
  const consultas = simularBanco(t, { quantidade: 1, filtrado: true });
  const { resposta, buffer } = criarResposta();
  await exportarAnaliticoExcel(normalizar({ idServico: '3', idFuncionario: '3' }), resposta);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer());
  const itens = objetos(workbook.getWorksheet('Analítico'));
  assert.equal(itens.length, 2); assert.ok(itens.every((item) => item.tipo_item === 'EXTRA'));
  assert.equal(objetos(workbook.getWorksheet('Serviços')).length, 1);
  assert.equal(objetos(workbook.getWorksheet('Serviços'))[0].ativo, 0);
  assert.equal(objetos(workbook.getWorksheet('Profissionais')).length, 1);
  assert.equal(objetos(workbook.getWorksheet('Filiais')).length, 1);
  assert.ok(consultas.some((sql) => sql.includes('item.idServico = 3') && sql.includes('item.idFuncionario = 3')));
});

test('recorte vazio gera as quatro abas com cabeçalhos e sem cadastros alheios', async (t) => {
  simularBanco(t, { quantidade: 0 });
  const { resposta, buffer } = criarResposta(); await exportarAnaliticoExcel(normalizar(), resposta);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer());
  assert.equal(workbook.worksheets.length, 4);
  assert.ok(workbook.worksheets.every((sheet) => sheet.rowCount === 1));
});

test('Excel da visão por serviço exporta itens individuais e cadastros sem multiplicações', async (t) => {
  simularBanco(t, { quantidade: 1, porServico: true });
  const { resposta, buffer } = criarResposta();
  await exportarAnaliticoExcel(normalizar({ visualizarPor: 'servico' }), resposta);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer());
  const itens = objetos(workbook.getWorksheet('Analítico'));
  assert.equal(itens.length, 3);
  assert.deepEqual(itens.map((item) => item.valor_item), [50, 35.5, 0]);
  assert.equal(new Set(itens.map((item) => item.id_agendamento)).size, 1);
  assert.equal(objetos(workbook.getWorksheet('Serviços')).length, 2);
  assert.equal(objetos(workbook.getWorksheet('Profissionais')).length, 2);
});

test('falha de consulta não envia arquivo parcial e limpa o arquivo temporário', async (t) => {
  simularBanco(t, { falhar: true });
  const antes = (await readdir(tmpdir())).filter((nome) => nome.startsWith('agendeaki-bi-')).sort();
  const { resposta, headers } = criarResposta();
  await assert.rejects(exportarAnaliticoExcel(normalizar(), resposta), /Falha na consulta de teste/);
  assert.deepEqual(headers, {});
  const depois = (await readdir(tmpdir())).filter((nome) => nome.startsWith('agendeaki-bi-')).sort();
  assert.deepEqual(depois, antes);
});
