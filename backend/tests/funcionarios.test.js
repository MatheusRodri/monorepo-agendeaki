import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SUPABASE_URL = 'https://auth.agendeaki.test';
process.env.SUPABASE_ANON_KEY = 'chave-de-teste';
const { bancoDeDados } = await import('../src/configuracoes/bancoDeDados.js');
const { default: rotas } = await import('../src/rotas/salao.js');
const atualizar = rotas.stack.find(({ route }) => route?.path === '/funcionarios/:idFuncionario' && route.methods.patch).route.stack[0].handle;

function preparar(t, { encontrado = true, servicosValidos = true } = {}) {
  const gravacoes = [];
  const transacao = { commit: t.mock.fn(), rollback: t.mock.fn() };
  t.mock.method(bancoDeDados, 'transaction', async () => transacao);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    id: 'administrador-teste', email: 'admin@teste.local', user_metadata: { perfil: 'ADMIN_SALAO', nome: 'Admin' },
  }), { headers: { 'Content-Type': 'application/json' } }));
  t.mock.method(bancoDeDados, 'query', async (sql, opcoes) => {
    if (sql.includes('FROM tb_usuario')) return [{ idUsuario: 1 }];
    if (sql.includes('FROM tb_salao s')) return [{ idSalao: 1 }];
    if (sql.includes('FROM tb_unidade WHERE')) return [{ idUnidade: 1 }];
    if (sql.includes('FROM tb_funcionario f')) {
      assert.equal(opcoes.replacements.idSalao, 1);
      assert.equal(opcoes.transaction, transacao);
      assert.match(sql, /f\.st_ativo=TRUE/);
      assert.match(sql, /FOR UPDATE/);
      return encontrado ? [{ idFuncionario: 7 }] : [];
    }
    if (sql.includes('FROM tb_servico')) return servicosValidos ? opcoes.replacements.idsServicos.map((idServico) => ({ idServico })) : [];
    gravacoes.push({ sql, valores: opcoes.replacements });
    // MySQL pode não alterar nenhuma linha quando nome e filial são mantidos.
    return [{ affectedRows: 0 }, { affectedRows: 0 }];
  });
  const resposta = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(dados) { this.dados = dados; return this; } };
  const requisicao = { headers: { authorization: 'Bearer teste' }, params: { idFuncionario: '7' }, originalUrl: '/funcionarios/7', body: { nome: 'Ana', idUnidade: '1', idsServicos: [2, 3] } };
  return { requisicao, resposta, transacao, gravacoes };
}

test('edita apenas os serviços mantendo nome e filial mesmo com zero linhas alteradas', async (t) => {
  const { requisicao, resposta, transacao, gravacoes } = preparar(t);
  await atualizar(requisicao, resposta);
  assert.equal(resposta.codigo, 200);
  assert.match(resposta.dados.mensagem, /atualizado com sucesso/);
  assert.equal(transacao.commit.mock.callCount(), 1);
  assert.equal(transacao.rollback.mock.callCount(), 0);
  assert.deepEqual(gravacoes.filter(({ sql }) => sql.startsWith('INSERT')).map(({ valores }) => valores.idServico), [2, 3]);
});

test('permite salvar novamente os mesmos dados do profissional', async (t) => {
  const { requisicao, resposta } = preparar(t);
  requisicao.body.idsServicos = [1];
  await atualizar(requisicao, resposta);
  assert.equal(resposta.codigo, 200);
});

test('recusa profissional ausente, inativo ou de outro salão antes de gravar', async (t) => {
  const { requisicao, resposta, transacao, gravacoes } = preparar(t, { encontrado: false });
  await atualizar(requisicao, resposta);
  assert.equal(resposta.codigo, 404);
  assert.equal(resposta.dados.mensagem, 'Profissional não encontrado.');
  assert.equal(transacao.rollback.mock.callCount(), 1);
  assert.deepEqual(gravacoes, []);
});

test('recusa serviços inválidos sem modificar o profissional nem seus vínculos', async (t) => {
  const { requisicao, resposta, transacao, gravacoes } = preparar(t, { servicosValidos: false });
  await atualizar(requisicao, resposta);
  assert.equal(resposta.codigo, 400);
  assert.match(resposta.dados.mensagem, /serviços ativos da filial/);
  assert.equal(transacao.rollback.mock.callCount(), 1);
  assert.deepEqual(gravacoes, []);
});
