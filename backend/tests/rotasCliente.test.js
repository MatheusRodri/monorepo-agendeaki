import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { afterAll, beforeEach, test } from '@jest/globals';
import { agendaDisponivel, amanha, iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, { SUPABASE_URL: 'https://supabase.teste', SUPABASE_ANON_KEY: 'anon', HERE_API_KEY: 'chave-here' });
const cliente = { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'CLIENTE' };
const ambiente = await iniciarRota('rotas/cliente.js', { usuario: cliente, montagem: '/api/cliente' });
const { banco, supabase } = ambiente;
afterAll(() => ambiente.parar());

const fetchReal = globalThis.fetch;
let respostaHere;
let senhaOk;
beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  ambiente.estado.autenticado = true;
  supabase.estado.respostas = {};
  respostaHere = { ok: true, json: async () => ({ items: [{ position: { lat: -23.5, lng: -46.6 } }] }) };
  senhaOk = true;
  jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    const endereco = String(url);
    if (endereco.includes('hereapi')) return typeof respostaHere === 'function' ? respostaHere() : Promise.resolve(respostaHere);
    if (endereco.includes('supabase.teste')) return Promise.resolve({ ok: senhaOk });
    return fetchReal(url, init);
  });
});

const base = '/api/cliente';
const dadosPerfil = { nome: 'Maria', telefone: '(11) 98765-4321', dataNascimento: '1990-05-20', aceitouDocumentos: true };

function perfilCompleto() {
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1, nome: 'Maria', telefone: '11987654321', dataNascimento: '1990-05-20', tipoDocumento: null, documentoCifrado: null }]);
  banco.responder(/FROM tb_aceite_documento_legal/, [{ cd_documento: 'TERMOS_USO' }, { cd_documento: 'POLITICA_PRIVACIDADE' }]);
}

test('rotas exigem autenticação', async () => {
  ambiente.estado.autenticado = false;
  assert.equal((await ambiente.get(`${base}/perfil`)).status, 401);
  assert.equal((await ambiente.get(`${base}/agendamentos/futuros`)).status, 401);
});

