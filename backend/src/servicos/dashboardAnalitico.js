import { QueryTypes, Transaction } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

const recortes = ['todos', 'agendamentos', 'realizados', 'extras', 'cancelados', 'naoCompareceu', 'comparecimento', 'previstos', 'taxaCancelamento'];
export const camposOrdenacao = ['idAgendamento', 'dataInicio', 'dataRealizacao', 'cliente', 'contato', 'servico', 'quantidadeServicosExtras', 'unidade', 'profissional', 'status', 'valor', 'tipoItem', 'statusPagamento', 'motivoCancelamento', 'origemCancelamento'];
const erroConsulta = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
const dataIso = (data) => {
  const valor = new Date(`${data}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && Number.isFinite(valor.getTime()) && valor.toISOString().slice(0, 10) === data;
};
function deslocar(data, dias) {
  const valor = new Date(`${data}T12:00:00Z`);
  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

export function normalizarConsultaAnalitica(query, idSalao, agora = new Date()) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  const filtros = { idSalao };
  for (const campo of ['idUnidade', 'idServico', 'idFuncionario']) {
    const valor = query[campo] ?? '';
    if (valor !== '' && (!/^\d+$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)))) throw erroConsulta(`Filtro ${campo} inválido.`);
    filtros[campo] = Number(valor) || 0;
  }
  for (const campo of ['dataInicio', 'dataFim']) {
    if (query[campo] && !dataIso(String(query[campo]))) throw erroConsulta('Informe datas válidas no formato AAAA-MM-DD.');
  }
  filtros.dataFim = query.dataFim || hoje;
  filtros.dataInicio = query.dataInicio || deslocar(filtros.dataFim, -29);
  if (filtros.dataInicio > filtros.dataFim) throw erroConsulta('A data inicial deve ser anterior ou igual à data final.');
  const recorte = query.recorte ?? 'todos';
  const visualizarPor = query.visualizarPor ?? 'atendimento';
  if (!['atendimento', 'servico'].includes(visualizarPor)) throw erroConsulta('Visualização inválida.');
  const ordenarPor = query.ordenarPor ?? 'dataInicio';
  const direcao = String(query.direcao ?? 'desc').toLowerCase();
  if ((ordenarPor === 'tipoItem' && visualizarPor !== 'servico') || !recortes.includes(recorte) || !camposOrdenacao.includes(ordenarPor) || !['asc', 'desc'].includes(direcao)) throw erroConsulta('Recorte ou ordenação inválidos.');
  const pagina = query.pagina ?? '1';
  const porPagina = Number(query.porPagina ?? 25);
  if (!/^\d+$/.test(String(pagina)) || !Number.isSafeInteger(Number(pagina)) || Number(pagina) < 1 || ![25, 50, 100].includes(porPagina)) throw erroConsulta('Paginação inválida.');
  // Uma referência fixa durante toda a consulta/exportação evita alterar a janela entre lotes.
  filtros.agora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(agora);
  return { filtros, recorte, visualizarPor, ordenarPor, direcao, pagina: Number(pagina), porPagina };
}

const filtroItem = '(:idServico = 0 OR item.fk_servico = :idServico) AND (:idFuncionario = 0 OR item.fk_funcionario = :idFuncionario)';
export const contagemServicosExtrasSql = `(SELECT COUNT(*) FROM tb_agendamento_servico_adicional item
  WHERE item.fk_agendamento = a.id_agendamento AND ${filtroItem})`;
const origem = `FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
  LEFT JOIN tb_usuario c ON c.id_usuario = a.fk_usuario
  LEFT JOIN tb_cliente_salao cs ON cs.id_cliente_salao = a.fk_cliente_salao`;

function condicao({ recorte }) {
  const datas = {
    todos: "DATE(CASE WHEN a.cd_status = 'CANCELADO' THEN COALESCE(a.dt_cancelamento,a.dt_inicio) ELSE a.dt_inicio END)",
    agendamentos: 'DATE(a.dt_inicio)', taxaCancelamento: 'DATE(a.dt_inicio)', realizados: 'DATE(a.dt_realizacao)', extras: 'DATE(a.dt_realizacao)',
    cancelados: 'DATE(COALESCE(a.dt_cancelamento,a.dt_inicio))', naoCompareceu: 'DATE(a.dt_inicio)', comparecimento: 'DATE(a.dt_inicio)',
  };
  const status = { realizados: 'REALIZADO', extras: 'REALIZADO', cancelados: 'CANCELADO', naoCompareceu: 'NAO_COMPARECEU' };
  const periodo = recorte === 'previstos'
    ? "a.cd_status = 'AGENDADO' AND a.dt_inicio >= :agora AND a.dt_inicio < DATE_ADD(:agora, INTERVAL 30 DAY)"
    : `${datas[recorte]} BETWEEN :dataInicio AND :dataFim${status[recorte] ? ` AND a.cd_status = '${status[recorte]}'` : ''}`;
  return `u.fk_salao = :idSalao AND (:idUnidade = 0 OR a.fk_unidade = :idUnidade)
    AND EXISTS (SELECT 1 FROM vw_servico_atendimento item WHERE item.id_agendamento = a.id_agendamento AND ${filtroItem})
    AND ${periodo}${recorte === 'taxaCancelamento' ? " AND (a.dt_inicio <= :agora OR a.cd_status='CANCELADO')" : ''}${recorte === 'comparecimento' ? " AND a.cd_status IN ('REALIZADO','NAO_COMPARECEU')" : ''}${recorte === 'extras' ? ` AND ${contagemServicosExtrasSql} > 0` : ''}`;
}

const dataSql = (campo) => `DATE_FORMAT(a.${campo},'%Y-%m-%dT%H:%i:%s-03:00')`;
const itensServicos = `(SELECT a.id_agendamento, a.fk_servico, a.fk_funcionario,
  a.nm_servico_agendado AS servico, f.nm_funcionario AS profissional, a.vl_servico_agendado AS valor,
  'ORIGINAL' AS tipoItem, NULL AS idExtra
  FROM tb_agendamento a INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario
  UNION ALL SELECT e.fk_agendamento, e.fk_servico, e.fk_funcionario, e.nm_servico, e.nm_funcionario,
  e.vl_cobrado, 'EXTRA', e.id_servico_adicional FROM tb_agendamento_servico_adicional e)`;

function origemConsulta(consulta) {
  return consulta.visualizarPor === 'servico'
    ? `${origem} INNER JOIN ${itensServicos} item ON item.id_agendamento = a.id_agendamento`
    : origem;
}
function condicaoConsulta(consulta) {
  return `${condicao(consulta)}${consulta.visualizarPor === 'servico' ? ` AND ${filtroItem}${consulta.recorte === 'extras' ? " AND item.tipoItem = 'EXTRA'" : ''}` : ''}`;
}

function colunas(consulta) {
  const fonteItem = consulta.recorte === 'extras'
    ? '(SELECT fk_agendamento AS id_agendamento, fk_servico, fk_funcionario, nm_servico AS servico, vl_cobrado AS valor FROM tb_agendamento_servico_adicional)'
    : 'vw_servico_atendimento';
  const colunasItem = consulta.visualizarPor === 'servico'
    ? `item.fk_servico AS idServico, item.fk_funcionario AS idFuncionario, item.tipoItem, item.idExtra,
      CONCAT(item.tipoItem, ':', CASE WHEN item.tipoItem = 'ORIGINAL' THEN a.id_agendamento ELSE item.idExtra END) AS idLinha,
      item.servico, item.profissional, item.valor`
    : `(SELECT GROUP_CONCAT(item.servico ORDER BY item.servico SEPARATOR ' + ') FROM ${fonteItem} item WHERE item.id_agendamento = a.id_agendamento AND ${filtroItem}) AS servico,
      (SELECT GROUP_CONCAT(DISTINCT f.nm_funcionario ORDER BY f.nm_funcionario SEPARATOR ', ') FROM ${fonteItem} item INNER JOIN tb_funcionario f ON f.id_funcionario = item.fk_funcionario WHERE item.id_agendamento = a.id_agendamento AND ${filtroItem}) AS profissional,
      (SELECT SUM(item.valor) FROM ${fonteItem} item WHERE item.id_agendamento = a.id_agendamento AND ${filtroItem}) AS valor`;
  return `a.id_agendamento AS idAgendamento, a.fk_usuario AS idUsuario, a.fk_cliente_salao AS idClienteSalao,
  a.fk_unidade AS idUnidade, ${dataSql('dt_inicio')} AS dataInicio, ${dataSql('dt_fim')} AS dataFim,
  ${dataSql('dt_realizacao')} AS dataRealizacao, ${dataSql('dt_cancelamento')} AS dataCancelamento,
  COALESCE(c.nm_usuario,cs.nm_cliente,'Cliente sem identificação') AS cliente,
  COALESCE(c.ds_email,cs.ds_email) AS email, COALESCE(c.nu_telefone,cs.nu_telefone) AS telefone,
  COALESCE(NULLIF(c.ds_email,''),NULLIF(cs.ds_email,''),c.nu_telefone,cs.nu_telefone) AS contato,
  u.nm_unidade AS unidade, ${colunasItem},
  CAST(a.cd_status AS CHAR) AS status, ${contagemServicosExtrasSql} AS quantidadeServicosExtras,
  (SELECT CAST(p.cd_status_pagamento AS CHAR) FROM tb_pagamento p WHERE p.fk_agendamento = a.id_agendamento ORDER BY p.dt_criacao DESC,p.id_pagamento DESC LIMIT 1) AS statusPagamento,
  CASE a.cd_motivo_cancelamento
    WHEN 'BLOQUEIO_AGENDA' THEN 'Bloqueio da agenda' WHEN 'INDISPONIBILIDADE_PROFISSIONAL' THEN 'Indisponibilidade do profissional'
    WHEN 'SOLICITACAO_CLIENTE' THEN 'Solicitação do cliente' WHEN 'PROBLEMA_UNIDADE' THEN 'Problema na unidade'
    WHEN 'ERRO_AGENDAMENTO' THEN 'Erro no agendamento' WHEN 'OUTRO' THEN 'Outro motivo' ELSE NULL END AS motivoCancelamento,
  a.ds_motivo_cancelamento AS detalheCancelamento, CAST(a.cd_origem_cancelamento AS CHAR) AS origemCancelamento`;
}

function ordenar(consulta) {
  // Os identificadores vêm exclusivamente da lista fechada validada na entrada.
  return `${consulta.ordenarPor} IS NULL ASC, ${consulta.ordenarPor} ${consulta.direcao.toUpperCase()}, idAgendamento DESC${consulta.visualizarPor === 'servico' ? ", (tipoItem = 'EXTRA') ASC, idExtra ASC" : ''}`;
}

export function consultarLinhasAnaliticas(consulta, { limite, offset = 0, transaction } = {}) {
  return bancoDeDados.query(`SELECT analitico.* FROM (SELECT ${colunas(consulta)} ${origemConsulta(consulta)} WHERE ${condicaoConsulta(consulta)}) analitico ORDER BY ${ordenar(consulta)}${limite ? ' LIMIT :limite OFFSET :offset' : ''}`, {
    replacements: { ...consulta.filtros, limite, offset }, type: QueryTypes.SELECT, transaction,
  });
}

export async function consultarAnalitico(consulta) {
  return bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
    const contagemExtras = consulta.visualizarPor === 'servico' ? "CASE WHEN item.tipoItem = 'EXTRA' THEN 1 ELSE 0 END" : contagemServicosExtrasSql;
    const [contagem] = await bancoDeDados.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT a.id_agendamento) AS totalAtendimentos,
      COALESCE(SUM(${contagemExtras}),0) AS totalServicosExtras ${origemConsulta(consulta)} WHERE ${condicaoConsulta(consulta)}`, { replacements: consulta.filtros, type: QueryTypes.SELECT, transaction });
    const total = Number(contagem.total);
    const totalPaginas = Math.max(1, Math.ceil(total / consulta.porPagina));
    const pagina = Math.min(consulta.pagina, totalPaginas);
    const agendamentos = await consultarLinhasAnaliticas(consulta, { limite: consulta.porPagina, offset: (pagina - 1) * consulta.porPagina, transaction });
    return { agendamentos, pagina, porPagina: consulta.porPagina, total, totalPaginas,
      totalAtendimentos: Number(contagem.totalAtendimentos ?? total), totalServicosExtras: Number(contagem.totalServicosExtras ?? 0),
      recorte: consulta.recorte, visualizarPor: consulta.visualizarPor };
  });
}

