'use client';

import { Fragment } from 'react';

export default function DetalhesDashboard({ dados, dinheiro }) {
  const resumo = dados.resumo ?? {};
  return (
    <div className="dashboard-premium__graficos">
      <section className="secao-painel"><h2>Evolução da receita</h2><p>Valor dos serviços concluídos, pela data em que foram marcados como realizados.</p><GraficoLinha dados={dados.receitaPorDia ?? []} campo="valor" cor="var(--ameixa)" vazio="Nenhum serviço realizado neste período." /></section>
      <section className="secao-painel"><h2>Receita por serviço</h2><p>Valor dos serviços realizados no período.</p><GraficoBarras dados={dados.receitaPorServico ?? []} campo="servico" valor="valor" formatar={dinheiro} vazio="Nenhum serviço realizado para estes filtros." /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Cancelamentos por motivo</h2><p>Distribuição dos agendamentos cancelados no período e nos filtros selecionados.</p><GraficoBarras dados={dados.cancelamentosPorMotivo ?? []} campo="motivo" valor="quantidade" formatar={(quantidade) => `${quantidade} ${Number(quantidade) === 1 ? 'agendamento' : 'agendamentos'}`} vazio="Nenhum cancelamento para estes filtros." /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Evolução dos agendamentos</h2><p>Todos os agendamentos pela data de início.</p><GraficoLinha dados={dados.agendamentosPorDia ?? []} campo="quantidade" cor="var(--verde-escuro, #397b61)" vazio="Nenhum agendamento para estes filtros." /><DistribuicaoStatus resumo={resumo} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Demanda por dia e horário</h2><p>Agendamentos concluídos ou marcados; cancelamentos aparecem no detalhe de cada célula.</p><MapaCalor dados={dados.mapaCalor ?? []} /></section>
      <section className="secao-painel"><h2>Clientes atendidos</h2><p>Novos e recorrentes pela primeira visita concluída registrada no salão.</p><div className="dashboard-premium__cliente-metricas"><Indicador titulo="Clientes atendidos" valor={dados.clientes?.clientesAtendidos ?? 0} /><Indicador titulo="Novos clientes" valor={dados.clientes?.clientesNovos ?? 0} /><Indicador titulo="Clientes recorrentes" valor={dados.clientes?.clientesRecorrentes ?? 0} /></div></section>
      <section className="secao-painel"><h2>Desempenho dos profissionais</h2><p>Atendimentos e valores dos serviços realizados; ocupação comparada à disponibilidade semanal cadastrada.</p><TabelaProfissionais profissionais={dados.profissionais ?? []} dinheiro={dinheiro} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Insights do negócio</h2><p>Sugestões geradas por regras aplicadas aos dados deste período.</p><ListaInsights insights={dados.insights ?? []} /></section>
      <section className="secao-painel dashboard-premium__grafico-largo"><h2>Clientes sem retorno há 90 dias</h2><p>Clientes com atendimento realizado, sem novo atendimento concluído nos últimos 90 dias.</p><TabelaClientesInativos clientes={dados.clientesInativos ?? []} /></section>

    </div>
  );
}

function ListaInsights({ insights }) {
  if (!insights.length) return <p className="dashboard-premium__vazio">Nenhum insight disponível para estes filtros.</p>;
  return <div className="lista-insights">{insights.map((insight, indice) => <article className={`lista-insights__item lista-insights__item--${insight.tipo}`} key={`${insight.titulo}-${indice}`}><strong>{insight.titulo}</strong><p>{insight.descricao}</p></article>)}</div>;
}

function TabelaClientesInativos({ clientes }) {
  if (!clientes.length) return <p className="dashboard-premium__vazio">Nenhum cliente atingiu 90 dias sem atendimento realizado.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><thead><tr><th>Cliente</th><th>Email</th><th>Telefone</th><th>Último atendimento</th></tr></thead><tbody>{clientes.map((cliente) => <tr key={cliente.idCliente}><th>{cliente.cliente}</th><td>{cliente.email || '—'}</td><td>{cliente.telefone || '—'}</td><td>{formatarDataHora(cliente.ultimoAtendimento)}</td></tr>)}</tbody></table></div>;
}

function DistribuicaoStatus({ resumo }) {
  const itens = [
    ['Realizados', Number(resumo.quantidadeAgendamentosRealizados ?? 0)],
    ['Marcados', Number(resumo.quantidadeAgendamentosMarcados ?? 0)],
    ['Cancelados', Number(resumo.quantidadeAgendamentosCancelados ?? 0)],
    ['Não presentes', Number(resumo.quantidadeNaoCompareceu ?? 0)],
  ];
  const total = Math.max(Number(resumo.quantidadeAgendamentosTotal ?? 0), 1);
  return <div className="dashboard-premium__status">{itens.map(([rotulo, quantidade]) => <div key={rotulo}><span>{rotulo}</span><div><i style={{ width: `${(quantidade / total) * 100}%` }} /></div><b>{quantidade}</b></div>)}</div>;
}

