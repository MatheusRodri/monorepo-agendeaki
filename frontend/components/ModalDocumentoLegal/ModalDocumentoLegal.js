'use client';

import { useEffect, useRef } from 'react';

export default function ModalDocumentoLegal({ aoFechar, carregando, documento, erro, onRetry, tipo }) {
  const botaoFechar = useRef(null);
  const dialogo = useRef(null);
  const titulo = tipo === 'termosDeUso' ? 'Termos de Uso' : 'Política de Privacidade';

  useEffect(() => {
    const elementoAnterior = document.activeElement;
    botaoFechar.current?.focus();
    function fecharComEscape(evento) {
      if (evento.key === 'Escape') aoFechar();
      if (evento.key === 'Tab') {
        const itensFocaveis = [...(dialogo.current?.querySelectorAll('button:not(:disabled), [tabindex="0"]') ?? [])];
        if (!itensFocaveis.length) return;
        const primeiro = itensFocaveis[0];
        const ultimo = itensFocaveis[itensFocaveis.length - 1];
        if (evento.shiftKey && document.activeElement === primeiro) {
          evento.preventDefault();
          ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primeiro.focus();
        }
      }
    }
    window.addEventListener('keydown', fecharComEscape);
    return () => {
      window.removeEventListener('keydown', fecharComEscape);
      elementoAnterior?.focus?.();
    };
  }, [aoFechar]);

  return <div className="modal-documento-legal__fundo" onMouseDown={(evento) => { if (evento.target === evento.currentTarget) aoFechar(); }}><section aria-labelledby="titulo-documento-legal" aria-modal="true" className="modal-documento-legal" ref={dialogo} role="dialog"><header className="modal-documento-legal__cabecalho"><div><h2 id="titulo-documento-legal">{titulo}</h2>{documento && <p>Versão {documento.versao}</p>}</div><button aria-label="Fechar documento" className="modal-documento-legal__fechar" onClick={aoFechar} ref={botaoFechar} type="button">×</button></header><div className="modal-documento-legal__conteudo" tabIndex="0">{carregando ? <p>Carregando documento…</p> : erro ? <div><p>{erro}</p><button onClick={onRetry} type="button">Tentar novamente</button></div> : <div className="modal-documento-legal__texto">{documento?.texto}</div>}</div><footer className="modal-documento-legal__rodape"><button className="botao-enviar" onClick={aoFechar} type="button">Fechar</button></footer></section></div>;
}
