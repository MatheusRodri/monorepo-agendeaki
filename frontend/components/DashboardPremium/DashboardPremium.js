'use client';

import { useEffect, useRef, useState } from 'react';
import { toastErro } from '../../utils/toast';
import DetalhesDashboard from './DetalhesDashboard';
import TabelaAnalitico from './TabelaAnalitico';
import PaginacaoAnalitico from './PaginacaoAnalitico';
import IndicadoresDashboard, { IndicadoresDetalhados } from './IndicadoresDashboard';
import FiltrosDashboard, { filtrosPrecos } from './FiltrosDashboard';
import IconeDashboard from './IconeDashboard';

const dinheiro = (valor) => Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const descricaoFiltrosPrecos = (filtros) => filtrosPrecos.map(([campo, rotulo, opcoes]) => `${rotulo}: ${opcoes.find(([valor]) => valor === filtros[campo])?.[1] ?? opcoes[0][1]}`).join(' · ');
const abas = [['geral', 'Geral'], ['detalhado', 'Detalhado'], ['analitico', 'Analítico']];
const recortes = {
  todos: ['Todos · visão operacional', 'Cancelados pela data de cancelamento (ou agendada, quando ausente); demais status pela data agendada.'],
  agendamentos: ['Agendamentos no período', 'Todos os status, pela data agendada no período selecionado.'],
  realizados: ['Atendimentos realizados', 'Atendimentos realizados, pela data da confirmação no período selecionado.'],
  extras: ['Serviços extras realizados', 'Atendimentos com extras, pela data da confirmação. Serviços, profissionais e valores se referem apenas aos extras correspondentes aos filtros, incluindo os gratuitos.'],
  taxaCancelamento: ['Base da taxa de cancelamento', 'Atendimentos pela data agendada, cujo horário já começou ou que foram cancelados. Cada atendimento conta uma vez.'],
  comparecimento: ['Comparecimento', 'Realizados e não comparecimentos pela data agendada no período selecionado. Taxa = realizados ÷ (realizados + não compareceram). Cada atendimento é contado uma vez, independentemente da quantidade de serviços. Cancelados e agendamentos ainda sem confirmação ficam fora do cálculo.'],
  cancelados: ['Agendamentos cancelados', 'Cancelamentos pela data do cancelamento, usando a data agendada quando ausente.'],
  naoCompareceu: ['Não compareceram', 'Ausências pela data agendada no período selecionado.'],
  previstos: ['Previsão · próximos 30 dias', 'Agendamentos ativos entre agora e os próximos 30 dias. Esta janela independe do período geral; unidade, serviço e profissional continuam aplicados.'],
};
const dataLegivel = (data) => /^\d{4}-\d{2}-\d{2}$/.test(data ?? '') ? data.split('-').reverse().join('/') : '—';
function focarDetalhe(id) {
  const destino = document.getElementById(id);
  let expansivel = destino?.closest('details');
  while (expansivel) {
    expansivel.open = true;
    expansivel = expansivel.parentElement?.closest('details');
  }
  destino?.focus({ preventScroll: true });
  destino?.scrollIntoView({ block: 'start' });
}
const parametrosDe = (dados) => new URLSearchParams(Object.entries(dados).filter(([, valor]) => valor !== '' && valor != null)).toString();

