import express from 'express';
import { jest } from '@jest/globals';

// Banco falso guiado por regras: a primeira regra cujo padrão casa com o SQL responde.
// Sem regra, consultas SELECT devolvem [] e as demais devolvem [[], { affectedRows: 0 }].
export function criarBancoFalso() {
  const regras = [];
  const banco = {
    chamadas: [],
    confirmadas: 0,
    falharRollback: false,
    revertidas: 0,
    regras,
    responder(padrao, resposta) { regras.unshift([padrao, resposta]); return banco; },
    reiniciar() { regras.length = 0; banco.chamadas.length = 0; banco.confirmadas = 0; banco.revertidas = 0; banco.falharRollback = false; },
    async query(sql, opcoes = {}) {
      banco.chamadas.push({ sql, opcoes });
      for (const [padrao, resposta] of regras) {
        if (padrao.test(sql)) return typeof resposta === 'function' ? resposta(opcoes, sql) : resposta;
      }
      return opcoes.type === 'SELECT' ? [] : [[], { affectedRows: 0 }];
    },
    async transaction(primeiro, segundo) {
      const funcao = typeof primeiro === 'function' ? primeiro : segundo;
      const transacao = { LOCK: { UPDATE: 'UPDATE' }, commit: async () => { banco.confirmadas += 1; }, rollback: async () => { if (banco.falharRollback) throw new Error('rollback'); banco.revertidas += 1; } };
      return funcao ? funcao(transacao) : transacao;
    },
    close: async () => {},
    sqls: () => banco.chamadas.map((chamada) => chamada.sql),
    chamou: (padrao) => banco.chamadas.some((chamada) => padrao.test(chamada.sql)),
  };
  return banco;
}

export function criarSupabaseFalso() {
  const estado = {
    usuario: { id: 'sup-1', email: 'user@teste.com', user_metadata: {} }, erro: null,
    respostas: {}, chamadas: [],
  };
  const resposta = (nome, padrao) => async (...args) => {
    estado.chamadas.push([nome, args]);
    const definida = estado.respostas[nome];
    if (typeof definida === 'function') return definida(...args);
    return definida ?? padrao;
  };
  const cliente = {
    auth: {
      getUser: resposta('getUser', { data: { user: estado.usuario }, error: null }),
      signUp: resposta('signUp', { data: { user: { id: 'sup-novo' }, session: { access_token: 'a', refresh_token: 'r' } }, error: null }),
      signInWithPassword: resposta('signInWithPassword', { data: { user: estado.usuario, session: { access_token: 'a', refresh_token: 'r' } }, error: null }),
      refreshSession: resposta('refreshSession', { data: { session: { access_token: 'a2', refresh_token: 'r2' }, user: estado.usuario }, error: null }),
      resend: resposta('resend', { error: null }),
      resetPasswordForEmail: resposta('resetPasswordForEmail', { data: {}, error: null }),
      updateUser: resposta('updateUser', { data: { user: estado.usuario }, error: null }),
      signOut: resposta('signOut', { error: null }),
      setSession: resposta('setSession', { data: { user: estado.usuario, session: {} }, error: null }),
      admin: {
        createUser: resposta('createUser', { data: { user: { id: 'sup-novo', app_metadata: {} } }, error: null }),
        deleteUser: resposta('deleteUser', { error: null }),
        updateUserById: resposta('updateUserById', { data: {}, error: null }),
        signOut: resposta('adminSignOut', { error: null }),
      },
    },
  };
  return { estado, cliente };
}

// Monta o roteador real num servidor Express real, trocando só banco, autenticação e Supabase.
export async function iniciarRota(arquivoRota, { usuario = { idUsuario: 1, perfil: 'ADMIN_SALAO' }, montagem = '/', extras = {}, analisarCorpo = true } = {}) {
  const banco = criarBancoFalso();
  const supabase = criarSupabaseFalso();
  const estado = { usuario, autenticado: true };

  jest.unstable_mockModule('../../src/configuracoes/bancoDeDados.js', () => ({ bancoDeDados: banco }));
  jest.unstable_mockModule('../../src/configuracoes/supabase.js', () => ({
    obterClienteSupabase: () => supabase.cliente,
    obterClienteAdministrativoSupabase: () => { if (supabase.estado.erroAdmin) throw new Error(supabase.estado.erroAdmin); return supabase.cliente; },
  }));
  jest.unstable_mockModule('../../src/servicos/autorizacaoUsuarios.js', () => ({
    autenticarRequisicao: async (requisicao, resposta) => {
      if (!estado.autenticado) { resposta.status(401).json({ mensagem: 'Sem sessão' }); return null; }
      return estado.usuario;
    },
  }));
  for (const [caminho, fabrica] of Object.entries(extras)) jest.unstable_mockModule(`../../src/${caminho}`, fabrica);

  const { default: roteador } = await import(`../../src/${arquivoRota}`);
  const aplicacao = express();
  if (analisarCorpo) aplicacao.use(express.json());
  aplicacao.use(montagem, roteador);
  const servidor = await new Promise((resolver) => { const s = aplicacao.listen(0, '127.0.0.1', () => resolver(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function chamar(metodo, caminho, corpo, cabecalhos = {}) {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo.toUpperCase(),
      headers: { 'content-type': 'application/json', authorization: 'Bearer token', ...cabecalhos },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* resposta não JSON (CSV, XLSX) */ }
    return { status: resposta.status, corpo: json, texto, cabecalhos: resposta.headers };
  }

  return {
    banco, supabase, estado, chamar,
    get: (caminho, cabecalhos) => chamar('GET', caminho, undefined, cabecalhos),
    post: (caminho, corpo, cabecalhos) => chamar('POST', caminho, corpo, cabecalhos),
    put: (caminho, corpo, cabecalhos) => chamar('PUT', caminho, corpo, cabecalhos),
    patch: (caminho, corpo, cabecalhos) => chamar('PATCH', caminho, corpo, cabecalhos),
    delete: (caminho, corpo, cabecalhos) => chamar('DELETE', caminho, corpo, cabecalhos),
    parar: () => new Promise((resolver) => servidor.close(resolver)),
  };
}

export function silenciarConsole() {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
}

// Registra só o banco falso (para testar serviços sem rotas).
export function mockarBanco() {
  const banco = criarBancoFalso();
  jest.unstable_mockModule('../../src/configuracoes/bancoDeDados.js', () => ({ bancoDeDados: banco }));
  return banco;
}

export const amanha = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Cenário em que o serviço 1 da unidade 5 pode ser reservado amanhã das 08:00 às 18:00 com a profissional 9.
export function agendaDisponivel(banco, extra = {}) {
  const servico = {
    idServico: 1, idUnidade: 5, nomeServico: 'Corte', valorServico: '50.00', idSalao: 1, duracaoMinutos: 30,
    promocaoTipo: null, promocaoValor: null, promocaoHabilitada: null, promocaoInicio: null, promocaoFim: null,
    idFuncionario: 9, nomeFuncionario: 'Ana', ...extra,
  };
  banco.responder(/FROM tb_servico s\s+INNER JOIN tb_funcionario_servico fs ON fs.fk_servico = s.id_servico/, [servico]);
  banco.responder(/FROM tb_horario_unidade/, [{ inicio: '08:00:00', fim: '18:00:00' }]);
  banco.responder(/FROM tb_disponibilidade_funcionario/, [{ inicio: '08:00:00', fim: '18:00:00' }]);
  return servico;
}
