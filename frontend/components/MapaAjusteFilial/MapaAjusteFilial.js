'use client';

import { useEffect, useRef } from 'react';

const coordenadasIniciais = { latitude: -23.5505, longitude: -46.6333 };

function criarIconePino(leaflet) {
  return leaflet.divIcon({
    className: 'mapa-ajuste-filial__icone-pino',
    html: '<span aria-hidden="true"></span>',
    iconAnchor: [15, 30],
    iconSize: [30, 30],
  });
}

export default function MapaAjusteFilial({ coordenadas, aoAlterarCoordenadas }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const marcador = useRef(null);
  const moduloLeaflet = useRef(null);
  const aoAlterarCoordenadasRef = useRef(aoAlterarCoordenadas);

  useEffect(() => { aoAlterarCoordenadasRef.current = aoAlterarCoordenadas; }, [aoAlterarCoordenadas]);

  useEffect(() => {
    let estaAtivo = true;

    async function iniciarMapa() {
      const pacoteLeaflet = await import('leaflet');
      const leaflet = pacoteLeaflet.default ?? pacoteLeaflet;
      if (!estaAtivo || !elementoMapa.current || instanciaMapa.current) return;

      moduloLeaflet.current = leaflet;
      const posicaoInicial = coordenadas ?? coordenadasIniciais;
      instanciaMapa.current = leaflet.map(elementoMapa.current, { zoomControl: true }).setView([posicaoInicial.latitude, posicaoInicial.longitude], coordenadas ? 18 : 11);
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(instanciaMapa.current);

      marcador.current = leaflet.marker([posicaoInicial.latitude, posicaoInicial.longitude], { draggable: true, icon: criarIconePino(leaflet) }).addTo(instanciaMapa.current);
      marcador.current.on('dragend', () => {
        const posicao = marcador.current.getLatLng();
        aoAlterarCoordenadasRef.current({ latitude: posicao.lat, longitude: posicao.lng });
      });
      instanciaMapa.current.on('click', (evento) => {
        marcador.current.setLatLng(evento.latlng);
        aoAlterarCoordenadasRef.current({ latitude: evento.latlng.lat, longitude: evento.latlng.lng });
      });
    }

    iniciarMapa();
    return () => { estaAtivo = false; instanciaMapa.current?.remove(); instanciaMapa.current = null; marcador.current = null; };
  }, []);

  useEffect(() => {
    if (!coordenadas || !instanciaMapa.current || !marcador.current) return;
    const posicao = [coordenadas.latitude, coordenadas.longitude];
    marcador.current.setLatLng(posicao);
    instanciaMapa.current.setView(posicao, 18);
  }, [coordenadas]);

  return <div aria-label="Mapa para ajustar a localização da filial" className="mapa-ajuste-filial" ref={elementoMapa} />;
}