test('perfil: consulta e atualização com validações', async () => {
  perfilCompleto();
  const perfil = await ambiente.get(`${base}/perfil`);
  assert.equal(perfil.corpo.cadastroIncompleto, false);
  assert.equal((await ambiente.patch(`${base}/perfil`, { ...dadosPerfil, nome: ' ' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/perfil`, { ...dadosPerfil, telefone: '123' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/perfil`, { ...dadosPerfil, dataNascimento: '2020-01-01' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/perfil`, dadosPerfil)).status, 200);
  assert.ok(banco.chamou(/UPDATE tb_usuario/));
});

test('perfil: exige aceite dos documentos quando pendente', async () => {
  banco.responder(/FROM tb_usuario WHERE id_usuario = :idUsuario/, [{ idUsuario: 1 }]);
  const resposta = await ambiente.patch(`${base}/perfil`, { ...dadosPerfil, aceitouDocumentos: false });
  assert.equal(resposta.status, 400);
  assert.equal(resposta.corpo.codigo, 'ACEITE_PENDENTE');
  banco.responder(/UPDATE tb_usuario/, () => { throw new Error('banco'); });
  perfilCompleto();
  assert.equal((await ambiente.patch(`${base}/perfil`, dadosPerfil)).status, 400);
});

test('senha: valida entradas e informa falha do provedor', async () => {
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: '123', confirmacaoSenha: '123' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: '123456', confirmacaoSenha: 'x23456' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: '123456', confirmacaoSenha: '123456' })).status, 200);
  senhaOk = false;
  assert.equal((await ambiente.patch(`${base}/senha`, { senha: '123456', confirmacaoSenha: '123456' })).status, 400);
});

test('salões próximos: valida coordenadas, raio e cidade', async () => {
  assert.equal((await ambiente.get(`${base}/saloes-proximos`)).status, 400);
  assert.equal((await ambiente.get(`${base}/saloes-proximos?latitude=-23&longitude=-46&raioKm=7`)).status, 400);
  const semChave = process.env.HERE_API_KEY;
  delete process.env.HERE_API_KEY;
  try { assert.equal((await ambiente.get(`${base}/saloes-proximos?cidade=SP`)).status, 400); } finally { process.env.HERE_API_KEY = semChave; }
  respostaHere = () => Promise.reject(new Error('rede'));
  assert.match((await ambiente.get(`${base}/saloes-proximos?cidade=SP`)).corpo.mensagem, /localizar essa cidade agora/);
  respostaHere = { ok: false, json: async () => ({}) };
  assert.match((await ambiente.get(`${base}/saloes-proximos?cidade=SP`)).corpo.mensagem, /Não foi possível localizar/);
});

test('salões próximos: devolve resultados, usa cidade geocodificada e sugere a filial mais próxima', async () => {
  banco.responder(/FROM tb_unidade u\s+INNER JOIN tb_salao s ON s.id_salao = u.fk_salao\s+LEFT JOIN tb_assinatura_salao/, [{ idUnidade: 5, nomeSalao: 'Studio' }]);
  const ok = await ambiente.get(`${base}/saloes-proximos?latitude=-23.5&longitude=-46.6&raioKm=5&busca=stu&idUnidade=5`);
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.saloes.length, 1);
  const porCidade = await ambiente.get(`${base}/saloes-proximos?cidade=Sao%20Paulo`);
  assert.equal(porCidade.corpo.cidade, 'Sao Paulo');
  assert.equal(porCidade.corpo.centroBusca.latitude, -23.5);
  banco.reiniciar();
  banco.responder(/ORDER BY distanciaKm\s+LIMIT 1/, [{ nomeUnidade: 'Longe', distanciaKm: '12.34' }]);
  assert.equal((await ambiente.get(`${base}/saloes-proximos?latitude=-23.5&longitude=-46.6`)).status, 200);
  banco.reiniciar();
  assert.equal((await ambiente.get(`${base}/saloes-proximos?latitude=-23.5&longitude=-46.6`)).corpo.saloes.length, 0);
});

test('sugestões exigem ao menos 2 caracteres', async () => {
  assert.deepEqual((await ambiente.get(`${base}/sugestoes-saloes?termo=a`)).corpo, { sugestoes: [] });
  banco.responder(/SELECT DISTINCT u.id_unidade/, [{ idUnidade: 5 }]);
  assert.equal((await ambiente.get(`${base}/sugestoes-saloes?termo=st&cidade=SP`)).corpo.sugestoes.length, 1);
});

test('serviços do salão: valida unidade e aplica promoção com Premium', async () => {
  assert.equal((await ambiente.get(`${base}/saloes/abc/servicos`)).status, 400);
  assert.deepEqual((await ambiente.get(`${base}/saloes/5/servicos`)).corpo, { idUnidade: 5, servicos: [] });
  const hoje = amanha;
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade/, [
    { idServico: 1, nome: 'Corte', descricao: 'd', valor: '50.00', idSalao: 1, duracaoMinutos: 30, promocaoTipo: 'PERCENTUAL', promocaoValor: '10.00', promocaoHabilitada: 1, promocaoInicio: null, promocaoFim: null, idFuncionario: 9, nomeFuncionario: 'Ana' },
    { idServico: 1, nome: 'Corte', descricao: 'd', valor: '50.00', idSalao: 1, duracaoMinutos: 30, promocaoTipo: 'PERCENTUAL', promocaoValor: '10.00', promocaoHabilitada: 1, promocaoInicio: null, promocaoFim: null, idFuncionario: 10, nomeFuncionario: 'Bia' },
  ]);
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA' }]);
  const resposta = await ambiente.get(`${base}/saloes/5/servicos`);
  assert.equal(resposta.corpo.servicos[0].valor, 45);
  assert.equal(resposta.corpo.servicos[0].profissionais.length, 2);
  assert.ok(hoje);
});

test('horários do agendamento validam ids e devolvem a disponibilidade', async () => {
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=x&idServico=1`)).status, 400);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=zz&data=${amanha}`)).status, 400);
  agendaDisponivel(banco);
  const resposta = await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=qualquer&data=${amanha}`);
  assert.equal(resposta.status, 200);
  assert.ok(resposta.corpo.horarios.length > 0);
  assert.equal(resposta.corpo.servico.valor, 50);
  const comProfissional = await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&idFuncionario=9&data=${amanha}`);
  assert.equal(comProfissional.status, 200);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&data=lixo`)).status, 400);
});

