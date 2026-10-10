'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CabecalhoCliente from '../CabecalhoCliente/CabecalhoCliente';
import MapaSaloes from '../MapaSaloes/MapaSaloes';
import { requisitarApi } from '../../utils/api';

export default function AreaCliente() {
  const [coordenadas, definirCoordenadas] = useState(null);
  const [coordenadasMapa, definirCoordenadasMapa] = useState(null);
  const [raioKm, definirRaioKm] = useState(5);
  const [tipoSalao, definirTipoSalao] = useState('TODOS');
  const [ordenacao, definirOrdenacao] = useState('DISTANCIA_ASC');
  const [centralizarNoCliente, definirCentralizarNoCliente] = useState(false);
  const [busca, definirBusca] = useState('');
  const [cidade, definirCidade] = useState('');
  const [buscaAplicada, definirBuscaAplicada] = useState('');
  const [cidadeAplicada, definirCidadeAplicada] = useState('');
  const [idUnidadeSelecionada, definirIdUnidadeSelecionada] = useState('');
  const [sugestoes, definirSugestoes] = useState([]);
  const [saloes, definirSaloes] = useState([]);
  const [salaoSelecionado, definirSalaoSelecionado] = useState(null);
  const [mensagem, definirMensagem] = useState('Localizando salões próximos...');
  const [carregando, definirCarregando] = useState(false);
  const idBuscaAtual = useRef(0);

  const buscarSaloes = useCallback(async () => {
    if (!coordenadas) return;

    const idBusca = ++idBuscaAtual.current;
    definirCarregando(true);
    definirMensagem('');
    try {
      const parametros = new URLSearchParams({
        latitude: coordenadas.latitude,
        longitude: coordenadas.longitude,
        raioKm,
        busca: buscaAplicada,
        cidade: cidadeAplicada,
      });
      if (idUnidadeSelecionada) parametros.set('idUnidade', idUnidadeSelecionada);
      const dadosResposta = await requisitarApi('/api/clientes/saloes-proximos', { parametros });
      if (idBusca !== idBuscaAtual.current) return;

      definirSaloes(dadosResposta.saloes);
      definirCoordenadasMapa(dadosResposta.centroBusca);
      definirMensagem(dadosResposta.saloes.length ? '' : `Nenhum salão foi encontrado em até ${raioKm} km da sua localização. Verifique o filtro de tipo ou aumente o raio.`);
    } catch (erro) {
      if (idBusca !== idBuscaAtual.current) return;
      definirSaloes([]);
      definirMensagem(erro.message);
    } finally {
      if (idBusca === idBuscaAtual.current) definirCarregando(false);
    }
  }, [buscaAplicada, cidadeAplicada, coordenadas, idUnidadeSelecionada, raioKm]);

  const localizarCliente = useCallback((centralizar = false) => {
    if (!navigator.geolocation) {
      definirMensagem('Seu navegador não disponibiliza localização.');
      return;
    }

    definirCarregando(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const novaCoordenada = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude };
        if (centralizar) {
          definirCidade(''); definirCidadeAplicada(''); definirIdUnidadeSelecionada('');
          definirBusca(''); definirBuscaAplicada(''); definirSalaoSelecionado(null);
          definirCentralizarNoCliente(true);
        }
        definirCoordenadas(novaCoordenada); definirCoordenadasMapa(novaCoordenada);
        definirCarregando(false);
      },
      () => { definirCarregando(false); definirMensagem('Permita o acesso à localização para encontrar salões próximos.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => { localizarCliente(); }, [localizarCliente]);

  useEffect(() => { buscarSaloes(); }, [buscarSaloes]);

  useEffect(() => {
    if (idUnidadeSelecionada) { definirSugestoes([]); return undefined; }
    const termo = busca.trim();
    if (termo.length < 2) { definirSugestoes([]); return undefined; }
    const atraso = window.setTimeout(async () => {
      try {
        const parametros = new URLSearchParams({ termo, cidade: cidade.trim() });
        const dados = await requisitarApi('/api/clientes/sugestoes-saloes', { parametros });
        definirSugestoes(dados.sugestoes ?? []);
      } catch { definirSugestoes([]); }
    }, 250);
    return () => window.clearTimeout(atraso);
  }, [busca, cidade, idUnidadeSelecionada]);

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
    definirCidadeAplicada(cidade.trim());
    definirIdUnidadeSelecionada('');
    definirSalaoSelecionado(null);
    definirCentralizarNoCliente(false);
  }

  function limparBusca() {
    definirBusca(''); definirCidade(''); definirBuscaAplicada(''); definirCidadeAplicada(''); definirIdUnidadeSelecionada(''); definirSugestoes([]); definirSalaoSelecionado(null);
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
            <label><span>Para onde você vai?</span><input onChange={(evento) => definirCidade(evento.target.value)} placeholder="Cidade de destino" value={cidade} /></label>
            <label className="campo-busca-sugestoes"><span>Busque um salão</span><input onChange={(evento) => { definirBusca(evento.target.value); definirIdUnidadeSelecionada(''); }} placeholder="Nome do salão ou unidade" value={busca} />{sugestoes.length > 0 && <ul>{sugestoes.map((sugestao) => <li key={sugestao.idUnidade}><button onClick={() => escolherSugestao(sugestao)} type="button"><strong>{sugestao.nomeSalao}</strong><small>{sugestao.nomeUnidade} · {sugestao.municipio}</small></button></li>)}</ul>}</label>
            <div><button type="submit">Buscar</button>{(cidadeAplicada || buscaAplicada) && <button onClick={limparBusca} type="button">Limpar</button>}</div>
          </form>
          <div className="filtros-exploracao">
            <div className="filtro-raio" role="group" aria-label="Raio de busca">
              <span>Distância</span>
              {[1, 5, 10].map((raio) => <button className={raioKm === raio ? 'filtro-raio__ativo' : ''} key={raio} onClick={() => definirRaioKm(raio)} type="button">{raio} km</button>)}
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
            {!carregando && !mensagem && !saloesFiltrados.length && <p className="estado-lista">Nenhum salão desse tipo foi encontrado neste raio.</p>}
            {saloesFiltrados.map((salao) => (
              <Link className={`cartao-salao${salao.proAtivo ? ' cartao-salao--pro' : ''}`} href={`/${salao.slugSalao}/${salao.slugFilial}`} key={salao.idUnidade}>
                <span className="cartao-salao__icone">✦</span><span><strong>{salao.nomeUnidade} {Boolean(salao.proAtivo) && <b className="selo-pro">PRO</b>}</strong><small>{salao.nomeSalao} · {Number(salao.distanciaKm).toFixed(1)} km</small><small>{salao.quantidadeAvaliacoes ? `★ ${Number(salao.mediaAvaliacao).toFixed(1)} · ${salao.quantidadeAvaliacoes} avaliações` : 'Sem avaliações'}</small><em>{salao.categoria.toLowerCase()}</em></span>
              </Link>
            ))}
          </div>
        </aside>
        <section className="mapa-area">
          <button className="botao-centralizar" disabled={carregando} onClick={() => localizarCliente(true)} type="button">⌖ Centralizar na minha localização</button>
          <MapaSaloes aoSelecionarSalao={definirSalaoSelecionado} centralizarNoCliente={centralizarNoCliente} coordenadas={coordenadasMapa} salaoSelecionado={salaoSelecionado} saloes={saloesFiltrados} />
        </section>
      </section>
    </main>
  );
}
