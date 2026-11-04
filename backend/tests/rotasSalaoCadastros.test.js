import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { afterAll, beforeEach, test } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { iniciarRota, silenciarConsole } from './auxiliares/ambiente.js';

Object.assign(process.env, { DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), DOCUMENT_HMAC_KEY: randomBytes(32).toString('base64') });
const ambiente = await iniciarRota('rotas/salao.js', { usuario: { idUsuario: 1, idAutenticacaoExterna: 'ext-1', perfil: 'ADMIN_SALAO' }, montagem: '/api/salao' });
const { banco } = ambiente;
const { prepararIndiceRaizCnpj } = await import('../src/servicos/documentosProtegidos.js');
afterAll(() => ambiente.parar());
const base = '/api/salao';
const fetchReal = globalThis.fetch;
const raiz = prepararIndiceRaizCnpj('11.222.333/0001-81');

const SALAO = /FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario = s.fk_usuario_administrador/;
const salao = () => banco.responder(SALAO, [{ idSalao: 1, nome: 'Studio', slug: 'studio', emailConta: 'a@a.com' }]);
const filialExiste = () => banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao AND st_ativo = TRUE LIMIT 1/, [{ idUnidade: 5 }]);

beforeEach(() => {
  banco.reiniciar();
  silenciarConsole();
  ambiente.estado.autenticado = true;
  jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => (String(url).includes('viacep')
    ? Promise.resolve({ ok: true, json: async () => ({ logradouro: 'Rua A', bairro: 'Centro', localidade: 'SP', uf: 'SP' }) })
    : fetchReal(url, init)));
});

const horarios = Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, fechado: false, abertura: '08:00', fechamento: '18:00' }));
const filial = { nome: 'Centro', numero: '10', categoria: 'UNISSEX', email: 'c@c.com', telefone: '11987654321', tipoDocumento: 'CNPJ',
  documento: '11.222.333/0001-81', horarios, latitude: -23.5, longitude: -46.6, cep: '01001-000', complemento: '' };

function filialPronta() {
  salao();
  banco.responder(/SELECT ds_cnpj_raiz_indice AS indiceRaizCnpj FROM tb_salao WHERE id_salao=:idSalao LIMIT 1/, [{ indiceRaizCnpj: raiz }]);
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao FOR UPDATE/, [{ indiceRaizCnpj: raiz }]);
}

test('listar filiais decifra o documento e agrupa horários', async () => {
  assert.equal((await ambiente.get(`${base}/filiais`)).status, 404);
  salao();
  assert.deepEqual((await ambiente.get(`${base}/filiais`)).corpo, { filiais: [] });
  const { prepararDocumento } = await import('../src/servicos/documentosProtegidos.js');
  banco.responder(/FROM tb_unidade WHERE fk_salao = :idSalao AND st_ativo = TRUE ORDER BY nm_unidade/, [{ idUnidade: 5, nome: 'Centro', latitude: -23, longitude: -46, documentoCifrado: prepararDocumento('CNPJ', '11.222.333/0001-81').documentoCifrado }, { idUnidade: 6, nome: 'Sul', latitude: null, longitude: null, documentoCifrado: null }]);
  banco.responder(/FROM tb_horario_unidade WHERE fk_unidade IN/, [{ idUnidade: 5, diaSemana: 1 }]);
  const resposta = await ambiente.get(`${base}/filiais`);
  assert.equal(resposta.corpo.filiais[0].documento, '11222333000181');
  assert.equal(resposta.corpo.filiais[0].horarios.length, 1);
  assert.equal(resposta.corpo.filiais[1].horarios.length, 0);
});

