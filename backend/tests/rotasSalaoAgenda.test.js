import assert from 'node:assert/strict';
import { afterAll, beforeEach, test } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { agendaDisponivel, amanha, iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, { DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64') });
const ambiente = await iniciarRota('rotas/salao.js', { usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'ADMIN_SALAO' }, montagem: '/api/salao' });
const { banco } = ambiente;
afterAll(() => ambiente.parar());
const base = '/api/salao';

const SALAO = /FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador/;
const salao = () => banco.responder(SALAO, [{ idSalao: 1, nome: 'Studio', slug: 'studio', emailConta: 'a@a.com' }]);
const filialExiste = () => banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao AND st_ativo = TRUE LIMIT 1/, [{ idUnidade: 5 }]);

beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  ambiente.estado.autenticado = true;
});

const bloqueio = { idUnidade: 5, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00`, dataHoraFim: `${amanha}T12:00`, codigoMotivo: 'PROBLEMA_UNIDADE' };

test('criar bloqueio valida período, unidade, profissional e motivo', async () => {
  assert.equal((await ambiente.post(`${base}/bloqueios`, bloqueio)).status, 404);
  salao();
  for (const alteracao of [{ idUnidade: 'x' }, { dataHoraInicio: 'lixo' }, { dataHoraFim: `${amanha}T09:00` }]) assert.equal((await ambiente.post(`${base}/bloqueios`, { ...bloqueio, ...alteracao })).status, 400);
  assert.equal((await ambiente.post(`${base}/bloqueios`, bloqueio)).status, 404);
  filialExiste();
  assert.match((await ambiente.post(`${base}/bloqueios`, bloqueio)).corpo.mensagem, /Profissional não encontrado/);
  banco.responder(/SELECT id_funcionario FROM tb_funcionario WHERE id_funcionario=:idFuncionario AND fk_unidade=:idUnidade/, [{ id_funcionario: 9 }]);
  for (const alteracao of [{ codigoMotivo: 'X' }, { codigoMotivo: 'OUTRO', detalheMotivo: ' ' }, { codigoMotivo: 'OUTRO', detalheMotivo: 'x'.repeat(201) }]) assert.equal((await ambiente.post(`${base}/bloqueios`, { ...bloqueio, ...alteracao })).status, 400);
});

test('criar bloqueio cancela agendamentos em conflito e notifica clientes', async () => {
  salao(); filialExiste();
  banco.responder(/SELECT id_funcionario FROM tb_funcionario WHERE id_funcionario=:idFuncionario/, [{ id_funcionario: 9 }]);
  const sem = await ambiente.post(`${base}/bloqueios`, bloqueio);
  assert.equal(sem.status, 201);
  assert.equal(sem.corpo.quantidadeAgendamentosCancelados, 0);
  banco.responder(/WHERE fk_unidade=:idUnidade AND cd_status='AGENDADO'\s+AND \(:idFuncionario IS NULL/, [{ idAgendamento: 1, idUsuario: 7 }, { idAgendamento: 2, idUsuario: null }]);
  banco.responder(/INSERT INTO tb_notificacao_cliente/, [11, 1]);
  const com = await ambiente.post(`${base}/bloqueios`, { ...bloqueio, idFuncionario: null, codigoMotivo: 'OUTRO', detalheMotivo: 'reforma' });
  assert.equal(com.corpo.quantidadeAgendamentosCancelados, 2);
  assert.match(com.corpo.mensagem, /2 agendamento/);
  assert.equal(banco.chamadas.filter((c) => /INSERT INTO tb_notificacao_cliente/.test(c.sql)).length, 1);
  banco.responder(/INSERT INTO tb_bloqueio_agenda/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.post(`${base}/bloqueios`, bloqueio)).status, 500);
});

test('excluir bloqueio', async () => {
  assert.equal((await ambiente.delete(`${base}/bloqueios/1`)).status, 404);
  salao();
  assert.equal((await ambiente.delete(`${base}/bloqueios/1`)).status, 404);
  banco.responder(/UPDATE tb_bloqueio_agenda b INNER JOIN/, [{ affectedRows: 1 }]);
  assert.equal((await ambiente.delete(`${base}/bloqueios/1`)).status, 200);
});

test('horários para agendar no salão', async () => {
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=x&idServico=1`)).status, 400);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=z`)).status, 400);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1`)).status, 404);
  filialExiste();
  agendaDisponivel(banco);
  const resposta = await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=9&data=${amanha}`);
  assert.ok(resposta.corpo.horarios.length > 0);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&data=lixo`)).status, 400);
});

