'use client';

import { useEffect, useRef, useState } from 'react';

const chavePreferencias = 'agendeaki-acessibilidade';
const tamanhoMinimo = 100;
const tamanhoMaximo = 200;
const passoTamanho = 25;

function salvarPreferencias(preferencias) {
  try { localStorage.setItem(chavePreferencias, JSON.stringify(preferencias)); } catch {}
}

function aplicarPreferencias({ tamanhoFonte, altoContraste, reduzirMovimento }) {
  const raiz = document.documentElement;
  raiz.style.setProperty('--escala-fonte', `${tamanhoFonte}%`);
  raiz.dataset.tamanhoFonte = String(tamanhoFonte);
  raiz.dataset.altoContraste = altoContraste ? 'ativo' : 'inativo';
  raiz.dataset.reducaoMovimento = reduzirMovimento ? 'ativa' : 'inativa';
}

function carregarVLibras() {
  if (window.__agendeAkiVLibrasPromise) return window.__agendeAkiVLibrasPromise;
  window.__agendeAkiVLibrasPromise = new Promise((resolver, rejeitar) => {
    if (window.VLibras?.Widget) { resolver(); return; }
    let script = document.querySelector('script[data-agendeaki-vlibras]');
    const aoCarregar = () => resolver();
    const aoFalhar = () => rejeitar(new Error('Não foi possível carregar o VLibras.'));
    if (!script) {
      script = document.createElement('script');
      script.async = true;
      script.dataset.agendeakiVlibras = 'true';
      script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
      script.addEventListener('load', aoCarregar, { once: true });
      script.addEventListener('error', aoFalhar, { once: true });
      document.body.appendChild(script);
      return;
    }
    script.addEventListener('load', aoCarregar, { once: true });
    script.addEventListener('error', aoFalhar, { once: true });
  });
  return window.__agendeAkiVLibrasPromise;
}

