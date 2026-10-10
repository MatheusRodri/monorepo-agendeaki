'use client';

import { useState } from 'react';

export default function BotaoResetarPwa() {
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function resetarAplicativo() {
    setCarregando(true);
    setMensagem('');

    try {
      const resposta = await fetch(`/offline?atualizar=${Date.now()}`, { cache: 'no-store' });
      if (!resposta.ok) throw new Error('O site ainda não está acessível.');

      if ('serviceWorker' in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((registro) => registro.unregister()));
      }

      if ('caches' in window) {
        const chaves = await caches.keys();
        await Promise.all(
          chaves
            .filter((chave) => chave.startsWith('agendeaki-offline-'))
            .map((chave) => caches.delete(chave)),
        );
      }

      window.location.replace('/');
    } catch {
      setMensagem('Não consegui acessar o site. Confira sua conexão e tente novamente.');
      setCarregando(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        disabled={carregando}
        onClick={resetarAplicativo}
        style={{
          background: 'transparent',
          border: '1px solid rgba(93, 53, 88, .2)',
          borderRadius: 12,
          color: '#704368',
          cursor: carregando ? 'wait' : 'pointer',
          font: '600 14px Arial, sans-serif',
          minHeight: 44,
          opacity: carregando ? .65 : 1,
          padding: '0 16px',
        }}
          type="button"
      >
        {carregando ? 'Atualizando aplicativo…' : 'Forçar atualização do aplicativo'}
      </button>
      {mensagem && (
        <p aria-live="polite" style={{ color: '#a84e50', fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>
          {mensagem}
        </p>
      )}
    </div>
  );
}