export default function DashboardPremium({ dados, filtrosDashboard, definirFiltrosDashboard, requisitar, carregando, erro, aoRecarregar }) {
  const [aba, definirAba] = useState('geral');
  const [controle, definirControle] = useState({ recorte: 'todos', visualizarPor: 'atendimento', pagina: 1, porPagina: 25, ordenarPor: 'dataInicio', direcao: 'desc', filtros: '' });
  const [consulta, definirConsulta] = useState({});
  const [tentativa, definirTentativa] = useState(0);
  const [exportando, definirExportando] = useState(false);
  const [preparandoPdf, definirPreparandoPdf] = useState(false);
  const [relatorioPdf, definirRelatorioPdf] = useState(null);
  const tituloAnalitico = useRef(null);
  const focarAnalitico = useRef(false);
  const detalhePendente = useRef(null);
  const chaveFiltros = parametrosDe(filtrosDashboard);
  const atual = controle.filtros === chaveFiltros ? controle : { ...controle, pagina: 1, filtros: chaveFiltros };
  const parametros = parametrosDe({ ...filtrosDashboard, ...atual, filtros: undefined });
  const pendente = consulta.chave !== parametros || consulta.carregando;
  const resultado = consulta.chave === parametros ? consulta.resultado : null;
  const erroAnalitico = consulta.chave === parametros ? consulta.erro : '';

  function alterarControle(alteracoes) { definirControle({ ...atual, ...alteracoes }); }
  function abrirAnalitico(recorte, visualizarPor = 'atendimento', filtros = {}) {
    if (Object.keys(filtros).length) definirFiltrosDashboard({ ...filtrosDashboard, ...filtros });
    alterarControle({ recorte, visualizarPor, pagina: 1, ordenarPor: 'dataInicio', direcao: 'desc' });
    focarAnalitico.current = true;
    definirAba('analitico');
  }
  function abrirDetalhado(secao) {
    const id = `dashboard-detalhe-${secao}`;
    if (aba === 'detalhado') { focarDetalhe(id); return; }
    detalhePendente.current = id;
    definirAba('detalhado');
  }
  useEffect(() => {
    if (aba === 'detalhado' && detalhePendente.current) {
      focarDetalhe(detalhePendente.current);
      detalhePendente.current = null;
    }
    if (aba === 'analitico' && focarAnalitico.current) { tituloAnalitico.current?.focus(); focarAnalitico.current = false; }
  }, [aba]);

  useEffect(() => {
    if (aba !== 'analitico' || !filtrosDashboard.dataInicio || !filtrosDashboard.dataFim) return;
    let ativo = true;
    definirConsulta({ chave: parametros, carregando: true });
    requisitar(`/indicadores/premium/analitico?${parametros}`)
      .then((resposta) => { if (ativo) definirConsulta({ chave: parametros, resultado: resposta }); })
      .catch((falha) => { if (ativo) definirConsulta({ chave: parametros, erro: falha.message }); });
    return () => { ativo = false; };
  }, [aba, parametros, tentativa, requisitar, filtrosDashboard.dataInicio, filtrosDashboard.dataFim]);

  async function exportarExcel() {
    if (exportando) return;
    definirExportando(true);
    try {
      const query = parametrosDe({ ...filtrosDashboard, recorte: atual.recorte, visualizarPor: atual.visualizarPor, ordenarPor: atual.ordenarPor, direcao: atual.direcao, formato: 'xlsx' });
      const arquivo = await requisitar(`/indicadores/premium/analitico/exportar?${query}`, { tipoResposta: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a'); link.href = url;
      link.download = `analitico-bi-${filtrosDashboard.dataInicio}-${filtrosDashboard.dataFim}.xlsx`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (falha) { toastErro(falha.message); }
    finally { definirExportando(false); }
  }
  async function exportarPdf() {
    if (preparandoPdf || relatorioPdf) return;
    definirPreparandoPdf(true);
    try {
      const filtros = { ...filtrosDashboard };
      const relatorio = await requisitar(`/indicadores/premium?${parametrosDe({ ...filtros, incluirAnalise: 'true' })}`, { timeout: 120_000 });
      definirRelatorioPdf({ dados: relatorio, filtros });
    } catch (falha) { toastErro(falha.message); }
    finally { definirPreparandoPdf(false); }
  }
  useEffect(() => {
    if (!relatorioPdf) return;
    let ativo = true;
    const finalizar = () => definirRelatorioPdf(null);
    window.addEventListener('afterprint', finalizar);
    (async () => {
      await document.fonts?.ready;
      requestAnimationFrame(() => { if (ativo) window.print(); });
    })();
    return () => { ativo = false; window.removeEventListener('afterprint', finalizar); };
  }, [relatorioPdf]);

  function tecladoAbas(evento, indice) {
    let destino;
    if (evento.key === 'ArrowRight') destino = (indice + 1) % abas.length;
    if (evento.key === 'ArrowLeft') destino = (indice + abas.length - 1) % abas.length;
    if (evento.key === 'Home') destino = 0;
    if (evento.key === 'End') destino = abas.length - 1;
    if (destino === undefined) return;
    evento.preventDefault(); definirAba(abas[destino][0]); document.getElementById(`aba-dashboard-${abas[destino][0]}`)?.focus();
  }

  return <div className={`dashboard-premium${aba === 'analitico' ? ' dashboard-premium--analitico' : ''}`}>
    <div className="dashboard-premium__tela">
      {aba !== 'analitico' && <header className="dashboard-premium__cabecalho"><div><p className="sobretitulo">Agende Aki Pro</p><h1>{aba === 'detalhado' ? 'Análises do seu salão' : 'Seu salão, em números.'}</h1><p>{aba === 'detalhado' ? 'Entenda o desempenho, identifique oportunidades e acompanhe seus resultados.' : `Período de ${dataLegivel(filtrosDashboard.dataInicio)} a ${dataLegivel(filtrosDashboard.dataFim)} · Horário de São Paulo`}</p></div><div className="dashboard-premium__acoes"><span>PRO</span><button className="botao-secundario" disabled={preparandoPdf || Boolean(relatorioPdf) || carregando} onClick={exportarPdf} type="button"><IconeDashboard nome="baixar" />{preparandoPdf ? 'Preparando PDF...' : 'Exportar PDF'}</button></div></header>}
      <FiltrosDashboard filtros={filtrosDashboard} aoAplicar={definirFiltrosDashboard} opcoes={dados.opcoesFiltros} carregando={carregando} compacto={aba !== 'geral'} periodo={dados.filtros}>
      <div aria-label="Visualizações do dashboard" className="dashboard-abas" role="tablist">{abas.map(([chave, rotulo], indice) => <button aria-controls={`painel-dashboard-${chave}`} aria-selected={aba === chave} id={`aba-dashboard-${chave}`} key={chave} onClick={() => definirAba(chave)} onKeyDown={(evento) => tecladoAbas(evento, indice)} role="tab" tabIndex={aba === chave ? 0 : -1} type="button"><IconeDashboard nome={chave === 'geral' ? 'grafico' : chave === 'detalhado' ? 'lista' : 'tendencia'} />{rotulo}</button>)}</div>
      </FiltrosDashboard>
      {carregando && <p role="status">Atualizando indicadores...</p>}
      {erro && <div className="dashboard-erro" role="alert"><p>{erro}</p><button className="botao-secundario" onClick={aoRecarregar} type="button">Tentar novamente</button></div>}
      <section aria-labelledby={`aba-dashboard-${aba}`} id={`painel-dashboard-${aba}`} role="tabpanel" tabIndex={0}>
        {aba === 'geral' && dados.resumo && <IndicadoresDashboard dados={dados} aoAbrir={abrirAnalitico} aoDetalhar={abrirDetalhado} />}
        {aba === 'detalhado' && dados.resumo && <><DetalhesDashboard dados={dados} dinheiro={dinheiro} navegavel /><details className="dashboard-analises__expansivel dashboard-analises__complementares"><summary>Indicadores complementares e regras de cálculo</summary><div><IndicadoresDetalhados dados={dados} aoAbrir={abrirAnalitico} aoDetalhar={abrirDetalhado} /><NotaHistoricoPrecos dados={dados} /><NotasDashboard /></div></details></>}
        {aba === 'analitico' && <>
          <div className="analitico-cabecalho"><div><h1 ref={tituloAnalitico} tabIndex={-1}>Análise de agendamentos</h1><p>Exporte um arquivo Excel com as abas Analítico, Unidades, Serviços e Profissionais.</p></div><button className="botao-secundario" disabled={exportando || carregando} onClick={exportarExcel} type="button">{exportando ? 'Preparando Excel...' : 'Exportar para Excel'}</button></div>
          <div aria-labelledby="rotulo-visualizar-analitico" className="analitico-visualizacao" role="group">
            <span id="rotulo-visualizar-analitico">Visualizar por</span>
            <div>{[['atendimento', 'Atendimento'], ['servico', 'Serviço']].map(([valor, rotulo]) => <button aria-pressed={atual.visualizarPor === valor} key={valor} onClick={() => { if (atual.visualizarPor !== valor) alterarControle({ visualizarPor: valor, pagina: 1, ordenarPor: 'dataInicio', direcao: 'desc' }); }} type="button">{rotulo}</button>)}</div>
          </div>
          <div className="analitico-controles"><label className="campo-formulario"><span>Recorte</span><select onChange={(evento) => alterarControle({ recorte: evento.target.value, pagina: 1 })} value={atual.recorte}>{Object.entries(recortes).map(([chave, [rotulo]]) => <option key={chave} value={chave}>{rotulo}</option>)}</select></label><label className="campo-formulario"><span>Registros por página</span><select onChange={(evento) => alterarControle({ porPagina: Number(evento.target.value), pagina: 1 })} value={atual.porPagina}>{[25, 50, 100].map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select></label></div>
          <details className="analitico-regras"><summary>Como este recorte é calculado</summary><p>{recortes[atual.recorte][1]} Datas no horário de São Paulo. Preços, promoções e ajustes usam o histórico registrado, com os mesmos filtros da exportação.</p></details>
          <p className="analitico-descricao">{atual.visualizarPor === 'servico' ? 'Cada linha é um serviço reservado ou extra, com seu profissional e valor. As datas e o status pertencem ao atendimento.' : 'Cada linha é um atendimento, reunindo seus serviços, profissionais e valores. Clique na linha para ver o detalhamento dos serviços.'}</p>
          <div aria-busy={Boolean(pendente)} className="analitico-resultados">
            {pendente ? <p className="dashboard-premium__vazio" role="status">Carregando registros...</p> : erroAnalitico ? <div className="dashboard-erro" role="alert"><p>{erroAnalitico}</p><button className="botao-secundario" onClick={() => definirTentativa((valor) => valor + 1)} type="button">Tentar novamente</button></div> : resultado && <>
              {atual.recorte === 'extras' && <p className="analitico-descricao" role="status">{resultado.totalServicosExtras ?? 0} {(resultado.totalServicosExtras ?? 0) === 1 ? 'serviço extra' : 'serviços extras'} em {resultado.totalAtendimentos ?? resultado.total} {(resultado.totalAtendimentos ?? resultado.total) === 1 ? 'atendimento' : 'atendimentos'}.</p>}
              <TabelaAnalitico agendamentos={resultado.agendamentos} dinheiro={dinheiro} visualizarPor={atual.visualizarPor} ordenarPor={atual.ordenarPor} direcao={atual.direcao} aoOrdenar={(campo) => alterarControle({ ordenarPor: campo, direcao: campo === atual.ordenarPor && atual.direcao === 'asc' ? 'desc' : 'asc', pagina: 1 })} />
              <PaginacaoAnalitico resultado={resultado} aoMudarPagina={(pagina) => alterarControle({ pagina })} aoMudarQuantidade={(porPagina) => alterarControle({ porPagina, pagina: 1 })} />
            </>}
          </div>
        </>}
      </section>
      {abas.filter(([chave]) => chave !== aba).map(([chave]) => <section aria-labelledby={`aba-dashboard-${chave}`} hidden id={`painel-dashboard-${chave}`} key={chave} role="tabpanel" />)}
    </div>
    {relatorioPdf && <div className="dashboard-premium__impressao"><h1>Relatório Agende Aki Pro</h1><p>Período de {relatorioPdf.filtros.dataInicio} a {relatorioPdf.filtros.dataFim} · horário de São Paulo.</p><p>{descricaoFiltrosPrecos(relatorioPdf.filtros)}</p><NotaHistoricoPrecos dados={relatorioPdf.dados} /><IndicadoresDashboard dados={relatorioPdf.dados} /><IndicadoresDetalhados dados={relatorioPdf.dados} /><DetalhesDashboard dados={relatorioPdf.dados} dinheiro={dinheiro} /><section className="secao-painel"><h2>Análise de agendamentos</h2><TabelaAnalitico agendamentos={relatorioPdf.dados.analiseAgendamentos ?? []} dinheiro={dinheiro} impressao /></section><NotasDashboard /></div>}
  </div>;
}

function NotaHistoricoPrecos({ dados }) {
  const quantidade = Number(dados.promocoes?.resumo?.servicosNaoInformados ?? 0);
  return <p className="dashboard-premium__nota">{quantidade > 0 ? `${quantidade} serviço(s) realizado(s) sem classificação histórica nos filtros atuais. Os totais de descontos e acréscimos são parciais. ` : ''}Registros antigos aparecem como “Não informado”. Descontos promocionais, descontos adicionais e acréscimos são contabilizados separadamente.</p>;
}

function NotasDashboard() {
  return <><small className="dashboard-premium__nota">Receita realizada soma os serviços confirmados como realizados, pela data da confirmação. O pagamento é controlado separadamente. A receita prevista considera os agendamentos ativos dos próximos 30 dias. Total de serviços realizados conta os serviços reservados e extras correspondentes aos filtros, inclusive os gratuitos. Serviços extras realizados conta cada serviço adicional; receita com serviços extras soma somente os valores cobrados por esses extras. Esses indicadores usam a data da confirmação. Um atendimento pode ter vários serviços.</small><small className="dashboard-premium__nota">Taxa de cancelamento = cancelados ÷ atendimentos elegíveis, pela data agendada. São elegíveis os horários já iniciados e os cancelados. Sem base, exibe —. Taxa de comparecimento = realizados ÷ (realizados + não compareceram), pela data agendada e contando cada atendimento uma única vez. Cancelados e agendamentos ainda sem confirmação são excluídos. Sem atendimentos para o cálculo, a taxa aparece como —.</small><small className="dashboard-premium__nota">Novos clientes tiveram sua primeira visita concluída no período; recorrentes já tinham visitas anteriores. Clientes inativos estão há 90 dias sem atendimento concluído. A ocupação é estimada pela grade semanal e não desconta feriados ou bloqueios pontuais.</small></>;
}