test('salvar filial valida os dados antes de gravar', async () => {
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 404);
  filialPronta();
  const casos = [
    [{ nome: ' ' }, 400], [{ categoria: 'X' }, 400], [{ email: 'ruim' }, 400], [{ telefone: '1' }, 400], [{ tipoDocumento: 'CPF' }, 400],
    [{ documento: '00.000.000/0001-91' }, 409], [{ horarios: [] }, 400], [{ horarios: horarios.map((h, i) => (i ? h : { ...h, abertura: '19:00' })) }, 400],
    [{ horarios: horarios.map((h) => ({ ...h, diaSemana: 0 })) }, 400], [{ latitude: 200 }, 400], [{ longitude: 'x' }, 400], [{ cep: '123' }, 422],
  ];
  for (const [alteracao, status] of casos) assert.equal((await ambiente.post(`${base}/filiais`, { ...filial, ...alteracao })).status, status, JSON.stringify(alteracao));
  const fechado = horarios.map((h, i) => (i === 0 ? { diaSemana: 0, fechado: true } : h));
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, [{ insertId: 10 }]);
  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idUnidade/, [{ idUnidade: 10 }]);
  assert.equal((await ambiente.post(`${base}/filiais`, { ...filial, horarios: fechado })).status, 201);
});

test('criar filial: sucesso, limite do plano Básico e erros', async () => {
  filialPronta();
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, [{ insertId: 10 }]);
  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idUnidade/, [{ idUnidade: 10 }]);
  const criada = await ambiente.post(`${base}/filiais`, filial);
  assert.equal(criada.status, 201);
  assert.equal(criada.corpo.idUnidade, 10);
  assert.equal(banco.chamadas.filter((c) => /INSERT INTO tb_horario_unidade/.test(c.sql)).length, 7);

  banco.responder(/SELECT COUNT\(\*\) AS quantidade FROM tb_unidade WHERE fk_salao=:idSalao AND st_ativo=TRUE/, [{ quantidade: 1 }]);
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 409);
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA' }]);
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 201);

  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice AND \(:idUnidade IS NULL/, [{ id_unidade: 1 }]);
  assert.match((await ambiente.post(`${base}/filiais`, filial)).corpo.mensagem, /outra unidade/);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE ds_documento_indice=:documentoIndice AND \(:idUnidade IS NULL/, []);
  banco.responder(/SELECT id_usuario FROM tb_usuario WHERE ds_documento_indice=:documentoIndice AND id_usuario<>/, [{ id_usuario: 9 }]);
  assert.match((await ambiente.post(`${base}/filiais`, filial)).corpo.mensagem, /outra empresa/);
  banco.responder(/SELECT id_usuario FROM tb_usuario WHERE ds_documento_indice=:documentoIndice AND id_usuario<>/, []);

  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idUnidade/, [{}]);
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, [{}]);
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 500);
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, () => { throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError', errors: [{ path: 'uk_unidade_nome_salao' }] }); });
  assert.match((await ambiente.post(`${base}/filiais`, filial)).corpo.mensagem, /Já existe uma unidade com esse nome/);
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, () => { throw Object.assign(new Error('dup'), { original: { code: 'ER_DUP_ENTRY' } }); });
  assert.match((await ambiente.post(`${base}/filiais`, filial)).corpo.mensagem, /CNPJ já está cadastrado/);
});

test('criar filial persistida apesar de falha tardia ainda responde sucesso', async () => {
  filialPronta();
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, [{ insertId: 10 }]);
  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idUnidade/, [{ idUnidade: 10 }]);
  banco.responder(/INSERT INTO tb_horario_unidade/, () => { throw new Error('falha nos horários'); });
  banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao LIMIT 1/, [{ idUnidade: 10 }]);
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 201);
  banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao LIMIT 1/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 500);
  banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao LIMIT 1/, []);
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 500);
});

test('criar filial recusa CNPJ de outra raiz dentro da transação', async () => {
  filialPronta();
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao FOR UPDATE/, [{ indiceRaizCnpj: 'outra' }]);
  assert.equal((await ambiente.post(`${base}/filiais`, filial)).status, 409);
});

test('atualizar filial: não encontrada, expediente em conflito e sucesso', async () => {
  filialPronta();
  assert.equal((await ambiente.patch(`${base}/filiais/5`, filial)).status, 404);
  banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao LIMIT 1/, [{ idUnidade: 5 }]);
  banco.responder(/FROM tb_agendamento WHERE fk_unidade=:idUnidade\s+AND cd_status='AGENDADO' AND dt_fim>NOW\(\)/, [{ diaSemana: 1, inicio: '07:00', fim: '07:30' }]);
  assert.match((await ambiente.patch(`${base}/filiais/5`, filial)).corpo.mensagem, /fora do horário/);
  banco.responder(/FROM tb_agendamento WHERE fk_unidade=:idUnidade\s+AND cd_status='AGENDADO' AND dt_fim>NOW\(\)/, [{ diaSemana: 1, inicio: '09:00', fim: '09:30' }]);
  assert.equal((await ambiente.patch(`${base}/filiais/5`, filial)).status, 200);
  assert.ok(banco.chamou(/UPDATE tb_unidade SET nm_unidade/));
  banco.responder(/FROM tb_salao WHERE id_salao=:idSalao FOR UPDATE/, [{ indiceRaizCnpj: 'outra' }]);
  assert.equal((await ambiente.patch(`${base}/filiais/5`, filial)).status, 409);
});

