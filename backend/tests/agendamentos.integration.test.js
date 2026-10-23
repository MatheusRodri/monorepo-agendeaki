import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

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
  const filtrado = await api('/salao/indicadores/premium?idServico=2&idFuncionario=2');
  assert.equal(filtrado.status,200,JSON.stringify(filtrado));assert.equal(Number(filtrado.dados.resumo.receitaRealizada),35.5);
  assert.equal(Number(filtrado.dados.resumo.atendimentosRealizados),1);
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
