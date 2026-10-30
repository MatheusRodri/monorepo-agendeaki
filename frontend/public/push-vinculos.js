/* Estado do destinatário compartilhado pelo service worker e suas mensagens. */
(() => {
  const nomeBanco = 'agendeaki-push-v1';
  function abrir() {
    return new Promise((resolve, reject) => {
      const pedido = indexedDB.open(nomeBanco, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore('vinculos', { keyPath: 'audience' });
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
  }
  async function operar(modo, executar) {
    const banco = await abrir();
    try {
      return await new Promise((resolve, reject) => {
        const tx = banco.transaction('vinculos', modo);
        const pedido = executar(tx.objectStore('vinculos'));
        tx.oncomplete = () => resolve(pedido?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Vínculo indisponível.'));
      });
    } finally { banco.close(); }
  }
  const listar = () => operar('readonly', (store) => store.getAll());
  function avisoPermitido(aviso, vinculo) {
    return aviso?.versao === 1 && Boolean(vinculo?.idVinculo) && aviso.audience === vinculo.audience
      && aviso.destinatarioId === vinculo.destinatarioId && aviso.idVinculo === vinculo.idVinculo;
  }
  globalThis.VinculosPush = {
    listar, avisoPermitido,
    async salvar(vinculo) {
      if (!['cliente', 'salao'].includes(vinculo.audience) || typeof vinculo.destinatarioId !== 'string'
        || typeof vinculo.idVinculo !== 'string' || vinculo.idVinculo.length !== 36) throw new Error('Vínculo inválido.');
      await operar('readwrite', (store) => store.put({ audience: vinculo.audience, destinatarioId: vinculo.destinatarioId, idVinculo: vinculo.idVinculo }));
    },
    async remover({ audience, destinatarioId, idVinculo }) {
      await operar('readwrite', (store) => {
        const pedido = store.get(audience);
        pedido.onsuccess = () => {
          const atual = pedido.result;
          if (atual && atual.destinatarioId === destinatarioId && (!idVinculo || atual.idVinculo === idVinculo)) store.delete(audience);
        };
        return pedido;
      });
    },
  };
})();