test('atualizar filial traduz erros de banco', async () => {
  filialPronta();
  banco.responder(/SELECT id_unidade AS idUnidade FROM tb_unidade WHERE id_unidade = :idUnidade AND fk_salao = :idSalao LIMIT 1/, [{ idUnidade: 5 }]);
  for (const [erro, status, trecho] of [[{ original: { code: 'ER_DUP_ENTRY' } }, 409, /CNPJ já está/], [{ parent: { code: 'ER_LOCK_DEADLOCK' } }, 409, /sendo atualizada/], [{}, 500, /falha/]]) {
    banco.responder(/UPDATE tb_unidade SET nm_unidade/, () => { throw Object.assign(new Error('falha'), erro); });
    const resposta = await ambiente.patch(`${base}/filiais/5`, filial);
    assert.equal(resposta.status, status);
    assert.match(resposta.corpo.mensagem, trecho);
  }
});

test('excluir filial, serviço e profissional (remoção lógica)', async () => {
  salao();
  const alvos = [['filiais/5', /UPDATE tb_unidade SET st_ativo=FALSE/], ['servicos/3', /UPDATE tb_servico s INNER JOIN/], ['funcionarios/9', /UPDATE tb_funcionario f INNER JOIN/]];
  for (const [caminho, sql] of alvos) {
    assert.equal((await ambiente.delete(`${base}/${caminho}`)).status, 404);
    banco.responder(sql, [{ affectedRows: 1 }]);
    assert.equal((await ambiente.delete(`${base}/${caminho}`)).status, 200);
  }
  banco.reiniciar();
  for (const [caminho] of alvos) assert.equal((await ambiente.delete(`${base}/${caminho}`)).status, 404);
});

const servico = { nome: 'Corte', idUnidade: 5, valor: 50, duracaoMinutos: 30, descricao: ' simples ' };

test('criar serviço valida entradas, unidade e Premium para promoção', async () => {
  assert.equal((await ambiente.post(`${base}/servicos`, servico)).status, 404);
  salao();
  for (const alteracao of [{ nome: '' }, { idUnidade: 0 }, { valor: -1 }, { duracaoMinutos: 20 }]) assert.equal((await ambiente.post(`${base}/servicos`, { ...servico, ...alteracao })).status, 400);
  assert.equal((await ambiente.post(`${base}/servicos`, servico)).status, 404);
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao AND st_ativo=TRUE LIMIT 1/, [{ id_unidade: 5 }]);
  assert.equal((await ambiente.post(`${base}/servicos`, servico)).status, 201);
  assert.equal(banco.chamadas.find((c) => /INSERT INTO tb_servico/.test(c.sql)).opcoes.replacements.descricao, 'simples');
  const promocao = { ativa: true, tipo: 'PERCENTUAL', valor: 10 };
  const semPremium = await ambiente.post(`${base}/servicos`, { ...servico, promocao });
  assert.equal(semPremium.status, 403);
  assert.equal(semPremium.corpo.codigo, 'PREMIUM_NECESSARIO');
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA' }]);
  assert.equal((await ambiente.post(`${base}/servicos`, { ...servico, promocao })).status, 201);
  assert.equal((await ambiente.post(`${base}/servicos`, { ...servico, valor: 'abc' })).status, 400);
});

