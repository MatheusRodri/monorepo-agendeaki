'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import MapaSaloes from '../MapaSaloes/MapaSaloes';
import { requisitarApi } from '../../utils/api';
import { toastErro } from '../../utils/toast';

export default function AreaCliente() {
  const [coordenadas, definirCoordenadas] = useState(null);
  const [coordenadasMapa, definirCoordenadasMapa] = useState(null);
  const [raioKm, definirRaioKm] = useState(5);
  const [tipoSalao, definirTipoSalao] = useState('TODOS');
  const [ordenacao, definirOrdenacao] = useState('DISTANCIA_ASC');
  const [centralizarNoCliente, definirCentralizarNoCliente] = useState(false);
  const [busca, definirBusca] = useState('');
  const [buscaAplicada, definirBuscaAplicada] = useState('');
  const [idUnidadeSelecionada, definirIdUnidadeSelecionada] = useState('');
  const [sugestoes, definirSugestoes] = useState([]);
  const [saloes, definirSaloes] = useState([]);
  const [salaoSelecionado, definirSalaoSelecionado] = useState(null);
  const [mensagem, definirMensagem] = useState('Localizando salões próximos...');
  const [carregando, definirCarregando] = useState(false);
  const [falhaBusca, definirFalhaBusca] = useState(false);
  const idBuscaAtual = useRef(0);
  const restauracaoConcluida = useRef(false);
  const idSalaoSelecionadoRestaurar = useRef(null);
  const [mapaProntoParaBuscar, definirMapaProntoParaBuscar] = useState(false);

  const estadoMapa = useMemo(() => ({
    busca,
    buscaAplicada,
    centralizarNoCliente,
    coordenadas,
    coordenadasMapa,
    idSalaoSelecionado: salaoSelecionado?.idUnidade ?? null,
    idUnidadeSelecionada,
    ordenacao,
    raioKm,
    tipoSalao,
  }), [busca, buscaAplicada, centralizarNoCliente, coordenadas, coordenadasMapa, idUnidadeSelecionada, ordenacao, raioKm, salaoSelecionado, tipoSalao]);
  const urlMapa = useMemo(() => `/cliente/inicio?mapa=${encodeURIComponent(JSON.stringify(estadoMapa))}`, [estadoMapa]);
  const urlMapaAtual = useRef(urlMapa);
  urlMapaAtual.current = urlMapa;
  const obterLinkSalao = useCallback((salao) => `/${salao.slugSalao}/${salao.slugFilial}?retornoMapa=${encodeURIComponent(urlMapaAtual.current)}`, []);

  useEffect(() => {
    try {
      const mapaSalvo = new URLSearchParams(window.location.search).get('mapa');
      const estado = mapaSalvo ? JSON.parse(mapaSalvo) : null;
      const latitude = Number(estado?.coordenadas?.latitude);
      const longitude = Number(estado?.coordenadas?.longitude);
      if (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
        const coordenadaRestaurada = { latitude, longitude };
        const latitudeMapa = Number(estado.coordenadasMapa?.latitude);
        const longitudeMapa = Number(estado.coordenadasMapa?.longitude);
        const centroMapaValido = Number.isFinite(latitudeMapa) && latitudeMapa >= -90 && latitudeMapa <= 90
          && Number.isFinite(longitudeMapa) && longitudeMapa >= -180 && longitudeMapa <= 180;
        definirCoordenadas(coordenadaRestaurada);
        definirCoordenadasMapa(centroMapaValido ? { latitude: latitudeMapa, longitude: longitudeMapa } : coordenadaRestaurada);
        definirRaioKm([0, 1, 5, 10].includes(Number(estado.raioKm)) ? Number(estado.raioKm) : 5);
        definirTipoSalao(['TODOS', 'FEMININO', 'MASCULINO', 'UNISSEX'].includes(estado.tipoSalao) ? estado.tipoSalao : 'TODOS');
        definirOrdenacao(['DISTANCIA_ASC', 'DISTANCIA_DESC', 'AVALIACOES_DESC', 'AVALIACOES_ASC'].includes(estado.ordenacao) ? estado.ordenacao : 'DISTANCIA_ASC');
        definirBusca(String(estado.busca ?? ''));
        definirBuscaAplicada(String(estado.buscaAplicada ?? ''));
        definirIdUnidadeSelecionada(String(estado.idUnidadeSelecionada ?? ''));
        definirCentralizarNoCliente(Boolean(estado.centralizarNoCliente));
        const idSalaoSelecionado = Number(estado.idSalaoSelecionado);
        idSalaoSelecionadoRestaurar.current = Number.isSafeInteger(idSalaoSelecionado) && idSalaoSelecionado > 0 ? idSalaoSelecionado : null;
        restauracaoConcluida.current = true;
      }
    } catch {
      restauracaoConcluida.current = false;
    }
    definirMapaProntoParaBuscar(true);
  }, []);

  const buscarSaloes = useCallback(async () => {
    if (!coordenadas) return;

    const idBusca = ++idBuscaAtual.current;
    definirCarregando(true);
    definirFalhaBusca(false);
    definirMensagem('');
    try {
      const parametros = new URLSearchParams({
        latitude: coordenadas.latitude,
        longitude: coordenadas.longitude,
        raioKm,
        busca: buscaAplicada,
      });
      if (idUnidadeSelecionada) parametros.set('idUnidade', idUnidadeSelecionada);
      const dadosResposta = await requisitarApi('/api/clientes/saloes-proximos', { parametros });
      if (idBusca !== idBuscaAtual.current) return;

      definirSaloes(dadosResposta.saloes);
      definirCoordenadasMapa(dadosResposta.centroBusca);
      definirMensagem(dadosResposta.saloes.length ? '' : (raioKm === 0
        ? 'Nenhum salão foi encontrado com esses filtros.'
        : `Nenhum salão foi encontrado em até ${raioKm} km da sua localização. Verifique o filtro de tipo ou aumente o raio.`));
    } catch (erro) {
      if (idBusca !== idBuscaAtual.current) return;
      definirSaloes([]);
      definirMensagem('');
      definirFalhaBusca(true);
      toastErro(erro.message);
    } finally {
      if (idBusca === idBuscaAtual.current) definirCarregando(false);
    }
  }, [buscaAplicada, coordenadas, idUnidadeSelecionada, raioKm]);

  const localizarCliente = useCallback((centralizar = false) => {
    if (!navigator.geolocation) {
      definirMensagem('');
      definirFalhaBusca(true);
      toastErro('Seu navegador não disponibiliza localização.');
      return;
    }

    definirCarregando(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const novaCoordenada = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude };
        if (centralizar) {
          definirIdUnidadeSelecionada('');
          definirBusca(''); definirBuscaAplicada(''); definirSalaoSelecionado(null);
          definirCentralizarNoCliente(true);
        }
        definirCoordenadas(novaCoordenada); definirCoordenadasMapa(novaCoordenada);
        definirCarregando(false);
      },
      () => { definirCarregando(false); definirMensagem(''); definirFalhaBusca(true); toastErro('Permita o acesso à localização para encontrar salões próximos.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (!mapaProntoParaBuscar || restauracaoConcluida.current) return;
    restauracaoConcluida.current = true;
    localizarCliente();
  }, [localizarCliente, mapaProntoParaBuscar]);

  useEffect(() => { buscarSaloes(); }, [buscarSaloes]);

  useEffect(() => {
    if (idSalaoSelecionadoRestaurar.current == null) return;
    const salao = saloes.find((item) => Number(item.idUnidade) === idSalaoSelecionadoRestaurar.current);
    if (!salao) return;
    definirSalaoSelecionado(salao);
    idSalaoSelecionadoRestaurar.current = null;
  }, [saloes]);

  useEffect(() => {
    if (idUnidadeSelecionada) { definirSugestoes([]); return undefined; }
    const termo = busca.trim();
    if (termo.length < 2) { definirSugestoes([]); return undefined; }
    const atraso = window.setTimeout(async () => {
      try {
        const parametros = new URLSearchParams({ termo });
        const dados = await requisitarApi('/api/clientes/sugestoes-saloes', { parametros });
        definirSugestoes(dados.sugestoes ?? []);
      } catch { definirSugestoes([]); }
    }, 250);
    return () => window.clearTimeout(atraso);
  }, [busca, idUnidadeSelecionada]);

  const saloesFiltrados = useMemo(() => (tipoSalao === 'TODOS'
    ? saloes
    : saloes.filter((salao) => salao.categoria === tipoSalao)).slice().sort((primeiro, segundo) => {
    if (Boolean(primeiro.proAtivo) !== Boolean(segundo.proAtivo)) return primeiro.proAtivo ? -1 : 1;
    const valorPrimeiro = ordenacao.startsWith('DISTANCIA') ? Number(primeiro.distanciaKm) : Number(primeiro.quantidadeAvaliacoes);
    const valorSegundo = ordenacao.startsWith('DISTANCIA') ? Number(segundo.distanciaKm) : Number(segundo.quantidadeAvaliacoes);
    const diferenca = ordenacao.endsWith('DESC') ? valorSegundo - valorPrimeiro : valorPrimeiro - valorSegundo;
    return diferenca || primeiro.nomeSalao.localeCompare(segundo.nomeSalao, 'pt-BR')
      || primeiro.nomeUnidade.localeCompare(segundo.nomeUnidade, 'pt-BR')
      || Number(primeiro.idUnidade) - Number(segundo.idUnidade);
  }), [ordenacao, saloes, tipoSalao]);

  function aplicarBusca(evento) {
    evento.preventDefault();
    definirBuscaAplicada(busca.trim());
    definirIdUnidadeSelecionada('');
    definirSalaoSelecionado(null);
    definirCentralizarNoCliente(false);
  }

  function limparBusca() {
    definirBusca(''); definirBuscaAplicada(''); definirIdUnidadeSelecionada(''); definirSugestoes([]); definirSalaoSelecionado(null);
  }

  function escolherSugestao(sugestao) {
    definirBusca(`${sugestao.nomeSalao} · ${sugestao.nomeUnidade}`);
    definirBuscaAplicada('');
    definirIdUnidadeSelecionada(String(sugestao.idUnidade));
    definirCentralizarNoCliente(false);
    definirSugestoes([]);
    definirSalaoSelecionado(null);
  }

  return (
    <main className="area-cliente">
      <CabecalhoCliente secao="inicio" />

      <section className="area-cliente__conteudo">
        <aside className="painel-exploracao">
          <p className="sobretitulo">Descubra perto de você</p>
          <h1>O seu próximo <em>momento</em> está por aqui.</h1>
          <form className="busca-exploracao" onSubmit={aplicarBusca}>
            <label className="campo-busca-sugestoes"><span>Busque um salão</span><input onChange={(evento) => { definirBusca(evento.target.value); definirIdUnidadeSelecionada(''); }} placeholder="Nome do salão ou unidade" value={busca} />{sugestoes.length > 0 && <ul>{sugestoes.map((sugestao) => <li key={sugestao.idUnidade}><button onClick={() => escolherSugestao(sugestao)} type="button"><strong>{sugestao.nomeSalao}</strong><small>{sugestao.nomeUnidade} · {sugestao.municipio}</small></button></li>)}</ul>}</label>
            <div><button type="submit">Buscar</button>{(buscaAplicada || idUnidadeSelecionada) && <button onClick={limparBusca} type="button">Limpar</button>}</div>
          </form>
          <div className="filtros-exploracao">
            <div className="filtro-raio" role="group" aria-label="Raio de busca">
              <span>Distância</span>
              {[[1, '1 km'], [5, '5 km'], [10, '10 km'], [0, 'Sem distância']].map(([raio, rotulo]) => <button className={raioKm === raio ? 'filtro-raio__ativo' : ''} key={raio} onClick={() => { definirRaioKm(raio); definirCentralizarNoCliente(false); }} type="button">{rotulo}</button>)}
            </div>
            <div className="filtro-tipo" role="group" aria-label="Tipo de salão">
              <span>Tipo</span>
              {[['TODOS', 'Todos'], ['FEMININO', 'Feminino'], ['MASCULINO', 'Masculino'], ['UNISSEX', 'Unissex']].map(([tipo, rotulo]) => <button className={tipoSalao === tipo ? 'filtro-tipo__ativo' : ''} key={tipo} onClick={() => { definirTipoSalao(tipo); definirSalaoSelecionado(null); }} type="button">{rotulo}</button>)}
            </div>
            <label className="filtro-ordenacao"><span>Ordenar por</span><select onChange={(evento) => definirOrdenacao(evento.target.value)} value={ordenacao}><option value="DISTANCIA_ASC">Menor distância</option><option value="DISTANCIA_DESC">Maior distância</option><option value="AVALIACOES_DESC">Mais avaliações</option><option value="AVALIACOES_ASC">Menos avaliações</option></select></label>
          </div>
          <div className="lista-saloes">
            {carregando && <p className="estado-lista">Buscando salões...</p>}
            {mensagem && <p className="estado-lista">{mensagem}</p>}
            {!carregando && !mensagem && !falhaBusca && !saloesFiltrados.length && <p className="estado-lista">Nenhum salão desse tipo foi encontrado neste raio.</p>}
            {saloesFiltrados.map((salao) => (
              <Link className={`cartao-salao${salao.proAtivo ? ' cartao-salao--pro' : ''}`} href={obterLinkSalao(salao)} key={salao.idUnidade}>
                <span className="cartao-salao__icone">✦</span><span><strong>{salao.nomeUnidade} {Boolean(salao.proAtivo) && <b className="selo-pro">Premium</b>}</strong><small>{salao.nomeSalao} · {Number(salao.distanciaKm).toFixed(1)} km</small><small>{salao.quantidadeAvaliacoes ? `★ ${Number(salao.mediaAvaliacao).toFixed(1)} · ${salao.quantidadeAvaliacoes} avaliações` : 'Sem avaliações'}</small><em>{salao.categoria.toLowerCase()}</em></span>
              </Link>
            ))}
          </div>
        </aside>
        <section className="mapa-area">
          <button className="botao-centralizar" disabled={carregando} onClick={() => localizarCliente(true)} type="button">⌖ Centralizar na minha localização</button>
          <MapaSaloes aoSelecionarSalao={definirSalaoSelecionado} centralizarNoCliente={centralizarNoCliente} coordenadas={coordenadasMapa} obterLinkSalao={obterLinkSalao} salaoSelecionado={salaoSelecionado} saloes={saloesFiltrados} />
        </section>
      </section>
    </main>
  );
}