export const colunasExportacao = [
  ['id_agendamento', 'idAgendamento'], ['tipo_item', 'tipoItem'], ['id_servico_adicional', 'idExtra'],
  ['id_usuario', 'idUsuario'], ['id_cliente_salao', 'idClienteSalao'], ['cliente', 'cliente'], ['email', 'email'], ['telefone', 'telefone'],
  ['id_unidade', 'idUnidade'], ['unidade', 'unidade'], ['id_servico', 'idServico'], ['servico', 'nomeServico'],
  ['id_funcionario', 'idFuncionario'], ['profissional', 'nomeFuncionario'], ['data_agendada', 'dataInicio'],
  ['data_realizacao', 'dataRealizacao'], ['data_cancelamento', 'dataCancelamento'], ['status', 'status'],
  ['status_pagamento', 'statusPagamento'], ['valor_item', 'valorItem'], ['motivo_cancelamento', 'motivoCancelamento'],
  ['detalhe_cancelamento', 'detalheCancelamento'], ['origem_cancelamento', 'origemCancelamento'],
];
export function linhaCsv(valores) {
  return valores.map((valor) => {
    const texto = String(valor ?? '');
    const seguro = /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replaceAll('"', '""')}"`;
  }).join(';') + '\r\n';
}

export async function consultarItens(consulta, ids, transaction) {
  return bancoDeDados.query(`SELECT item.* FROM (
    SELECT a.id_agendamento AS idAgendamento, 'ORIGINAL' AS tipoItem, NULL AS idExtra,
      a.fk_servico AS idServico, a.nm_servico_agendado AS nomeServico, a.fk_funcionario AS idFuncionario,
      f.nm_funcionario AS nomeFuncionario, a.vl_servico_agendado AS valorItem
      FROM tb_agendamento a INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario WHERE a.id_agendamento IN (:ids)
    UNION ALL
    SELECT e.fk_agendamento, 'EXTRA', e.id_servico_adicional, e.fk_servico, e.nm_servico, e.fk_funcionario, e.nm_funcionario, e.vl_cobrado
      FROM tb_agendamento_servico_adicional e WHERE e.fk_agendamento IN (:ids)
    ) item WHERE (:idServico = 0 OR item.idServico = :idServico) AND (:idFuncionario = 0 OR item.idFuncionario = :idFuncionario)
    ${consulta.recorte === 'extras' ? "AND item.tipoItem = 'EXTRA'" : ''}
    ORDER BY item.idAgendamento, (item.tipoItem = 'EXTRA'), item.idExtra`, {
    replacements: { ...consulta.filtros, ids }, type: QueryTypes.SELECT, transaction,
  });
}