const novo = { idUnidade: 5, idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00`, cliente: { nome: 'Carla', email: 'c@c.com', telefone: '119' }, valorEsperado: 50 };

test('criar agendamento no salão valida cliente e dados', async () => {
  assert.equal((await ambiente.post(`${base}/agendamentos`, novo)).status, 404);
  salao();
  const casos = [
    { idUnidade: 'x' }, { idFuncionario: 'x' }, { idClienteSalao: 'x', cliente: {} }, { idClienteSalao: 3 }, { cliente: {} },
    { cliente: { nome: 'x'.repeat(121) } }, { cliente: { nome: 'A', email: 'ruim' } }, { cliente: { nome: 'A', telefone: '1'.repeat(21) } },
  ];
  for (const alteracao of casos) assert.equal((await ambiente.post(`${base}/agendamentos`, { ...novo, ...alteracao })).status, 400, JSON.stringify(alteracao));
  assert.equal((await ambiente.post(`${base}/agendamentos`, novo)).status, 404);
});

test('criar agendamento no salão com cliente novo ou existente', async () => {
  salao(); filialExiste(); agendaDisponivel(banco);
  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idClienteSalao/, [{ idClienteSalao: 4 }]);
  const criado = await ambiente.post(`${base}/agendamentos`, { ...novo, observacao: ' obs ' });
  assert.equal(criado.status, 201);
  assert.equal(criado.corpo.idFuncionario, 9);
  assert.ok(banco.chamou(/INSERT INTO tb_cliente_salao/));
  const existente = { ...novo, cliente: undefined, idClienteSalao: 4 };
  assert.equal((await ambiente.post(`${base}/agendamentos`, existente)).status, 404);
  banco.responder(/SELECT id_cliente_salao AS idClienteSalao FROM tb_cliente_salao WHERE id_cliente_salao=:idClienteSalao AND fk_salao/, [{ idClienteSalao: 4 }]);
  assert.equal((await ambiente.post(`${base}/agendamentos`, existente)).status, 201);
  banco.responder(/SELECT id_agendamento FROM tb_agendamento\s+WHERE fk_funcionario=:idFuncionario AND cd_status='AGENDADO'/, [{ id_agendamento: 1 }]);
  assert.equal((await ambiente.post(`${base}/agendamentos`, existente)).status, 409);
  banco.reiniciar(); salao(); filialExiste(); agendaDisponivel(banco);
  assert.equal((await ambiente.post(`${base}/agendamentos`, { ...existente, valorEsperado: 1, idClienteSalao: 4 })).status, 404);
});

test('listar clientes do salão com e sem busca', async () => {
  assert.equal((await ambiente.get(`${base}/clientes`)).status, 404);
  salao();
  banco.responder(/UNION ALL/, [{ nome: 'Ana' }]);
  assert.equal((await ambiente.get(`${base}/clientes`)).corpo.clientes.length, 1);
  await ambiente.get(`${base}/clientes?busca=ana`);
  assert.match(banco.chamadas.at(-1).sql, /cliente.nome LIKE :busca/);
});

test('listar agendamentos do salão valida a consulta', async () => {
  assert.equal((await ambiente.get(`${base}/agendamentos`)).status, 404);
  salao();
  banco.responder(/SELECT COUNT\(\*\) AS total\s+FROM tb_agendamento a INNER JOIN tb_unidade u/, [{ total: '1' }]);
  banco.responder(/SELECT a.id_agendamento AS idAgendamento,\s+a.fk_unidade/, [{ idAgendamento: 1, status: 'AGENDADO', dataHoraInicio: '2999-01-01 10:00:00', valor: '30' }]);
  assert.equal((await ambiente.get(`${base}/agendamentos?periodo=hoje`)).corpo.total, 1);
  assert.equal((await ambiente.get(`${base}/agendamentos?tipo=x`)).status, 400);
  banco.responder(/SELECT COUNT\(\*\) AS total\s+FROM tb_agendamento a INNER JOIN tb_unidade u/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/agendamentos`)).status, 500);
});

