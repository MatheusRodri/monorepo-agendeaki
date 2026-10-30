import { Router } from 'express';
import { compararSeguramente, sessoesAdmin } from '../servicos/sessoesAdmin.js';
import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

const roteadorAdmin = Router();
function tokenBearer(requisicao) {
  const cabecalho = requisicao.headers.authorization;
  return cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
}

async function obterAdmin(requisicao, resposta) {
  try {
    const sessao = await sessoesAdmin.validar(tokenBearer(requisicao));
    if (!sessao) { resposta.status(401).json({ mensagem: 'A sessão administrativa é inválida ou expirou. Entre novamente.' }); return null; }
    return { nome: process.env.ADMIN_NAME?.trim() || 'Administrador', email: sessao.email };
  } catch {
    resposta.status(503).json({ mensagem: 'Não foi possível validar a sessão administrativa agora.' }); return null;
  }
}

function periodo12Meses() {
  const hoje = new Date();
  const inicioMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 11, 1));
  return {
    inicio: `${inicioMes.getUTCFullYear()}-${String(inicioMes.getUTCMonth() + 1).padStart(2, '0')}-01`,
    meses: Array.from({ length: 12 }, (_, indice) => {
      const data = new Date(Date.UTC(inicioMes.getUTCFullYear(), inicioMes.getUTCMonth() + indice, 1));
      const chave = `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
      return { mes: chave.slice(0, 7), clientes: 0, saloes: 0, receitaCentavos: 0 };
    }),
  };
}

async function obterResumo() {
  const [usuarios, saloes, assinaturas, faturas] = await Promise.all([
    bancoDeDados.query(
      `SELECT COUNT(*) AS total, SUM(st_ativo=TRUE) AS ativos
       FROM tb_usuario WHERE tp_usuario='CLIENTE'`,
      { type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT COUNT(*) AS total, SUM(st_ativo=TRUE) AS ativos FROM tb_salao`,
      { type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT
         SUM(cd_status IN ('AUTORIZADA','CANCELAMENTO_AGENDADO')) AS assinaturasAtivas,
         SUM(cd_status='EM_TESTE') AS emTeste,
         SUM(cd_status='PAGAMENTO_PENDENTE') AS pagamentoPendente,
         COALESCE(SUM(CASE
           WHEN cd_status IN ('AUTORIZADA','CANCELAMENTO_AGENDADO')
             THEN CASE WHEN cd_periodicidade='ANUAL' THEN vl_assinatura / 12 ELSE vl_assinatura END
           ELSE 0 END),0) AS mrrEstimado
       FROM tb_assinatura_salao`,
      { type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(vl_pago_centavos),0) AS receitaCentavos
       FROM tb_fatura_assinatura_salao WHERE cd_status='paid' AND dt_pago IS NOT NULL`,
      { type: QueryTypes.SELECT },
    ),
  ]);
  return {
    clientes: { total: Number(usuarios[0].total ?? 0), ativos: Number(usuarios[0].ativos ?? 0) },
    saloes: { total: Number(saloes[0].total ?? 0), ativos: Number(saloes[0].ativos ?? 0) },
    assinaturas: {
      ativas: Number(assinaturas[0].assinaturasAtivas ?? 0),
      emTeste: Number(assinaturas[0].emTeste ?? 0),
      pagamentoPendente: Number(assinaturas[0].pagamentoPendente ?? 0),
    },
    mrrEstimado: Number(assinaturas[0].mrrEstimado ?? 0),
    faturasPagas: Number(faturas[0].quantidade ?? 0),
    receitaConfirmada: Number(faturas[0].receitaCentavos ?? 0) / 100,
  };
}

