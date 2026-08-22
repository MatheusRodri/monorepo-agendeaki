'use client';

import { useEffect, useRef, useState } from 'react';

export default function MapaSaloes({ aoSelecionarSalao, coordenadas, salaoSelecionado, saloes }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const camadaMarcadores = useRef(null);
  const moduloLeaflet = useRef(null);
  const marcadoresPorUnidade = useRef(new Map());
  const [mapaPronto, definirMapaPronto] = useState(false);

  useEffect(() => {
    let estaAtivo = true;

    async function iniciarMapa() {
      const pacoteLeaflet = await import('leaflet');
      const leaflet = pacoteLeaflet.default ?? pacoteLeaflet;

      if (!estaAtivo || !elementoMapa.current || instanciaMapa.current) return;

      moduloLeaflet.current = leaflet;
      instanciaMapa.current = leaflet.map(elementoMapa.current, { zoomControl: false }).setView([-23.5505, -46.6333], 12);
      leaflet.control.zoom({ position: 'bottomright' }).addTo(instanciaMapa.current);
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(instanciaMapa.current);
      camadaMarcadores.current = leaflet.layerGroup().addTo(instanciaMapa.current);
      definirMapaPronto(true);
    }

    iniciarMapa();

    return () => {
      estaAtivo = false;
      instanciaMapa.current?.remove();
      instanciaMapa.current = null;
      definirMapaPronto(false);
    };
  }, []);

  useEffect(() => {
    if (!coordenadas || !instanciaMapa.current || !mapaPronto) return;
    instanciaMapa.current.setView([coordenadas.latitude, coordenadas.longitude], 13);
  }, [coordenadas, mapaPronto]);

  useEffect(() => {
    const leaflet = moduloLeaflet.current;
    if (!leaflet || !camadaMarcadores.current || !instanciaMapa.current || !mapaPronto) return;

    camadaMarcadores.current.clearLayers();
    marcadoresPorUnidade.current.clear();
    const pontos = coordenadas ? [[Number(coordenadas.latitude), Number(coordenadas.longitude)]] : [];

    saloes.forEach((salao) => {
      const latitude = Number(salao.latitude);
      const longitude = Number(salao.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const marcador = leaflet.marker([latitude, longitude], {
        icon: leaflet.divIcon({
          className: `marcador-salao marcador-salao--${salao.categoria.toLowerCase()}`,
          html: '<span></span>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      });

      marcador.bindPopup(`<div class="popup-salao"><span>${salao.categoria.toLowerCase()}</span><strong>${salao.nomeSalao}</strong><p>${salao.nomeUnidade} · ${salao.bairro}</p><a href="/cliente/saloes/${salao.idUnidade}">Ver serviços →</a></div>`, { closeButton: false, offset: [0, -13] });
      marcador.on('click', () => aoSelecionarSalao(salao));
      marcador.addTo(camadaMarcadores.current);
      marcadoresPorUnidade.current.set(salao.idUnidade, marcador);
      pontos.push([latitude, longitude]);
    });

    if (pontos.length > 1) {
      instanciaMapa.current.fitBounds(pontos, { padding: [48, 48], maxZoom: 13 });
    }
  }, [aoSelecionarSalao, coordenadas, mapaPronto, saloes]);

  useEffect(() => {
    const marcador = salaoSelecionado ? marcadoresPorUnidade.current.get(salaoSelecionado.idUnidade) : null;
    if (marcador) marcador.openPopup();
  }, [salaoSelecionado]);

  return <div aria-label="Mapa de salões próximos" className="mapa-saloes" ref={elementoMapa} role="application" />;
}
