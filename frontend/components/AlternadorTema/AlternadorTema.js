'use client';

import { useEffect, useState } from 'react';

export default function AlternadorTema() {
  const [temaEscuro, definirTemaEscuro] = useState(false);

  useEffect(() => {
    const temaSalvo = localStorage.getItem('tema-agendeaki');
    const prefereTemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const deveUsarTemaEscuro = temaSalvo ? temaSalvo === 'escuro' : prefereTemaEscuro;

    definirTemaEscuro(deveUsarTemaEscuro);
    document.documentElement.dataset.tema = deveUsarTemaEscuro ? 'escuro' : 'claro';
  }, []);

  function alternarTema() {
    const proximoTemaEscuro = !temaEscuro;

    definirTemaEscuro(proximoTemaEscuro);
    document.documentElement.dataset.tema = proximoTemaEscuro ? 'escuro' : 'claro';
    localStorage.setItem('tema-agendeaki', proximoTemaEscuro ? 'escuro' : 'claro');
  }

  return (
    <button
      aria-label={temaEscuro ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-pressed={temaEscuro}
      className="alternador-tema"
      onClick={alternarTema}
      type="button"
    >
      <span aria-hidden="true" className="alternador-tema__icone">
        {temaEscuro ? '☀' : '☾'}
      </span>
      <span className="alternador-tema__texto">{temaEscuro ? 'Claro' : 'Escuro'}</span>
    </button>
  );
}
