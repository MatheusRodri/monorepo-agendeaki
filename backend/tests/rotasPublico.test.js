import assert from 'node:assert/strict';
import { afterAll, beforeEach, test } from '@jest/globals';
import { iniciarRota } from './auxiliares/ambiente.js';

const ambiente = await iniciarRota('rotas/publico.js');
const { banco } = ambiente;
afterAll(() => ambiente.parar());
beforeEach(() => banco.reiniciar());

const filial = { idSalao: 1, nomeSalao: 'Studio', slugSalao: 'studio', idUnidade: 5, nomeUnidade: 'Centro', slugFilial: 'centro' };
const linhaServico = (extra = {}) => ({
  idServico: 1, nome: 'Corte', descricao: 'Corte simples', valor: '50.00', duracaoMinutos: 30,
  promocaoTipo: null, promocaoValor: null, promocaoHabilitada: null, promocaoInicio: null, promocaoFim: null,
  idFuncionario: 9, nomeFuncionario: 'Ana', ...extra,
});

test('página de agendamento devolve 404 quando a filial não existe', async () => {
  const resposta = await ambiente.get('/agendamento/studio/centro');
  assert.equal(resposta.status, 404);
});

test('página de agendamento agrupa profissionais por serviço e ignora serviço sem profissional', async () => {
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  banco.responder(/FROM tb_servico se/, [
    linhaServico(), linhaServico({ idFuncionario: 10, nomeFuncionario: 'Bia' }),
    linhaServico({ idServico: 2, nome: 'Barba', idFuncionario: null, nomeFuncionario: null }),
  ]);
  const resposta = await ambiente.get('/agendamento/studio/centro');
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.disponivel, true);
  assert.equal(resposta.corpo.servicos.length, 1);
  assert.deepEqual(resposta.corpo.servicos[0].profissionais.map((p) => p.nome), ['Ana', 'Bia']);
  assert.equal(resposta.corpo.servicos[0].valor, 50);
});

test('página de agendamento aplica a promoção somente com Premium ativo', async () => {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  banco.responder(/FROM tb_servico se/, [linhaServico({
    promocaoTipo: 'PERCENTUAL', promocaoValor: '20.00', promocaoHabilitada: 1, promocaoInicio: hoje, promocaoFim: hoje,
  })]);
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA', dataProximaCobranca: null }]);
  assert.equal((await ambiente.get('/agendamento/studio/centro')).corpo.servicos[0].valor, 40);
  banco.responder(/FROM tb_assinatura_salao/, []);
  assert.equal((await ambiente.get('/agendamento/studio/centro')).corpo.servicos[0].valor, 50);
});

test('página sem serviços fica indisponível', async () => {
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  const resposta = await ambiente.get('/agendamento/studio/centro');
  assert.equal(resposta.corpo.disponivel, false);
});

test('horários: 404 sem filial e 400 para serviço ou profissional inválidos', async () => {
  assert.equal((await ambiente.get('/agendamento/studio/centro/horarios?idServico=1')).status, 404);
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  assert.equal((await ambiente.get('/agendamento/studio/centro/horarios?idServico=abc')).status, 400);
  assert.equal((await ambiente.get('/agendamento/studio/centro/horarios?idServico=1&idFuncionario=x')).status, 400);
});

test('horários: repassa erro de validação da data com o status do serviço', async () => {
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  const resposta = await ambiente.get('/agendamento/studio/centro/horarios?idServico=1&data=lixo');
  assert.equal(resposta.status, 400);
  assert.ok(resposta.corpo.mensagem);
});

test('endereço legado redireciona pelo id da unidade ou devolve 404', async () => {
  assert.equal((await ambiente.get('/agendamento/unidade/5')).status, 404);
  banco.responder(/SELECT s.ds_slug AS slugSalao/, [{ slugSalao: 'studio', slugFilial: 'centro' }]);
  const resposta = await ambiente.get('/agendamento/unidade/5');
  assert.deepEqual(resposta.corpo, { caminho: '/studio/centro' });
});

test('avaliações: rejeita unidade inválida e 404 para unidade inexistente', async () => {
  assert.equal((await ambiente.get('/avaliacoes/abc')).status, 400);
  assert.equal((await ambiente.get('/avaliacoes/0')).status, 400);
  assert.equal((await ambiente.get('/avaliacoes/5')).status, 404);
});

test('avaliações: pagina de 20 em 20 e informa se há mais', async () => {
  banco.responder(/SELECT u.id_unidade AS idUnidade FROM tb_unidade u/, [{ idUnidade: 5 }]);
  banco.responder(/COUNT\(\*\) AS quantidade, ROUND\(AVG\(nu_nota_salao\)/, [{ quantidade: '45', mediaSalao: '4.5' }]);
  banco.responder(/GROUP BY fk_servico/, [{ idServico: 1, quantidade: 3, mediaServico: '4.0' }]);
  banco.responder(/LIMIT 20 OFFSET/, [{ idAvaliacao: 1, notaSalao: 5 }]);
  const primeira = await ambiente.get('/avaliacoes/5');
  assert.equal(primeira.corpo.temMais, true);
  assert.equal(primeira.corpo.pagina, 1);
  const terceira = await ambiente.get('/avaliacoes/5?pagina=3');
  assert.equal(terceira.corpo.temMais, false);
  assert.equal(banco.chamadas.at(-1).opcoes.replacements.deslocamento, 40);
  assert.equal((await ambiente.get('/avaliacoes/5?pagina=99999')).corpo.pagina, 1000);
});

test('horários: erro inesperado do banco vira 500', async () => {
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_funcionario_servico fs/, () => { throw new Error('banco'); });
  const resposta = await ambiente.get(`/agendamento/studio/centro/horarios?idServico=1&data=${new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}`);
  assert.equal(resposta.status, 500);
});

test('horários: devolve a disponibilidade quando há profissional e agenda', async () => {
  const { agendaDisponivel, amanha } = await import('./auxiliares/ambiente.js');
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  agendaDisponivel(banco);
  const resposta = await ambiente.get(`/agendamento/studio/centro/horarios?idServico=1&idFuncionario=qualquer&data=${amanha}`);
  assert.equal(resposta.status, 200);
  assert.ok(resposta.corpo.horarios.length > 0);
});

test('horários sem data informada são recusados', async () => {
  banco.responder(/FROM tb_salao s INNER JOIN tb_unidade u/, [filial]);
  assert.equal((await ambiente.get('/agendamento/studio/centro/horarios?idServico=1')).status, 400);
});
