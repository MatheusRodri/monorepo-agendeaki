import { filtroServicoSql, normalizarFiltrosPrecos } from './historicoPrecos.js';
import { QueryTypes, Transaction } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

const recortes = ['todos', 'agendamentos', 'realizados', 'extras', 'cancelados', 'naoCompareceu', 'comparecimento', 'previstos', 'taxaCancelamento'];
export const camposOrdenacao = ['idAgendamento', 'dataInicio', 'dataRealizacao', 'cliente', 'contato', 'servico', 'quantidadeServicosExtras', 'unidade', 'profissional', 'status', 'valor', 'tipoItem', 'statusPagamento', 'motivoCancelamento', 'origemCancelamento', 'promocaoAplicada', 'precoNormal', 'precoVigente', 'descontoPromocional', 'descontoAdicional', 'acrescimo'];
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
  const filtros = { idSalao, ...normalizarFiltrosPrecos(query) };
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

const filtroItem = filtroServicoSql();
export const contagemServicosExtrasSql = `(SELECT COUNT(*) FROM vw_servico_atendimento item
  WHERE item.id_agendamento = a.id_agendamento AND item.id_extra IS NOT NULL AND ${filtroItem})`;
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

// O ID do extra identifica o tipo sem depender da collation dos textos da view.
const tipoItemSql = "CASE WHEN item.id_extra IS NULL THEN 'ORIGINAL' ELSE 'EXTRA' END";
// A view usa zero para extras na ocupação; a tabela analítica exibe a duração histórica do fechamento.
const duracaoItemSql = 'CASE WHEN item.id_extra IS NULL THEN item.minutos_reservados ELSE extra.nu_duracao_minutos END';
const dataSql = (campo) => `DATE_FORMAT(a.${campo},'%Y-%m-%dT%H:%i:%s-03:00')`;
export const camposPrecosItemSql = `CASE WHEN item.st_promocao_aplicada IS NULL THEN 'NAO_INFORMADO'
    WHEN item.st_promocao_aplicada THEN 'COM' ELSE 'SEM' END AS promocaoAplicada,
  item.vl_preco_normal AS precoNormal, item.vl_preco_vigente AS precoVigente,
  item.desconto_promocional AS descontoPromocional, item.desconto_adicional AS descontoAdicional,
  item.acrescimo, (item.st_promocao_aplicada IS NULL) AS totaisParciais`;

function origemConsulta(consulta) {
  return consulta.visualizarPor === 'servico'
    ? `${origem} INNER JOIN vw_servico_atendimento item ON item.id_agendamento = a.id_agendamento
      LEFT JOIN tb_agendamento_servico_adicional extra ON extra.id_servico_adicional = item.id_extra`
    : origem;
}
function condicaoConsulta(consulta) {
  return `${condicao(consulta)}${consulta.visualizarPor === 'servico' ? ` AND ${filtroItem}${consulta.recorte === 'extras' ? " AND item.id_extra IS NOT NULL" : ''}` : ''}`;
}

function colunas(consulta) {
  const filtro = `${filtroItem}${consulta.recorte === 'extras' ? " AND item.id_extra IS NOT NULL" : ''}`;
  const soma = (campo) => `(SELECT SUM(item.${campo}) FROM vw_servico_atendimento item WHERE item.id_agendamento = a.id_agendamento AND ${filtro})`;
  const colunasItem = consulta.visualizarPor === 'servico'
    ? `item.fk_servico AS idServico, item.fk_funcionario AS idFuncionario, ${tipoItemSql} AS tipoItem, item.id_extra AS idExtra,
      CONCAT(${tipoItemSql}, ':', COALESCE(item.id_extra, a.id_agendamento)) AS idLinha,
      item.servico, item.profissional, item.valor, ${duracaoItemSql} AS duracaoMinutos,
      extra.ds_observacao_ajuste AS observacaoAjuste, ${camposPrecosItemSql}`
    : `(SELECT GROUP_CONCAT(item.servico ORDER BY item.servico SEPARATOR ' + ') FROM vw_servico_atendimento item WHERE item.id_agendamento = a.id_agendamento AND ${filtro}) AS servico,
      (SELECT GROUP_CONCAT(DISTINCT item.profissional ORDER BY item.profissional SEPARATOR ', ') FROM vw_servico_atendimento item WHERE item.id_agendamento = a.id_agendamento AND ${filtro}) AS profissional,
      ${soma('valor')} AS valor, ${soma('vl_preco_normal')} AS precoNormal, ${soma('vl_preco_vigente')} AS precoVigente,
      ${soma('desconto_promocional')} AS descontoPromocional, ${soma('desconto_adicional')} AS descontoAdicional, ${soma('acrescimo')} AS acrescimo,
      (SELECT CASE WHEN COUNT(item.st_promocao_aplicada) < COUNT(*) THEN 'NAO_INFORMADO'
        WHEN MIN(item.st_promocao_aplicada) <> MAX(item.st_promocao_aplicada) THEN 'MISTA'
        WHEN MAX(item.st_promocao_aplicada) = 1 THEN 'COM' ELSE 'SEM' END
        FROM vw_servico_atendimento item WHERE item.id_agendamento = a.id_agendamento AND ${filtro}) AS promocaoAplicada,
      (SELECT COUNT(*) > COUNT(item.st_promocao_aplicada) FROM vw_servico_atendimento item WHERE item.id_agendamento = a.id_agendamento AND ${filtro}) AS totaisParciais`;
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
  return `${consulta.ordenarPor} IS NULL ASC, ${consulta.ordenarPor} ${consulta.direcao.toUpperCase()}, idAgendamento DESC${consulta.visualizarPor === 'servico' ? ", (idExtra IS NOT NULL) ASC, idExtra ASC" : ''}`;
}

