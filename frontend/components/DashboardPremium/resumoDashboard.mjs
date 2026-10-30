// Os rankings distribuem o total real; "Outros" só existe quando há mais de quatro registros.
export function montarRanking(itens) {
  const ordenados = itens.map((item) => ({ ...item, quantidade: Math.max(0, Number(item.quantidade) || 0) }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  const total = ordenados.reduce((soma, item) => soma + item.quantidade, 0);
  const resultado = ordenados.slice(0, 4);
  if (ordenados.length > 4) resultado.push({ id: 'outros', nome: 'Outros', quantidade: ordenados.slice(4).reduce((soma, item) => soma + item.quantidade, 0) });
  return resultado.map((item) => ({ ...item, percentual: total ? item.quantidade / total * 100 : 0 }));
}

// Até 60 faixas mantêm períodos longos leves. Ticket usa receita ÷ atendimentos de cada faixa.
export function montarSerie(registros, inicio, fim, campo, divisor) {
  const primeiro = Date.parse(`${inicio}T00:00:00Z`);
  const ultimo = Date.parse(`${fim}T00:00:00Z`);
  if (!Number.isFinite(primeiro) || !Number.isFinite(ultimo) || ultimo < primeiro) return [];
  const dias = Math.floor((ultimo - primeiro) / 86400000) + 1;
  const faixas = Array.from({ length: Math.min(dias, 60) }, () => ({ valor: 0, divisor: 0 }));
  for (const item of registros ?? []) {
    const dia = Math.floor((Date.parse(`${item.data}T00:00:00Z`) - primeiro) / 86400000);
    if (!Number.isFinite(dia) || dia < 0 || dia >= dias) continue;
    const faixa = faixas[Math.floor(dia * faixas.length / dias)];
    faixa.valor += Number(item[campo]) || 0;
    if (divisor) faixa.divisor += Number(item[divisor]) || 0;
  }
  return faixas.map((faixa) => divisor ? (faixa.divisor ? faixa.valor / faixa.divisor : 0) : faixa.valor);
}