export default function AcessibilidadeGlobal() {
  const [aberto, definirAberto] = useState(false);
  const [carregado, definirCarregado] = useState(false);
  const [vlibrasIndisponivel, definirVlibrasIndisponivel] = useState(false);
  const [tamanhoFonte, definirTamanhoFonte] = useState(100);
  const [altoContraste, definirAltoContraste] = useState(false);
  const [reduzirMovimento, definirReduzirMovimento] = useState(false);
  const [preferenciaMovimentoDefinida, definirPreferenciaMovimentoDefinida] = useState(false);
  const botaoAcessibilidade = useRef(null);

  useEffect(() => {
    let preferenciaSalva = {};
    try { preferenciaSalva = JSON.parse(localStorage.getItem(chavePreferencias) || '{}'); } catch {}
    const escalaSalva = Number(preferenciaSalva.tamanhoFonte);
    const reducaoPadrao = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const preferencias = {
      tamanhoFonte: Number.isFinite(escalaSalva) ? Math.min(tamanhoMaximo, Math.max(tamanhoMinimo, escalaSalva)) : 100,
      altoContraste: preferenciaSalva.altoContraste === true,
      reduzirMovimento: typeof preferenciaSalva.reduzirMovimento === 'boolean' ? preferenciaSalva.reduzirMovimento : reducaoPadrao,
    };
    definirTamanhoFonte(preferencias.tamanhoFonte);
    definirAltoContraste(preferencias.altoContraste);
    definirReduzirMovimento(preferencias.reduzirMovimento);
    definirPreferenciaMovimentoDefinida(typeof preferenciaSalva.reduzirMovimento === 'boolean');
    aplicarPreferencias(preferencias);
    definirCarregado(true);
  }, []);

  useEffect(() => {
    let dialogoAtivo = null;
    let focoAnterior = null;
    const seletoresFocaveis = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function sincronizarDialogo() {
      const dialogos = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      const proximo = dialogos.reverse().find((dialogo) => dialogo.getClientRects().length > 0) || null;
      if (proximo === dialogoAtivo) return;

      if (dialogoAtivo && !proximo) {
        const restaurarFoco = focoAnterior;
        dialogoAtivo = null;
        focoAnterior = null;
        if (restaurarFoco?.isConnected) restaurarFoco.focus();
      }
      if (proximo) {
        if (!dialogoAtivo) focoAnterior = document.activeElement;
        dialogoAtivo = proximo;
        const primeiroControle = proximo.querySelector('[autofocus], [data-foco-inicial], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
        (primeiroControle || proximo).focus({ preventScroll: true });
      }
    }

    function manterFocoNoDialogo(evento) {
      if (evento.key !== 'Tab' || !dialogoAtivo) return;
      const focaveis = [...dialogoAtivo.querySelectorAll(seletoresFocaveis)].filter((elemento) => elemento.getClientRects().length > 0);
      if (!focaveis.length) {
        evento.preventDefault();
        dialogoAtivo.focus();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && (document.activeElement === primeiro || !dialogoAtivo.contains(document.activeElement))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (document.activeElement === ultimo || !dialogoAtivo.contains(document.activeElement))) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    const observador = new MutationObserver(sincronizarDialogo);
    observador.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden', 'style', 'class'] });
    document.addEventListener('keydown', manterFocoNoDialogo);
    sincronizarDialogo();
    return () => {
      observador.disconnect();
      document.removeEventListener('keydown', manterFocoNoDialogo);
    };
  }, []);

  useEffect(() => {
    if (!carregado) return;
    aplicarPreferencias({ tamanhoFonte, altoContraste, reduzirMovimento });
    salvarPreferencias({
      tamanhoFonte,
      altoContraste,
      ...(preferenciaMovimentoDefinida ? { reduzirMovimento } : {}),
    });
  }, [altoContraste, carregado, preferenciaMovimentoDefinida, reduzirMovimento, tamanhoFonte]);

  useEffect(() => {
    const definirConteudoPrincipal = () => {
      const principal = document.querySelector('main');
      if (principal && principal.id !== 'conteudo-principal') {
        principal.id = 'conteudo-principal';
        principal.tabIndex = -1;
      }
    };
    const observador = new MutationObserver(definirConteudoPrincipal);
    observador.observe(document.body, { childList: true, subtree: true });
    definirConteudoPrincipal();
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    let ativo = true;
    carregarVLibras()
      .then(() => {
        if (!ativo || window.__agendeAkiVLibrasIniciado) return;
        new window.VLibras.Widget('https://vlibras.gov.br/app');
        window.__agendeAkiVLibrasIniciado = true;
      })
      .catch(() => { if (ativo) definirVlibrasIndisponivel(true); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;
    function fecharComEscape(evento) {
      if (evento.key === 'Escape') {
        definirAberto(false);
        botaoAcessibilidade.current?.focus();
      }
    }
    document.addEventListener('keydown', fecharComEscape);
    return () => document.removeEventListener('keydown', fecharComEscape);
  }, [aberto]);

  function alterarTamanhoFonte(delta) {
    definirTamanhoFonte((atual) => Math.min(tamanhoMaximo, Math.max(tamanhoMinimo, atual + delta)));
  }

  function prepararAlvoDoAtalho(evento) {
    const principal = document.querySelector('main');
    if (!principal) return;
    evento.preventDefault();
    principal.id = 'conteudo-principal';
    principal.tabIndex = -1;
    principal.focus();
    principal.scrollIntoView({ block: 'start' });
    window.history.replaceState(null, '', '#conteudo-principal');
  }

  function alternarReducaoMovimento() {
    definirReduzirMovimento((atual) => !atual);
    definirPreferenciaMovimentoDefinida(true);
  }

  return <>
    <a className="atalho-conteudo" href="#conteudo-principal" onClick={prepararAlvoDoAtalho}>Pular para o conteúdo principal</a>
    <aside aria-label="Recursos de acessibilidade" className="acessibilidade-global" data-carregado={carregado ? 'true' : 'false'}>
      <button
        aria-controls="painel-acessibilidade"
        aria-expanded={aberto}
        className="acessibilidade-global__abrir"
        onClick={() => definirAberto((atual) => !atual)}
        ref={botaoAcessibilidade}
        type="button"
      >Acessibilidade</button>
      <section aria-label="Preferências de acessibilidade" className="acessibilidade-global__painel" hidden={!aberto} id="painel-acessibilidade">
        <h2>Preferências de acessibilidade</h2>
        <div aria-label="Tamanho do texto" className="acessibilidade-global__tamanho" role="group">
          <span aria-live="polite">Tamanho do texto: {tamanhoFonte}%</span>
          <button disabled={tamanhoFonte <= tamanhoMinimo} onClick={() => alterarTamanhoFonte(-passoTamanho)} type="button"><span aria-hidden="true">A−</span> Diminuir</button>
          <button disabled={tamanhoFonte >= tamanhoMaximo} onClick={() => alterarTamanhoFonte(passoTamanho)} type="button"><span aria-hidden="true">A+</span> Aumentar</button>
          <button disabled={tamanhoFonte === 100} onClick={() => definirTamanhoFonte(100)} type="button">Padrão</button>
        </div>
        <button aria-pressed={altoContraste} className="acessibilidade-global__opcao" onClick={() => definirAltoContraste((atual) => !atual)} type="button">Alto contraste <span>{altoContraste ? 'Ativado' : 'Desativado'}</span></button>
        <button aria-pressed={reduzirMovimento} className="acessibilidade-global__opcao" onClick={alternarReducaoMovimento} type="button">Reduzir movimento <span>{reduzirMovimento ? 'Ativado' : 'Desativado'}</span></button>
        {vlibrasIndisponivel && <p className="acessibilidade-global__aviso" role="status">O VLibras está temporariamente indisponível. Os demais recursos continuam funcionando.</p>}
      </section>
    </aside>
    <div className={`acessibilidade-vlibras${vlibrasIndisponivel ? ' acessibilidade-vlibras--indisponivel' : ''}`}>
      <div className="enabled" vw="">
        <div className="active" vw-access-button="" />
        <div vw-plugin-wrapper=""><div className="vw-plugin-top-wrapper" /></div>
      </div>
    </div>
  </>;
}
