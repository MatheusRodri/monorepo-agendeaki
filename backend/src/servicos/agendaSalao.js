import { QueryTypes, Transaction } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { incluirServicosAdicionais } from './agendamentos.js';
import { liberacaoConclusao, podeConcluirAgendamento } from './regrasTemporaisAgendamento.js';

const erroConsulta = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });
function deslocarData(data, dias) {
  const valor = new Date(`${data}T12:00:00Z`);
  valor.setUTCDate(valor.getUTCDate() + dias);
  return valor.toISOString().slice(0, 10);
}

export function normalizarConsultaAgenda(query, agora = new Date()) {
  const tipo = query.tipo ?? 'futuros';
  const periodo = query.periodo ?? 'todos';
  if (!['futuros', 'historico'].includes(tipo)) throw erroConsulta('Tipo de agenda inválido.');
  if (!['todos', 'hoje', 'amanha', '7dias'].includes(periodo)) throw erroConsulta('Período da agenda inválido.');
  const pagina = Number(query.pagina ?? 1);
  const porPagina = Number(query.porPagina ?? 10);
  if (!/^\d+$/.test(String(query.pagina ?? 1)) || !Number.isSafeInteger(pagina) || pagina < 1
    || !/^\d+$/.test(String(query.porPagina ?? 10)) || ![10, 25, 50].includes(porPagina)
    || !Number.isSafeInteger((pagina - 1) * porPagina)) throw erroConsulta('Paginação inválida.');
  const referencia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(agora);
  const hoje = referencia.slice(0, 10);
  return {
    tipo, periodo, pagina, porPagina, agora: referencia,
    inicioPeriodo: periodo === 'todos' ? null : `${deslocarData(hoje, periodo === 'amanha' ? 1 : 0)} 00:00:00`,
    fimPeriodo: periodo === 'todos' ? null : `${deslocarData(hoje, periodo === '7dias' ? 7 : periodo === 'amanha' ? 2 : 1)} 00:00:00`,
  };
}

export async function consultarAgendaSalao(idSalao, consulta) {
  const futuros = consulta.tipo === 'futuros';
  const condicao = `u.fk_salao = :idSalao AND (${futuros
    ? "a.dt_inicio >= :agora AND a.cd_status = 'AGENDADO'"
    : "a.dt_inicio < :agora OR a.cd_status IN ('REALIZADO', 'CANCELADO', 'NAO_COMPARECEU')"})${consulta.inicioPeriodo ? ' AND a.dt_inicio >= :inicioPeriodo AND a.dt_inicio < :fimPeriodo' : ''}`;
  const replacements = { ...consulta, idSalao };
  return bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
    const [contagem] = await bancoDeDados.query(`SELECT COUNT(*) AS total
      FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
      WHERE ${condicao}`, { replacements, type: QueryTypes.SELECT, transaction });
    const total = Number(contagem.total);
    const totalPaginas = Math.max(1, Math.ceil(total / consulta.porPagina));
    const pagina = Math.min(consulta.pagina, totalPaginas);
    const agendamentos = await bancoDeDados.query(`SELECT a.id_agendamento AS idAgendamento,
      a.fk_unidade AS idUnidade, a.fk_funcionario AS idFuncionario, a.dt_inicio AS dataHoraInicio,
      a.dt_fim AS dataHoraFim, a.cd_status AS status, a.nm_servico_agendado AS servico,
      a.vl_servico_agendado AS valor, a.ds_observacao AS observacao,
      COALESCE(c.nm_usuario, cs.nm_cliente) AS cliente, COALESCE(c.ds_email, cs.ds_email) AS emailCliente,
      COALESCE(c.nu_telefone, cs.nu_telefone) AS telefoneCliente, f.nm_funcionario AS funcionario,
      u.nm_unidade AS filial, COALESCE(p.cd_status_pagamento, 'PENDENTE') AS statusPagamento,
      CASE WHEN p.cd_status_pagamento = 'APROVADO' THEN TRUE ELSE FALSE END AS pago
      FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
      LEFT JOIN tb_usuario c ON c.id_usuario = a.fk_usuario
      LEFT JOIN tb_cliente_salao cs ON cs.id_cliente_salao = a.fk_cliente_salao
      INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario
      LEFT JOIN (SELECT p1.fk_agendamento, p1.cd_status_pagamento FROM tb_pagamento p1
        INNER JOIN (SELECT fk_agendamento, MAX(id_pagamento) AS idPagamento FROM tb_pagamento
          GROUP BY fk_agendamento) ultimo ON ultimo.idPagamento = p1.id_pagamento) p ON p.fk_agendamento = a.id_agendamento
      WHERE ${condicao} ORDER BY a.dt_inicio ${futuros ? 'ASC' : 'DESC'}, a.id_agendamento ${futuros ? 'ASC' : 'DESC'}
      LIMIT :limite OFFSET :offset`, {
      replacements: { ...replacements, limite: consulta.porPagina, offset: (pagina - 1) * consulta.porPagina },
      type: QueryTypes.SELECT, transaction,
    });
    const agora = new Date();
    const comPermissoes = agendamentos.map((agendamento) => ({ ...agendamento,
      podeConcluir: podeConcluirAgendamento(agendamento, agora),
      conclusaoDisponivelEm: liberacaoConclusao(agendamento.dataHoraInicio),
    }));
    return { agendamentos: await incluirServicosAdicionais(comPermissoes, { transaction }),
      pagina, porPagina: consulta.porPagina, total, totalPaginas, tipo: consulta.tipo, periodo: consulta.periodo };
  });
}
