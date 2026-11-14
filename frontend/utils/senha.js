const regras = [
  { id: 'tamanho', rotulo: 'Mínimo de 8 caracteres', testar: (senha) => senha.length >= 8 },
  { id: 'maiuscula', rotulo: 'Pelo menos 1 letra maiúscula', testar: (senha) => /\p{Lu}/u.test(senha) },
  { id: 'minuscula', rotulo: 'Pelo menos 1 letra minúscula', testar: (senha) => /\p{Ll}/u.test(senha) },
  { id: 'numero', rotulo: 'Pelo menos 1 número', testar: (senha) => /\p{N}/u.test(senha) },
  { id: 'especial', rotulo: 'Pelo menos 1 caractere especial', testar: (senha) => /[^\p{L}\p{N}\s]/u.test(senha) },
];

export function avaliarSenha(senha = '') {
  const valor = String(senha ?? '');
  return regras.map((regra) => ({ id: regra.id, rotulo: regra.rotulo, atendida: regra.testar(valor) }));
}

export function senhaAtendeRegras(senha) {
  return avaliarSenha(senha).every((regra) => regra.atendida);
}