export async function prepararLinhasExportacao(consulta, lote, transaction) {
  if (consulta.visualizarPor === 'servico') return lote.map((linha) => ({ ...linha, nomeServico: linha.servico, nomeFuncionario: linha.profissional, valorItem: linha.valor }));
  const itens = await consultarItens(consulta, lote.map((item) => item.idAgendamento), transaction);
  const porAgendamento = new Map();
  for (const item of itens) {
    const chave = String(item.idAgendamento);
    if (!porAgendamento.has(chave)) porAgendamento.set(chave, []);
    porAgendamento.get(chave).push(item);
  }
  return lote.flatMap((agendamento) => (porAgendamento.get(String(agendamento.idAgendamento)) ?? []).map((item) => ({ ...agendamento, ...item })));
}

export async function exportarAnaliticoCsv(consulta, resposta) {
  await bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
    async function escrever(texto) {
      if (resposta.destroyed) throw new Error('Exportação interrompida.');
      if (!resposta.write(texto)) await new Promise((resolve, reject) => {
        const limpar = () => { resposta.off('drain', pronto); resposta.off('close', fechado); resposta.off('error', falha); };
        const pronto = () => { limpar(); resolve(); };
        const falha = (erro) => { limpar(); reject(erro); };
        const fechado = () => falha(new Error('Exportação interrompida.'));
        resposta.once('drain', pronto); resposta.once('close', fechado); resposta.once('error', falha);
      });
    }
    // Consulta o primeiro lote antes de enviar cabeçalhos, permitindo responder erros em JSON.
    let offset = 0;
    let lote = await consultarLinhasAnaliticas(consulta, { limite: 500, offset, transaction });
    resposta.setHeader('Content-Type', 'text/csv; charset=utf-8');
    resposta.setHeader('Content-Disposition', `attachment; filename="analitico-bi-${consulta.filtros.dataInicio}-${consulta.filtros.dataFim}.csv"`);
    await escrever('\uFEFF' + linhaCsv(colunasExportacao.map(([nome]) => nome)));
    while (lote.length) {
      const linhas = await prepararLinhasExportacao(consulta, lote, transaction);
      for (const item of linhas) {
        const linha = { ...item, valorItem: Number(item.valorItem).toFixed(2) };
        await escrever(linhaCsv(colunasExportacao.map(([, campo]) => linha[campo])));
      }
      if (lote.length < 500) break;
      offset += lote.length;
      lote = await consultarLinhasAnaliticas(consulta, { limite: 500, offset, transaction });
    }
  });
  resposta.end();
}
