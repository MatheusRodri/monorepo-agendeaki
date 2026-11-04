import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { agendaDisponivel, amanha, mockarBanco, silenciarConsole } from './auxiliares/ambiente.js';

// Casos de borda que os testes por área não alcançam: valores ausentes, formatos alternativos e erros raros.
const banco = mockarBanco();
const documentos = await import('../src/servicos/documentos.js');
const protegidos = await import('../src/servicos/documentosProtegidos.js');
const regras = await import('../src/servicos/regrasTemporaisAgendamento.js');
const promocoes = await import('../src/servicos/promocoesServicos.js');
const { criarServicoSessoesAdmin } = await import('../src/servicos/sessoesAdmin.js');
const convites = await import('../src/servicos/convitesAvaliacao.js');
const agendamentos = await import('../src/servicos/agendamentos.js');
const analitico = await import('../src/servicos/dashboardAnalitico.js');
const disponibilidade = await import('../src/servicos/disponibilidade.js');
const push = await import('../src/servicos/notificacoesPush.js');
const faturas = await import('../src/servicos/faturasAssinaturas.js');

beforeEach(() => { banco.reiniciar(); silenciarConsole(); });
afterEach(() => { jest.useRealTimers(); });

// ---- documentos ----

test('CPF e CNPJ cujo resto do cálculo exige dígito zero', () => {
  assert.equal(documentos.cpfValido('100.000.001-08'), true); // primeiro dígito: resto 10
  assert.equal(documentos.cpfValido('100.000.028-10'), true); // segundo dígito: resto 10
  assert.equal(documentos.cnpjValido('10.000.000.0003-07'.replace(/\./g, '')), true); // primeiro dígito: resto < 2
  assert.equal(documentos.cnpjValido('10000000000650'), true); // segundo dígito: resto < 2
});

test('data de nascimento considera o aniversário ainda não ocorrido no mês corrente', () => {
  jest.useFakeTimers({ now: new Date('2026-06-15T15:00:00Z') });
  assert.equal(documentos.dataNascimentoValida('2008-06-20'), false); // mesmo mês, dia seguinte: ainda tem 17
  assert.equal(documentos.dataNascimentoValida('2008-06-15'), true); // faz 18 hoje
  assert.equal(documentos.dataNascimentoValida('2008-06-10'), true); // mesmo mês, dia anterior
  assert.equal(documentos.dataNascimentoValida('2008-07-01'), false);
});

