'use client';

import { useEffect, useRef, useState } from 'react';
import { toastErro } from '../../utils/toast';
import DetalhesDashboard from './DetalhesDashboard';
import TabelaAnalitico from './TabelaAnalitico';

const dinheiro = (valor) => Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const filtrosVazios = { dataInicio: '', dataFim: '', idUnidade: '', idServico: '', idFuncionario: '' };
const abas = [['geral', 'Geral'], ['detalhado', 'Detalhado'], ['analitico', 'Analítico']];
const recortes = {
  todos: ['Todos · visão operacional', 'Cancelados pela data de cancelamento (ou agendada, quando ausente); demais status pela data agendada.'],
  agendamentos: ['Agendamentos no período', 'Todos os status, pela data agendada no período selecionado.'],
  realizados: ['Atendimentos realizados', 'Atendimentos realizados, pela data da confirmação no período selecionado.'],
  extras: ['Serviços extras realizados', 'Atendimentos com extras, pela data da confirmação. Serviços, profissionais e valores se referem apenas aos extras correspondentes aos filtros, incluindo os gratuitos.'],
  comparecimento: ['Comparecimento', 'Realizados e não comparecimentos pela data agendada no período selecionado. Taxa = realizados ÷ (realizados + não compareceram). Cada atendimento é contado uma vez, independentemente da quantidade de serviços. Cancelados e agendamentos ainda sem confirmação ficam fora do cálculo.'],
  cancelados: ['Agendamentos cancelados', 'Cancelamentos pela data do cancelamento, usando a data agendada quando ausente.'],
  naoCompareceu: ['Não compareceram', 'Ausências pela data agendada no período selecionado.'],
  previstos: ['Previsão · próximos 30 dias', 'Agendamentos ativos entre agora e os próximos 30 dias. Esta janela independe do período geral; unidade, serviço e profissional continuam aplicados.'],
};
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
  const chaveFiltros = parametrosDe(filtrosDashboard);
  const atual = controle.filtros === chaveFiltros ? controle : { ...controle, pagina: 1, filtros: chaveFiltros };
  const parametros = parametrosDe({ ...filtrosDashboard, ...atual, filtros: undefined });
  const pendente = consulta.chave !== parametros || consulta.carregando;
  const resultado = consulta.chave === parametros ? consulta.resultado : null;
  const erroAnalitico = consulta.chave === parametros ? consulta.erro : '';

  function alterarControle(alteracoes) { definirControle({ ...atual, ...alteracoes }); }
  function abrirAnalitico(recorte, visualizarPor = 'atendimento') {
    alterarControle({ recorte, visualizarPor, pagina: 1, ordenarPor: 'dataInicio', direcao: 'desc' });
    focarAnalitico.current = true;
    definirAba('analitico');
  }
  useEffect(() => {
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

  return <div className="dashboard-premium">
    <div className="dashboard-premium__tela">
      <div className="dashboard-premium__cabecalho"><div><p className="sobretitulo">Agende Aki Pro</p><h1>Seu salão, em números.</h1><p>Período de {filtrosDashboard.dataInicio} a {filtrosDashboard.dataFim} · horário de São Paulo.</p></div><div className="dashboard-premium__acoes"><span>PRO</span><button className="botao-secundario" disabled={preparandoPdf || Boolean(relatorioPdf) || carregando} onClick={exportarPdf} type="button">{preparandoPdf ? 'Preparando PDF...' : 'Exportar PDF'}</button></div></div>
      <div className="filtros-dashboard">
        {['dataInicio', 'dataFim'].map((campo, indice) => <label className="campo-formulario" key={campo}><span>{indice ? 'Até' : 'De'}</span><input onChange={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, [campo]: evento.target.value })} type="date" value={filtrosDashboard[campo]} /></label>)}
        {[['idUnidade', 'Unidade', 'filiais'], ['idServico', 'Serviço', 'servicos'], ['idFuncionario', 'Profissional', 'funcionarios']].map(([campo, rotulo, lista]) => <label className="campo-formulario" key={campo}><span>{rotulo}</span><select onChange={(evento) => definirFiltrosDashboard({ ...filtrosDashboard, [campo]: evento.target.value })} value={filtrosDashboard[campo]}><option value="">Todos</option>{dados.opcoesFiltros?.[lista]?.map((item) => <option key={item[campo]} value={item[campo]}>{item.nome}</option>)}</select></label>)}
        <button className="botao-secundario" onClick={() => definirFiltrosDashboard(filtrosVazios)} type="button">Limpar filtros</button>
      </div>
      <div aria-label="Visualizações do dashboard" className="dashboard-abas" role="tablist">{abas.map(([chave, rotulo], indice) => <button aria-controls={`painel-dashboard-${chave}`} aria-selected={aba === chave} id={`aba-dashboard-${chave}`} key={chave} onClick={() => definirAba(chave)} onKeyDown={(evento) => tecladoAbas(evento, indice)} role="tab" tabIndex={aba === chave ? 0 : -1} type="button">{rotulo}</button>)}</div>
      {carregando && <p role="status">Atualizando indicadores...</p>}
      {erro && <div className="dashboard-erro" role="alert"><p>{erro}</p><button className="botao-secundario" onClick={aoRecarregar} type="button">Tentar novamente</button></div>}
      <section aria-labelledby={`aba-dashboard-${aba}`} id={`painel-dashboard-${aba}`} role="tabpanel" tabIndex={0}>
        {aba === 'geral' && dados.resumo && <><IndicadoresDashboard dados={dados} aoAbrir={abrirAnalitico} /><section className="secao-painel"><h2>Em destaque</h2><div className="lista-insights">{(dados.insights ?? []).slice(0, 3).map((item, indice) => <article className={`lista-insights__item lista-insights__item--${item.tipo}`} key={indice}><strong>{item.titulo}</strong><p>{item.descricao}</p></article>)}</div></section></>}
        {aba === 'detalhado' && dados.resumo && <><DetalhesDashboard dados={dados} dinheiro={dinheiro} /><NotasDashboard /></>}
        {aba === 'analitico' && <>
          <div className="analitico-cabecalho"><div><h2 ref={tituloAnalitico} tabIndex={-1}>Análise de agendamentos</h2><p>Exporte um arquivo Excel com as abas Analítico, Unidades, Serviços e Profissionais.</p></div><button className="botao-secundario" disabled={exportando || carregando} onClick={exportarExcel} type="button">{exportando ? 'Preparando Excel...' : 'Exportar para Excel'}</button></div>
          <div aria-labelledby="rotulo-visualizar-analitico" className="analitico-visualizacao" role="group">
            <span id="rotulo-visualizar-analitico">Visualizar por</span>
            <div>{[['atendimento', 'Atendimento'], ['servico', 'Serviço']].map(([valor, rotulo]) => <button aria-pressed={atual.visualizarPor === valor} key={valor} onClick={() => { if (atual.visualizarPor !== valor) alterarControle({ visualizarPor: valor, pagina: 1, ordenarPor: 'dataInicio', direcao: 'desc' }); }} type="button">{rotulo}</button>)}</div>
          </div>
          <div className="analitico-controles"><label className="campo-formulario"><span>Recorte</span><select onChange={(evento) => alterarControle({ recorte: evento.target.value, pagina: 1 })} value={atual.recorte}>{Object.entries(recortes).map(([chave, [rotulo]]) => <option key={chave} value={chave}>{rotulo}</option>)}</select></label><label className="campo-formulario"><span>Registros por página</span><select onChange={(evento) => alterarControle({ porPagina: Number(evento.target.value), pagina: 1 })} value={atual.porPagina}>{[25, 50, 100].map((valor) => <option key={valor} value={valor}>{valor}</option>)}</select></label></div>
          <p className="analitico-descricao">{recortes[atual.recorte][1]}</p>
          <p className="analitico-descricao">{atual.visualizarPor === 'servico' ? 'Cada linha é um serviço reservado ou extra, com seu profissional e valor. As datas e o status pertencem ao atendimento.' : 'Cada linha é um atendimento, reunindo seus serviços, profissionais e valores.'}</p>
          <div aria-busy={Boolean(pendente)} className="analitico-resultados">
            {pendente ? <p className="dashboard-premium__vazio" role="status">Carregando registros...</p> : erroAnalitico ? <div className="dashboard-erro" role="alert"><p>{erroAnalitico}</p><button className="botao-secundario" onClick={() => definirTentativa((valor) => valor + 1)} type="button">Tentar novamente</button></div> : resultado && <>
              {atual.recorte === 'extras' && <p className="analitico-descricao" role="status">{resultado.totalServicosExtras ?? 0} {(resultado.totalServicosExtras ?? 0) === 1 ? 'serviço extra' : 'serviços extras'} em {resultado.totalAtendimentos ?? resultado.total} {(resultado.totalAtendimentos ?? resultado.total) === 1 ? 'atendimento' : 'atendimentos'}.</p>}
              <TabelaAnalitico agendamentos={resultado.agendamentos} dinheiro={dinheiro} visualizarPor={atual.visualizarPor} ordenarPor={atual.ordenarPor} direcao={atual.direcao} aoOrdenar={(campo) => alterarControle({ ordenarPor: campo, direcao: campo === atual.ordenarPor && atual.direcao === 'asc' ? 'desc' : 'asc', pagina: 1 })} />
              <nav aria-label="Paginação do analítico" className="analitico-paginacao"><span role="status">{resultado.total ? `${(resultado.pagina - 1) * resultado.porPagina + 1}–${Math.min(resultado.pagina * resultado.porPagina, resultado.total)} de ${resultado.total} registros` : '0 registros'} · Página {resultado.pagina} de {resultado.totalPaginas}</span><div><button className="botao-secundario" disabled={resultado.pagina <= 1} onClick={() => alterarControle({ pagina: resultado.pagina - 1 })} type="button">Anterior</button><button className="botao-secundario" disabled={resultado.pagina >= resultado.totalPaginas} onClick={() => alterarControle({ pagina: resultado.pagina + 1 })} type="button">Próxima</button></div></nav>
            </>}
          </div>
        </>}
      </section>
      {abas.filter(([chave]) => chave !== aba).map(([chave]) => <section aria-labelledby={`aba-dashboard-${chave}`} hidden id={`painel-dashboard-${chave}`} key={chave} role="tabpanel" />)}
    </div>
    {relatorioPdf && <div className="dashboard-premium__impressao"><h1>Relatório Agende Aki Pro</h1><p>Período de {relatorioPdf.filtros.dataInicio} a {relatorioPdf.filtros.dataFim} · horário de São Paulo.</p><IndicadoresDashboard dados={relatorioPdf.dados} /><DetalhesDashboard dados={relatorioPdf.dados} dinheiro={dinheiro} /><section className="secao-painel"><h2>Análise de agendamentos</h2><TabelaAnalitico agendamentos={relatorioPdf.dados.analiseAgendamentos ?? []} dinheiro={dinheiro} /></section><NotasDashboard /></div>}
  </div>;
}

