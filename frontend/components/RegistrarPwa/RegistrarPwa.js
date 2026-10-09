'use client';

import { useEffect } from 'react';

export default function RegistrarPwa() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let registro;
    let temporizador;
    let tinhaControlador = Boolean(navigator.serviceWorker.controller);
    let recarregando = false;

    const verificarAtualizacao = () => {
      if (registro && navigator.onLine) registro.update().catch(() => {});
    };

    const aoTrocarControlador = () => {
      if (tinhaControlador && !recarregando) {
        recarregando = true;
        window.location.reload();
        return;
      }
      tinhaControlador = true;
    };

    const aoVoltarParaTela = () => {
      if (document.visibilityState === 'visible') verificarAtualizacao();
    };

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarControlador);
    document.addEventListener('visibilitychange', aoVoltarParaTela);
    window.addEventListener('online', verificarAtualizacao);

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((novoRegistro) => {
        registro = novoRegistro;
        verificarAtualizacao();
        temporizador = window.setInterval(verificarAtualizacao, 60 * 60 * 1000);
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', aoTrocarControlador);
      document.removeEventListener('visibilitychange', aoVoltarParaTela);
      window.removeEventListener('online', verificarAtualizacao);
      if (temporizador) window.clearInterval(temporizador);
    };
  }, []);
  return null;
}
