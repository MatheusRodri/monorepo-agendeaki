export function somenteNumeros(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function temDigitosRepetidos(valor) {
  return /^(\d)\1+$/.test(valor);
}

export function cpfValido(valor) {
  const cpf = somenteNumeros(valor);
  if (cpf.length !== 11 || temDigitosRepetidos(cpf)) return false;
  const calcularDigito = (quantidade) => {
    const soma = cpf.slice(0, quantidade).split('').reduce((total, digito, indice) => total + Number(digito) * (quantidade + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

export function cnpjValido(valor) {
  const cnpj = somenteNumeros(valor);
  if (cnpj.length !== 14 || temDigitosRepetidos(cnpj)) return false;
  const calcularDigito = (quantidade) => {
    const pesos = quantidade === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = cnpj.slice(0, quantidade).split('').reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcularDigito(12) === Number(cnpj[12]) && calcularDigito(13) === Number(cnpj[13]);
}

export function dataNascimentoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))) return false;
  const data = new Date(`${valor}T12:00:00`);
  return !Number.isNaN(data.getTime()) && data < new Date();
}
