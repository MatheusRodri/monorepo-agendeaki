import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { bancoDeDados } from '../src/configuracoes/bancoDeDados.js';
import { incluirServicosAdicionais, salvarServicosAdicionais } from '../src/servicos/agendamentos.js';

const simular = (objeto, metodo, implementacao) => jest.spyOn(objeto, metodo).mockImplementation(implementacao);

function simularFechamento() {
  const gravacoes = [];
  const transaction = {};
  simular(bancoDeDados, 'query', async (sql, opcoes) => {
    assert.equal(opcoes.transaction, transaction);
    if (sql.includes('SELECT fk_salao AS idSalao')) return [{ idSalao: 7 }];
    if (sql.includes('FROM tb_assinatura_salao')) return [{ status: 'AUTORIZADA' }];
    if (sql.includes('SELECT s.nm_servico')) return [{ nomeServico: 'Barba', nomeFuncionario: 'João', duracaoMinutos: 20,
      valorReferencia: '50.00', promocaoTipo: 'PERCENTUAL', promocaoValor: 20, promocaoHabilitada: 1,
      promocaoInicio: null, promocaoFim: null }];
    if (sql.includes('INSERT INTO tb_agendamento_servico_adicional')) { gravacoes.push(opcoes.replacements); return []; }
    assert.fail('Consulta inesperada');
  });
  return { gravacoes, transaction };
}

test('salva motivos com descontos, acréscimos e valor zero; sem ajuste não conserva um motivo antigo', async () => {
  const { gravacoes, transaction } = simularFechamento();
  await salvarServicosAdicionais({ idAgendamento: 10, idUnidade: 2, transaction, servicosAdicionais: [
    { idServico: 1, idFuncionario: 1, valorCobrado: 35, valorEsperado: 40, observacaoAjuste: '  Cortesia.  ' },
    { idServico: 1, idFuncionario: 1, valorCobrado: 45, valorEsperado: 40, observacaoAjuste: 'Acabamento especial.' },
    { idServico: 1, idFuncionario: 1, valorCobrado: 0, valorEsperado: 40, observacaoAjuste: 'Cortesia integral.' },
    { idServico: 1, idFuncionario: 1, valorCobrado: 40, valorEsperado: 40, observacaoAjuste: 'Ajuste removido.' },
    { idServico: 1, idFuncionario: 1, valorCobrado: 45, valorEsperado: 40 },
  ] });
  assert.deepEqual(gravacoes.map((item) => item.observacaoAjuste), ['Cortesia.', 'Acabamento especial.', 'Cortesia integral.', null, null]);
  assert.deepEqual(gravacoes.map((item) => item.valorCobrado), [35, 45, 0, 40, 45]);
});

test('rejeita observação inválida e preserva o conflito de preço sem gravar o extra', async () => {
  const { gravacoes, transaction } = simularFechamento();
  const salvar = (extra) => salvarServicosAdicionais({ idAgendamento: 10, idUnidade: 2, transaction,
    servicosAdicionais: [{ idServico: 1, idFuncionario: 1, valorCobrado: 45, valorEsperado: 40, ...extra }] });
  await assert.rejects(salvar({ observacaoAjuste: 'a'.repeat(501) }), { status: 400 });
  await assert.rejects(salvar({ observacaoAjuste: {} }), { status: 400 });
  await assert.rejects(salvar({ valorEsperado: 50, observacaoAjuste: 'Acabamento.' }), { status: 409, codigo: 'PRECO_ALTERADO' });
  assert.equal(gravacoes.length, 0);
});

test('inclui observações no histórico do salão apenas quando solicitado, conservando o total', async () => {
  simular(bancoDeDados, 'query', async (sql) => [{ idAgendamento: 10, valorCobrado: 45,
    ...(sql.includes('ds_observacao_ajuste') ? { observacaoAjuste: 'Acabamento especial.' } : {}) }]);
  const agendamentos = [{ idAgendamento: 10, valor: 40 }];
  const [cliente] = await incluirServicosAdicionais(agendamentos);
  assert.equal(cliente.servicosAdicionais[0].observacaoAjuste, undefined);
  const [salao] = await incluirServicosAdicionais(agendamentos, { incluirObservacoesAjuste: true });
  assert.equal(salao.servicosAdicionais[0].observacaoAjuste, 'Acabamento especial.');
  assert.equal(salao.valorTotal, 85);
});
