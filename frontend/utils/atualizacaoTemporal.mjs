// Reconsulta na próxima liberação, sem intervalos longos que excedam o limite do navegador.
export function agendarAtualizacaoTemporal(instantes, atualizar, {
  janela = window, documento = document, agora = Date.now,
} = {}) {
  const futuros = instantes.map((valor) => new Date(valor).getTime()).filter((valor) => Number.isFinite(valor) && valor > agora());
  const proximo = Math.min(...futuros);
  let temporizador;
  function agendar() {
    if (!Number.isFinite(proximo)) return;
    temporizador = janela.setTimeout(() => {
      if (agora() < proximo) agendar();
      else atualizar();
    }, Math.min(60000, Math.max(0, proximo - agora()) + 50));
  }
  const aoRetornar = () => { if (documento.visibilityState === 'visible') atualizar(); };
  documento.addEventListener('visibilitychange', aoRetornar);
  janela.addEventListener('focus', aoRetornar);
  agendar();
  return () => {
    janela.clearTimeout(temporizador);
    documento.removeEventListener('visibilitychange', aoRetornar);
    janela.removeEventListener('focus', aoRetornar);
  };
}