test('chaves de documentos exigem variável de ambiente definida', () => {
  const anterior = { c: process.env.DOCUMENT_ENCRYPTION_KEY, h: process.env.DOCUMENT_HMAC_KEY };
  delete process.env.DOCUMENT_ENCRYPTION_KEY;
  assert.throws(() => protegidos.validarChavesDocumentos(), /DOCUMENT_ENCRYPTION_KEY/);
  Object.assign(process.env, { DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
  delete process.env.DOCUMENT_HMAC_KEY;
  assert.throws(() => protegidos.validarChavesDocumentos(), /DOCUMENT_HMAC_KEY/);
  if (anterior.c) process.env.DOCUMENT_ENCRYPTION_KEY = anterior.c;
  if (anterior.h) process.env.DOCUMENT_HMAC_KEY = anterior.h;
});

// ---- regras temporais, promoções e sessões ----

test('instante do agendamento aceita objeto Date', () => {
  const data = new Date('2026-10-30T12:00:00Z');
  assert.equal(regras.instanteAgendamento(data).getTime(), data.getTime());
  assert.equal(regras.instanteAgendamento(''), null);
});

test('promoção com data em formato inválido é recusada', () => {
  for (const dataInicio of ['2026/10/01', 20261001, '1000-13-01']) {
    assert.throws(() => promocoes.normalizarPromocao({ ativa: false, tipo: 'PERCENTUAL', valor: 10, dataInicio }, 100), { status: 400 });
  }
});

test('sessão administrativa com assinatura válida e conteúdo corrompido é rejeitada', async () => {
  const segredo = 's'.repeat(40);
  const servico = criarServicoSessoesAdmin({ banco, ambiente: { ADMIN_SESSION_SECRET: segredo, ADMIN_EMAIL: 'a@a.com', ADMIN_PASSWORD: 'x' } });
  const payload = Buffer.from('isto-nao-e-json').toString('base64url');
  const assinatura = createHmac('sha256', segredo).update(payload).digest('base64url');
  assert.equal(await servico.validar(`${payload}.${assinatura}`), null);
});

// ---- convites de avaliação ----

test('processar convites usa o relógio real e termina quando a fila está vazia', async () => {
  assert.equal(await convites.processarConvitesAvaliacao({ banco }), 0);
});

test('processador de convites registra falha do ciclo e continua', async () => {
  const processar = jest.fn().mockRejectedValue(new Error('banco fora'));
  const parar = convites.iniciarProcessadorConvites({ processar, intervaloMs: 3600000 });
  await new Promise((resolve) => setImmediate(resolve));
  parar();
  expect(console.error).toHaveBeenCalledWith('[Convites de avaliação] Falha no ciclo.', { mensagem: 'banco fora' });
});

// ---- agendamentos ----

test('observação de item que não é texto invalida a reserva', () => {
  assert.throws(() => agendamentos.validarItensReserva(5, [{ idServico: 1, idFuncionario: 9, dataHoraInicio: '2026-10-30T10:00', observacao: 123 }]), { codigo: 'ITEM_INVALIDO' });
});

test('reserva grava a observação sem espaços nas pontas', async () => {
  agendaDisponivel(banco);
  banco.responder(/INSERT INTO tb_agendamento\b/, [77, 1]);
  const [reserva] = await agendamentos.criarReservasCliente({ idUsuario: 1, idUnidade: 5,
    itens: [{ idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00`, valorEsperado: 50, observacao: '  alergia a amônia  ' }] });
  assert.equal(reserva.idAgendamento, 77);
  const gravado = banco.chamadas.find((c) => /INSERT INTO tb_agendamento\b/.test(c.sql));
  assert.equal(gravado.opcoes.replacements.observacao, 'alergia a amônia');
});

test('serviço extra indisponível na unidade é recusado e lista vazia não consulta o banco', async () => {
  banco.responder(/SELECT fk_salao AS idSalao FROM tb_unidade/, [{ idSalao: 1 }]);
  await assert.rejects(() => agendamentos.salvarServicosAdicionais({ idAgendamento: 1, idUnidade: 5, transaction: {},
    servicosAdicionais: [{ idServico: 1, idFuncionario: 9 }] }), { status: 400 });
  assert.deepEqual(await agendamentos.incluirServicosAdicionais([]), []);
});

// ---- dashboard analítico ----

test('consulta analítica recusa filtros, período, visualização, recorte e paginação inválidos', () => {
  const normalizar = (query) => analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30', ...query }, 1);
  for (const query of [
    { idUnidade: 'x' }, { dataInicio: '2026-10-31' }, { visualizarPor: 'outro' }, { recorte: 'nenhum' },
    { ordenarPor: 'tipoItem' }, { direcao: 'lateral' }, { pagina: '0' }, { porPagina: '30' },
  ]) {
    assert.throws(() => normalizar(query), { status: 400 }, JSON.stringify(query));
  }
});

test('condições SQL variam por recorte e por visualização', async () => {
  const sqlDe = async (extra) => {
    banco.reiniciar();
    banco.responder(/^SELECT COUNT\(\*\)/, [{ total: 0 }]);
    await analitico.consultarAnalitico(analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30', ...extra }, 1));
    return banco.sqls().join('\n');
  };
  assert.match(await sqlDe({ recorte: 'previstos' }), /INTERVAL 30 DAY/);
  assert.match(await sqlDe({ recorte: 'taxaCancelamento' }), /dt_inicio <= :agora OR a.cd_status='CANCELADO'/);
  assert.match(await sqlDe({ recorte: 'comparecimento' }), /IN \('REALIZADO','NAO_COMPARECEU'\)/);
  assert.match(await sqlDe({ recorte: 'extras', visualizarPor: 'servico' }), /item.id_extra IS NOT NULL/);
});

test('totais ausentes na contagem assumem o total e zero extras', async () => {
  banco.responder(/^SELECT COUNT\(\*\)/, [{ total: '3' }]);
  banco.responder(/^SELECT analitico\.\*/, [{ idAgendamento: 1 }]);
  const pagina = await analitico.consultarAnalitico(analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30' }, 1));
  assert.equal(pagina.totalAtendimentos, 3);
  assert.equal(pagina.totalServicosExtras, 0);
});

test('exportação mantém atendimento sem itens como lista vazia', async () => {
  const consulta = analitico.normalizarConsultaAnalitica({ dataInicio: '2026-10-01', dataFim: '2026-10-30' }, 1);
  assert.deepEqual(await analitico.prepararLinhasExportacao(consulta, [{ idAgendamento: 1 }], {}), []);
});

// ---- disponibilidade ----

test('reserva sem horário informado é recusada', async () => {
  await assert.rejects(() => disponibilidade.resolverReserva({ dataHoraInicio: undefined, idUnidade: 5, idServico: 1, transaction: {} }), { status: 400 });
});

test('sem expediente da unidade ou da profissional não há horários', async () => {
  agendaDisponivel(banco);
  banco.responder(/FROM tb_horario_unidade/, []);
  assert.deepEqual((await disponibilidade.listarHorariosDisponiveis({ data: amanha, idUnidade: 5, idServico: 1 })).horarios, []);
  banco.responder(/FROM tb_horario_unidade/, [{ inicio: '08:00:00', fim: '18:00:00' }]);
  banco.responder(/FROM tb_disponibilidade_funcionario/, []);
  assert.deepEqual((await disponibilidade.listarHorariosDisponiveis({ data: amanha, idUnidade: 5, idServico: 1 })).horarios, []);
});

test('horários passados e ocupados pelo cliente ou pela profissional são descartados', async () => {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  agendaDisponivel(banco);
  banco.responder(/FROM tb_horario_unidade/, [{ inicio: '00:00:00', fim: '23:59:00' }]);
  banco.responder(/FROM tb_disponibilidade_funcionario/, [{ inicio: '00:00:00', fim: '23:59:00' }]);
  const passados = await disponibilidade.listarHorariosDisponiveis({ data: hoje, idUnidade: 5, idServico: 1 });
  assert.ok(passados.horarios.every((h) => new Date(`${hoje}T${h.inicio}:00-03:00`) > new Date()));

  const ocupacao = { inicio: `${amanha}T08:00:00`, fim: `${amanha}T10:00:00` };
  agendaDisponivel(banco);
  banco.responder(/AND dt_fim > CONCAT\(:data, ' 00:00:00'\)\s+AND \(:ignorarIdAgendamento/, [ocupacao]);
  const semCliente = await disponibilidade.listarHorariosDisponiveis({ data: amanha, idUnidade: 5, idServico: 1, idUsuario: 1 });
  assert.equal(semCliente.horarios[0].inicio, '10:00');

  agendaDisponivel(banco);
  banco.responder(/FROM tb_agendamento\s+WHERE fk_funcionario/, [ocupacao]);
  const semProfissional = await disponibilidade.listarHorariosDisponiveis({ data: amanha, idUnidade: 5, idServico: 1 });
  assert.equal(semProfissional.horarios[0].inicio, '10:00');
});

// ---- notificações e faturas ----

test('contagem de não lidas assume zero quando o banco não devolve linha', async () => {
  assert.equal((await push.listarNotificacoesSalao(1)).naoLidas, 0);
  assert.equal((await push.listarNotificacoesCliente(1)).naoLidas, 0);
});

test('fatura com cliente em texto, pagamento informado e sem status', async () => {
  banco.responder(/FROM tb_assinatura_salao a/, [{ idAssinatura: 3, idSalao: 9, idCliente: 'cus_banco' }]);
  const gravada = () => banco.chamadas.filter((c) => /INSERT INTO tb_fatura_assinatura_salao/.test(c.sql)).at(-1).opcoes.replacements;
  await faturas.salvarFaturaAssinatura({ id: 'in_1', subscription: 'sub_1', customer: 'cus_texto', status_transitions: { paid_at: 1761840000 } });
  assert.equal(gravada().idCliente, 'cus_texto');
  assert.equal(gravada().pagoEm.getTime(), 1761840000 * 1000);
  assert.equal(gravada().status, 'unknown');
});
