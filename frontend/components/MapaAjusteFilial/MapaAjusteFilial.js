'use client';

import { useEffect, useRef, useState } from 'react';

const centroInicial = { latitude: -23.5505, longitude: -46.6333 };

export default function MapaAjusteFilial({ coordenadas }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const marcador = useRef(null);
  const moduloMapbox = useRef(null);
  const [mapaPronto, definirMapaPronto] = useState(false);
  const [erro, definirErro] = useState('');

  useEffect(() => {
    let estaAtivo = true;

    async function iniciarMapa() {
      const tokenMapbox = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!tokenMapbox) {
        definirErro('Configure o token público do Mapbox para exibir o mapa.');
        return;
      }

      const pacoteMapbox = await import('mapbox-gl');
      const mapboxgl = pacoteMapbox.default ?? pacoteMapbox;
      if (!estaAtivo || !elementoMapa.current || instanciaMapa.current) return;

      moduloMapbox.current = mapboxgl;
      mapboxgl.accessToken = tokenMapbox;
      const posicaoInicial = coordenadas ?? centroInicial;
      instanciaMapa.current = new mapboxgl.Map({
        center: [posicaoInicial.longitude, posicaoInicial.latitude],
        container: elementoMapa.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        zoom: coordenadas ? 17 : 10,
      });
      instanciaMapa.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
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
    const mapboxgl = moduloMapbox.current;
    if (!coordenadas || !mapboxgl || !instanciaMapa.current) return;
    const posicao = [coordenadas.longitude, coordenadas.latitude];
    if (!marcador.current) marcador.current = new mapboxgl.Marker({ color: '#e55353' }).setLngLat(posicao).addTo(instanciaMapa.current);
    else marcador.current.setLngLat(posicao);
    instanciaMapa.current.flyTo({ center: posicao, essential: true, zoom: 17 });
  }, [coordenadas, mapaPronto]);

  if (erro) return <p className="estado-localizacao">{erro}</p>;
  return <div aria-label="Mapa da localização da filial" className="mapa-ajuste-filial" ref={elementoMapa} />;
}
