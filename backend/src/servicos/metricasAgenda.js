export function comporMotivo(codigo, detalhe, motivos) {
  if (!Object.hasOwn(motivos, codigo) || typeof detalhe !== 'string' || detalhe.length > 200 || (codigo === 'OUTRO' && !detalhe.trim())) {
    throw Object.assign(new Error('Informe um motivo válido com detalhe de até 200 caracteres.'), { status: 400 });
  }
  const motivo = `${motivos[codigo]}${detalhe ? `: ${detalhe}` : ''}`;
  if (motivo.length > 300) throw Object.assign(new Error('O motivo completo excede 300 caracteres.'), { status: 400 });
  return motivo;
}
