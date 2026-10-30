import { normalizarValorServico, precoServico, validarValorEsperado } from './promocoesServicos.js';

export function calcularHistoricoPreco(valorNormal, promocao, premiumAtivo, agora = new Date()) {
  const preco = precoServico(valorNormal, promocao, premiumAtivo, agora);
  return {
    precoNormal: preco.valorOriginal,
    precoVigente: preco.valorVigente,
    promocaoAplicada: preco.promocaoAtiva,
    tipoPromocaoAplicada: preco.promocaoAtiva ? promocao.tipo : null,
    valorPromocaoAplicada: preco.promocaoAtiva ? promocao.valor : null,
  };
}

export function calcularAjusteExtra(historico, valorCobrado, valorEsperado) {
  validarValorEsperado(valorEsperado, historico.precoVigente);
  const cobrado = Number(normalizarValorServico(valorCobrado ?? historico.precoVigente));
  const diferenca = Math.round(cobrado * 100) - Math.round(historico.precoVigente * 100);
  return { valorCobrado: cobrado, descontoAdicional: Math.max(-diferenca, 0) / 100, acrescimo: Math.max(diferenca, 0) / 100 };
}

export function normalizarObservacaoAjuste(valor) {
  if (valor == null) return null;
  if (typeof valor !== 'string' || valor.trim().length > 500) {
    throw Object.assign(new Error('A observação do ajuste deve ser um texto de até 500 caracteres.'), { status: 400 });
  }
  return valor.trim() || null;
}

export function normalizarFiltrosPrecos(query) {
  const promocao = query.promocao ?? 'todas';
  const ajusteValor = query.ajusteValor ?? 'todos';
  if (!['todas', 'com', 'sem', 'naoInformado'].includes(promocao)
    || !['todos', 'desconto', 'acrescimo', 'sem', 'naoInformado'].includes(ajusteValor)) {
    throw Object.assign(new Error('Filtro de promoção ou ajuste de valor inválido.'), { status: 400 });
  }
  return { promocao, ajusteValor };
}

// Alias definido pelo código; todos os valores externos são parâmetros SQL.
export function filtroServicoSql(alias = 'item') {
  return `(:idServico = 0 OR ${alias}.fk_servico = :idServico)
    AND (:idFuncionario = 0 OR ${alias}.fk_funcionario = :idFuncionario)
    AND (:promocao = 'todas' OR (:promocao = 'com' AND ${alias}.st_promocao_aplicada = TRUE)
      OR (:promocao = 'sem' AND ${alias}.st_promocao_aplicada = FALSE)
      OR (:promocao = 'naoInformado' AND ${alias}.st_promocao_aplicada IS NULL))
    AND (:ajusteValor = 'todos' OR (:ajusteValor = 'desconto' AND ${alias}.desconto_adicional > 0)
      OR (:ajusteValor = 'acrescimo' AND ${alias}.acrescimo > 0)
      OR (:ajusteValor = 'sem' AND ${alias}.desconto_adicional = 0 AND ${alias}.acrescimo = 0)
      OR (:ajusteValor = 'naoInformado' AND ${alias}.st_promocao_aplicada IS NULL))`;
}