function contextoAgendamento(extra = {}) {
  banco.responder(/SELECT a.fk_unidade AS idUnidade,\s+a.fk_usuario AS idUsuario, a.fk_cliente_salao AS idClienteSalao/, [{ idUnidade: 5, idUsuario: 7, idClienteSalao: null }]);
  banco.responder(/SELECT cd_status AS status, dt_inicio AS dataHoraInicio, dt_fim AS dataHoraFim/, [{ status: 'AGENDADO', dataHoraInicio: '2020-01-01 10:00:00', dataHoraFim: '2020-01-01 10:30:00', servico: 'Corte', idUnidade: 5, ...extra }]);
}

test('confirmar atendimento valida o estado e o prazo', async () => {
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {})).status, 404);
  salao();
  assert.equal((await ambiente.patch(`${base}/agendamentos/x/confirmar-atendimento`, {})).status, 400);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {})).status, 404);
  contextoAgendamento({ status: 'REALIZADO' });
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {})).status, 409);
  contextoAgendamento({ idUnidade: 99 });
  assert.match((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {})).corpo.mensagem, /foi alterado/);
  contextoAgendamento({ dataHoraInicio: '2999-01-01 10:00:00' });
  assert.match((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {})).corpo.mensagem, /a partir de 00h/);
});

test('confirmar atendimento grava extras, resultado e convida o cliente a avaliar', async () => {
  salao(); contextoAgendamento();
  const sucesso = await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {});
  assert.equal(sucesso.status, 200);
  assert.ok(banco.chamou(/INSERT INTO tb_notificacao_cliente/));
  banco.responder(/SELECT fk_salao AS idSalao FROM tb_unidade WHERE id_unidade=:idUnidade/, [{ idSalao: 1 }]);
  banco.responder(/SELECT s.nm_servico AS nomeServico,/, [{ nomeServico: 'Barba', valorReferencia: '20.00', duracaoMinutos: 20, promocaoTipo: null, nomeFuncionario: 'Ana' }]);
  const extra = { idServico: 2, idFuncionario: 9, valorCobrado: 20, valorEsperado: 20 };
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, { servicosAdicionais: [extra] })).status, 200);
  assert.ok(banco.chamou(/INSERT INTO tb_agendamento_servico_adicional/));
  const preco = await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, { servicosAdicionais: [{ ...extra, valorEsperado: 5 }] });
  assert.equal(preco.status, 409);
  assert.equal(preco.corpo.codigo, 'PRECO_ALTERADO');
  assert.equal(preco.corpo.precosAtualizados[0].idServico, 2);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, { servicosAdicionais: [{ idServico: 'x' }] })).status, 400);
  assert.ok(banco.revertidas > 0);
});

test('registrar ausência exige que o horário tenha passado', async () => {
  salao(); contextoAgendamento();
  const ok = await ambiente.patch(`${base}/agendamentos/3/nao-compareceu`, {});
  assert.equal(ok.status, 200);
  assert.match(ok.corpo.mensagem, /Ausência/);
  assert.equal(banco.chamou(/INSERT INTO tb_notificacao_cliente/), false);
  contextoAgendamento({ dataHoraInicio: '2999-01-01 10:00:00' });
  assert.match((await ambiente.patch(`${base}/agendamentos/3/nao-compareceu`, {})).corpo.mensagem, /após o horário/);
});

