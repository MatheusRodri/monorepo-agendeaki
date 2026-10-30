import { QueryTypes, Transaction } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { incluirServicosAdicionais } from './agendamentos.js';
import { podeAvaliarAgendamento } from './regrasTemporaisAgendamento.js';

const erroConsulta = () => Object.assign(new Error('Paginação inválida.'), { status: 400 });

export function normalizarPaginacaoCliente(query) {
  const paginaTexto = String(query.pagina ?? '1');
  const porPaginaTexto = String(query.porPagina ?? '10');
  const localizarTexto = query.localizar == null ? '' : String(query.localizar);
  const pagina = Number(paginaTexto);
  const porPagina = Number(porPaginaTexto);
  const localizar = localizarTexto ? Number(localizarTexto) : null;
  if (!/^\d+$/.test(paginaTexto) || !Number.isSafeInteger(pagina) || pagina < 1
    || !/^\d+$/.test(porPaginaTexto) || ![10, 25, 50].includes(porPagina)
    || !Number.isSafeInteger((pagina - 1) * porPagina)
    || (localizarTexto && (!/^\d+$/.test(localizarTexto) || !Number.isSafeInteger(localizar) || localizar < 1))) {
    throw erroConsulta();
  }
  return { pagina, porPagina, localizar };
}

export async function consultarAgendamentosCliente(idUsuario, tipoListagem, consulta) {
  const futuros = tipoListagem === 'futuros';
  const condicao = `a.fk_usuario = :idUsuario AND (${futuros
    ? "a.dt_inicio >= :agora AND a.cd_status = 'AGENDADO'"
    : "a.dt_inicio < :agora OR a.cd_status IN ('REALIZADO', 'CANCELADO', 'NAO_COMPARECEU')"})`;
  const referencia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
  const replacements = { ...consulta, idUsuario, agora: referencia };
  return bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
    const [contagem] = await bancoDeDados.query(`SELECT COUNT(*) AS total FROM tb_agendamento a WHERE ${condicao}`,
      { replacements, type: QueryTypes.SELECT, transaction });
    const total = Number(contagem.total);
    const totalPaginas = Math.max(1, Math.ceil(total / consulta.porPagina));
    let pagina = Math.min(consulta.pagina, totalPaginas);
    let localizado = false;
    if (consulta.localizar && !futuros) {
      const [alvo] = await bancoDeDados.query(`SELECT a.dt_inicio AS inicio FROM tb_agendamento a
        WHERE ${condicao} AND a.id_agendamento = :localizar LIMIT 1`, {
        replacements, type: QueryTypes.SELECT, transaction,
      });
      if (alvo) {
        const [anteriores] = await bancoDeDados.query(`SELECT COUNT(*) AS total FROM tb_agendamento a
          WHERE ${condicao} AND (a.dt_inicio > :inicioAlvo OR (a.dt_inicio = :inicioAlvo AND a.id_agendamento > :localizar))`, {
          replacements: { ...replacements, inicioAlvo: alvo.inicio }, type: QueryTypes.SELECT, transaction,
        });
        pagina = Math.floor(Number(anteriores.total) / consulta.porPagina) + 1;
        localizado = true;
      }
    }
    const direcao = futuros ? 'ASC' : 'DESC';
    const agendamentos = await bancoDeDados.query(`SELECT a.id_agendamento AS idAgendamento,
      a.fk_unidade AS idUnidade, a.fk_servico AS idServico, a.fk_funcionario AS idFuncionario,
      a.dt_inicio AS dataHoraInicio, a.dt_fim AS dataHoraFim, a.nm_servico_agendado AS servico,
      a.vl_servico_agendado AS valor, a.ds_observacao AS observacao,
      a.ds_motivo_cancelamento AS motivoCancelamento, a.cd_status AS status,
      av.id_avaliacao AS idAvaliacao,
      f.nm_funcionario AS profissional, s.nm_salao AS salao, u.nm_unidade AS unidade,
      u.ds_municipio AS municipio
      FROM tb_agendamento a INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario
      INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
      INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
      LEFT JOIN tb_avaliacao av ON av.fk_agendamento = a.id_agendamento
      WHERE ${condicao} ORDER BY a.dt_inicio ${direcao}, a.id_agendamento ${direcao}
      LIMIT :limite OFFSET :offset`, {
      replacements: { ...replacements, limite: consulta.porPagina, offset: (pagina - 1) * consulta.porPagina },
      type: QueryTypes.SELECT, transaction,
    });
    const agora = new Date();
    const comPermissoes = agendamentos.map((agendamento) => ({ ...agendamento, podeAvaliar: podeAvaliarAgendamento(agendamento, agora) }));
    return { agendamentos: await incluirServicosAdicionais(comPermissoes, { transaction }),
      pagina, porPagina: consulta.porPagina, total, totalPaginas, localizado };
  });
}