function MapaCalor({ dados }) {
  if (!dados.length) return <p className="dashboard-premium__vazio">Nenhum agendamento para estes filtros.</p>;
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const maximo = Math.max(...dados.map((item) => Number(item.quantidade ?? 0)), 1);
  const quantidades = new Map(dados.map((item) => [`${item.diaSemana}-${item.hora}`, item]));
  return <div className="mapa-calor__rolagem"><div aria-hidden="true" className="mapa-calor" style={{ gridTemplateColumns: '42px repeat(24, minmax(19px, 1fr))' }}><span />{Array.from({ length: 24 }, (_, hora) => <span className="mapa-calor__hora" key={hora}>{hora}</span>)}{dias.map((dia, diaSemana) => <Fragment key={dia}><strong>{dia}</strong>{Array.from({ length: 24 }, (_, hora) => { const item = quantidades.get(`${diaSemana}-${hora}`); const quantidade = Number(item?.quantidade ?? 0); return <span className="mapa-calor__celula" key={hora} style={{ backgroundColor: quantidade ? `rgba(116, 68, 95, ${0.12 + (quantidade / maximo) * 0.78})` : undefined }} />; })}</Fragment>)}</div><table className="visualmente-oculto"><caption>Agendamentos e cancelamentos por dia da semana e hora</caption><thead><tr><th scope="col">Dia</th>{Array.from({ length: 24 }, (_, hora) => <th scope="col" key={hora}>{hora}h</th>)}</tr></thead><tbody>{dias.map((dia, diaSemana) => <tr key={dia}><th scope="row">{dia}</th>{Array.from({ length: 24 }, (_, hora) => { const item = quantidades.get(`${diaSemana}-${hora}`); return <td key={hora}>{Number(item?.quantidade ?? 0)} agendamentos; {Number(item?.cancelados ?? 0)} cancelamentos</td>; })}</tr>)}</tbody></table></div>;
}

function TabelaProfissionais({ profissionais, dinheiro }) {
  if (!profissionais.length) return <p className="dashboard-premium__vazio">Nenhum profissional encontrado para estes filtros.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><thead><tr><th>Profissional</th><th>Realizados</th><th>Receita</th><th>Ticket médio</th><th>Cancelados</th><th>Ocupação estimada</th></tr></thead><tbody>{profissionais.map((profissional) => <tr key={profissional.idFuncionario}><th>{profissional.profissional}</th><td>{profissional.atendimentosRealizados}</td><td>{dinheiro(profissional.receitaRealizada)}</td><td>{dinheiro(profissional.ticketMedio)}</td><td>{profissional.cancelamentos}</td><td>{profissional.ocupacaoEstimada == null ? 'Sem grade' : `${Number(profissional.ocupacaoEstimada).toFixed(1).replace('.', ',')}%`}</td></tr>)}</tbody></table></div>;
}

function GraficoLinha({ dados, campo, cor, vazio }) {
  if (!dados.length) return <p className="dashboard-premium__vazio">{vazio}</p>;
  const valores = dados.map((item) => Number(item[campo] ?? 0));
  const maximo = Math.max(...valores, 1);
  const pontos = valores.map((valor, indice) => `${dados.length === 1 ? 50 : 8 + (indice * 84) / (dados.length - 1)},${92 - (valor / maximo) * 78}`).join(' ');
  return <div className="grafico-linha"><svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="5" x2="95" y1="92" y2="92" /><line x1="5" x2="95" y1="53" y2="53" /><line x1="5" x2="95" y1="14" y2="14" /><polyline points={pontos} style={{ stroke: cor }} />{valores.map((valor, indice) => { const x = dados.length === 1 ? 50 : 8 + (indice * 84) / (dados.length - 1); const y = 92 - (valor / maximo) * 78; return <circle key={`${dados[indice].data}-${indice}`} cx={x} cy={y} r="1.3" style={{ fill: cor }} />; })}</svg><div className="grafico-linha__legenda"><span>{dados[0].data}</span><span>{dados[dados.length - 1].data}</span></div><table className="visualmente-oculto"><caption>{campo}: valores por período</caption><thead><tr><th scope="col">Período</th><th scope="col">{campo}</th></tr></thead><tbody>{dados.map((item) => <tr key={item.data}><th scope="row">{item.data}</th><td>{item[campo]}</td></tr>)}</tbody></table></div>;
}

function GraficoBarras({ dados, campo, valor, formatar, vazio }) {
  if (!dados.length) return <p className="dashboard-premium__vazio">{vazio}</p>;
  const maximo = Math.max(...dados.map((item) => Number(item[valor] ?? 0)), 1);
  return <div className="grafico-barras">{dados.map((item) => <div className="grafico-barras__linha" key={item[campo]}><span title={item[campo]}>{item[campo]}</span><div><i style={{ width: `${Math.max(2, (Number(item[valor]) / maximo) * 100)}%` }} /></div><b>{formatar(item[valor])}</b></div>)}</div>;
}

function Indicador({ titulo, valor }) { return <article className="indicador"><span>{titulo}</span><strong>{valor}</strong></article>; }
function formatarDataHora(valor) { return valor ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(valor)) : '—'; }
