export function calcularMetricasCancelamento(resumo) {
  const base = Number(resumo.quantidadeAgendamentosElegiveis ?? 0);
  const cancelados = Number(resumo.quantidadeCancelamentosElegiveis ?? 0);
  resumo.taxaCancelamento = base ? cancelados / base * 100 : null;
  resumo.distribuicaoStatus = {
    realizados: Number(resumo.quantidadeComparecimentos ?? 0),
    marcados: Number(resumo.quantidadeAgendamentosMarcados ?? 0),
    cancelados,
    naoCompareceu: Number(resumo.quantidadeNaoCompareceu ?? 0),
  };
  return resumo;
}

export function comporMotivo(codigo, detalhe, motivos) {
  if (!Object.hasOwn(motivos, codigo) || typeof detalhe !== 'string' || detalhe.length > 200 || (codigo === 'OUTRO' && !detalhe.trim())) {
    throw Object.assign(new Error('Informe um motivo válido com detalhe de até 200 caracteres.'), { status: 400 });
  }
  const motivo = `${motivos[codigo]}${detalhe ? `: ${detalhe}` : ''}`;
  if (motivo.length > 300) throw Object.assign(new Error('O motivo completo excede 300 caracteres.'), { status: 400 });
  return motivo;
}