test('horários indicam serviço indisponível e conflito do próprio cliente', async () => {
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&data=${amanha}`)).status, 404);
  agendaDisponivel(banco);
  banco.responder(/SELECT id_agendamento FROM tb_agendamento\s+WHERE fk_servico=:idServico/, [{ id_agendamento: 1 }]);
  const resposta = await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&data=${amanha}`);
  assert.equal(resposta.corpo.codigo, 'SERVICO_REPETIDO_DIA');
});

test('criar agendamento simples e em lote', async () => {
  agendaDisponivel(banco);
  banco.responder(/INSERT INTO tb_agendamento\s+\(fk_usuario/, [55, 1]);
  const simples = await ambiente.post(`${base}/agendamentos`, { idUnidade: 5, idServico: 1, idFuncionario: '', dataHoraInicio: `${amanha}T10:00`, valorEsperado: 50 });
  assert.equal(simples.status, 201);
  assert.equal(simples.corpo.agendamentos[0].idAgendamento, 55);
  assert.equal(simples.corpo.nomeFuncionario, 'Ana');
  assert.equal(banco.confirmadas > 0, true);
  const lote = await ambiente.post(`${base}/agendamentos/lote`, { idUnidade: 5, itens: [{ idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T11:00` }] });
  assert.equal(lote.status, 201);
  assert.match(lote.corpo.mensagem, /Agendamentos confirmados/);
});

test('criar agendamento rejeita lista inválida, horário ocupado e preço alterado', async () => {
  assert.equal((await ambiente.post(`${base}/agendamentos/lote`, { idUnidade: 5, itens: [] })).corpo.codigo, 'LISTA_INVALIDA');
  const repetido = { idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00` };
  assert.equal((await ambiente.post(`${base}/agendamentos/lote`, { idUnidade: 5, itens: [repetido, repetido] })).status, 409);
  assert.equal((await ambiente.post(`${base}/agendamentos/lote`, { idUnidade: 5, itens: [{ idServico: 1 }] })).corpo.codigo, 'ITEM_INVALIDO');
  agendaDisponivel(banco);
  assert.equal((await ambiente.post(`${base}/agendamentos`, { idUnidade: 5, idServico: 1, dataHoraInicio: 'lixo' })).status, 400);
  assert.equal((await ambiente.post(`${base}/agendamentos`, { idUnidade: 5, idServico: 1, dataHoraInicio: `${amanha}T03:00` })).status, 409);
  const preco = await ambiente.post(`${base}/agendamentos`, { idUnidade: 5, idServico: 1, dataHoraInicio: `${amanha}T10:00`, valorEsperado: 10 });
  assert.equal(preco.corpo.codigo, 'PRECO_ALTERADO');
  assert.ok(banco.revertidas > 0);
});

test('criar agendamento recusa conflito do cliente com outro serviço no mesmo intervalo', async () => {
  agendaDisponivel(banco);
  banco.responder(/DATE_FORMAT\(dt_inicio, '%Y-%m-%dT%H:%i:%s'\) AS inicio,\s+DATE_FORMAT\(dt_fim, '%Y-%m-%dT%H:%i:%s'\) AS fim FROM tb_agendamento\s+WHERE \(\(:idUsuario/, [{ inicio: `${amanha}T10:00:00`, fim: `${amanha}T10:30:00` }]);
  const resposta = await ambiente.post(`${base}/agendamentos/lote`, { idUnidade: 5, itens: [{ idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00` }] });
  assert.equal(resposta.status, 409);
});

test('listar agendamentos futuros e histórico com paginação e localização', async () => {
  banco.responder(/SELECT COUNT\(\*\) AS total FROM tb_agendamento a\s+WHERE/, (opcoes) => [{ total: opcoes.replacements.inicioAlvo ? '25' : '30' }]);
  banco.responder(/SELECT a.dt_inicio AS inicio FROM tb_agendamento a/, [{ inicio: '2026-10-01 10:00:00' }]);
  banco.responder(/FROM tb_agendamento a INNER JOIN tb_funcionario f/, [{ idAgendamento: 3, status: 'REALIZADO', dataHoraFim: '2020-01-01 10:00:00', valor: '50.00' }]);
  const futuros = await ambiente.get(`${base}/agendamentos/futuros?pagina=9`);
  assert.equal(futuros.status, 200);
  assert.equal(futuros.corpo.pagina, 3);
  assert.equal(futuros.corpo.agendamentos[0].valorTotal, 50);
  const historico = await ambiente.get(`${base}/agendamentos/historico?localizar=3&porPagina=10`);
  assert.equal(historico.corpo.localizado, true);
  assert.equal(historico.corpo.agendamentos[0].podeAvaliar, true);
  assert.equal((await ambiente.get(`${base}/agendamentos/futuros?pagina=0`)).status, 400);
  banco.responder(/SELECT COUNT\(\*\) AS total FROM tb_agendamento a WHERE a.fk_usuario/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/agendamentos/futuros`)).status, 500);
});

test('notificações: listar, marcar uma, por agendamento e todas', async () => {
  banco.responder(/ORDER BY criadaEm DESC/, [{ id: 1 }]);
  banco.responder(/SELECT COUNT\(\*\) AS quantidade FROM tb_notificacao_cliente/, [{ quantidade: 4 }]);
  assert.equal((await ambiente.get(`${base}/notificacoes`)).corpo.naoLidas, 4);
  assert.equal((await ambiente.post(`${base}/notificacoes/lidas`, {})).status, 200);

  assert.equal((await ambiente.patch(`${base}/notificacoes/abc/lida`, {})).status, 400);
  assert.equal((await ambiente.patch(`${base}/notificacoes/5/lida`, {})).status, 404);
  banco.responder(/SELECT n.id_notificacao FROM tb_notificacao_cliente n\s+INNER JOIN tb_agendamento a ON a.id_agendamento=n.fk_agendamento AND a.fk_usuario=n.fk_usuario\s+WHERE n.id_notificacao=:idNotificacao/, [{ id_notificacao: 5 }]);
  assert.equal((await ambiente.patch(`${base}/notificacoes/5/lida`, {})).status, 200);
  banco.responder(/UPDATE tb_notificacao_cliente n\s+INNER JOIN tb_agendamento a[\s\S]*n.id_notificacao=:idNotificacao/, [{ affectedRows: 1 }]);
  assert.equal((await ambiente.patch(`${base}/notificacoes/5/lida`, {})).status, 200);

  assert.equal((await ambiente.patch(`${base}/notificacoes/agendamentos/zz/lida`, {})).status, 400);
  assert.equal((await ambiente.patch(`${base}/notificacoes/agendamentos/8/lida`, {})).status, 404);
  banco.responder(/SELECT n.id_notificacao FROM tb_notificacao_cliente n\s+INNER JOIN tb_agendamento a ON a.id_agendamento=n.fk_agendamento AND a.fk_usuario=n.fk_usuario\s+WHERE n.fk_usuario=:idUsuario AND n.fk_agendamento/, [{ id_notificacao: 5 }]);
  assert.equal((await ambiente.patch(`${base}/notificacoes/agendamentos/8/lida`, {})).status, 200);
  banco.responder(/UPDATE tb_notificacao_cliente n\s+INNER JOIN tb_agendamento a ON a.id_agendamento=n.fk_agendamento AND a.fk_usuario=n.fk_usuario\s+SET n.st_lida=TRUE WHERE n.fk_usuario=:idUsuario AND n.fk_agendamento/, [{ affectedRows: 1 }]);
  assert.equal((await ambiente.patch(`${base}/notificacoes/agendamentos/8/lida`, {})).status, 200);
});

test('inscrição de push: chave pública, salvar, consultar e remover', async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  assert.equal((await ambiente.get(`${base}/notificacoes/chave-publica`)).status, 503);
  process.env.VAPID_PUBLIC_KEY = 'pub';
  assert.equal((await ambiente.get(`${base}/notificacoes/chave-publica`)).corpo.chavePublica, 'pub');
  const valida = { endpoint: 'https://push.exemplo/1', keys: { p256dh: 'p', auth: 'a' } };
  for (const invalida of [{}, { ...valida, endpoint: 'http://inseguro.com/x' }, { ...valida, keys: {} }, { ...valida, endpoint: 'nao-e-url' }]) {
    assert.equal((await ambiente.post(`${base}/notificacoes/inscricao`, invalida)).status, 400);
  }
  const salva = await ambiente.post(`${base}/notificacoes/inscricao`, valida);
  assert.equal(salva.status, 201);
  assert.equal(salva.corpo.destinatarioId, 'ext-1');
  assert.equal((await ambiente.post(`${base}/notificacoes/inscricao`, { ...valida, endpoint: 'http://localhost:9/x' })).status, 201);
  assert.equal((await ambiente.get(`${base}/notificacoes/inscricao?endpoint=${encodeURIComponent(valida.endpoint)}`)).corpo.ativa, false);
  banco.responder(/id_vinculo_dispositivo AS idVinculo FROM tb_inscricao_notificacao_cliente/, [{ idVinculo: 'v' }]);
  assert.equal((await ambiente.get(`${base}/notificacoes/inscricao?endpoint=x`)).corpo.ativa, true);
  assert.equal((await ambiente.delete(`${base}/notificacoes/inscricao`, {})).status, 400);
  assert.equal((await ambiente.delete(`${base}/notificacoes/inscricao`, { endpoint: valida.endpoint, idVinculo: 'v' })).status, 200);
});

test('avaliação valida notas e estado do agendamento', async () => {
  const nota = { notaSalao: 5, notaServico: 4, comentario: 'ótimo' };
  assert.equal((await ambiente.post(`${base}/agendamentos/abc/avaliacao`, nota)).status, 400);
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, { ...nota, notaSalao: 6 })).status, 400);
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, { ...nota, comentario: 'x'.repeat(501) })).status, 400);
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, nota)).status, 404);
  const linha = (extra) => banco.responder(/SELECT id_agendamento AS idAgendamento, fk_unidade AS idUnidade, fk_servico AS idServico/, [{ idAgendamento: 1, idUnidade: 5, idServico: 1, status: 'REALIZADO', dataHoraFim: '2020-01-01 10:00:00', ...extra }]);
  linha({ status: 'AGENDADO' });
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, nota)).status, 409);
  linha({ dataHoraFim: '2999-01-01 10:00:00' });
  assert.match((await ambiente.post(`${base}/agendamentos/1/avaliacao`, nota)).corpo.mensagem, /término previsto/);
  linha({});
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, { ...nota, comentario: '' })).status, 201);
  banco.responder(/INSERT INTO tb_avaliacao/, () => { throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }); });
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, nota)).status, 409);
  banco.responder(/INSERT INTO tb_avaliacao/, () => { throw new Error('outro'); });
  assert.equal((await ambiente.post(`${base}/agendamentos/1/avaliacao`, nota)).status, 500);
});

