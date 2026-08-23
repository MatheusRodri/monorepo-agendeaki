'use client';

import { useEffect, useRef, useState } from 'react';

const centroInicial = { latitude: -23.5505, longitude: -46.6333 };

function formatarCep(cep) {
  const numeros = String(cep ?? '').replace(/\D/g, '');
  return numeros.length === 8 ? `${numeros.slice(0, 5)}-${numeros.slice(5)}` : cep;
}

function criarConteudoPopup(salao) {
  const conteudo = document.createElement('div');
  conteudo.className = 'popup-salao';

  const categoria = document.createElement('span');
  categoria.textContent = salao.categoria.toLowerCase();
  const nomeUnidade = document.createElement('strong');
  nomeUnidade.textContent = salao.nomeUnidade;
  const endereco = document.createElement('p');
  const logradouro = [salao.rua, salao.numeroEndereco].filter(Boolean).join(', ');
  const complemento = salao.complemento ? ` · ${salao.complemento}` : '';
  const localidade = [salao.bairro, [salao.municipio, salao.estado].filter(Boolean).join('/')].filter(Boolean).join(', ');
  const cep = formatarCep(salao.cep);
  endereco.textContent = [logradouro && `${logradouro}${complemento}`, localidade, cep && `CEP ${cep}`].filter(Boolean).join(' — ');
  const link = document.createElement('a');
  link.href = `/cliente/saloes/${salao.idUnidade}`;
  link.textContent = 'Ver serviços →';

  conteudo.append(categoria, nomeUnidade, endereco, link);
  return conteudo;
}

export default function MapaSaloes({ aoSelecionarSalao, coordenadas, salaoSelecionado, saloes }) {
  const elementoMapa = useRef(null);
  const instanciaMapa = useRef(null);
  const moduloMapa = useRef(null);
  const marcadoresPorUnidade = useRef(new Map());
  const [mapaPronto, definirMapaPronto] = useState(false);
  const [erro, definirErro] = useState('');

  useEffect(() => {
    let estaAtivo = true;

    async function iniciarMapa() {
      const pacoteMapa = await import('maplibre-gl');
      const maplibregl = pacoteMapa.default ?? pacoteMapa;
      if (!estaAtivo || !elementoMapa.current || instanciaMapa.current) return;

      moduloMapa.current = maplibregl;
      instanciaMapa.current = new maplibregl.Map({
        center: [centroInicial.longitude, centroInicial.latitude],
        container: elementoMapa.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        zoom: 12,
      });
      instanciaMapa.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');
      instanciaMapa.current.once('load', () => { if (estaAtivo) definirMapaPronto(true); });
    }

    iniciarMapa().catch(() => { if (estaAtivo) definirErro('Não foi possível carregar o mapa agora.'); });
    return () => {
      estaAtivo = false;
      marcadoresPorUnidade.current.clear();
      instanciaMapa.current?.remove();
      instanciaMapa.current = null;
    };
  }, []);

  useEffect(() => {
    if (!coordenadas || !instanciaMapa.current || !mapaPronto) return;
    instanciaMapa.current.flyTo({
      center: [coordenadas.longitude, coordenadas.latitude],
      essential: true,
      zoom: 13,
    });
  }, [coordenadas, mapaPronto]);

  useEffect(() => {
    const maplibregl = moduloMapa.current;
    const mapa = instanciaMapa.current;
    if (!maplibregl || !mapa || !mapaPronto) return;

    marcadoresPorUnidade.current.forEach((marcador) => marcador.remove());
    marcadoresPorUnidade.current.clear();

    const pontos = coordenadas ? [[Number(coordenadas.longitude), Number(coordenadas.latitude)]] : [];
    saloes.forEach((salao) => {
      const latitude = Number(salao.latitude);
      const longitude = Number(salao.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const elementoMarcador = document.createElement('button');
      elementoMarcador.type = 'button';
      elementoMarcador.className = `marcador-salao marcador-salao--${salao.categoria.toLowerCase()}`;
      elementoMarcador.setAttribute('aria-label', `Selecionar ${salao.nomeSalao}`);
      elementoMarcador.append(document.createElement('span'));

      const popup = new maplibregl.Popup({ closeButton: false, offset: 20 }).setDOMContent(criarConteudoPopup(salao));
      const marcador = new maplibregl.Marker({ element: elementoMarcador, anchor: 'bottom' })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(mapa);

      elementoMarcador.addEventListener('click', () => aoSelecionarSalao(salao));
      marcadoresPorUnidade.current.set(salao.idUnidade, marcador);
      pontos.push([longitude, latitude]);
    });

    if (pontos.length > 1) mapa.fitBounds(pontos, { padding: 48, maxZoom: 13 });
  }, [aoSelecionarSalao, coordenadas, mapaPronto, saloes]);

  useEffect(() => {
    const marcador = salaoSelecionado ? marcadoresPorUnidade.current.get(salaoSelecionado.idUnidade) : null;
    const popup = marcador?.getPopup();
    if (popup && instanciaMapa.current && !popup.isOpen()) popup.addTo(instanciaMapa.current);
  }, [salaoSelecionado]);

  if (erro) return <p className="estado-lista">{erro}</p>;
  return <div aria-label="Mapa de salões próximos" className="mapa-saloes maplibregl-map" ref={elementoMapa} role="application" />;
}