async function obterSerieMensal() {
  const periodo = periodo12Meses();
  const [clientes, saloes, faturas] = await Promise.all([
    bancoDeDados.query(
      `SELECT DATE_FORMAT(dt_criacao, '%Y-%m-01') AS mes, COUNT(*) AS total
       FROM tb_usuario
       WHERE tp_usuario='CLIENTE' AND dt_criacao >= :inicio
       GROUP BY mes`,
      { replacements: { inicio: periodo.inicio }, type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT DATE_FORMAT(dt_criacao, '%Y-%m-01') AS mes, COUNT(*) AS total
       FROM tb_salao WHERE dt_criacao >= :inicio GROUP BY mes`,
      { replacements: { inicio: periodo.inicio }, type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT DATE_FORMAT(dt_pago, '%Y-%m-01') AS mes, SUM(vl_pago_centavos) AS total
       FROM tb_fatura_assinatura_salao
       WHERE cd_status='paid' AND dt_pago IS NOT NULL AND dt_pago >= :inicio
       GROUP BY mes`,
      { replacements: { inicio: periodo.inicio }, type: QueryTypes.SELECT },
    ),
  ]);
  const porMes = new Map(periodo.meses.map((item) => [item.mes, item]));
  clientes.forEach(({ mes, total }) => { const item = porMes.get(String(mes).slice(0, 7)); if (item) item.clientes = Number(total); });
  saloes.forEach(({ mes, total }) => { const item = porMes.get(String(mes).slice(0, 7)); if (item) item.saloes = Number(total); });
  faturas.forEach(({ mes, total }) => { const item = porMes.get(String(mes).slice(0, 7)); if (item) item.receitaCentavos = Number(total); });
  return periodo.meses.map((item) => ({ ...item, receita: item.receitaCentavos / 100 }));
}

function parametrosLista(requisicao) {
  const pagina = Math.max(1, Number.parseInt(requisicao.query.pagina, 10) || 1);
  const limite = Math.min(50, Math.max(1, Number.parseInt(requisicao.query.limite, 10) || 20));
  const busca = String(requisicao.query.busca ?? '').trim().slice(0, 100);
  return { pagina, limite, busca, deslocamento: (pagina - 1) * limite };
}

async function responderLista(resposta, { consulta, replacements, contagem, replacementsContagem, pagina, limite, deslocamento }) {
  const [itens, totais] = await Promise.all([
    bancoDeDados.query(consulta, { replacements: { ...replacements, limite, deslocamento }, type: QueryTypes.SELECT }),
    bancoDeDados.query(contagem, { replacements: replacementsContagem, type: QueryTypes.SELECT }),
  ]);
  const total = Number(totais[0]?.total ?? 0);
  resposta.status(200).json({ itens, pagina, limite, total, totalPaginas: Math.ceil(total / limite) });
}

roteadorAdmin.post('/login', async (requisicao, resposta) => {
  const emailConfigurado = process.env.ADMIN_EMAIL?.trim();
  const senhaConfigurada = process.env.ADMIN_PASSWORD;
  const configurado = sessoesAdmin.configurado();
  if (!configurado) {
    resposta.status(503).json({ mensagem: 'O acesso administrativo ainda não foi configurado no backend.' });
    return;
  }

  const emailRecebido = String(requisicao.body?.email ?? '').trim();
  const senhaRecebida = String(requisicao.body?.senha ?? '');
  if (!compararSeguramente(emailRecebido.toLowerCase(), emailConfigurado.toLowerCase())
    || !compararSeguramente(senhaRecebida, senhaConfigurada)) {
    resposta.status(401).json({ mensagem: 'E-mail ou senha inválidos.' });
    return;
  }

  const email = emailConfigurado;
  let tokenAcesso;
  try { tokenAcesso = await sessoesAdmin.criar(email); }
  catch { resposta.status(503).json({ mensagem: 'Não foi possível iniciar a sessão administrativa.' }); return; }
  resposta.status(200).json({
    tokenAcesso,
    tokenAtualizacao: null,
    usuario: { nome: process.env.ADMIN_NAME?.trim() || 'Administrador', email },
  });
});

roteadorAdmin.post('/logout', async (requisicao, resposta) => {
  try {
    if (!await sessoesAdmin.revogar(tokenBearer(requisicao))) { resposta.status(401).json({ mensagem: 'Sessão inválida ou expirada.' }); return; }
    resposta.status(200).json({ mensagem: 'Sessão encerrada.' });
  } catch { resposta.status(503).json({ mensagem: 'Não foi possível confirmar o encerramento da sessão.' }); }
});

roteadorAdmin.get('/perfil', async (requisicao, resposta) => {
  const admin = await obterAdmin(requisicao, resposta);
  if (admin) resposta.status(200).json({ perfil: admin });
});

roteadorAdmin.get('/dashboard', async (requisicao, resposta) => {
  if (!await obterAdmin(requisicao, resposta)) return;
  try {
    const [resumo, serieMensal, ultimosSaloes, faturasRecentes] = await Promise.all([
      obterResumo(),
      obterSerieMensal(),
      bancoDeDados.query(
        `SELECT s.id_salao AS idSalao, s.nm_salao AS nome, s.st_ativo AS ativo,
                s.dt_criacao AS criadoEm, u.ds_email AS emailResponsavel
         FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario=s.fk_usuario_administrador
         ORDER BY s.dt_criacao DESC, s.id_salao DESC LIMIT 8`,
        { type: QueryTypes.SELECT },
      ),
      bancoDeDados.query(
        `SELECT f.id_fatura_provedor AS id, s.nm_salao AS salao,
                f.vl_pago_centavos / 100 AS valor, f.ds_moeda AS moeda, f.dt_pago AS pagoEm
         FROM tb_fatura_assinatura_salao f INNER JOIN tb_salao s ON s.id_salao=f.fk_salao
         WHERE f.cd_status='paid' AND f.dt_pago IS NOT NULL
         ORDER BY f.dt_pago DESC, f.id_fatura_salao DESC LIMIT 8`,
        { type: QueryTypes.SELECT },
      ),
    ]);
    resposta.status(200).json({ resumo, serieMensal, ultimosSaloes, faturasRecentes });
  } catch (erro) {
    console.error('[Admin] Falha ao carregar painel.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar o painel administrativo.' });
  }
});

