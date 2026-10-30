'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function AlternadorTema() {
  const [temaEscuro, definirTemaEscuro] = useState(false);
  const [destino, definirDestino] = useState(undefined);

  useEffect(() => {
    const temaSalvo = localStorage.getItem('tema-agendeaki');
    const prefereTemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const deveUsarTemaEscuro = temaSalvo ? temaSalvo === 'escuro' : prefereTemaEscuro;

    definirTemaEscuro(deveUsarTemaEscuro);
    document.documentElement.dataset.tema = deveUsarTemaEscuro ? 'escuro' : 'claro';
  }, []);

  useEffect(() => {
    function atualizarDestino() {
      const proximoDestino = document.querySelector('[data-alternador-tema-destino]');
      definirDestino((destinoAtual) => destinoAtual === proximoDestino ? destinoAtual : proximoDestino);
    }

    const observador = new MutationObserver(atualizarDestino);
    observador.observe(document.body, { childList: true, subtree: true });
    atualizarDestino();

    return () => observador.disconnect();
  }, []);

  function alternarTema() {
    const proximoTemaEscuro = !temaEscuro;

    definirTemaEscuro(proximoTemaEscuro);
    document.documentElement.dataset.tema = proximoTemaEscuro ? 'escuro' : 'claro';
    localStorage.setItem('tema-agendeaki', proximoTemaEscuro ? 'escuro' : 'claro');
  }

  const botao = (
    <button
      aria-label={temaEscuro ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-pressed={temaEscuro}
      className={`alternador-tema ${destino ? 'alternador-tema--cabecalho' : 'alternador-tema--global'}`}
      onClick={alternarTema}
      type="button"
    >
      <span aria-hidden="true" className="alternador-tema__icone">
        {temaEscuro ? '☀' : '☾'}
      </span>
      <span className="alternador-tema__texto">{temaEscuro ? 'Claro' : 'Escuro'}</span>
    </button>
  );

  if (destino === undefined) return null;
  return destino ? createPortal(botao, destino) : botao;
}