test('listar serviços aplica promoção quando Premium', async () => {
  assert.equal((await ambiente.get(`${base}/servicos`)).status, 404);
  salao();
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade\s+WHERE u.fk_salao=:idSalao/, [{ idServico: 1, nome: 'Corte', valor: '50.00', promocaoTipo: 'PERCENTUAL', promocaoValor: '20', promocaoHabilitada: 1, promocaoInicio: null, promocaoFim: null }]);
  banco.responder(/FROM tb_assinatura_salao/, [{ status: 'AUTORIZADA' }]);
  const resposta = await ambiente.get(`${base}/servicos`);
  assert.equal(resposta.corpo.premiumAtivo, true);
  assert.equal(resposta.corpo.servicos[0].valorVigente, 40);
  assert.equal(resposta.corpo.servicos[0].valor, 50);
});

test('atualizar serviço percorre validação, localização e transação', async () => {
  salao();
  assert.equal((await ambiente.patch(`${base}/servicos/abc`, servico)).status, 400);
  assert.equal((await ambiente.patch(`${base}/servicos/3`, { ...servico, nome: '' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/servicos/3`, servico)).status, 404);
  filialExiste();
  assert.match((await ambiente.patch(`${base}/servicos/3`, servico)).corpo.mensagem, /Serviço não encontrado/);
  banco.responder(/SELECT s.fk_unidade AS idUnidade FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade\s+WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE`?/, [{ idUnidade: 5 }]);
  assert.equal((await ambiente.patch(`${base}/servicos/3`, servico)).status, 404);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade\s+WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE FOR UPDATE/, [{ idUnidade: 5, promocaoTipo: null }]);
  assert.equal((await ambiente.patch(`${base}/servicos/3`, servico)).status, 200);
  assert.ok(banco.chamou(/UPDATE tb_servico SET fk_unidade/));
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade\s+WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE FOR UPDATE/, [{ idUnidade: 99 }]);
  assert.equal((await ambiente.patch(`${base}/servicos/3`, servico)).status, 409);
  assert.equal((await ambiente.patch(`${base}/servicos/3`, { ...servico, promocao: { ativa: true, tipo: 'PERCENTUAL', valor: 10 } })).status, 409);
});

const profissional = { nome: 'Ana', idUnidade: 5, idsServicos: [1, 2] };

test('criar profissional cria vínculos e disponibilidade padrão', async () => {
  assert.equal((await ambiente.post(`${base}/funcionarios`, profissional)).status, 404);
  salao();
  assert.equal((await ambiente.post(`${base}/funcionarios`, { ...profissional, idsServicos: [] })).status, 400);
  assert.equal((await ambiente.post(`${base}/funcionarios`, profissional)).status, 400);
  filialExiste();
  assert.match((await ambiente.post(`${base}/funcionarios`, profissional)).corpo.mensagem, /apenas serviços/);
  banco.responder(/SELECT id_servico AS idServico FROM tb_servico WHERE fk_unidade=:idUnidade AND st_ativo=TRUE AND id_servico IN/, [{ idServico: 1 }, { idServico: 2 }]);
  assert.match((await ambiente.post(`${base}/funcionarios`, profissional)).corpo.mensagem, /identificar o profissional/);
  banco.responder(/SELECT LAST_INSERT_ID\(\) AS idFuncionario/, [{ idFuncionario: 9 }]);
  banco.responder(/FROM tb_horario_unidade WHERE fk_unidade = :idUnidade AND st_fechado = FALSE/, [{ diaSemana: 1, horaInicio: '08:00', horaFim: '18:00' }]);
  assert.equal((await ambiente.post(`${base}/funcionarios`, profissional)).status, 201);
  assert.equal(banco.chamadas.filter((c) => /INSERT INTO tb_funcionario_servico/.test(c.sql)).length, 2);
  assert.ok(banco.chamou(/INSERT INTO tb_disponibilidade_funcionario/));
});

test('listar e atualizar profissionais', async () => {
  assert.equal((await ambiente.get(`${base}/funcionarios`)).status, 404);
  salao();
  assert.deepEqual((await ambiente.get(`${base}/funcionarios`)).corpo, { funcionarios: [] });
  banco.responder(/FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade\s+WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE ORDER BY/, [{ idFuncionario: 9, nome: 'Ana' }, { idFuncionario: 10, nome: 'Bia' }]);
  banco.responder(/FROM tb_funcionario_servico fs INNER JOIN tb_servico s/, [{ idFuncionario: 9, idServico: 1, nomeServico: 'Corte' }, { idFuncionario: 9, idServico: 2, nomeServico: 'Barba' }]);
  const lista = await ambiente.get(`${base}/funcionarios`);
  assert.equal(lista.corpo.funcionarios[0].servicos, 'Corte · Barba');
  assert.deepEqual(lista.corpo.funcionarios[1].idsServicos, []);
  banco.responder(/FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade=f.fk_unidade\s+WHERE u.fk_salao=:idSalao AND f.st_ativo=TRUE ORDER BY/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.get(`${base}/funcionarios`)).status, 500);

  banco.reiniciar();
  assert.equal((await ambiente.patch(`${base}/funcionarios/9`, profissional)).status, 404);
  salao();
  assert.equal((await ambiente.patch(`${base}/funcionarios/9`, { ...profissional, nome: '' })).status, 400);
  assert.equal((await ambiente.patch(`${base}/funcionarios/9`, profissional)).status, 400);
  filialExiste();
  assert.equal((await ambiente.patch(`${base}/funcionarios/9`, profissional)).status, 404);
  banco.responder(/WHERE f.id_funcionario=:idFuncionario AND u.fk_salao=:idSalao AND f.st_ativo=TRUE\s+LIMIT 1 FOR UPDATE/, [{ idFuncionario: 9 }]);
  assert.match((await ambiente.patch(`${base}/funcionarios/9`, profissional)).corpo.mensagem, /serviços ativos/);
  banco.responder(/SELECT id_servico AS idServico FROM tb_servico WHERE fk_unidade=:idUnidade AND st_ativo=TRUE AND id_servico IN/, [{ idServico: 1 }, { idServico: 2 }]);
  assert.equal((await ambiente.patch(`${base}/funcionarios/9`, profissional)).status, 200);
  assert.ok(banco.chamou(/DELETE FROM tb_funcionario_servico/));
});

