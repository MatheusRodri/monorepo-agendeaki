export function somenteNumeros(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

export function formatarCpf(valor) {
  const numeros = somenteNumeros(valor).slice(0, 11);
  return numeros.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatarCnpj(valor) {
  const numeros = somenteNumeros(valor).slice(0, 14);
  return numeros.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function formatarTelefone(valor) {
  const numeros = somenteNumeros(valor).slice(0, 11);
  if (numeros.length <= 10) return numeros.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return numeros.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function formatarData(valor) {
  const numeros = somenteNumeros(valor).slice(0, 8);
  return numeros.replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d{1,4})$/, '$1/$2');
}

export function dataParaIso(valor) {
  const numeros = somenteNumeros(valor);
  return numeros.length === 8 ? `${numeros.slice(4)}-${numeros.slice(2, 4)}-${numeros.slice(0, 2)}` : '';
}

export function dataParaExibicao(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? '')) ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}` : formatarData(valor);
}
