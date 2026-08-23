'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AlternadorTema from '../AlternadorTema/AlternadorTema';
import MapaSaloes from '../MapaSaloes/MapaSaloes';
import { lerRespostaApi, obterTokenAcesso, obterUrlApi } from '../../utils/respostaApi';

export default function AreaCliente() {
  const [coordenadas, definirCoordenadas] = useState(null);
  const [coordenadasMapa, definirCoordenadasMapa] = useState(null);
  const [raioKm, definirRaioKm] = useState(5);
  const [tipoSalao, definirTipoSalao] = useState('TODOS');
  const [busca, definirBusca] = useState('');
  const [cidade, definirCidade] = useState('');
  const [buscaAplicada, definirBuscaAplicada] = useState('');
  const [cidadeAplicada, definirCidadeAplicada] = useState('');
  const [sugestoes, definirSugestoes] = useState([]);
  const [saloes, definirSaloes] = useState([]);
  const [salaoSelecionado, definirSalaoSelecionado] = useState(null);
  const [mensagem, definirMensagem] = useState('Localizando salões próximos...');
  const [carregando, definirCarregando] = useState(false);

  const buscarSaloes = useCallback(async () => {
    if (!coordenadas) return;

    definirCarregando(true);
    definirMensagem('');
    try {
      const tokenAcesso = obterTokenAcesso();
      const urlApi = obterUrlApi();
      const parametros = new URLSearchParams({
        latitude: coordenadas.latitude,
        longitude: coordenadas.longitude,
        raioKm,
        busca: buscaAplicada,
        cidade: cidadeAplicada,
      });
      const resposta = await fetch(`${urlApi}/api/clientes/saloes-proximos?${parametros}`, {
        headers: tokenAcesso ? { Authorization: `Bearer ${tokenAcesso}` } : {},
      });
      const { dados: dadosResposta, mensagem: mensagemResposta } = await lerRespostaApi(resposta);

      if (!resposta.ok) throw new Error(dadosResposta.mensagem ?? mensagemResposta ?? 'Não foi possível buscar os salões.');

      definirSaloes(dadosResposta.saloes);
      definirCoordenadasMapa(dadosResposta.centroBusca);
      definirMensagem(dadosResposta.saloes.length ? '' : `Nenhum salão foi encontrado em até ${raioKm} km da sua localização. Verifique o filtro de tipo ou aumente o raio.`);
    } catch (erro) {
      definirSaloes([]);
      definirMensagem(erro.message);
    } finally {
      definirCarregando(false);
    }
  }, [buscaAplicada, cidadeAplicada, coordenadas, raioKm]);

  useEffect(() => {
    if (!navigator.geolocation) {
      definirMensagem('Seu navegador não disponibiliza localização.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => { const novaCoordenada = { latitude: posicao.coords.latitude, longitude: posicao.coords.longitude }; definirCoordenadas(novaCoordenada); definirCoordenadasMapa(novaCoordenada); },
      () => definirMensagem('Permita o acesso à localização para encontrar salões próximos.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => { buscarSaloes(); }, [buscarSaloes]);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { definirSugestoes([]); return undefined; }
    const atraso = window.setTimeout(async () => {
      try {
        const parametros = new URLSearchParams({ termo, cidade: cidade.trim() });
        const resposta = await fetch(`${obterUrlApi()}/api/clientes/sugestoes-saloes?${parametros}`, { headers: { Authorization: `Bearer ${obterTokenAcesso()}` } });
        const { dados } = await lerRespostaApi(resposta);
        if (resposta.ok) definirSugestoes(dados.sugestoes ?? []);
      } catch { definirSugestoes([]); }
    }, 250);
    return () => window.clearTimeout(atraso);
  }, [busca, cidade]);

  const saloesFiltrados = tipoSalao === 'TODOS'
    ? saloes
    : saloes.filter((salao) => salao.categoria === tipoSalao);

  function aplicarBusca(evento) {
    evento.preventDefault();
    definirBuscaAplicada(busca.trim());
    definirCidadeAplicada(cidade.trim());
    definirSalaoSelecionado(null);
  }

  function limparBusca() {
    definirBusca(''); definirCidade(''); definirBuscaAplicada(''); definirCidadeAplicada(''); definirSugestoes([]); definirSalaoSelecionado(null);
  }

  function escolherSugestao(sugestao) {
    definirBusca(sugestao.nomeSalao);
    definirBuscaAplicada(sugestao.nomeSalao);
    definirSugestoes([]);
    definirSalaoSelecionado(null);
  }

  return (
    <main className="area-cliente">
      <header className="cabecalho-area">
        <Link aria-label="AgendeAki: página inicial" className="marca" href="/"><span aria-hidden="true" className="marca__simbolo">a</span><span>agende<span>aki</span></span></Link>
        <nav aria-label="Navegação do cliente"><Link className="navegacao-area__ativo" href="/cliente/inicio">Explorar</Link><Link href="/cliente/agendamentos">Agendamentos</Link><Link href="/cliente/configuracoes">Configurações</Link></nav>
        <AlternadorTema />
      </header>

      <section className="area-cliente__conteudo">
        <aside className="painel-exploracao">
          <p className="sobretitulo">Descubra perto de você</p>
          <h1>O seu próximo <em>momento</em> está por aqui.</h1>
          <form className="busca-exploracao" onSubmit={aplicarBusca}>
            <label><span>Para onde você vai?</span><input onChange={(evento) => definirCidade(evento.target.value)} placeholder="Cidade de destino" value={cidade} /></label>
            <label className="campo-busca-sugestoes"><span>Busque um salão</span><input onChange={(evento) => definirBusca(evento.target.value)} placeholder="Nome do salão ou unidade" value={busca} />{sugestoes.length > 0 && <ul>{sugestoes.map((sugestao) => <li key={`${sugestao.nomeSalao}-${sugestao.nomeUnidade}`}><button onClick={() => escolherSugestao(sugestao)} type="button"><strong>{sugestao.nomeSalao}</strong><small>{sugestao.nomeUnidade} · {sugestao.municipio}</small></button></li>)}</ul>}</label>
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
          </div>
          <div className="lista-saloes">
            {carregando && <p className="estado-lista">Buscando salões...</p>}
            {mensagem && <p className="estado-lista">{mensagem}</p>}
            {!carregando && !mensagem && !saloesFiltrados.length && <p className="estado-lista">Nenhum salão desse tipo foi encontrado neste raio.</p>}
            {saloesFiltrados.map((salao) => (
              <button className={salaoSelecionado?.idUnidade === salao.idUnidade ? 'cartao-salao cartao-salao--selecionado' : 'cartao-salao'} key={salao.idUnidade} onClick={() => definirSalaoSelecionado(salao)} type="button">
                <span className="cartao-salao__icone">✦</span><span><strong>{salao.nomeUnidade}</strong><small>{salao.nomeSalao} · {Number(salao.distanciaKm).toFixed(1)} km</small><em>{salao.categoria.toLowerCase()}</em></span>
              </button>
            ))}
          </div>
        </aside>
        <section className="mapa-area">
          <MapaSaloes aoSelecionarSalao={definirSalaoSelecionado} coordenadas={coordenadasMapa} salaoSelecionado={salaoSelecionado} saloes={saloesFiltrados} />
        </section>
      </section>
    </main>
  );
}