roteadorAdmin.get('/clientes', async (requisicao, resposta) => {
  if (!await obterAdmin(requisicao, resposta)) return;
  const parametros = parametrosLista(requisicao);
  const termo = `%${parametros.busca}%`;
  const filtro = parametros.busca ? 'AND (u.nm_usuario LIKE :termo OR u.ds_email LIKE :termo)' : '';
  try {
    await responderLista(resposta, {
      ...parametros,
      consulta: `SELECT u.id_usuario AS id, u.nm_usuario AS nome, u.ds_email AS email,
                        u.st_ativo AS ativo, u.dt_criacao AS criadoEm
                 FROM tb_usuario u WHERE u.tp_usuario='CLIENTE' ${filtro}
                 ORDER BY u.dt_criacao DESC, u.id_usuario DESC LIMIT :limite OFFSET :deslocamento`,
      replacements: { termo }, replacementsContagem: { termo },
      contagem: `SELECT COUNT(*) AS total FROM tb_usuario u WHERE u.tp_usuario='CLIENTE' ${filtro}`,
    });
  } catch (erro) {
    console.error('[Admin] Falha ao listar clientes.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar os clientes.' });
  }
});

roteadorAdmin.get('/saloes', async (requisicao, resposta) => {
  if (!await obterAdmin(requisicao, resposta)) return;
  const parametros = parametrosLista(requisicao);
  const termo = `%${parametros.busca}%`;
  const filtro = parametros.busca ? 'AND (s.nm_salao LIKE :termo OR u.nm_usuario LIKE :termo OR u.ds_email LIKE :termo)' : '';
  try {
    await responderLista(resposta, {
      ...parametros,
      consulta: `SELECT s.id_salao AS id, s.nm_salao AS nome, u.nm_usuario AS responsavel,
                        u.ds_email AS emailResponsavel, s.st_ativo AS ativo, s.dt_criacao AS criadoEm,
                        (SELECT COUNT(*) FROM tb_unidade un WHERE un.fk_salao=s.id_salao AND un.st_ativo=TRUE) AS unidadesAtivas
                 FROM tb_salao s INNER JOIN tb_usuario u ON u.id_usuario=s.fk_usuario_administrador
                 WHERE 1=1 ${filtro}
                 ORDER BY s.dt_criacao DESC, s.id_salao DESC LIMIT :limite OFFSET :deslocamento`,
      replacements: { termo }, replacementsContagem: { termo },
      contagem: `SELECT COUNT(*) AS total FROM tb_salao s
                 INNER JOIN tb_usuario u ON u.id_usuario=s.fk_usuario_administrador WHERE 1=1 ${filtro}`,
    });
  } catch (erro) {
    console.error('[Admin] Falha ao listar salões.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar os salões.' });
  }
});

