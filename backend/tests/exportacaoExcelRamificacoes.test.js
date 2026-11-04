import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { beforeEach, jest, test } from '@jest/globals';
import { mockarBanco, silenciarConsole } from './auxiliares/ambiente.js';

// Planilha simulada: permite chegar ao limite de linhas do Excel sem gerar um milhão de linhas reais.
const banco = mockarBanco();
const controle = { aoCriarAba: null };
jest.unstable_mockModule('exceljs', () => ({
  default: { stream: { xlsx: { WorkbookWriter: class {
    zip = { on: (evento, funcao) => { controle.erroZip = evento === 'error' ? funcao : controle.erroZip; }, abort() {} };
    addWorksheet() {
      controle.aoCriarAba?.();
      return { columns: [], getRow: () => ({ commit() {} }), addRow: () => ({ commit() {} }), commit() {} };
    }
    async commit() {}
  } } } },
}));
const analitico = await import('../src/servicos/dashboardAnalitico.js');
const excel = await import('../src/servicos/dashboardExcel.js');

beforeEach(() => { banco.reiniciar(); controle.aoCriarAba = null; silenciarConsole(); });

const consulta = () => analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30', recorte: 'realizados', visualizarPor: 'servico' }, 1);
const resposta = () => Object.assign(new PassThrough(), { setHeader: jest.fn() });
const lote = () => Array.from({ length: 500 }, (_, i) => ({ idAgendamento: i, idUnidade: 5, idServico: 1, idFuncionario: 9, servico: 'Corte', profissional: 'Ana', valor: '10' }));

test('exportar Excel recusa recortes acima do limite de linhas da planilha', async () => {
  banco.responder(/^SELECT analitico\.\*/, lote);
  await assert.rejects(() => excel.exportarAnaliticoExcel(consulta(), resposta()), /limite de linhas do Excel/);
}, 60000);

test('exportar Excel interrompe quando o arquivo temporário falha durante a consulta', async () => {
  controle.aoCriarAba = () => controle.erroZip(new Error('disco cheio'));
  // Cede o laço de eventos para o erro do arquivo ser entregue entre os lotes.
  banco.responder(/^SELECT analitico\.\*/, () => new Promise((resolver) => setImmediate(() => resolver(lote()))));
  await assert.rejects(() => excel.exportarAnaliticoExcel(consulta(), resposta()), /disco cheio/);
});
