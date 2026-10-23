import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import ExcelJS from 'exceljs';

// Só executa com uma conexão de testes explícita. Cria e remove um banco exclusivo.
const habilitado = Boolean(process.env.TEST_MYSQL_SOCKET || process.env.TEST_MYSQL_HOST);
const integrar = (nome, executar) => test(nome, { skip: !habilitado }, executar);
const nomeBanco = `agendeaki_agendamentos_test_${process.pid}`;
let administrador, banco, criarReservasCliente, listarHorariosDisponiveis;
let servidor, base, query;
const fetchOriginal = globalThis.fetch;
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const depois = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
const item = (hora = '09:00', idFuncionario = 1, data = amanha, idServico = 1) => ({ idServico, idFuncionario, dataHoraInicio: `${data}T${hora}:00` });
const criar = (itens, idUsuario = 2, idUnidade = 1) => criarReservasCliente({ idUsuario, idUnidade, itens });
async function api(caminho, metodo = 'GET', dados, token = 'salao') {
  const resposta = await fetchOriginal(`${base}${caminho}`, { method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: dados == null ? undefined : JSON.stringify(dados) });
  return { status: resposta.status, dados: await resposta.json() };
}
async function executarSql(texto) {
  let delimitador = ';', comando = '';
  for (const linha of texto.split('\n')) {
    if (linha.trim().startsWith('--')) continue;
    if (linha.trim().startsWith('DELIMITER ')) { delimitador = linha.trim().slice(10); continue; }
    comando += `${linha}\n`;
    if (comando.trimEnd().endsWith(delimitador)) {
      await administrador.query(comando.trimEnd().slice(0, -delimitador.length)); comando = '';
    }
  }
}

