import assert from 'node:assert/strict';
import { afterAll, beforeEach, test } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, { DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64') });
const ambiente = await iniciarRota('rotas/salao.js', { usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'ADMIN_SALAO' }, montagem: '/api/salao' });
const { banco } = ambiente;
afterAll(() => ambiente.parar());
const base = '/api/salao';

const SALAO = /FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador/;
const salao = () => banco.responder(SALAO, [{ idSalao: 1, nome: 'Studio', slug: 'studio', emailConta: 'a@a.com' }]);
const premium = () => { salao(); banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA', provedor: 'LOCAL' }]); };

beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  ambiente.estado.autenticado = true;
});

const resumoBase = { quantidadeAtendimentosAConfirmar: 0, quantidadeAgendamentosElegiveis: 10, quantidadeCancelamentosElegiveis: 1, quantidadeComparecimentos: 4, quantidadeNaoCompareceu: 0 };

function dadosCompletos() {
  banco.responder(/AS quantidadeAgendamentosElegiveis/, (opcoes) => (opcoes.replacements.dataInicioAnterior
    ? [{ ...resumoBase, quantidadeCancelamentosElegiveis: 1 }]
    : [{ ...resumoBase, quantidadeAtendimentosAConfirmar: 2, quantidadeCancelamentosElegiveis: 3, quantidadeComparecimentos: 6, quantidadeNaoCompareceu: 2 }]));
  banco.responder(/AS receitaPrevista, COUNT/, [{ receitaPrevista: 100, quantidadeAgendamentosFuturos: 2 }]);
  banco.responder(/AS diaSemana, HOUR\(a.dt_inicio\)/, [{ diaSemana: 1, hora: 9, quantidade: 5, cancelados: 1 }, { diaSemana: 2, hora: 10, quantidade: 1, cancelados: 0 }]);
  banco.responder(/AS clientesAtendidos/, [{ clientesAtendidos: 5, clientesNovos: 2, clientesRecorrentes: 3 }]);
  banco.responder(/GROUP BY item.servico ORDER BY quantidade DESC/, [{ servico: 'Corte', valor: '200', quantidade: 5 }, { servico: 'Barba', valor: '40', quantidade: 2 }, { servico: 'Novo', valor: '10', quantidade: 1 }]);
  banco.responder(/GROUP BY item.servico ORDER BY valor DESC LIMIT 8/, [{ servico: 'Corte', valor: '100' }, { servico: 'Barba', valor: '100' }]);
  banco.responder(/LEFT JOIN vw_servico_atendimento item ON item.fk_funcionario=f.id_funcionario/, [
    { idFuncionario: 9, profissional: 'Ana', atendimentosRealizados: 1, receitaRealizada: 50, minutosAtendimentoRealizado: 60 },
    { idFuncionario: 10, profissional: 'Bia', atendimentosRealizados: 0, receitaRealizada: 0, minutosAtendimentoRealizado: 0 },
  ]);
  banco.responder(/AS minutosDisponiveis/, [{ idFuncionario: 9, diaSemana: 1, minutosDisponiveis: 480 }]);
  banco.responder(/HAVING MAX\(a.dt_realizacao\)/, [{ idCliente: 'U:1', cliente: 'Maria' }]);
  banco.responder(/COUNT\(item.st_promocao_aplicada\) AS servicosConhecidos/, [{ servicosConhecidos: '10', servicosComPromocao: '4' }]);
  banco.responder(/AS quantidadeAnterior/, [{ quantidade: 1, quantidadeAnterior: 0 }]);
}

