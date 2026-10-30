'use client';

import { obterIdentidadeSessao } from '../../utils/respostaApi';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function RegistrarPwa() {
  const caminho = usePathname();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let registro;
    const audience = window.location.pathname.startsWith('/salao') ? 'salao' : 'cliente';
    let identidadeAtual = obterIdentidadeSessao(audience);
    const identificar = () => {
      const destinatarioId = obterIdentidadeSessao(audience);
      if (destinatarioId !== identidadeAtual) { window.location.reload(); return; }
      (navigator.serviceWorker.controller || registro?.active)?.postMessage({ type: 'AGENDEAKI_VINCULO_IDENTIFICAR', audience, destinatarioId });
    };
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
      if (document.visibilityState === 'visible') { verificarAtualizacao(); identificar(); }
    };

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarControlador);
    document.addEventListener('visibilitychange', aoVoltarParaTela);
    window.addEventListener('online', verificarAtualizacao);
    window.addEventListener('storage', identificar);

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((novoRegistro) => {
        registro = novoRegistro;
        identificar();
        verificarAtualizacao();
        temporizador = window.setInterval(verificarAtualizacao, 60 * 60 * 1000);
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', aoTrocarControlador);
      document.removeEventListener('visibilitychange', aoVoltarParaTela);
      window.removeEventListener('online', verificarAtualizacao);
      window.removeEventListener('storage', identificar);
      if (temporizador) window.clearInterval(temporizador);
    };
  }, [caminho]);
  return null;
}