test('cancelar agendamento', async () => {
  assert.equal((await ambiente.patch(`${base}/agendamentos/9/cancelar`, {})).status, 404);
  banco.responder(/UPDATE tb_agendamento SET cd_status = 'CANCELADO'/, [[], { affectedRows: 1 }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/9/cancelar`, {})).status, 200);
  banco.responder(/UPDATE tb_agendamento SET cd_status = 'CANCELADO'/, [{ affectedRows: 1 }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/9/cancelar`, {})).status, 200);
});

test('horários do reagendamento', async () => {
  assert.equal((await ambiente.get(`${base}/agendamentos/9/horarios?idServico=1&idUnidade=5&idFuncionario=qualquer&data=${amanha}`)).status, 404);
  banco.responder(/SELECT id_agendamento AS idAgendamento, fk_servico AS idServico,\s+nu_duracao_minutos AS duracaoMinutos/, [{ idAgendamento: 9, idServico: 1, duracaoMinutos: 45 }]);
  assert.equal((await ambiente.get(`${base}/agendamentos/9/horarios?idServico=x&idUnidade=5&idFuncionario=qualquer`)).status, 400);
  agendaDisponivel(banco);
  const mesmoServico = await ambiente.get(`${base}/agendamentos/9/horarios?idServico=1&idUnidade=5&idFuncionario=9&data=${amanha}`);
  assert.equal(mesmoServico.corpo.duracaoMinutos, 45);
  const outroServico = await ambiente.get(`${base}/agendamentos/9/horarios?idServico=2&idUnidade=5&idFuncionario=qualquer&data=${amanha}`);
  assert.equal(outroServico.status, 200);
  assert.equal((await ambiente.get(`${base}/agendamentos/9/horarios?idServico=1&idUnidade=5&idFuncionario=qualquer&data=lixo`)).status, 400);
});

