'use client';

import { useEffect, useRef, useState } from 'react';
import { obterEstiloMapaHere } from '../../utils/here';
import { toastErro } from '../../utils/toast';

const centroInicial = { latitude: -23.5505, longitude: -46.6333 };

export default function MapaAjusteFilial({ coordenadas }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const marcador = useRef(null);
  const moduloMapa = useRef(null);
  const [mapaPronto, definirMapaPronto] = useState(false);
  const [erro, definirErro] = useState('');

  useEffect(() => {
    let estaAtivo = true;

    async function iniciarMapa() {
      const estiloHere = obterEstiloMapaHere();
      if (!estiloHere) throw new Error('Configure a chave pública da HERE para carregar o mapa.');

      const pacoteMapa = await import('maplibre-gl');
      const maplibregl = pacoteMapa.default ?? pacoteMapa;
      if (!estaAtivo || !elementoMapa.current || instanciaMapa.current) return;

      maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      moduloMapa.current = maplibregl;
      const posicaoInicial = coordenadas ?? centroInicial;
      instanciaMapa.current = new maplibregl.Map({
        center: [posicaoInicial.longitude, posicaoInicial.latitude],
        container: elementoMapa.current,
        style: estiloHere,
        zoom: coordenadas ? 17 : 10,
      });
      instanciaMapa.current.addControl(new maplibregl.NavigationControl(), 'top-right');
      definirMapaPronto(true);
    }

    iniciarMapa().catch((causa) => { if (estaAtivo) { definirErro('Mapa indisponível no momento.'); toastErro(causa.message || 'Não foi possível carregar o mapa agora.'); } });
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
      marcador.current = new maplibregl.Marker({ color: '#e55353', draggable: false })
        .setLngLat(posicao)
        .addTo(instanciaMapa.current);
    } else {
      marcador.current.setLngLat(posicao);
    }
    instanciaMapa.current.flyTo({ center: posicao, essential: true, zoom: 17 });
  }, [coordenadas, mapaPronto]);

  if (erro) return <p className="estado-localizacao">{erro}</p>;
  return <div aria-hidden="true" className="mapa-ajuste-filial maplibregl-map" inert ref={elementoMapa} />;
}
