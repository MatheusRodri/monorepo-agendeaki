import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { consultarAnalitico, normalizarConsultaAnalitica, colunasExportacao, linhaCsv, prepararLinhasExportacao } from '../src/servicos/dashboardAnalitico.js';

const simular = (objeto, metodo, implementacao) => jest.spyOn(objeto, metodo).mockImplementation(implementacao);

function simularBanco(linhas, itens = [], total = linhas.length) {
  const transaction = {};
  const consultas = [];
  simular(bancoDeDados, 'transaction', async (_opcoes, callback) => callback(transaction));
  simular(bancoDeDados, 'query', async (sql, opcoes) => {
    assert.equal(opcoes.transaction, transaction, 'Contagem, página e composição devem compartilhar o snapshot');
    consultas.push({ sql, ...opcoes });
    if (sql.startsWith('SELECT COUNT(*)')) return [{ total, totalAtendimentos: total, totalServicosExtras: itens.filter((item) => item.tipoItem === 'EXTRA').length }];
    if (sql.startsWith('SELECT analitico.*')) return linhas;
    if (sql.startsWith('SELECT item.id_agendamento')) return itens;
    assert.fail('Consulta inesperada');
  });
  return consultas;
}

const consulta = (extra = {}) => normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-31', ...extra }, 7);

test('composição usa uma consulta em lote, preserva valores históricos e não altera as linhas originais', async () => {
  const linhas = [{ idAgendamento: 10, valor: '75.00' }, { idAgendamento: 20, valor: '0.00' }];
  const itens = [
    { idAgendamento: '10', tipoItem: 'ORIGINAL', valorItem: '40.00', precoNormal: '50.00', duracaoMinutos: 30 },
    { idAgendamento: 10, tipoItem: 'EXTRA', idExtra: 3, valorItem: '35.00', precoNormal: null, descontoAdicional: null, duracaoMinutos: 20, observacaoAjuste: 'Cortesia para o cliente.' },
    { idAgendamento: 20, tipoItem: 'ORIGINAL', valorItem: '0.00', precoNormal: '0.00', duracaoMinutos: 15 },
  ];
  const consultas = simularBanco(linhas, itens);
  const resultado = await consultarAnalitico(consulta());
  assert.equal(consultas.length, 3);
  assert.deepEqual(consultas[2].replacements.ids, [10, 20]);
  assert.deepEqual(resultado.agendamentos.map((item) => item.servicos.length), [2, 1]);
  for (const item of resultado.agendamentos) assert.equal(item.servicos.reduce((soma, servico) => soma + Number(servico.valorItem), 0), Number(item.valor));
  assert.equal(resultado.agendamentos[0].servicos[1].descontoAdicional, null);
  assert.equal(resultado.agendamentos[0].servicos[0].duracaoMinutos, 30);
  assert.equal(resultado.agendamentos[0].servicos[1].observacaoAjuste, 'Cortesia para o cliente.');
  assert.equal(linhas[0].servicos, undefined);
});

test('composição recebe os mesmos filtros e limita extras ao recorte selecionado', async () => {
  const consultas = simularBanco([{ idAgendamento: 10, valor: '45.00' }], [{ idAgendamento: 10, tipoItem: 'EXTRA', valorItem: '45.00' }]);
  await consultarAnalitico(consulta({ idUnidade: 2, idServico: 3, idFuncionario: 4, promocao: 'com', ajusteValor: 'acrescimo', recorte: 'extras' }));
  const composicao = consultas[2];
  assert.match(composicao.sql, /AND item.id_extra IS NOT NULL/);
  assert.match(composicao.sql, /ELSE extra.nu_duracao_minutos END AS duracaoMinutos/);
  assert.match(composicao.sql, /extra.ds_observacao_ajuste AS observacaoAjuste/);
  for (const campo of ['idSalao', 'idUnidade', 'idServico', 'idFuncionario', 'promocao', 'ajusteValor']) assert.equal(composicao.replacements[campo], consultas[1].replacements[campo]);
});

test('visão por serviço mantém paginação e duração sem carregar uma composição duplicada', async () => {
  const consultas = simularBanco([{ idAgendamento: 10, idLinha: 'EXTRA:3', duracaoMinutos: 20 }], [], 30);
  const resultado = await consultarAnalitico(consulta({ visualizarPor: 'servico', pagina: 99 }));
  assert.equal(consultas.length, 2);
  assert.equal(resultado.pagina, 2);
  assert.equal(consultas[1].replacements.offset, 25);
  assert.match(consultas[1].sql, /ELSE extra.nu_duracao_minutos END AS duracaoMinutos/);
  assert.equal(resultado.agendamentos[0].servicos, undefined);
});

test('página vazia não consulta itens com uma lista de identificadores vazia', async () => {
  const consultas = simularBanco([]);
  const resultado = await consultarAnalitico(consulta());
  assert.equal(consultas.length, 2);
  assert.deepEqual(resultado.agendamentos, []);
  assert.equal(resultado.total, 0);
  assert.equal(resultado.totalPaginas, 1);
});

test('exportação preserva a observação por serviço e neutraliza fórmulas no CSV', async () => {
  const observacaoAjuste = '=Motivo "combinado"; acabamento especial';
  const consultaServico = consulta({ visualizarPor: 'servico' });
  const [linha] = await prepararLinhasExportacao(consultaServico, [{ servico: 'Barba', valor: 45, observacaoAjuste }]);
  assert.equal(linha.observacaoAjuste, observacaoAjuste);
  assert.ok(colunasExportacao.some(([nome, campo]) => nome === 'observacao_ajuste' && campo === 'observacaoAjuste'));
  assert.equal(linhaCsv([linha.observacaoAjuste]), '"\'=Motivo ""combinado""; acabamento especial"\r\n');
  simular(bancoDeDados, 'query', async () => [{ idAgendamento: 10, observacaoAjuste }]);
  const [agrupada] = await prepararLinhasExportacao(consulta(), [{ idAgendamento: 10 }]);
  assert.equal(agrupada.observacaoAjuste, observacaoAjuste);
});