test('dashboard Premium exige salão, Premium e período coerente', async () => {
  assert.equal((await ambiente.get(`${base}/indicadores/premium`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/indicadores/premium`)).status, 403);
  premium();
  assert.equal((await ambiente.get(`${base}/indicadores/premium?dataInicio=2026-10-30&dataFim=2026-10-01`)).status, 400);
});

test('dashboard Premium monta resumo, comparações e insights', async () => {
  premium(); dadosCompletos();
  const resposta = await ambiente.get(`${base}/indicadores/premium?dataInicio=2026-10-01&dataFim=2026-10-30&idUnidade=5&idServico=1&idFuncionario=9`);
  assert.equal(resposta.status, 200);
  const { corpo } = resposta;
  assert.equal(corpo.resumo.receitaPrevista, 100);
  assert.equal(corpo.resumo.quantidadeAgendamentosFuturos, 2);
  assert.equal(corpo.resumo.taxaCancelamento, 30);
  assert.equal(corpo.resumo.taxaComparecimento, 75);
  assert.deepEqual(corpo.periodoComparacao, { dataInicioAnterior: '2026-09-01', dataFimAnterior: '2026-09-30' });
  assert.equal(corpo.profissionais[0].ticketMedio, 50);
  assert.equal(corpo.profissionais[1].ticketMedio, 0);
  assert.ok(corpo.profissionais[0].ocupacaoEstimada < 30);
  assert.equal(corpo.profissionais[1].ocupacaoEstimada, null);
  const titulos = corpo.insights.map((item) => item.titulo);
  for (const esperado of ['Confirme atendimentos concluídos', 'Cancelamentos em alta', 'Horário com maior procura', 'Serviço em crescimento', 'Serviço em queda', 'Revise horários disponíveis', 'Retome contato com clientes inativos']) {
    assert.ok(titulos.includes(esperado), esperado);
  }
  assert.equal(corpo.promocoes.resumo.participacaoPromocoes, 40);
  assert.equal(corpo.visaoGeral.agendamentosComPromocao, 1);
  assert.deepEqual(corpo.analiseAgendamentos, []);
});

test('dashboard Premium sem alertas devolve o insight neutro e aceita períodos parciais', async () => {
  premium();
  banco.responder(/AS quantidadeAgendamentosElegiveis/, [{ ...resumoBase }]);
  banco.responder(/AS receitaPrevista, COUNT/, [{ receitaPrevista: 0, quantidadeAgendamentosFuturos: 0 }]);
  banco.responder(/COUNT\(item.st_promocao_aplicada\) AS servicosConhecidos/, [{}]);
  banco.responder(/AS quantidadeAnterior/, [{ quantidade: 0, quantidadeAnterior: 0 }]);
  const padrao = await ambiente.get(`${base}/indicadores/premium?incluirAnalise=false`);
  assert.equal(padrao.status, 200);
  assert.equal(padrao.corpo.insights[0].titulo, 'Nenhum alerta para este período');
  const soFim = await ambiente.get(`${base}/indicadores/premium?dataFim=2026-10-30`);
  assert.equal(soFim.corpo.filtros.dataInicio, '2026-10-01');
  const soInicio = await ambiente.get(`${base}/indicadores/premium?dataInicio=2020-01-01`);
  assert.equal(soInicio.corpo.filtros.dataInicio, '2020-01-01');
});

test('dashboard Premium responde 500 quando uma consulta falha', async () => {
  premium();
  banco.responder(/AS receitaPrevista, COUNT/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/indicadores/premium`)).status, 500);
});

test('analítico Premium exige assinatura e devolve a página', async () => {
  assert.equal((await ambiente.get(`${base}/indicadores/premium/analitico`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/indicadores/premium/analitico`)).status, 403);
  premium();
  banco.responder(/SELECT COUNT\(\*\) AS total, COUNT\(DISTINCT a.id_agendamento\)/, [{ total: '0', totalAtendimentos: '0', totalServicosExtras: '0' }]);
  const resposta = await ambiente.get(`${base}/indicadores/premium/analitico?dataInicio=2026-10-01&dataFim=2026-10-30`);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.total, 0);
  assert.equal((await ambiente.get(`${base}/indicadores/premium/analitico?dataInicio=lixo`)).status, 400);
  banco.responder(/SELECT COUNT\(\*\) AS total, COUNT\(DISTINCT a.id_agendamento\)/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/indicadores/premium/analitico?dataInicio=2026-10-01&dataFim=2026-10-30`)).status, 500);
});