roteadorAdmin.get('/unidades', async (requisicao, resposta) => {
  if (!await obterAdmin(requisicao, resposta)) return;
  const parametros = parametrosLista(requisicao);
  const termo = `%${parametros.busca}%`;
  const filtro = parametros.busca
    ? `AND (un.nm_unidade LIKE :termo OR s.nm_salao LIKE :termo
            OR un.ds_municipio LIKE :termo OR un.ds_bairro LIKE :termo)`
    : '';
  try {
    await responderLista(resposta, {
      ...parametros,
      consulta: `SELECT un.id_unidade AS id, un.nm_unidade AS nome, s.nm_salao AS salao,
                        CONCAT(un.ds_rua, ', ', un.nu_endereco,
                          CASE WHEN un.ds_complemento IS NULL OR un.ds_complemento='' THEN '' ELSE CONCAT(' - ', un.ds_complemento) END,
                          ' - ', un.ds_bairro) AS endereco,
                        CONCAT(un.ds_municipio, '/', un.ds_estado) AS cidade,
                        un.tp_categoria AS categoria, un.st_ativo AS ativo, un.dt_criacao AS criadoEm
                 FROM tb_unidade un INNER JOIN tb_salao s ON s.id_salao=un.fk_salao
                 WHERE 1=1 ${filtro}
                 ORDER BY un.dt_criacao DESC, un.id_unidade DESC LIMIT :limite OFFSET :deslocamento`,
      replacements: { termo }, replacementsContagem: { termo },
      contagem: `SELECT COUNT(*) AS total FROM tb_unidade un
                 INNER JOIN tb_salao s ON s.id_salao=un.fk_salao WHERE 1=1 ${filtro}`,
    });
  } catch (erro) {
    console.error('[Admin] Falha ao listar unidades.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar as unidades.' });
  }
});

roteadorAdmin.get('/assinaturas', async (requisicao, resposta) => {
  if (!await obterAdmin(requisicao, resposta)) return;
  const parametros = parametrosLista(requisicao);
  const termo = `%${parametros.busca}%`;
  const filtro = parametros.busca ? 'AND (s.nm_salao LIKE :termo OR u.ds_email LIKE :termo OR a.cd_status LIKE :termo)' : '';
  try {
    await responderLista(resposta, {
      ...parametros,
      consulta: `SELECT a.id_assinatura_salao AS id, s.nm_salao AS salao,
                        u.ds_email AS emailResponsavel, a.cd_periodicidade AS periodicidade,
                        a.cd_status AS status, a.vl_assinatura AS valor, a.dt_inicio AS inicio,
                        a.dt_proxima_cobranca AS proximaCobranca, a.dt_atualizacao AS atualizadoEm
                 FROM tb_assinatura_salao a INNER JOIN tb_salao s ON s.id_salao=a.fk_salao
                 INNER JOIN tb_usuario u ON u.id_usuario=s.fk_usuario_administrador
                 WHERE 1=1 ${filtro}
                 ORDER BY a.dt_atualizacao DESC, a.id_assinatura_salao DESC LIMIT :limite OFFSET :deslocamento`,
      replacements: { termo }, replacementsContagem: { termo },
      contagem: `SELECT COUNT(*) AS total FROM tb_assinatura_salao a
                 INNER JOIN tb_salao s ON s.id_salao=a.fk_salao
                 INNER JOIN tb_usuario u ON u.id_usuario=s.fk_usuario_administrador WHERE 1=1 ${filtro}`,
    });
  } catch (erro) {
    console.error('[Admin] Falha ao listar assinaturas.', { mensagem: erro.message });
    resposta.status(500).json({ mensagem: 'Não foi possível carregar as assinaturas.' });
  }
});

export default roteadorAdmin;