test('disponibilidade: listar por unidade e salvar jornada', async () => {
  assert.equal((await ambiente.get(`${base}/disponibilidade?idUnidade=5`)).status, 404);
  salao();
  assert.equal((await ambiente.get(`${base}/disponibilidade?idUnidade=x`)).status, 404);
  assert.equal((await ambiente.get(`${base}/disponibilidade?idUnidade=5`)).status, 404);
  filialExiste();
  assert.deepEqual((await ambiente.get(`${base}/disponibilidade?idUnidade=5`)).corpo, { bloqueios: [], funcionarios: [] });
  banco.responder(/FROM tb_funcionario f WHERE f.fk_unidade=:idUnidade AND f.st_ativo=TRUE/, [{ idFuncionario: 9, nome: 'Ana' }]);
  banco.responder(/FROM tb_disponibilidade_funcionario\s+WHERE fk_funcionario IN/, [{ idFuncionario: 9, diaSemana: 1, inicio: '08:00', fim: '12:00' }]);
  banco.responder(/FROM tb_bloqueio_agenda b LEFT JOIN/, [{ idBloqueio: 1 }]);
  const resposta = await ambiente.get(`${base}/disponibilidade?idUnidade=5`);
  assert.equal(resposta.corpo.funcionarios[0].periodos.length, 1);
  assert.equal(resposta.corpo.bloqueios.length, 1);
});