test('atualizar agendamento: validação, não encontrado, conflito e sucesso', async () => {
  const corpo = { idUnidade: 5, idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00`, observacao: ' obs ' };
  assert.equal((await ambiente.patch(`${base}/agendamentos/abc`, corpo)).status, 400);
  assert.equal((await ambiente.patch(`${base}/agendamentos/9`, { ...corpo, idFuncionario: 'x' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/agendamentos/9`, corpo)).status, 404);
  banco.responder(/FROM tb_agendamento WHERE id_agendamento = :idAgendamento AND fk_usuario = :idUsuario AND cd_status = 'AGENDADO' AND dt_inicio > NOW\(\) LIMIT 1 FOR UPDATE/, [{ idServicoOriginal: 1, nomeServico: 'Corte antigo', valorServico: '40.00', duracaoMinutos: 30, precoNormal: '40.00', precoVigente: '40.00' }]);
  banco.responder(/SELECT fk_unidade AS idUnidade FROM tb_agendamento/, [{ idUnidade: 4 }]);
  agendaDisponivel(banco);
  const ok = await ambiente.patch(`${base}/agendamentos/9`, { ...corpo, idFuncionario: '' });
  assert.equal(ok.status, 200);
  const update = banco.chamadas.find((c) => /UPDATE tb_agendamento SET fk_unidade/.test(c.sql)).opcoes.replacements;
  assert.equal(update.nomeServico, 'Corte antigo');
  assert.equal(update.observacao, 'obs');
  banco.responder(/SELECT id_agendamento FROM tb_agendamento WHERE fk_funcionario=:idFuncionario/, [{ id_agendamento: 2 }]);
  assert.equal((await ambiente.patch(`${base}/agendamentos/9`, corpo)).status, 409);
  banco.reiniciar();
  banco.responder(/LIMIT 1 FOR UPDATE/, [{ idServicoOriginal: 2, nomeServico: 'X', valorServico: '1', duracaoMinutos: 30 }]);
  agendaDisponivel(banco);
  assert.equal((await ambiente.patch(`${base}/agendamentos/9`, corpo)).status, 200);
});