test('cancelar agendamento pelo salão', async () => {
  const corpo = { codigoMotivo: 'PROBLEMA_UNIDADE' };
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/cancelar`, corpo)).status, 404);
  salao();
  assert.equal((await ambiente.patch(`${base}/agendamentos/x/cancelar`, corpo)).status, 400);
  for (const invalido of [{ codigoMotivo: 'X' }, { codigoMotivo: 'OUTRO', detalheMotivo: '' }, { codigoMotivo: 'OUTRO', detalheMotivo: 'x'.repeat(201) }]) assert.equal((await ambiente.patch(`${base}/agendamentos/3/cancelar`, invalido)).status, 400);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/cancelar`, corpo)).status, 409);
  banco.responder(/SELECT a.fk_usuario AS idUsuario\s+FROM tb_agendamento a INNER JOIN tb_unidade u/, [{ idUsuario: 7 }]);
  assert.match((await ambiente.patch(`${base}/agendamentos/3/cancelar`, corpo)).corpo.mensagem, /mudou de status/);
  banco.responder(/UPDATE tb_agendamento SET cd_status='CANCELADO', dt_cancelamento=NOW\(\),\s+fk_usuario_cancelamento/, [{ affectedRows: 1 }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/cancelar`, corpo)).status, 200);
  assert.ok(banco.chamou(/INSERT INTO tb_notificacao_cliente/));
  banco.responder(/SELECT a.fk_usuario AS idUsuario\s+FROM tb_agendamento a INNER JOIN tb_unidade u/, [{ idUsuario: null }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/cancelar`, corpo)).status, 200);
  banco.responder(/UPDATE tb_agendamento SET cd_status='CANCELADO', dt_cancelamento=NOW\(\),\s+fk_usuario_cancelamento/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/cancelar`, corpo)).status, 500);
});

const reagendavel = /SELECT a.id_agendamento AS idAgendamento, a.fk_usuario AS idUsuario, a.fk_cliente_salao AS idClienteSalao/;
const linhaReagendavel = { idAgendamento: 3, idUsuario: 7, idClienteSalao: null, idUnidade: 5, idServico: 1, idFuncionario: 8, dataHoraInicio: '2020-01-01 10:00:00', servico: 'Corte', duracaoMinutos: 30 };

test('horários de reagendamento no salão', async () => {
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/agendamentos/x/horarios-reagendamento`)).status, 400);
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento`)).status, 404);
  banco.responder(reagendavel, [linhaReagendavel]);
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento?idFuncionario=zz`)).status, 400);
  agendaDisponivel(banco);
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento?idFuncionario=qualquer&data=${amanha}`)).status, 200);
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento?idFuncionario=9&data=${amanha}`)).status, 200);
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento?data=lixo`)).status, 400);
});

test('reagendar no salão altera horário, notifica e trata conflitos', async () => {
  const corpo = { dataHoraInicio: `${amanha}T10:00`, idFuncionario: 9 };
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).status, 404);
  salao();
  assert.equal((await ambiente.patch(`${base}/agendamentos/x/reagendar`, corpo)).status, 400);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, { ...corpo, idFuncionario: 'x' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).status, 409);
  banco.responder(reagendavel, [linhaReagendavel]);
  agendaDisponivel(banco);
  banco.responder(/INSERT INTO tb_notificacao_cliente/, [12, 1]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).status, 200);
  assert.match(banco.chamadas.find((c) => /INSERT INTO tb_notificacao_cliente/.test(c.sql)).opcoes.replacements.mensagem, /reagendou/);
  banco.responder(/SELECT id_agendamento FROM tb_agendamento WHERE fk_funcionario = :idFuncionario/, [{ id_agendamento: 1 }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).status, 409);
  banco.responder(/SELECT id_agendamento FROM tb_agendamento WHERE fk_funcionario = :idFuncionario/, []);
  let chamadas = 0;
  banco.responder(reagendavel, () => [{ ...linhaReagendavel, idUnidade: ++chamadas === 1 ? 5 : 6 }]);
  assert.match((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).corpo.mensagem, /unidade do agendamento mudou/);
  chamadas = 0;
  banco.responder(reagendavel, () => (++chamadas === 1 ? [linhaReagendavel] : []));
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).status, 409);
  banco.responder(reagendavel, [{ ...linhaReagendavel, idUsuario: null, idFuncionario: 9, dataHoraInicio: `${amanha} 10:00:00` }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, corpo)).status, 200);
});

test('avaliações recebidas pelo salão', async () => {
  assert.equal((await ambiente.get(`${base}/avaliacoes`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/avaliacoes?idUnidade=-1`)).status, 400);
  banco.responder(/COUNT\(\*\) AS quantidade, ROUND\(AVG\(av.nu_nota_salao\),1\) AS mediaSalao,/, [{ quantidade: '45' }]);
  banco.responder(/LIMIT 30 OFFSET :deslocamento/, [{ idAvaliacao: 1 }]);
  const geral = await ambiente.get(`${base}/avaliacoes`);
  assert.equal(geral.corpo.temMais, true);
  const filtrada = await ambiente.get(`${base}/avaliacoes?idUnidade=5&pagina=2`);
  assert.equal(filtrada.corpo.temMais, false);
  assert.match(banco.chamadas.at(-1).sql, /av.fk_unidade=:idUnidade/);
});

