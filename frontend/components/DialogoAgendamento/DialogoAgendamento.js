'use client';

import { useEffect, useRef } from 'react';

export default function DialogoAgendamento({ children, tituloId, aoFechar, ocupado = false, retornoFocoId, classe = 'modal-agendamento', classeConteudo = 'formulario-agendamento modal-agendamento__conteudo' }) {
  const conteudo = useRef(null);
  const fechar = useRef(aoFechar);
  const bloqueado = useRef(ocupado);
  fechar.current = aoFechar;
  bloqueado.current = ocupado;
  useEffect(() => {
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    conteudo.current?.focus();
    function teclado(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        if (!bloqueado.current) fechar.current?.();
      }
      if (evento.key !== 'Tab') return;
      const elementos = [...conteudo.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
      const primeiro = elementos[0];
      const ultimo = elementos.at(-1);
      if (!primeiro) { evento.preventDefault(); return; }
      if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === conteudo.current)) {
        evento.preventDefault(); ultimo.focus();
      } else if (!evento.shiftKey && (document.activeElement === ultimo || document.activeElement === conteudo.current)) {
        evento.preventDefault(); primeiro.focus();
      }
    }
    document.addEventListener('keydown', teclado);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', teclado);
      const destino = retornoFocoId ? document.getElementById(retornoFocoId) : anterior;
      requestAnimationFrame(() => {
        if (!document.querySelector('[role="dialog"][aria-modal="true"]') && destino?.isConnected && !destino.disabled) destino.focus({ preventScroll: true });
      });
    };
  }, []);
  return <div className={classe} role="presentation"><section aria-labelledby={tituloId} aria-modal="true" className={classeConteudo} ref={conteudo} role="dialog" tabIndex={-1}>{children}</section></div>;
}
