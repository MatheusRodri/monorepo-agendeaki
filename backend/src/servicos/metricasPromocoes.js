import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { filtroServicoSql } from './historicoPrecos.js';

export function completarResumoPromocoes(linha) {
  const resumo = Object.fromEntries(Object.entries(linha).map(([chave, valor]) => [chave, Number(valor)]));
  resumo.participacaoPromocoes = resumo.servicosConhecidos
    ? resumo.servicosComPromocao / resumo.servicosConhecidos * 100 : null;
  return resumo;
}

export async function consultarMetricasPromocoes(filtros, dataInicioAnterior, dataFimAnterior) {
  const origem = `FROM tb_agendamento a INNER JOIN tb_unidade u ON u.id_unidade = a.fk_unidade
    INNER JOIN vw_servico_atendimento item ON item.id_agendamento = a.id_agendamento
    WHERE u.fk_salao = :idSalao AND (:idUnidade = 0 OR a.fk_unidade = :idUnidade)
      AND ${filtroServicoSql()} AND a.cd_status = 'REALIZADO'
      AND DATE(a.dt_realizacao) BETWEEN :inicio AND :fim`;
  const resumoSql = `SELECT COUNT(item.st_promocao_aplicada) AS servicosConhecidos,
    COUNT(*) - COUNT(item.st_promocao_aplicada) AS servicosNaoInformados,
    COALESCE(SUM(item.st_promocao_aplicada = TRUE),0) AS servicosComPromocao,
    COALESCE(SUM(CASE WHEN item.st_promocao_aplicada THEN item.valor ELSE 0 END),0) AS receitaComPromocao,
    COALESCE(SUM(item.desconto_promocional),0) AS descontosPromocionais,
    COALESCE(SUM(item.desconto_adicional),0) AS descontosAdicionais,
    COALESCE(SUM(item.acrescimo),0) AS acrescimos ${origem}`;
  const consultar = (sql, inicio = filtros.dataInicio, fim = filtros.dataFim) => bancoDeDados.query(sql, {
    replacements: { ...filtros, inicio, fim }, type: QueryTypes.SELECT,
  });
  const [atual, anterior, receitaPorDia, ranking, ajustesPorServico] = await Promise.all([
    consultar(resumoSql), consultar(resumoSql, dataInicioAnterior, dataFimAnterior),
    consultar(`SELECT DATE_FORMAT(a.dt_realizacao,'%Y-%m-%d') AS data, SUM(item.valor) AS valor
      ${origem} AND item.st_promocao_aplicada = TRUE GROUP BY DATE_FORMAT(a.dt_realizacao,'%Y-%m-%d') ORDER BY data`),
    consultar(`SELECT item.fk_servico AS idServico, u.id_unidade AS idUnidade, MAX(item.servico) AS servico,
      u.nm_unidade AS unidade, COUNT(*) AS utilizacoes, SUM(item.valor) AS receitaRealizada,
      SUM(item.desconto_promocional) AS descontosPromocionais ${origem} AND item.st_promocao_aplicada = TRUE
      GROUP BY item.fk_servico, u.id_unidade, u.nm_unidade
      ORDER BY utilizacoes DESC, receitaRealizada DESC, idServico, idUnidade LIMIT 10`),
    consultar(`SELECT item.fk_servico AS idServico, u.id_unidade AS idUnidade, MAX(item.servico) AS servico,
      u.nm_unidade AS unidade, SUM(item.desconto_adicional > 0) AS quantidadeDescontos,
      SUM(item.desconto_adicional) AS descontosAdicionais, SUM(item.acrescimo > 0) AS quantidadeAcrescimos,
      SUM(item.acrescimo) AS acrescimos ${origem} AND item.id_extra IS NOT NULL
      AND (item.desconto_adicional > 0 OR item.acrescimo > 0)
      GROUP BY item.fk_servico, u.id_unidade, u.nm_unidade ORDER BY servico, idServico, idUnidade`),
  ]);
  return { resumo: completarResumoPromocoes(atual[0]), comparacaoAnterior: completarResumoPromocoes(anterior[0]),
    receitaPorDia, ranking, ajustesPorServico };
}
