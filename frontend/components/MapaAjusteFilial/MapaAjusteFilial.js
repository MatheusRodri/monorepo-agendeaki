'use client';

import { useEffect, useRef, useState } from 'react';

const centroInicial = { latitude: -23.5505, longitude: -46.6333 };

export default function MapaAjusteFilial({ coordenadas, modoAjuste = false, aoAjustar }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const marcador = useRef(null);
  const moduloMapa = useRef(null);
  const ajusteManualAtual = useRef(modoAjuste);
  const aoAjustarAtual = useRef(aoAjustar);
  const [mapaPronto, definirMapaPronto] = useState(false);
  const [erro, definirErro] = useState('');

  useEffect(() => {
    ajusteManualAtual.current = modoAjuste;
    aoAjustarAtual.current = aoAjustar;
    requestAnimationFrame(() => instanciaMapa.current?.resize());
  }, [aoAjustar, modoAjuste]);

  useEffect(() => {
    let estaAtivo = true;

    async function iniciarMapa() {
      const pacoteMapa = await import('maplibre-gl');
      const maplibregl = pacoteMapa.default ?? pacoteMapa;
      if (!estaAtivo || !elementoMapa.current || instanciaMapa.current) return;

      moduloMapa.current = maplibregl;
      const posicaoInicial = coordenadas ?? centroInicial;
      instanciaMapa.current = new maplibregl.Map({
        center: [posicaoInicial.longitude, posicaoInicial.latitude],
        container: elementoMapa.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        zoom: coordenadas ? 17 : 10,
      });
      instanciaMapa.current.addControl(new maplibregl.NavigationControl(), 'top-right');
      definirMapaPronto(true);
    }

    iniciarMapa().catch(() => { if (estaAtivo) definirErro('Não foi possível carregar o mapa agora.'); });
    return () => {
      estaAtivo = false;
      instanciaMapa.current?.remove();
      instanciaMapa.current = null;
      marcador.current = null;
    };
  }, []);

  useEffect(() => {
    const maplibregl = moduloMapa.current;
    if (!coordenadas || !maplibregl || !instanciaMapa.current) return;
    const posicao = [coordenadas.longitude, coordenadas.latitude];
    if (!marcador.current) {
      marcador.current = new maplibregl.Marker({ color: '#e55353', draggable: true })
        .setLngLat(posicao)
        .addTo(instanciaMapa.current);
      marcador.current.on('dragend', () => {
        if (!ajusteManualAtual.current) return;
        const novaPosicao = marcador.current.getLngLat();
        aoAjustarAtual.current?.({ latitude: novaPosicao.lat, longitude: novaPosicao.lng });
      });
    } else {
      marcador.current.setLngLat(posicao);
    }
    instanciaMapa.current.flyTo({ center: posicao, essential: true, zoom: 17 });
  }, [coordenadas, mapaPronto]);

  useEffect(() => {
    const mapa = instanciaMapa.current;
    if (!mapa || !mapaPronto) return undefined;

    function ajustarPorClique(evento) {
      if (!ajusteManualAtual.current) return;
      aoAjustarAtual.current?.({ latitude: evento.lngLat.lat, longitude: evento.lngLat.lng });
    }

    mapa.on('click', ajustarPorClique);
    return () => mapa.off('click', ajustarPorClique);
  }, [mapaPronto]);

  if (erro) return <p className="estado-localizacao">{erro}</p>;
  return <div aria-label={modoAjuste ? 'Mapa para ajustar a localização da filial' : 'Mapa da localização da filial'} className={modoAjuste ? 'mapa-ajuste-filial mapa-ajuste-filial--ajustavel maplibregl-map' : 'mapa-ajuste-filial maplibregl-map'} ref={elementoMapa} />;
}
