'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { obterEstiloMapaHere } from '../../utils/here';

const semUnidades = [];

function obterCoordenadas(unidade) {
  const valores = [unidade.longitude, unidade.latitude];
  if (valores.some((valor) => valor == null || String(valor).trim() === '')) return null;
  const [longitude, latitude] = valores.map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return [longitude, latitude];
}

function formatarEndereco(unidade) {
  return [[unidade.rua, unidade.numero].filter(Boolean).join(', '), unidade.complemento, unidade.bairro,
    [unidade.municipio, unidade.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ');
}

export default function VisualizacaoUnidades({ unidades = semUnidades, aoEditar, aoCopiarLink, aoCompartilhar, children }) {
  const [visao, definirVisao] = useState('lista');
  const [idSelecionada, definirIdSelecionada] = useState(null);
  const [enquadramento, definirEnquadramento] = useState(0);
  const idPainel = useId();
  const localizadas = useMemo(() => unidades.filter((unidade) => obterCoordenadas(unidade)), [unidades]);
  const semLocalizacao = useMemo(() => unidades.filter((unidade) => !obterCoordenadas(unidade)), [unidades]);
  const selecionada = localizadas.find((unidade) => String(unidade.idUnidade) === idSelecionada);
  const paginaAtiva = Number(selecionada?.quantidadeOpcoesAgendamento) > 0;

  function verTodas() {
    definirIdSelecionada(null);
    definirEnquadramento((atual) => atual + 1);
  }

  return <div className="visualizacao-unidades">
    <div aria-label="Visualização das unidades" className="visualizacao-unidades__seletor" role="group">
      <button aria-controls={idPainel} aria-pressed={visao === 'lista'} onClick={() => definirVisao('lista')} type="button"><span aria-hidden="true">☷</span> Lista</button>
      <button aria-controls={idPainel} aria-pressed={visao === 'mapa'} onClick={() => definirVisao('mapa')} type="button"><span aria-hidden="true">⌖</span> Mapa</button>
    </div>
    <div id={idPainel}>
      {visao === 'lista' ? children : <>
        <div className="unidades-mapa__acoes">
          <button className="botao-secundario" disabled={!localizadas.length} onClick={verTodas} type="button">Enquadrar unidades</button>
        </div>
        <p aria-live="polite" className="unidades-mapa__resumo">{localizadas.length} {localizadas.length === 1 ? 'unidade no mapa' : 'unidades no mapa'} · {unidades.length} {unidades.length === 1 ? 'unidade cadastrada' : 'unidades cadastradas'}</p>
        {!unidades.length ? <p className="estado-lista">Cadastre uma unidade para visualizar sua localização no mapa.</p> : <>
          {localizadas.length > 0 && <div className="unidades-mapa__grade">
            <MapaUnidades aoSelecionar={definirIdSelecionada} aoVoltarLista={() => definirVisao('lista')} enquadramento={enquadramento} idSelecionada={idSelecionada} unidades={localizadas} />
            <aside aria-label="Unidades exibidas no mapa" className="unidades-mapa__lateral">
              <h3>Suas localizações</h3>
              <p>Selecione um ponto no mapa ou uma unidade abaixo.</p>
              <ul className="unidades-mapa__lista">{localizadas.map((unidade, indice) => <li key={unidade.idUnidade}>
                <button aria-pressed={String(unidade.idUnidade) === idSelecionada} onClick={() => definirIdSelecionada(String(unidade.idUnidade))} type="button">
                  <span aria-hidden="true" className="unidades-mapa__numero">{indice + 1}</span>
                  <span><strong>{unidade.nome}</strong><small>{[unidade.municipio, unidade.estado].filter(Boolean).join('/')}</small></span>
                </button>
              </li>)}</ul>
              <div aria-live="polite" className="unidades-mapa__detalhes">
                {selecionada ? <>
                  <h3>{selecionada.nome}</h3>
                  <p>{formatarEndereco(selecionada)}</p>
                  {selecionada.telefone && <p>Telefone: {selecionada.telefone}</p>}
                  {selecionada.email && <p>{selecionada.email}</p>}
                  <small>{paginaAtiva ? 'Página de agendamento disponível' : 'Página temporariamente indisponível'}</small>
                  <div className="acoes-gestao">
                    <button onClick={() => aoEditar(selecionada)} type="button">Editar unidade</button>
                    <button disabled={!paginaAtiva} onClick={() => aoCopiarLink(selecionada)} type="button">Copiar link</button>
                    <button disabled={!paginaAtiva} onClick={() => aoCompartilhar(selecionada)} type="button">WhatsApp</button>
                  </div>
                </> : <p>Os dados e as ações da unidade selecionada aparecem aqui.</p>}
              </div>
            </aside>
          </div>}
          {semLocalizacao.length > 0 && <section aria-label="Unidades sem localização" className="unidades-mapa__pendencias">
            <h3>{semLocalizacao.length} {semLocalizacao.length === 1 ? 'unidade sem localização' : 'unidades sem localização'}</h3>
            <p>Atualize a localização destas unidades para exibi-las no mapa.</p>
            <ul>{semLocalizacao.map((unidade) => <li key={unidade.idUnidade}><span><strong>{unidade.nome}</strong><small>{formatarEndereco(unidade)}</small></span><button aria-label={`Definir localização de ${unidade.nome}`} className="botao-secundario" onClick={() => aoEditar(unidade)} type="button">Definir localização</button></li>)}</ul>
          </section>}
        </>}
      </>}
    </div>
  </div>;
}

function MapaUnidades({ unidades, aoSelecionar, idSelecionada, enquadramento, aoVoltarLista }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const moduloMapa = useRef(null);
  const marcadores = useRef(new Map());
  const [pronto, definirPronto] = useState(false);
  const [erro, definirErro] = useState(false);
  const idDescricao = useId();

  useEffect(() => {
    let ativo = true;
    let observador;
    let temporizador;

    async function iniciar() {
      const estilo = obterEstiloMapaHere();
      if (!estilo) throw new Error('Mapa indisponível.');
      const pacote = await import('maplibre-gl');
      if (!ativo || !elementoMapa.current) return;
      const maplibregl = pacote.default ?? pacote;
      moduloMapa.current = maplibregl;
      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const mapa = new maplibregl.Map({
        container: elementoMapa.current, style: estilo, center: obterCoordenadas(unidades[0]), zoom: 12,
        locale: { 'NavigationControl.ZoomIn': 'Aproximar', 'NavigationControl.ZoomOut': 'Afastar', 'Map.Title': 'Mapa das unidades' },
      });
      instanciaMapa.current = mapa;
      mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapa.on('error', () => { if (ativo) definirErro(true); });
      mapa.once('load', () => {
        if (!ativo) return;
        window.clearTimeout(temporizador);
        definirPronto(true);
      });
      temporizador = window.setTimeout(() => { if (ativo) definirErro(true); }, 20_000);
      observador = new ResizeObserver(() => { if (ativo) mapa.resize(); });
      observador.observe(elementoMapa.current);
    }

    iniciar().catch(() => { if (ativo) definirErro(true); });
    return () => {
      ativo = false;
      window.clearTimeout(temporizador);
      observador?.disconnect();
      marcadores.current.forEach((marcador) => marcador.remove());
      marcadores.current.clear();
      instanciaMapa.current?.remove();
      instanciaMapa.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = instanciaMapa.current;
    const maplibregl = moduloMapa.current;
    if (!pronto || !mapa || !maplibregl) return;
    const novosMarcadores = new Map();
    unidades.forEach((unidade, indice) => {
      const elemento = document.createElement('button');
      elemento.className = 'unidades-mapa__marcador';
      elemento.type = 'button';
      elemento.textContent = String(indice + 1);
      elemento.title = unidade.nome;
      elemento.setAttribute('aria-label', `Selecionar unidade ${unidade.nome}`);
      elemento.setAttribute('aria-pressed', 'false');
      elemento.addEventListener('click', () => aoSelecionar(String(unidade.idUnidade)));
      const marcador = new maplibregl.Marker({ element: elemento }).setLngLat(obterCoordenadas(unidade)).addTo(mapa);
      novosMarcadores.set(String(unidade.idUnidade), marcador);
    });
    marcadores.current = novosMarcadores;
    return () => {
      novosMarcadores.forEach((marcador) => marcador.remove());
      novosMarcadores.clear();
    };
  }, [aoSelecionar, pronto, unidades]);

  useEffect(() => {
    const mapa = instanciaMapa.current;
    const maplibregl = moduloMapa.current;
    if (!pronto || !mapa || !maplibregl || !unidades.length) return;
    const limites = new maplibregl.LngLatBounds();
    unidades.forEach((unidade) => limites.extend(obterCoordenadas(unidade)));
    mapa.fitBounds(limites, { padding: 48, maxZoom: 14, duration: 0 });
  }, [enquadramento, pronto, unidades]);

  useEffect(() => {
    if (!pronto) return;
    marcadores.current.forEach((marcador, id) => marcador.getElement().setAttribute('aria-pressed', String(id === idSelecionada)));
    const selecionado = marcadores.current.get(idSelecionada);
    if (selecionado && instanciaMapa.current) {
      const reduzirMovimento = document.documentElement.dataset.reducaoMovimento === 'ativa'
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      instanciaMapa.current.easeTo({ center: selecionado.getLngLat(), zoom: 15, duration: reduzirMovimento ? 0 : 400 });
    }
  }, [idSelecionada, pronto, unidades]);

  return <div className="unidades-mapa__quadro">
    <div aria-describedby={idDescricao} aria-label="Mapa das unidades do salão" className="unidades-mapa__mapa" inert={!pronto || erro} ref={elementoMapa} role="region" />
    <p className="visualmente-oculto" id={idDescricao}>Use os controles para aproximar ou afastar. As mesmas unidades podem ser selecionadas pelos botões ao lado do mapa.</p>
    {erro ? <div className="unidades-mapa__aviso" role="status"><strong>Não foi possível carregar o mapa.</strong><p>Você pode consultar e editar suas unidades na lista.</p><button className="botao-secundario" onClick={aoVoltarLista} type="button">Voltar para a lista</button></div>
      : !pronto && <p className="unidades-mapa__aviso" role="status">Carregando o mapa das suas unidades…</p>}
  </div>;
}
