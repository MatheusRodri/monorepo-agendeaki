export function normalizarRetornoInterno(valor, origem) {
  if (typeof valor !== 'string' || !valor.startsWith('/') || valor.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(valor)) return null;
  try {
    const destino = new URL(valor, origem);
    return destino.origin === origem ? `${destino.pathname}${destino.search}${destino.hash}` : null;
  } catch { return null; }
}
