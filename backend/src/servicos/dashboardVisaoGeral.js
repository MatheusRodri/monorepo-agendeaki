import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { filtroServicoSql } from './historicoPrecos.js';
import { apresentarServico, camposPromocaoSql } from './promocoesServicos.js';

export async function consultarVisaoGeralDashboard(filtros, dataInicioAnterior, dataFimAnterior) {
  const origem = `FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
    WHERE u.fk_salao=:idSalao AND (:idUnidade = 0 OR a.fk_unidade=:idUnidade)
    AND EXISTS (SELECT 1 FROM vw_servico_atendimento item WHERE item.id_agendamento=a.id_agendamento AND ${filtroServicoSql()})`;
  const consultar = (sql) => bancoDeDados.query(sql, {
    replacements: { ...filtros, dataInicioAnterior, dataFimAnterior }, type: QueryTypes.SELECT,
  });
  const [futurosPorDia, cancelamentosPorDia, promocoesAtivas, agendamentosComPromocao, receitaPorDiaAnterior] = await Promise.all([
    consultar(`SELECT DATE_FORMAT(a.dt_inicio,'%Y-%m-%d') AS data, COUNT(*) AS quantidade ${origem}
      AND a.cd_status='AGENDADO' AND a.dt_inicio>=:agora AND a.dt_inicio<DATE_ADD(:agora, INTERVAL 30 DAY)
      GROUP BY DATE_FORMAT(a.dt_inicio,'%Y-%m-%d') ORDER BY data`),
    consultar(`SELECT DATE_FORMAT(COALESCE(a.dt_cancelamento,a.dt_inicio),'%Y-%m-%d') AS data, COUNT(*) AS quantidade ${origem}
      AND a.cd_status='CANCELADO' AND DATE(COALESCE(a.dt_cancelamento,a.dt_inicio)) BETWEEN :dataInicio AND :dataFim
      GROUP BY DATE_FORMAT(COALESCE(a.dt_cancelamento,a.dt_inicio),'%Y-%m-%d') ORDER BY data`),
    consultar(`SELECT s.id_servico AS idServico, s.nm_servico AS servico, u.nm_unidade AS unidade, s.vl_servico AS valor, ${camposPromocaoSql('s')} FROM tb_servico s INNER JOIN tb_unidade u ON u.id_unidade=s.fk_unidade
      WHERE u.fk_salao=:idSalao AND u.st_ativo=TRUE AND s.st_ativo=TRUE AND s.st_promocao_ativa=TRUE
      AND (:idUnidade = 0 OR s.fk_unidade=:idUnidade) AND (:idServico = 0 OR s.id_servico=:idServico)
      AND (:idFuncionario = 0 OR EXISTS (SELECT 1 FROM tb_funcionario_servico fs INNER JOIN tb_funcionario f ON f.id_funcionario=fs.fk_funcionario
        WHERE fs.fk_servico=s.id_servico AND fs.fk_funcionario=:idFuncionario AND f.st_ativo=TRUE))
      AND (s.dt_promocao_inicio IS NULL OR s.dt_promocao_inicio<=DATE(:agora))
      AND (s.dt_promocao_fim IS NULL OR s.dt_promocao_fim>=DATE(:agora)) ORDER BY u.nm_unidade,s.nm_servico,s.id_servico`),
    consultar(`SELECT COUNT(DISTINCT CASE WHEN DATE(a.dt_inicio) BETWEEN :dataInicio AND :dataFim THEN a.id_agendamento END) AS quantidade,
      COUNT(DISTINCT CASE WHEN DATE(a.dt_inicio) BETWEEN :dataInicioAnterior AND :dataFimAnterior THEN a.id_agendamento END) AS quantidadeAnterior
      FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade=a.fk_unidade
      INNER JOIN vw_servico_atendimento item ON item.id_agendamento=a.id_agendamento
      WHERE u.fk_salao=:idSalao AND (:idUnidade = 0 OR a.fk_unidade=:idUnidade) AND ${filtroServicoSql()}
      AND item.st_promocao_aplicada=TRUE AND DATE(a.dt_inicio) BETWEEN :dataInicioAnterior AND :dataFim`),
    consultar(`SELECT DATE_FORMAT(a.dt_realizacao, '%Y-%m-%d') AS data, SUM(item.valor) AS valor
      FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
      INNER JOIN vw_servico_atendimento item ON item.id_agendamento = a.id_agendamento
      WHERE u.fk_salao = :idSalao AND (:idUnidade = 0 OR a.fk_unidade = :idUnidade)
      AND ${filtroServicoSql()} AND a.cd_status = 'REALIZADO'
      AND DATE(a.dt_realizacao) BETWEEN :dataInicioAnterior AND :dataFimAnterior
      GROUP BY DATE_FORMAT(a.dt_realizacao, '%Y-%m-%d') ORDER BY data`),
  ]);
  const referencia = new Date(`${filtros.agora.replace(' ', 'T')}-03:00`);
  const fimPrevisao = new Date(`${filtros.agora.slice(0, 10)}T12:00:00Z`);
  fimPrevisao.setUTCDate(fimPrevisao.getUTCDate() + 30);
  return { futurosPorDia, cancelamentosPorDia, receitaPorDiaAnterior, inicioPrevisao: filtros.agora.slice(0, 10), fimPrevisao: fimPrevisao.toISOString().slice(0, 10),
    promocoesAtivas: promocoesAtivas.length,
    listaPromocoesAtivas: promocoesAtivas.map((item) => apresentarServico(item, true, true, referencia)),
    agendamentosComPromocao: Number(agendamentosComPromocao[0].quantidade),
    agendamentosComPromocaoAnterior: Number(agendamentosComPromocao[0].quantidadeAnterior) };
}