test('salvar disponibilidade valida períodos, conflitos e grava', async () => {
  const caminho = `${base}/funcionarios/9/disponibilidade`;
  assert.equal((await ambiente.put(caminho, { periodos: [] })).status, 404);
  salao();
  for (const periodos of [undefined, [{ diaSemana: 9, inicio: '08:00', fim: '09:00' }], [{ diaSemana: 1, inicio: '10:00', fim: '09:00' }], [{ diaSemana: 1, inicio: '08:00', fim: '10:00' }, { diaSemana: 1, inicio: '09:00', fim: '11:00' }]]) {
    assert.equal((await ambiente.put(caminho, { periodos })).status, 400);
  }
  const ok = [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }, { diaSemana: 1, inicio: '13:00', fim: '18:00' }];
  assert.equal((await ambiente.put(caminho, { periodos: ok })).status, 404);
  banco.responder(/SELECT f.id_funcionario AS idFuncionario, f.fk_unidade AS idUnidade/, [{ idFuncionario: 9, idUnidade: 5 }]);
  assert.match((await ambiente.put(caminho, { periodos: ok })).corpo.mensagem, /foi alterado/);
  banco.responder(/SELECT fk_unidade AS idUnidade FROM tb_funcionario\s+WHERE id_funcionario=:idFuncionario AND st_ativo=TRUE/, [{ idUnidade: 5 }]);
  banco.responder(/FROM tb_agendamento WHERE fk_funcionario=:idFuncionario AND cd_status='AGENDADO' AND dt_fim>NOW\(\)/, [{ diaSemana: 2, inicio: '09:00', fim: '09:30' }]);
  assert.match((await ambiente.put(caminho, { periodos: ok })).corpo.mensagem, /fora do expediente/);
  banco.responder(/FROM tb_agendamento WHERE fk_funcionario=:idFuncionario AND cd_status='AGENDADO' AND dt_fim>NOW\(\)/, [{ diaSemana: 1, inicio: '09:00', fim: '09:30' }]);
  assert.equal((await ambiente.put(caminho, { periodos: ok })).status, 200);
  assert.equal(banco.chamadas.filter((c) => /INSERT INTO tb_disponibilidade_funcionario/.test(c.sql)).length, 2);
  banco.responder(/DELETE FROM tb_disponibilidade_funcionario/, () => { throw Object.assign(new Error('x'), { original: { code: 'ER_LOCK_WAIT_TIMEOUT' } }); });
  assert.equal((await ambiente.put(caminho, { periodos: ok })).status, 409);
  banco.responder(/DELETE FROM tb_disponibilidade_funcionario/, () => { throw new Error('outro'); });
  assert.equal((await ambiente.put(caminho, { periodos: ok })).status, 400);
});

test('criar filial tolera falha ao desfazer a transação', async () => {
  filialPronta();
  banco.falharRollback = true;
  banco.responder(/INSERT INTO tb_unidade \(fk_salao/, () => { throw new Error('falha ao inserir'); });
  const resposta = await ambiente.post(`${base}/filiais`, filial);
  assert.equal(resposta.status, 500);
});

// ---- ramificações restantes ----

test('salvar filial sem e-mail é recusada', async () => {
  filialPronta();
  const { email, ...semEmail } = filial;
  assert.equal((await ambiente.post(`${base}/filiais`, semEmail)).status, 400);
});

test('criar serviço sem descrição grava nulo e falha inesperada vira 500', async () => {
  salao();
  banco.responder(/SELECT id_unidade FROM tb_unidade WHERE id_unidade=:idUnidade AND fk_salao=:idSalao AND st_ativo=TRUE LIMIT 1/, [{ id_unidade: 5 }]);
  const { descricao, ...semDescricao } = servico;
  assert.equal((await ambiente.post(`${base}/servicos`, semDescricao)).status, 201);
  assert.equal(banco.chamadas.find((c) => /INSERT INTO tb_servico/.test(c.sql)).opcoes.replacements.descricao, null);
  banco.responder(/INSERT INTO tb_servico/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.post(`${base}/servicos`, semDescricao)).status, 500);
});

test('atualizar serviço sem descrição grava nulo e falha inesperada vira 500', async () => {
  salao(); filialExiste();
  banco.responder(/SELECT s.fk_unidade AS idUnidade FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade\s+WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE/, [{ idUnidade: 5 }]);
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade\s+WHERE s.id_servico=:idServico AND u.fk_salao=:idSalao AND s.st_ativo=TRUE FOR UPDATE/, [{ idUnidade: 5, promocaoTipo: null }]);
  const { descricao, ...semDescricao } = servico;
  assert.equal((await ambiente.patch(`${base}/servicos/3`, semDescricao)).status, 200);
  assert.equal(banco.chamadas.find((c) => /UPDATE tb_servico SET fk_unidade/.test(c.sql)).opcoes.replacements.descricao, null);
  banco.responder(/UPDATE tb_servico SET fk_unidade/, () => { throw new Error('banco'); });
  assert.equal((await ambiente.patch(`${base}/servicos/3`, semDescricao)).status, 500);
});

test('disponibilidade com período incompleto é recusada', async () => {
  salao();
  assert.equal((await ambiente.put(`${base}/funcionarios/9/disponibilidade`, { periodos: [{ diaSemana: 1 }] })).status, 400);
});