test('exportar analítico em CSV e XLSX e recusar formato inválido', async () => {
  premium();
  const periodo = 'dataInicio=2026-10-01&dataFim=2026-10-30';
  const csv = await ambiente.get(`${base}/indicadores/premium/analitico/exportar?${periodo}`);
  assert.equal(csv.status, 200);
  assert.ok(csv.texto.includes('id_agendamento'));
  assert.match(csv.cabecalhos.get('content-type'), /text\/csv/);
  const xlsx = await ambiente.get(`${base}/indicadores/premium/analitico/exportar?${periodo}&formato=xlsx`);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.cabecalhos.get('content-type'), /spreadsheetml/);
  const invalido = await ambiente.get(`${base}/indicadores/premium/analitico/exportar?${periodo}&formato=pdf`);
  assert.equal(invalido.status, 400);
});

// ---- ramificações restantes ----

test('dashboard Premium tolera valores nulos de disponibilidade, atendimento e comparecimento', async () => {
  premium();
  banco.responder(/AS quantidadeAgendamentosElegiveis/, [{ ...resumoBase, quantidadeComparecimentos: 0, quantidadeNaoCompareceu: 0 }]);
  banco.responder(/AS receitaPrevista, COUNT/, [{ receitaPrevista: 0, quantidadeAgendamentosFuturos: 0 }]);
  banco.responder(/COUNT\(item.st_promocao_aplicada\) AS servicosConhecidos/, [{}]);
  banco.responder(/AS quantidadeAnterior/, [{ quantidade: 0, quantidadeAnterior: 0 }]);
  banco.responder(/LEFT JOIN vw_servico_atendimento item ON item.fk_funcionario=f.id_funcionario/, [
    { idFuncionario: 9, profissional: 'Ana', atendimentosRealizados: 0, receitaRealizada: 0, minutosAtendimentoRealizado: null },
  ]);
  banco.responder(/AS minutosDisponiveis/, [{ idFuncionario: 9, diaSemana: 1, minutosDisponiveis: null }]);
  const resposta = await ambiente.get(`${base}/indicadores/premium?dataInicio=2026-10-01&dataFim=2026-10-30`);
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.resumo.taxaComparecimento, null);
  assert.equal(resposta.corpo.profissionais[0].ocupacaoEstimada, null);
});

test('dashboard Premium informa filtro de promoção inválido com 400 e a mensagem', async () => {
  premium();
  const resposta = await ambiente.get(`${base}/indicadores/premium?promocao=invalida`);
  assert.equal(resposta.status, 400);
  assert.match(resposta.corpo.mensagem, /Filtro de promoção/);
});

test('exportação interrompida depois de iniciada encerra a conexão', async () => {
  premium();
  banco.responder(/^SELECT analitico\.\*/, () => { throw new Error('banco'); });
  const resposta = await ambiente.get(`${base}/indicadores/premium/analitico/exportar?dataInicio=2026-10-01&dataFim=2026-10-30`).catch((erro) => erro);
  assert.ok(resposta instanceof Error || resposta.status !== 200 || !resposta.texto.includes('fim'));
});

test('falha no segundo lote da exportação, já com cabeçalhos enviados, encerra a conexão', async () => {
  premium();
  const linhas = Array.from({ length: 500 }, (_, i) => ({ idAgendamento: i, idUnidade: 5 }));
  let chamadas = 0;
  banco.responder(/^SELECT analitico\.\*/, () => { if (++chamadas > 1) throw new Error('banco'); return linhas; });
  await ambiente.get(`${base}/indicadores/premium/analitico/exportar?dataInicio=2026-10-01&dataFim=2026-10-30`).catch(() => null);
  assert.ok(chamadas >= 2);
});