test('indicadores básicos aplicam filtros e tratam falhas', async () => {
  assert.equal((await ambiente.get(`${base}/indicadores`)).status, 404);
  salao();
  banco.responder(/COALESCE\(SUM\(CASE WHEN a.cd_status IN \('AGENDADO','REALIZADO'\)/, [{ quantidadeAgendamentosAtivos: 3 }]);
  const resposta = await ambiente.get(`${base}/indicadores?idUnidade=5&idServico=1&idFuncionario=9&dataInicio=2026-10-01&dataFim=2026-10-30`);
  assert.equal(resposta.corpo.resumo.quantidadeAgendamentosAtivos, 3);
  assert.deepEqual(resposta.corpo.filtros.idUnidade, 5);
  const semFiltros = await ambiente.get(`${base}/indicadores?dataInicio=lixo`);
  assert.equal(semFiltros.corpo.filtros.dataInicio, null);
  banco.responder(/GROUP BY a.nm_servico_agendado/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/indicadores`)).status, 500);
});

// ---- ramificações restantes ----

test('horários para agendar: data ausente é recusada e falha inesperada vira 500', async () => {
  salao(); filialExiste(); agendaDisponivel(banco);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=9`)).status, 400);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_funcionario_servico fs/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=9&data=${amanha}`)).status, 500);
});

test('falhas inesperadas ao criar agendamento, confirmar atendimento e reagendar', async () => {
  salao(); filialExiste(); agendaDisponivel(banco);
  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idClienteSalao/, [{ idClienteSalao: 4 }]);
  banco.responder(/INSERT INTO tb_agendamento\b/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.post(`${base}/agendamentos`, novo)).status, 500);

  banco.reiniciar(); salao(); contextoAgendamento();
  banco.responder(/UPDATE tb_agendamento/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/confirmar-atendimento`, {})).status, 500);

  banco.reiniciar(); salao();
  banco.responder(reagendavel, [linhaReagendavel]);
  agendaDisponivel(banco);
  banco.responder(/UPDATE tb_agendamento/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.patch(`${base}/agendamentos/3/reagendar`, { dataHoraInicio: `${amanha}T10:00`, idFuncionario: 9 })).status, 400);
});

test('horários de reagendamento: data ausente e falha inesperada', async () => {
  salao();
  banco.responder(reagendavel, [linhaReagendavel]);
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento`)).status, 400);
  agendaDisponivel(banco);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_funcionario_servico fs/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/agendamentos/3/horarios-reagendamento?data=${amanha}`)).status, 400);
});