test('excluir conta remove dados locais e a identidade', async () => {
  banco.responder(/SELECT id_agendamento AS idAgendamento FROM tb_agendamento WHERE fk_usuario/, [{ idAgendamento: 1 }, { idAgendamento: 2 }]);
  const ok = await ambiente.delete(`${base}/conta`);
  assert.equal(ok.status, 200);
  assert.ok(banco.chamou(/DELETE FROM tb_pagamento/));
  assert.ok(banco.chamou(/DELETE FROM tb_usuario/));
  banco.reiniciar();
  assert.equal((await ambiente.delete(`${base}/conta`)).status, 200);
  assert.equal(banco.chamou(/DELETE FROM tb_pagamento/), false);
  supabase.estado.respostas.deleteUser = { error: { message: 'x' } };
  const falha = await ambiente.delete(`${base}/conta`);
  assert.equal(falha.status, 500);
  assert.ok(banco.revertidas > 0);
});

test('excluir conta responde 503 quando a administração do Supabase não está configurada', async () => {
  supabase.estado.erroAdmin = 'Configure SUPABASE_SECRET_KEY';
  try { assert.equal((await ambiente.delete(`${base}/conta`)).status, 503); } finally { supabase.estado.erroAdmin = null; }
});

// ---- ramificações restantes ----