function IndicadoresDashboard({ dados, aoAbrir }) {
  const resumo = dados.resumo ?? {}, anterior = dados.comparacaoAnterior ?? {};
  const ticket = Number(resumo.atendimentosRealizados) ? Number(resumo.receitaRealizada) / Number(resumo.atendimentosRealizados) : 0;
  const ticketAnterior = Number(anterior.atendimentosRealizados) ? Number(anterior.receitaRealizada) / Number(anterior.atendimentosRealizados) : 0;
  const taxa = Number(resumo.quantidadeAgendamentosElegiveis) ? Number(resumo.quantidadeAgendamentosCancelados) / Number(resumo.quantidadeAgendamentosElegiveis) * 100 : 0;
  const taxaAnterior = Number(anterior.quantidadeAgendamentosElegiveis) ? Number(anterior.quantidadeAgendamentosCancelados) / Number(anterior.quantidadeAgendamentosElegiveis) * 100 : 0;
  const comparecimento = resumo.taxaComparecimento == null ? null : Number(resumo.taxaComparecimento);
  const comparecimentoAnterior = anterior.taxaComparecimento == null ? null : Number(anterior.taxaComparecimento);
  const diferencaComparecimento = comparecimento != null && comparecimentoAnterior != null ? comparecimento - comparecimentoAnterior : null;
  const variacao = (valor, base) => base ? `${valor > base ? '+' : ''}${(((valor - base) / base) * 100).toFixed(1).replace('.', ',')}%` : (valor ? 'Sem base anterior' : '0%');
  const itens = [
    { titulo: 'Receita realizada', valor: dinheiro(resumo.receitaRealizada), recorte: 'realizados', variacao: variacao(Number(resumo.receitaRealizada), Number(anterior.receitaRealizada)) },
    { titulo: 'Receita prevista · próximos 30 dias', valor: dinheiro(resumo.receitaPrevista), recorte: 'previstos' },
    { titulo: 'Receita com serviços extras', valor: dinheiro(resumo.receitaServicosExtras), recorte: 'extras', visualizarPor: 'servico', descricao: 'Valor cobrado pelos extras realizados.', variacao: variacao(Number(resumo.receitaServicosExtras ?? 0), Number(anterior.receitaServicosExtras ?? 0)) },
    { titulo: 'Ticket médio realizado', valor: dinheiro(ticket), recorte: 'realizados', variacao: variacao(ticket, ticketAnterior) },
    { titulo: 'Agendamentos no período', valor: resumo.quantidadeAgendamentosTotal ?? 0, recorte: 'agendamentos', variacao: variacao(Number(resumo.quantidadeAgendamentosTotal), Number(anterior.quantidadeAgendamentosTotal)) },
    { titulo: 'Atendimentos realizados', valor: resumo.quantidadeAgendamentosRealizados ?? 0, recorte: 'realizados' },
    { titulo: 'Total de serviços realizados', valor: resumo.quantidadeServicosRealizados ?? 0, recorte: 'realizados', visualizarPor: 'servico', descricao: 'Inclui os serviços reservados e extras.', variacao: variacao(Number(resumo.quantidadeServicosRealizados ?? 0), Number(anterior.quantidadeServicosRealizados ?? 0)) },
    { titulo: 'Serviços extras realizados', valor: resumo.quantidadeServicosExtras ?? 0, recorte: 'extras', variacao: variacao(Number(resumo.quantidadeServicosExtras ?? 0), Number(anterior.quantidadeServicosExtras ?? 0)) },
    { titulo: 'Taxa de cancelamento', valor: `${taxa.toFixed(1).replace('.', ',')}%`, recorte: 'cancelados', variacao: `${taxa - taxaAnterior > 0 ? '+' : ''}${(taxa - taxaAnterior).toFixed(1).replace('.', ',')} p.p.`, inverso: true },
    { titulo: 'Agendamentos cancelados', valor: resumo.quantidadeAgendamentosCancelados ?? 0, recorte: 'cancelados' },
    { titulo: 'Taxa de comparecimento', valor: comparecimento == null ? '—' : `${comparecimento.toFixed(1).replace('.', ',')}%`, recorte: 'comparecimento', descricao: comparecimento == null ? 'Sem realizados ou ausências no período.' : 'Realizados ÷ (realizados + ausências), pela data agendada.', variacao: diferencaComparecimento != null ? `${diferencaComparecimento > 0 ? '+' : ''}${diferencaComparecimento.toFixed(1).replace('.', ',')} p.p.` : comparecimento != null ? 'Sem base anterior' : undefined },
    { titulo: 'Não compareceram', valor: resumo.quantidadeNaoCompareceu ?? 0, recorte: 'naoCompareceu' },
  ];
  const grupos = [
    { titulo: 'Financeiro', itens: itens.slice(0, 4) },
    { titulo: 'Atendimentos e serviços', itens: itens.slice(4, 8) },
    { titulo: 'Cancelamentos e comparecimento', itens: itens.slice(8, 12) },
  ];
  return <div className="dashboard-premium__grupos">{grupos.map((grupo) => <section className="dashboard-premium__grupo" key={grupo.titulo}>
    <h2>{grupo.titulo}</h2>
    <div className="grade-indicadores dashboard-premium__indicadores">{grupo.itens.map((item) => {
    const Tag = aoAbrir ? 'button' : 'article';
    const diferenca = Number.parseFloat(item.variacao?.replace(',', '.'));
    return <Tag className={`indicador${aoAbrir ? ' indicador--atalho' : ''}`} key={item.titulo} {...(aoAbrir ? { type: 'button', onClick: () => aoAbrir(item.recorte, item.visualizarPor), 'aria-label': `${item.titulo}: ${item.valor}. Ver no Analítico` } : {})}><span>{item.titulo}</span><strong>{item.valor}</strong>{item.descricao && <small className="indicador__descricao">{item.descricao}</small>}{item.variacao && <small className={`indicador__variacao${(item.inverso ? diferenca > 0 : diferenca < 0) ? ' indicador__variacao--negativa' : ''}`}>{item.variacao} vs. período anterior</small>}{aoAbrir && <small className="indicador__atalho">Ver no Analítico <span aria-hidden="true">↗</span></small>}</Tag>;
    })}</div>
  </section>)}</div>;
}

function NotasDashboard() {
  return <><small className="dashboard-premium__nota">Receita realizada soma os serviços confirmados como realizados, pela data da confirmação. O pagamento é controlado separadamente. A receita prevista considera os agendamentos ativos dos próximos 30 dias. Total de serviços realizados conta os serviços reservados e extras correspondentes aos filtros, inclusive os gratuitos. Serviços extras realizados conta cada serviço adicional; receita com serviços extras soma somente os valores cobrados por esses extras. Esses indicadores usam a data da confirmação. Um atendimento pode ter vários serviços.</small><small className="dashboard-premium__nota">Taxa de comparecimento = realizados ÷ (realizados + não compareceram), pela data agendada e contando cada atendimento uma única vez. Cancelados e agendamentos ainda sem confirmação são excluídos. Sem atendimentos para o cálculo, a taxa aparece como —.</small><small className="dashboard-premium__nota">Novos clientes tiveram sua primeira visita concluída no período; recorrentes já tinham visitas anteriores. Clientes inativos estão há 90 dias sem atendimento concluído. A ocupação é estimada pela grade semanal e não desconta feriados ou bloqueios pontuais.</small></>;
}