before(async () => {
  if (!habilitado) return;
  process.env.MYSQL_DATABASE = nomeBanco;
  process.env.MYSQL_USER = process.env.TEST_MYSQL_USER || 'root';
  process.env.MYSQL_PASSWORD = process.env.TEST_MYSQL_PASSWORD || '';
  process.env.MYSQL_HOST = process.env.TEST_MYSQL_HOST || '127.0.0.1';
  process.env.MYSQL_PORT = process.env.TEST_MYSQL_PORT || '3306';
  process.env.MYSQL_SOCKET = process.env.TEST_MYSQL_SOCKET || '';
  process.env.SUPABASE_URL = 'https://auth.agendeaki.test';
  process.env.SUPABASE_ANON_KEY = 'chave-de-teste';
  process.env.VAPID_PUBLIC_KEY = '';
  process.env.VAPID_PRIVATE_KEY = '';
  administrador = await mysql.createConnection({ user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), socketPath: process.env.MYSQL_SOCKET || undefined });
  const schema = (await readFile(new URL('../../database/script.sql', import.meta.url), 'utf8')).replaceAll('tccsalao', nomeBanco);
  await executarSql(schema);
  // A migração pode ser reaplicada em uma base criada pelo esquema inicial.
  const migracao = await readFile(new URL('../../database/migracoes/2026-10-23-servicos-adicionais.sql', import.meta.url), 'utf8');
  await executarSql(migracao); await executarSql(migracao);
  ({ bancoDeDados: banco } = await import('../src/configuracoes/bancoDeDados.js'));
  ({ criarReservasCliente } = await import('../src/servicos/agendamentos.js'));
  ({ listarHorariosDisponiveis } = await import('../src/servicos/disponibilidade.js'));
  query = (sql, replacements = {}) => banco.query(sql, { replacements, type: 'SELECT' });
  await banco.query(`INSERT INTO tb_usuario (id_usuario,nm_usuario,ds_email,tp_usuario,id_autenticacao_externa) VALUES
    (1,'Admin','admin@teste.local','ADMIN_SALAO','admin'),(2,'Cliente','cliente@teste.local','CLIENTE','cliente'),
    (3,'Outro','outro@teste.local','CLIENTE','outro'),(4,'Outro salão','salao2@teste.local','ADMIN_SALAO','salao2')`);
  await banco.query(`INSERT INTO tb_salao (id_salao,fk_usuario_administrador,nm_salao,ds_slug,ds_cnpj_raiz_indice) VALUES
    (1,1,'Salão teste','teste',REPEAT('a',64)),(2,4,'Outro salão','outro',REPEAT('b',64))`);
  for (const id of [1,2,3]) await banco.query(`INSERT INTO tb_unidade
    (id_unidade,fk_salao,nm_unidade,ds_slug,tp_categoria,ds_rua,nu_endereco,ds_bairro,ds_municipio,ds_estado,nu_cep,ds_email,tp_documento,ds_documento_cifrado,ds_documento_indice,ds_cnpj_raiz_indice,nu_telefone)
    VALUES (:id,:salao,:nome,:nome,'UNISSEX','Rua','1','Centro','São Paulo','SP','01001000',:email,'CNPJ','fixture',:indice,REPEAT('a',64),'11999999999')`,
    { replacements: { id, salao: id === 3 ? 2 : 1, nome: `filial${id}`, email: `filial${id}@teste.local`, indice: String(id).repeat(64) } });
  await banco.query(`INSERT INTO tb_funcionario (id_funcionario,fk_unidade,nm_funcionario) VALUES (1,1,'Ana'),(2,1,'Bia'),(3,2,'Caio'),(4,3,'Dora')`);
  await banco.query(`INSERT INTO tb_servico (id_servico,fk_unidade,nm_servico,vl_servico,nu_duracao_minutos) VALUES (1,1,'Corte',50,30),(2,1,'Escova',40,45),(3,2,'Corte filial 2',60,30),(4,3,'Corte outro salão',80,30),(5,1,'Tratamento',30,30)`);
  await banco.query(`INSERT INTO tb_funcionario_servico (fk_funcionario,fk_servico) VALUES (1,1),(1,2),(2,1),(2,2),(3,3),(4,4),(1,5),(2,5)`);
  for (let dia = 0; dia < 7; dia++) {
    for (const unidade of [1,2,3]) await banco.query(`INSERT INTO tb_horario_unidade (fk_unidade,nr_dia_semana,hr_abertura,hr_fechamento) VALUES (:unidade,:dia,'09:00','18:00')`, { replacements: { unidade, dia } });
    for (const funcionario of [1,2,3,4]) await banco.query(`INSERT INTO tb_disponibilidade_funcionario (fk_funcionario,nr_dia_semana,hr_inicio,hr_fim) VALUES (:funcionario,:dia,'09:00','18:00')`, { replacements: { funcionario, dia } });
  }
  await banco.query(`INSERT INTO tb_assinatura_salao (fk_salao,cd_periodicidade,cd_status,vl_assinatura,id_preco_provedor,ds_referencia_externa,dt_inicio,dt_proxima_cobranca)
    VALUES (1,'MENSAL','AUTORIZADA',50,'teste','00000000-0000-0000-0000-000000000001',NOW(),DATE_ADD(NOW(),INTERVAL 30 DAY))`);
  globalThis.fetch = async (url, opcoes) => {
    if (String(url).startsWith(process.env.SUPABASE_URL)) {
      const token = new Headers(opcoes?.headers).get('authorization')?.replace('Bearer ', '');
      const perfis = { salao: ['admin','admin@teste.local','ADMIN_SALAO'], cliente: ['cliente','cliente@teste.local','CLIENTE'], outro: ['outro','outro@teste.local','CLIENTE'], salao2: ['salao2','salao2@teste.local','ADMIN_SALAO'] };
      const usuario = perfis[token];
      return new Response(JSON.stringify(usuario ? { id: usuario[0], email: usuario[1], user_metadata: { perfil: usuario[2], nome: usuario[0] } } : { message: 'Token inválido' }), { status: usuario ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
    }
    return fetchOriginal(url, opcoes);
  };
  const { default: express } = await import('express');
  const { default: cliente } = await import('../src/rotas/cliente.js');
  const { default: salao } = await import('../src/rotas/salao.js');
  const app = express(); app.use(express.json()); app.use('/clientes',cliente); app.use('/salao',salao);
  app.use((erro, req, res, next) => { res.status(500).json({ mensagem: erro.message }); });
  servidor = app.listen(0, '127.0.0.1'); await new Promise((resolve) => servidor.once('listening', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
beforeEach(async () => { if (habilitado) { await banco.query('DELETE FROM tb_agendamento'); await banco.query('DELETE FROM tb_bloqueio_agenda'); } });
after(async () => {
  globalThis.fetch = fetchOriginal;
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
  if (banco) await banco.close();
  if (administrador) { await administrador.query(`DROP DATABASE IF EXISTS ${nomeBanco}`); await administrador.end(); }
});

integrar('confirma serviços consecutivos no mesmo dia e serviços em dias diferentes', async () => {
  const reservas = await criar([item(), item('09:30',1,amanha,5), item('09:00',1,depois)]);
  assert.equal(reservas.length,3);
  assert.equal((await query('SELECT * FROM tb_agendamento')).length,3);
});
integrar('mesmo serviço no mesmo dia é bloqueado mesmo sem sobreposição e em novas requisições', async () => {
  const [reserva] = await criar([item()]);
  await assert.rejects(criar([item('12:00',2)]), { status:409, codigo:'SERVICO_REPETIDO_DIA' });
  const horarios = await api(`/clientes/agendamentos/horarios?data=${amanha}&idServico=1&idUnidade=1&idFuncionario=2`,'GET',undefined,'cliente');
  assert.equal(horarios.status,409); assert.equal(horarios.dados.codigo,'SERVICO_REPETIDO_DIA');
  await criar([item('09:00',1,depois)]);
  await banco.query("UPDATE tb_agendamento SET cd_status='REALIZADO' WHERE id_agendamento=:id",{replacements:{id:reserva.idAgendamento}});
  await assert.rejects(criar([item('12:00',2)]),{codigo:'SERVICO_REPETIDO_DIA'});
  await banco.query("UPDATE tb_agendamento SET cd_status='CANCELADO' WHERE id_agendamento=:id",{replacements:{id:reserva.idAgendamento}});
  await criar([item('12:00',2)]);
});
integrar('migração preserva reservas existentes e pode ser reaplicada', async () => {
  await criar([item()]);
  const antes = await query('SELECT * FROM tb_agendamento');
  await administrador.query('DROP VIEW vw_servico_atendimento');
  await administrador.query('DROP TABLE tb_agendamento_servico_adicional');
  const migracao = await readFile(new URL('../../database/migracoes/2026-10-23-servicos-adicionais.sql', import.meta.url), 'utf8');
  await executarSql(migracao); await executarSql(migracao);
  assert.deepEqual(await query('SELECT * FROM tb_agendamento'),antes);
});
integrar('rollback integral e índice do item em conflito dentro da lista', async () => {
  await assert.rejects(criar([item(), item('09:00',2,amanha,5)]), { status:409, codigo:'CONFLITO_CLIENTE', indiceItem:1 });
  assert.equal((await query('SELECT * FROM tb_agendamento')).length,0);
  await assert.rejects(criar([item(), item('09:00')]), { status:409, indiceItem:1 });
  assert.equal((await query('SELECT * FROM tb_agendamento')).length,0);
});
integrar('impede sobreposição parcial do cliente com outro profissional e em outra filial', async () => {
  await criar([item('09:00',1,amanha,2)]);
  await assert.rejects(criar([item('09:30',2)]), { codigo:'CONFLITO_CLIENTE' });
  await assert.rejects(criar([item('09:00',3,amanha,3)],2,2), { codigo:'CONFLITO_CLIENTE' });
  const horarios = await listarHorariosDisponiveis({ data:amanha,idUnidade:1,idServico:1,idFuncionario:2,idUsuario:2 });
  assert.equal(horarios.horarios.some((h) => ['09:00','09:30'].includes(h.inicio)),false);
});
integrar('duas requisições concorrentes não ocupam um profissional com agenda vazia', async () => {
  const resultados = await Promise.allSettled([criar([item()],2),criar([item()],3)]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length,1);
  assert.equal((await query('SELECT * FROM tb_agendamento')).length,1);
});
integrar('o cliente também é serializado entre filiais diferentes', async () => {
  const resultados = await Promise.allSettled([criar([item()],2),criar([item('09:00',3,amanha,3)],2,2)]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length,1);
});
integrar('consulta e reagendamento ignoram o próprio registro e respeitam outras reservas', async () => {
  const [primeiro, segundo] = await criar([item(),item('10:00',2,amanha,5)]);
  const propria = await api(`/clientes/agendamentos/${primeiro.idAgendamento}/horarios?data=${amanha}&idServico=1&idUnidade=1&idFuncionario=1`,'GET',undefined,'cliente');
  assert.equal(propria.status,200); assert.ok(propria.dados.horarios.some((h) => h.inicio==='09:00'));
  assert.equal(propria.dados.horarios.some((h) => h.inicio==='10:00'),false);
  for (const caminho of [`/clientes/agendamentos/${primeiro.idAgendamento}`, `/salao/agendamentos/${primeiro.idAgendamento}/reagendar`]) {
    const resposta = await api(caminho,'PATCH',{ idUnidade:1,...item('10:00',1) },caminho.startsWith('/clientes')?'cliente':'salao');
    assert.equal(resposta.status,409,JSON.stringify(resposta));
  }
  const resposta = await api(`/salao/agendamentos/${primeiro.idAgendamento}/reagendar`,'PATCH',item('09:30',2));
  assert.equal(resposta.status,200,JSON.stringify(resposta));
});
integrar('endpoint em lote identifica conflito e o endpoint individual mantém compatibilidade', async () => {
  const conflito = await api('/clientes/agendamentos/lote','POST',{idUnidade:1,itens:[item(),item('09:00',2)]},'cliente');
  assert.equal(conflito.status,409);assert.equal(conflito.dados.indiceItem,1);
  const resposta = await api('/clientes/agendamentos','POST',{idUnidade:1,...item()},'cliente');
  assert.equal(resposta.status,201,JSON.stringify(resposta));assert.equal(resposta.dados.nomeFuncionario,'Ana');
});
integrar('bloqueio concorre com reserva e cancela ou impede a ocupação', async () => {
  const [reserva,bloqueio] = await Promise.allSettled([criar([item()]),api('/salao/bloqueios','POST',{idUnidade:1,idFuncionario:1,dataHoraInicio:`${amanha}T09:00:00`,dataHoraFim:`${amanha}T10:00:00`,codigoMotivo:'BLOQUEIO_AGENDA'})]);
  assert.equal(bloqueio.status,'fulfilled'); assert.equal(bloqueio.value.status,201,JSON.stringify(bloqueio));
  assert.equal((await query("SELECT * FROM tb_agendamento WHERE cd_status='AGENDADO'")).length,0);
});
integrar('conclusão com extras de outro profissional, valor ajustado e proteção contra repetição', async () => {
  const [reserva] = await criar([item()]);
  const caminho = `/salao/agendamentos/${reserva.idAgendamento}/confirmar-atendimento`;
  const corpo = {servicosAdicionais:[{idServico:2,idFuncionario:2,valorCobrado:'35.50'}]};
  const resposta = await api(caminho,'PATCH',corpo); assert.equal(resposta.status,200,JSON.stringify(resposta));
  assert.equal((await api(caminho,'PATCH',corpo)).status,409);
  const [registro] = await query('SELECT * FROM tb_agendamento');
  assert.equal(registro.nu_duracao_minutos,30);assert.equal(registro.cd_status,'REALIZADO');
  assert.equal((await query('SELECT * FROM tb_agendamento_servico_adicional')).length,1);
  assert.equal((await query('SELECT * FROM tb_notificacao_cliente')).length,1);
  const historico = await api('/clientes/agendamentos/historico','GET',undefined,'cliente');
  assert.equal(historico.dados.agendamentos[0].valorTotal,85.5);
  assert.equal(historico.dados.agendamentos[0].servicosAdicionais[0].profissional,'Bia');
  const painel = await api(`/salao/indicadores/premium?dataFim=${amanha}`);assert.equal(painel.status,200,JSON.stringify(painel));
  assert.equal(Number(painel.dados.resumo.receitaRealizada),85.5);assert.equal(Number(painel.dados.resumo.atendimentosRealizados),1);
  assert.equal(Number(painel.dados.receitaPorServico.find((s)=>s.servico==='Escova').valor),35.5);
  assert.equal(Number(painel.dados.profissionais.find((p)=>p.profissional==='Bia').receitaRealizada),35.5);
  assert.equal(Number(painel.dados.profissionais.find((p)=>p.profissional==='Bia').minutosAtendimentoRealizado),0);
  assert.equal(Number(painel.dados.analiseAgendamentos[0].valor),85.5);
  assert.equal(Number(painel.dados.resumo.quantidadeServicosExtras), 1);
  assert.equal(Number(painel.dados.resumo.quantidadeServicosRealizados), 2);
  assert.equal(Number(painel.dados.resumo.receitaServicosExtras), 35.5);
  assert.equal(Number(painel.dados.analiseAgendamentos[0].quantidadeServicosExtras), 1);
  const filtrado = await api('/salao/indicadores/premium?idServico=2&idFuncionario=2');
  assert.equal(filtrado.status,200,JSON.stringify(filtrado));assert.equal(Number(filtrado.dados.resumo.receitaRealizada),35.5);
  assert.equal(Number(filtrado.dados.resumo.atendimentosRealizados),1);
  assert.equal(Number(filtrado.dados.resumo.quantidadeServicosExtras), 1);
  assert.equal(Number(filtrado.dados.resumo.quantidadeServicosRealizados), 1);
  assert.equal(Number(filtrado.dados.resumo.receitaServicosExtras), 35.5);
  const original = await api('/salao/indicadores/premium?idServico=1&idFuncionario=1');
  assert.equal(Number(original.dados.resumo.quantidadeServicosExtras), 0);
  assert.equal(Number(original.dados.resumo.quantidadeServicosRealizados), 1);
  assert.equal(Number(original.dados.resumo.receitaServicosExtras), 0);
});
integrar('vários extras no mesmo profissional não multiplicam atendimentos ou ocupação', async () => {
  const [reserva] = await criar([item()]);
  const resposta = await api(`/salao/agendamentos/${reserva.idAgendamento}/confirmar-atendimento`,'PATCH',{
    servicosAdicionais:[{idServico:2,idFuncionario:1,valorCobrado:10},{idServico:2,idFuncionario:1,valorCobrado:0}]
  });
  assert.equal(resposta.status,200,JSON.stringify(resposta));
  const painel = await api('/salao/indicadores/premium');
  assert.equal(painel.status,200,JSON.stringify(painel));
  const ana = painel.dados.profissionais.find((p)=>p.profissional==='Ana');
  assert.equal(Number(ana.atendimentosRealizados),1); assert.equal(Number(ana.minutosAtendimentoRealizado),30);
  assert.equal(Number(ana.receitaRealizada),60); assert.equal(Number(painel.dados.resumo.atendimentosRealizados),1);
  assert.equal(Number(painel.dados.resumo.quantidadeServicosExtras), 2);
  assert.equal(Number(painel.dados.resumo.quantidadeServicosRealizados), 3);
  assert.equal(Number(painel.dados.resumo.receitaServicosExtras), 10);
  const extras = await api('/salao/indicadores/premium/analitico?recorte=extras');
  assert.equal(extras.dados.total, 1); assert.equal(extras.dados.totalServicosExtras, 2);
  assert.equal(Number(extras.dados.agendamentos[0].valor), 10);
  const servicos = await api('/salao/indicadores/premium/analitico?recorte=realizados&visualizarPor=servico');
  assert.equal(servicos.status, 200, JSON.stringify(servicos.dados));
  assert.equal(servicos.dados.total, 3); assert.equal(servicos.dados.totalAtendimentos, 1);
  assert.equal(servicos.dados.totalServicosExtras, 2);
  assert.deepEqual(servicos.dados.agendamentos.map((linha) => Number(linha.valor)), [50, 10, 0]);
  assert.equal(new Set(servicos.dados.agendamentos.map((linha) => linha.idLinha)).size, 3);
  const porServico = await api('/salao/indicadores/premium/analitico?visualizarPor=servico&recorte=extras&idServico=2&idFuncionario=1&ordenarPor=valor&direcao=asc');
  assert.equal(porServico.dados.total, 2); assert.equal(porServico.dados.totalAtendimentos, 1);
  assert.ok(porServico.dados.agendamentos.every((linha) => linha.tipoItem === 'EXTRA'));
  assert.deepEqual(porServico.dados.agendamentos.map((linha) => Number(linha.valor)), [0, 10]);
});
integrar('extras inválidos, serviço de outra filial e salão sem acesso não concluem o atendimento', async () => {
  const [reserva] = await criar([item()]);
  const caminho = `/salao/agendamentos/${reserva.idAgendamento}/confirmar-atendimento`;
  for (const extra of [{idServico:2,idFuncionario:2,valorCobrado:-1},{idServico:3,idFuncionario:3,valorCobrado:10},{idServico:2,idFuncionario:3,valorCobrado:10}]) {
    const resposta = await api(caminho,'PATCH',{servicosAdicionais:[{idServico:2,idFuncionario:2,valorCobrado:10},extra]});
    assert.equal(resposta.status,400,JSON.stringify(resposta));
    assert.equal((await query('SELECT * FROM tb_agendamento_servico_adicional')).length,0);
  }
  assert.equal((await api(caminho,'PATCH',{},'salao2')).status,404);
  assert.equal((await query('SELECT cd_status FROM tb_agendamento'))[0].cd_status,'AGENDADO');
  assert.equal((await api(caminho,'PATCH')).status,200);
});

integrar('agenda pagina próximos e histórico no servidor, preservando extras e isolamento do salão', async () => {
  const { normalizarConsultaAgenda } = await import('../src/servicos/agendaSalao.js');
  const dia = normalizarConsultaAgenda({ periodo: 'amanha' }).inicioPeriodo.slice(0, 10);
  for (const tipo of ['futuros', 'historico']) {
    for (let indice = 0; indice < 13; indice++) await banco.query(`INSERT INTO tb_agendamento
      (fk_usuario,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,cd_status,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos)
      VALUES (2,1,1,1,:inicio,:fim,:status,'Corte',50,30)`, { replacements: {
      inicio: `${tipo === 'futuros' ? dia : '2020-01-01'} 09:00:00`, fim: `${tipo === 'futuros' ? dia : '2020-01-01'} 09:30:00`,
      status: tipo === 'futuros' ? 'AGENDADO' : 'REALIZADO',
    } });
  }
  const [ultimo] = await query('SELECT id_agendamento AS id FROM tb_agendamento ORDER BY id_agendamento DESC LIMIT 1');
  await banco.query(`INSERT INTO tb_agendamento_servico_adicional
    (fk_agendamento,fk_servico,fk_funcionario,nm_servico,nm_funcionario,vl_referencia,vl_cobrado,nu_duracao_minutos)
    VALUES (:id,2,2,'Escova','Bia',40,12.50,45),(:id,2,2,'Escova','Bia',40,0,45)`, { replacements: { id: ultimo.id } });
  for (const tipo of ['futuros', 'historico']) {
    const caminho = `/salao/agendamentos?tipo=${tipo}`;
    const primeira = await api(caminho);
    assert.equal(primeira.status, 200, JSON.stringify(primeira.dados));
    assert.deepEqual([primeira.dados.total, primeira.dados.pagina, primeira.dados.porPagina, primeira.dados.totalPaginas], [13, 1, 10, 2]);
    assert.equal(primeira.dados.agendamentos.length, 10);
    const segunda = await api(`${caminho}&pagina=2`);
    assert.equal(segunda.dados.agendamentos.length, 3);
    const ids = [...primeira.dados.agendamentos, ...segunda.dados.agendamentos].map((item) => item.idAgendamento);
    assert.equal(new Set(ids).size, 13);
    assert.deepEqual(ids, [...ids].sort((a,b) => tipo === 'futuros' ? a-b : b-a));
    const fora = await api(caminho, 'GET', undefined, 'salao2');
    assert.equal(fora.dados.total, 0);
    assert.deepEqual(fora.dados.agendamentos, []);
  }
  const historico = await api('/salao/agendamentos?tipo=historico&porPagina=25');
  assert.equal(historico.dados.agendamentos[0].servicosAdicionais.length, 2);
  assert.equal(historico.dados.agendamentos[0].valorTotal, 62.5);
  const amanhaFiltrado = await api('/salao/agendamentos?periodo=amanha');
  assert.equal(amanhaFiltrado.dados.total, 13);
  assert.equal((await api('/salao/agendamentos?periodo=hoje')).dados.total, 0);
  assert.equal((await api('/salao/agendamentos?periodo=7dias')).dados.total, 13);
  assert.equal((await api('/salao/agendamentos?tipo=historico&periodo=amanha')).dados.total, 0);
  for (const parametros of ['tipo=outro', 'periodo=ontem', 'pagina=0', 'porPagina=1000']) {
    assert.equal((await api(`/salao/agendamentos?${parametros}`)).status, 400);
  }
  assert.equal((await api('/salao/agendamentos', 'GET', undefined, 'cliente')).status, 403);
});

integrar('cliente pagina as duas listas, localiza avaliação antiga e não acessa agendamentos alheios', async () => {
  const futuro = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 7 * 86400000));
  for (const [quantidade, data, status, idUsuario] of [
    [24, '2020-01-01', 'REALIZADO', 2], [12, futuro, 'AGENDADO', 2], [1, '2020-01-01', 'REALIZADO', 3],
  ]) for (let indice = 0; indice < quantidade; indice++) await banco.query(`INSERT INTO tb_agendamento
    (fk_usuario,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,cd_status,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos)
    VALUES (:idUsuario,1,1,1,:inicio,:fim,:status,'Corte',50,30)`, { replacements: {
    idUsuario, inicio: `${data} 09:00:00`, fim: `${data} 09:30:00`, status,
  } });
  const historicos = await query('SELECT id_agendamento AS id FROM tb_agendamento WHERE fk_usuario=2 AND cd_status=\'REALIZADO\' ORDER BY id_agendamento');
  const alvo = historicos[2].id;
  const [alheio] = await query('SELECT id_agendamento AS id FROM tb_agendamento WHERE fk_usuario=3');
  await banco.query(`INSERT INTO tb_agendamento_servico_adicional
    (fk_agendamento,fk_servico,fk_funcionario,nm_servico,nm_funcionario,vl_referencia,vl_cobrado,nu_duracao_minutos)
    VALUES (:id,2,2,'Escova','Bia',40,10,45),(:id,2,2,'Escova','Bia',40,0,45)`, { replacements: { id: alvo } });
  for (const [tipo, total] of [['historico', 24], ['futuros', 12]]) {
    const primeira = await api(`/clientes/agendamentos/${tipo}`, 'GET', undefined, 'cliente');
    assert.equal(primeira.status, 200, JSON.stringify(primeira.dados));
    assert.deepEqual([primeira.dados.total, primeira.dados.pagina, primeira.dados.porPagina, primeira.dados.totalPaginas], [total, 1, 10, Math.ceil(total/10)]);
    const ultima = await api(`/clientes/agendamentos/${tipo}?pagina=99`, 'GET', undefined, 'cliente');
    assert.equal(ultima.dados.pagina, Math.ceil(total/10));
    assert.equal(ultima.dados.agendamentos.length, total % 10);
    assert.ok([...primeira.dados.agendamentos, ...ultima.dados.agendamentos].every((item) => item.idAgendamento !== alheio.id));
  }
  const localizada = await api(`/clientes/agendamentos/historico?localizar=${alvo}`, 'GET', undefined, 'cliente');
  assert.equal(localizada.dados.localizado, true);
  assert.equal(localizada.dados.pagina, 3);
  const atendimento = localizada.dados.agendamentos.find((item) => item.idAgendamento === alvo);
  assert.equal(atendimento.podeAvaliar, 1);
  assert.equal(atendimento.servicosAdicionais.length, 2);
  assert.equal(atendimento.valorTotal, 60);
  const privada = await api(`/clientes/agendamentos/historico?localizar=${alheio.id}`, 'GET', undefined, 'cliente');
  assert.equal(privada.dados.localizado, false);
  assert.equal(privada.dados.pagina, 1);
  for (const parametros of ['pagina=0', 'porPagina=100', 'localizar=-1']) {
    assert.equal((await api(`/clientes/agendamentos/historico?${parametros}`, 'GET', undefined, 'cliente')).status, 400);
  }
  assert.equal((await api('/clientes/agendamentos/historico', 'GET', undefined, 'salao')).status, 403);
});

integrar('analítico separa data agendada da realização e explica os indicadores por recorte', async () => {
  const [reserva] = await criar([item()]);
  await banco.query("UPDATE tb_agendamento SET dt_inicio='2026-06-12 09:00:00',dt_fim='2026-06-12 09:30:00',dt_realizacao='2026-07-01 11:00:00',cd_status='REALIZADO' WHERE id_agendamento=:id", { replacements: { id: reserva.idAgendamento } });
  const periodo = 'dataInicio=2026-07-01&dataFim=2026-07-01';
  const realizados = await api(`/salao/indicadores/premium/analitico?${periodo}&recorte=realizados`);
  assert.equal(realizados.status, 200, JSON.stringify(realizados.dados));
  assert.equal(realizados.dados.total, 1);
  assert.equal(realizados.dados.agendamentos[0].dataInicio, '2026-06-12T09:00:00-03:00');
  assert.equal(realizados.dados.agendamentos[0].dataRealizacao, '2026-07-01T11:00:00-03:00');
  const marcados = await api(`/salao/indicadores/premium/analitico?${periodo}&recorte=agendamentos`);
  assert.equal(marcados.dados.total, 0);
  await banco.query("UPDATE tb_agendamento SET cd_status='CANCELADO',dt_realizacao=NULL,dt_cancelamento='2026-07-01 12:00:00' WHERE id_agendamento=:id", { replacements: { id: reserva.idAgendamento } });
  const cancelados = await api(`/salao/indicadores/premium/analitico?${periodo}&recorte=cancelados`);
  assert.equal(cancelados.dados.total, 1);
  assert.equal(cancelados.dados.agendamentos[0].dataRealizacao, null);
  const operacional = await api(`/salao/indicadores/premium/analitico?${periodo}`);
  assert.equal(operacional.dados.total, 1);
});

integrar('comparecimento usa a data agendada, exclui pendentes e cancelados e preserva filtros e comparação', async () => {
  for (const [unidade, funcionario, servico, data, realizacao, status] of [
    [1, 1, 1, '2026-06-12', '2026-07-01 11:00:00', 'REALIZADO'],
    [1, 1, 1, '2026-06-13', null, 'REALIZADO'],
    [1, 1, 1, '2026-06-14', null, 'NAO_COMPARECEU'],
    [1, 1, 1, '2026-06-15', null, 'CANCELADO'],
    [1, 1, 1, '2026-06-16', null, 'AGENDADO'],
    [1, 1, 1, '2026-05-20', '2026-05-20 11:00:00', 'REALIZADO'],
    [2, 3, 3, '2026-06-17', null, 'NAO_COMPARECEU'],
    [3, 4, 4, '2026-06-18', null, 'NAO_COMPARECEU'],
  ]) await banco.query(`INSERT INTO tb_agendamento
    (fk_usuario,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,dt_realizacao,cd_status,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos)
    VALUES (2,:unidade,:funcionario,:servico,:inicio,:fim,:realizacao,:status,'Corte',50,30)`, {
    replacements: { unidade, funcionario, servico, inicio: `${data} 09:00:00`, fim: `${data} 09:30:00`, realizacao, status },
  });
  const filtros = 'dataInicio=2026-06-01&dataFim=2026-06-30&idUnidade=1&idServico=1&idFuncionario=1';
  const painel = await api(`/salao/indicadores/premium?${filtros}&incluirAnalise=false`);
  assert.equal(painel.status, 200, JSON.stringify(painel.dados));
  assert.equal(Number(painel.dados.resumo.quantidadeComparecimentos), 2);
  assert.equal(Number(painel.dados.resumo.quantidadeNaoCompareceu), 1);
  assert.ok(Math.abs(painel.dados.resumo.taxaComparecimento - 200 / 3) < 0.00001);
  assert.equal(painel.dados.comparacaoAnterior.taxaComparecimento, 100);
  assert.equal(Number(painel.dados.comparacaoAnterior.quantidadeServicosRealizados), 1);
  assert.equal(Number(painel.dados.resumo.quantidadeServicosRealizados), 0);
  const analitico = await api(`/salao/indicadores/premium/analitico?${filtros}&recorte=comparecimento`);
  assert.equal(analitico.dados.total, 3);
  assert.ok(analitico.dados.agendamentos.every((linha) => ['REALIZADO', 'NAO_COMPARECEU'].includes(linha.status)));
  const vazio = await api('/salao/indicadores/premium?dataInicio=2026-07-01&dataFim=2026-07-01&incluirAnalise=false');
  assert.equal(vazio.dados.resumo.taxaComparecimento, null);
  assert.equal(Number(vazio.dados.resumo.quantidadeServicosRealizados), 1);
  const foraDoSalao = await api('/salao/indicadores/premium?dataInicio=2026-06-01&dataFim=2026-06-30&idUnidade=3&incluirAnalise=false');
  assert.equal(foraDoSalao.dados.resumo.taxaComparecimento, null);
  assert.equal(Number(foraDoSalao.dados.resumo.quantidadeServicosRealizados), 0);
});

integrar('analítico pagina e ordena antes de limitar, mantém nulos por último e valida parâmetros', async () => {
  for (let indice = 0; indice < 53; indice++) await banco.query(`INSERT INTO tb_agendamento
    (fk_usuario,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,dt_realizacao,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos)
    VALUES (2,1,1,1,'2026-06-12 09:00:00','2026-06-12 09:30:00',:realizacao,'Corte',:valor,30)`,
    { replacements: { realizacao: indice % 2 ? '2026-06-12 11:00:00' : null, valor: indice + 1 } });
  const caminho = '/salao/indicadores/premium/analitico?dataInicio=2026-06-01&dataFim=2026-06-30';
  const primeira = await api(`${caminho}&ordenarPor=valor&direcao=desc`);
  assert.equal(primeira.status, 200, JSON.stringify(primeira.dados));
  assert.equal(primeira.dados.total, 53); assert.equal(primeira.dados.totalPaginas, 3);
  assert.equal(primeira.dados.agendamentos.length, 25);
  assert.equal(Number(primeira.dados.agendamentos[0].valor), 53);
  const ultima = await api(`${caminho}&ordenarPor=valor&direcao=desc&pagina=99`);
  assert.equal(ultima.dados.pagina, 3); assert.equal(ultima.dados.agendamentos.length, 3);
  assert.deepEqual(ultima.dados.agendamentos.map((linha) => Number(linha.valor)), [3,2,1]);
  for (const direcao of ['asc', 'desc']) {
    const ordenado = await api(`${caminho}&ordenarPor=dataRealizacao&direcao=${direcao}`);
    assert.ok(ordenado.dados.agendamentos.every((linha) => linha.dataRealizacao !== null));
  }
  for (const filtro of ['pagina=-1', 'porPagina=500', 'ordenarPor=valor%20DESC', 'recorte=outro', 'dataInicio=2026-13-01']) assert.equal((await api(`${caminho}&${filtro}`)).status, 400);
  assert.equal((await api(`${caminho}&idUnidade=3`)).dados.total, 0);
  assert.equal((await api(caminho, 'GET', undefined, 'salao2')).status, 403);
  assert.equal((await api(caminho, 'GET', undefined, 'cliente')).status, 403);
});

integrar('CSV para BI separa itens, exporta além da página e respeita filtros de serviço e profissional', async () => {
  const [reserva] = await criar([item()]);
  const conclusao = await api(`/salao/agendamentos/${reserva.idAgendamento}/confirmar-atendimento`, 'PATCH', { servicosAdicionais: [
    { idServico: 2, idFuncionario: 2, valorCobrado: '35.50' }, { idServico: 2, idFuncionario: 2, valorCobrado: '0.00' },
  ] });
  assert.equal(conclusao.status, 200, JSON.stringify(conclusao.dados));
  for (let indice = 0; indice < 27; indice++) await banco.query(`INSERT INTO tb_agendamento
    (fk_usuario,fk_unidade,fk_funcionario,fk_servico,dt_inicio,dt_fim,dt_realizacao,cd_status,nm_servico_agendado,vl_servico_agendado,nu_duracao_minutos)
    VALUES (2,1,1,1,NOW(),DATE_ADD(NOW(),INTERVAL 30 MINUTE),NOW(),'REALIZADO','Corte',50,30)`);
  const exportar = async (filtros = '', token = 'salao') => {
    const resposta = await fetchOriginal(`${base}/salao/indicadores/premium/analitico/exportar?recorte=realizados&${filtros}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: resposta.status, conteudo: await resposta.text(), tipo: resposta.headers.get('content-type') };
  };
  const arquivo = await exportar();
  assert.equal(arquivo.status, 200); assert.match(arquivo.tipo, /text\/csv/);
  const linhas = arquivo.conteudo.replace(/^\uFEFF/, '').trimEnd().split('\r\n').map((linha) => linha.split(';').map((valor) => valor.slice(1, -1).replaceAll('""', '"')));
  const cabecalho = linhas.shift();
  assert.equal(linhas.length, 30);
  assert.equal(new Set(linhas.map((linha) => linha[0])).size, 28);
  assert.equal(linhas.reduce((soma, linha) => soma + Number(linha[cabecalho.indexOf('valor_item')]), 0), 1435.5);
  const filtrado = await exportar('idServico=2&idFuncionario=2');
  const extras = filtrado.conteudo.trimEnd().split('\r\n').slice(1);
  assert.equal(extras.length, 2); assert.ok(extras.every((linha) => linha.includes(';"EXTRA";')));
  const foraDoSalao = await exportar('', 'salao2'); assert.equal(foraDoSalao.status, 403);
  const respostaExcel = await fetchOriginal(`${base}/salao/indicadores/premium/analitico/exportar?recorte=realizados&formato=xlsx`, { headers: { Authorization: 'Bearer salao' } });
  assert.equal(respostaExcel.status, 200);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await respostaExcel.arrayBuffer()));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Analítico', 'Filiais', 'Serviços', 'Profissionais']);
  assert.equal(workbook.getWorksheet('Analítico').rowCount, 31);
  assert.equal(workbook.getWorksheet('Filiais').rowCount, 2);
  assert.equal(workbook.getWorksheet('Serviços').rowCount, 3);
  assert.equal(workbook.getWorksheet('Profissionais').rowCount, 3);
  const leve = await api('/salao/indicadores/premium?incluirAnalise=false');
  assert.deepEqual(leve.dados.analiseAgendamentos, []);
  assert.equal(Number(leve.dados.resumo.receitaRealizada), 1435.5);
  const completo = await api(`/salao/indicadores/premium?dataFim=${amanha}`);
  assert.equal(completo.dados.analiseAgendamentos.length, 28);
});
