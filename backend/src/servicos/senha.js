const regras = [
  { id: 'tamanho', mensagem: 'A senha deve possuir pelo menos 8 caracteres.', testar: (senha) => senha.length >= 8 },
  { id: 'maiuscula', mensagem: 'A senha deve possuir pelo menos 1 letra maiúscula.', testar: (senha) => /\p{Lu}/u.test(senha) },
  { id: 'minuscula', mensagem: 'A senha deve possuir pelo menos 1 letra minúscula.', testar: (senha) => /\p{Ll}/u.test(senha) },
  { id: 'numero', mensagem: 'A senha deve possuir pelo menos 1 número.', testar: (senha) => /\p{N}/u.test(senha) },
  { id: 'especial', mensagem: 'A senha deve possuir pelo menos 1 caractere especial.', testar: (senha) => /[^\p{L}\p{N}\s]/u.test(senha) },
];

export function mensagemSenhaInvalida(senha) {
  const valor = typeof senha === 'string' ? senha : '';
  return regras.find((regra) => !regra.testar(valor))?.mensagem ?? null;
}