export function consultarLinhasAnaliticas(consulta, { limite, offset = 0, transaction } = {}) {
  return bancoDeDados.query(`SELECT analitico.* FROM (SELECT ${colunas(consulta)} ${origemConsulta(consulta)} WHERE ${condicaoConsulta(consulta)}) analitico ORDER BY ${ordenar(consulta)}${limite ? ' LIMIT :limite OFFSET :offset' : ''}`, {
    replacements: { ...consulta.filtros, limite, offset }, type: QueryTypes.SELECT, transaction,
  });
}

export async function consultarAnalitico(consulta) {
  return bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
    const contagemExtras = consulta.visualizarPor === 'servico' ? "CASE WHEN item.id_extra IS NOT NULL THEN 1 ELSE 0 END" : contagemServicosExtrasSql;
    const [contagem] = await bancoDeDados.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT a.id_agendamento) AS totalAtendimentos,
      COALESCE(SUM(${contagemExtras}),0) AS totalServicosExtras ${origemConsulta(consulta)} WHERE ${condicaoConsulta(consulta)}`, { replacements: consulta.filtros, type: QueryTypes.SELECT, transaction });
    const total = Number(contagem.total);
    const totalPaginas = Math.max(1, Math.ceil(total / consulta.porPagina));
    const pagina = Math.min(consulta.pagina, totalPaginas);
    const agendamentos = await consultarLinhasAnaliticas(consulta, { limite: consulta.porPagina, offset: (pagina - 1) * consulta.porPagina, transaction });
    let linhas = agendamentos;
    if (consulta.visualizarPor === 'atendimento' && agendamentos.length) {
      // Uma única consulta para compor a página inteira, no mesmo snapshot dos totais.
      const itens = await consultarItens(consulta, agendamentos.map((item) => item.idAgendamento), transaction);
      const porAtendimento = new Map(agendamentos.map((item) => [String(item.idAgendamento), []]));
      for (const item of itens) porAtendimento.get(String(item.idAgendamento))?.push(item);
      linhas = agendamentos.map((item) => ({ ...item, servicos: porAtendimento.get(String(item.idAgendamento)) }));
    }
    return { agendamentos: linhas, pagina, porPagina: consulta.porPagina, total, totalPaginas,
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
  ['status_pagamento', 'statusPagamento'], ['valor_item', 'valorItem'],
  ['promocao_aplicada', 'promocaoAplicada'], ['preco_normal', 'precoNormal'], ['preco_vigente', 'precoVigente'],
  ['desconto_promocional', 'descontoPromocional'], ['desconto_adicional', 'descontoAdicional'], ['acrescimo', 'acrescimo'],
  ['dados_parciais', 'totaisParciais'], ['motivo_cancelamento', 'motivoCancelamento'],
  ['detalhe_cancelamento', 'detalheCancelamento'], ['origem_cancelamento', 'origemCancelamento'],
  ['observacao_ajuste', 'observacaoAjuste'],
];
export function linhaCsv(valores) {
  return valores.map((valor) => {
    const texto = String(valor ?? '');
    const seguro = /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replaceAll('"', '""')}"`;
  }).join(';') + '\r\n';
}

export async function consultarItens(consulta, ids, transaction) {
  return bancoDeDados.query(`SELECT item.id_agendamento AS idAgendamento, ${tipoItemSql} AS tipoItem, item.id_extra AS idExtra,
    item.fk_servico AS idServico, item.fk_funcionario AS idFuncionario, item.servico AS nomeServico,
    item.profissional AS nomeFuncionario, item.valor AS valorItem, ${duracaoItemSql} AS duracaoMinutos,
    extra.ds_observacao_ajuste AS observacaoAjuste, ${camposPrecosItemSql}
    FROM vw_servico_atendimento item
    LEFT JOIN tb_agendamento_servico_adicional extra ON extra.id_servico_adicional = item.id_extra
    WHERE item.id_agendamento IN (:ids) AND ${filtroItem}
    ${consulta.recorte === 'extras' ? "AND item.id_extra IS NOT NULL" : ''}
    ORDER BY item.id_agendamento, (item.id_extra IS NOT NULL), item.id_extra`, {
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
        const linha = { ...item };
        for (const campo of ['valorItem', 'precoNormal', 'precoVigente', 'descontoPromocional', 'descontoAdicional', 'acrescimo']) {
          linha[campo] = item[campo] == null ? '' : Number(item[campo]).toFixed(2);
        }
        await escrever(linhaCsv(colunasExportacao.map(([, campo]) => linha[campo])));
      }
      if (lote.length < 500) break;
      offset += lote.length;
      lote = await consultarLinhasAnaliticas(consulta, { limite: 500, offset, transaction });
    }
  });
  resposta.end();
}