test('todas as rotas do cliente exigem sessão', async () => {
  ambiente.estado.autenticado = false;
  const rotas = [
    ['get', '/saloes-proximos'], ['get', '/notificacoes/inscricao'], ['post', '/notificacoes/inscricao'], ['delete', '/notificacoes/inscricao'],
    ['get', '/notificacoes'], ['post', '/notificacoes/lidas'], ['patch', '/notificacoes/1/lida'], ['patch', '/notificacoes/agendamentos/1/lida'],
    ['get', '/perfil'], ['patch', '/perfil'], ['patch', '/senha'], ['get', '/sugestoes-saloes'], ['get', '/saloes/5/servicos'],
    ['post', '/agendamentos'], ['get', '/agendamentos/horarios'], ['post', '/agendamentos/lote'], ['post', '/agendamentos/1/avaliacao'],
    ['get', '/agendamentos/1/horarios'], ['patch', '/agendamentos/1'], ['patch', '/agendamentos/1/cancelar'], ['delete', '/conta'],
    ['get', '/agendamentos/futuros'], ['get', '/agendamentos/historico'],
  ];
  for (const [metodo, caminho] of rotas) {
    const resposta = await ambiente[metodo](`${base}${caminho}`, metodo === 'get' ? undefined : {});
    assert.equal(resposta.status, 401, `${metodo} ${caminho}`);
  }
});

test('alterar senha sem cabeçalho Bearer ainda chega ao provedor', async () => {
  const resposta = await ambiente.patch(`${base}/senha`, { senha: '123456', confirmacaoSenha: '123456' }, { authorization: 'Basic abc' });
  assert.equal(resposta.status, 200);
});

test('rotas toleram corpo ou parâmetros ausentes', async () => {
  assert.equal((await ambiente.patch(`${base}/perfil`)).status, 400);
  assert.equal((await ambiente.get(`${base}/sugestoes-saloes`)).status, 200);
  assert.equal((await ambiente.post(`${base}/agendamentos`)).status, 400);
  assert.equal((await ambiente.get(`${base}/notificacoes/inscricao`)).corpo.ativa, false);
  assert.equal((await ambiente.delete(`${base}/notificacoes/inscricao`, { endpoint: 'https://push/1' })).status, 200);
  assert.equal((await ambiente.post(`${base}/agendamentos/9/avaliacao`, { notaSalao: 5, notaServico: 5 })).status, 404);
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1`)).status, 400);
});

test('erros inesperados viram 500 nos horários e na criação de agendamentos', async () => {
  agendaDisponivel(banco);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_funcionario_servico fs/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/agendamentos/horarios?idUnidade=5&idServico=1&data=${amanha}`)).status, 500);
  banco.reiniciar();
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE id_unidade=:idUnidade FOR UPDATE/, () => { throw new Error('banco'); });
  const corpo = { idUnidade: 5, idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00`, valorEsperado: 50 };
  assert.equal((await ambiente.post(`${base}/agendamentos`, corpo)).status, 500);
});

test('horários do reagendamento: data ausente e erro inesperado', async () => {
  banco.responder(/SELECT id_agendamento AS idAgendamento, fk_servico AS idServico,\s+nu_duracao_minutos AS duracaoMinutos/, [{ idAgendamento: 9, idServico: 1, duracaoMinutos: 45 }]);
  assert.equal((await ambiente.get(`${base}/agendamentos/9/horarios?idServico=1&idUnidade=5&idFuncionario=qualquer`)).status, 400);
  agendaDisponivel(banco);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_funcionario_servico fs/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/agendamentos/9/horarios?idServico=1&idUnidade=5&idFuncionario=qualquer&data=${amanha}`)).status, 500);
});

test('atualizar agendamento sem observação grava nulo e erro inesperado vira 400', async () => {
  banco.responder(/LIMIT 1 FOR UPDATE/, [{ idServicoOriginal: 2, nomeServico: 'X', valorServico: '1', duracaoMinutos: 30 }]);
  agendaDisponivel(banco);
  const corpo = { idUnidade: 5, idServico: 1, idFuncionario: 9, dataHoraInicio: `${amanha}T10:00` };
  assert.equal((await ambiente.patch(`${base}/agendamentos/9`, corpo)).status, 200);
  assert.equal(banco.chamadas.find((c) => /UPDATE tb_agendamento SET fk_unidade/.test(c.sql)).opcoes.replacements.observacao, null);
  banco.responder(/SELECT id_agendamento FROM tb_agendamento WHERE fk_funcionario=:idFuncionario/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.patch(`${base}/agendamentos/9`, corpo)).status, 400);
});
