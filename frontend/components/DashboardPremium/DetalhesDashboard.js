'use client';

import { Fragment, useId, useState } from 'react';
import IconeDashboard from './IconeDashboard';
import { destaquesDetalhados, percentualDetalhado, rankingDetalhado, receitaPromocoes, resumirAgenda, seriesFinanceiras, servicosDetalhados } from './detalhadoDashboard.mjs';

export default function DetalhesDashboard({ dados, dinheiro, navegavel = false }) {
  const destaques = destaquesDetalhados(dados, dinheiro);
  const servicos = servicosDetalhados(dados);
  const profissionais = (dados.profissionais ?? []).map((item) => ({ id: item.idFuncionario, nome: item.profissional,
    quantidade: Number(item.atendimentosRealizados ?? 0), receita: Number(item.receitaRealizada ?? 0) }));
  return <div className="dashboard-analises">
    <SecaoAnalise nome="financeiro" titulo="Desempenho financeiro" descricao="Acompanhe a evolução da receita e entenda o que está impactando seus resultados." icone="grafico" navegavel={navegavel} destaques={destaques.financeiro}>
      <PainelAnalise titulo="Evolução da receita"><EvolucaoReceita dados={dados} dinheiro={dinheiro} /></PainelAnalise>
      <RankingAnalise titulo="Receita por serviço" itens={servicos} inicial="receita" dinheiro={dinheiro} />
    </SecaoAnalise>
    <SecaoAnalise nome="servicos" titulo="Serviços" descricao="Identifique quais serviços são mais procurados e quais geram mais receita." icone="servicos" navegavel={navegavel} destaques={destaques.servicos}
      complemento={<Expansivel titulo="Conferir todos os serviços realizados" impressao={!navegavel}><TabelaServicosRealizados itens={dados.receitaPorServico ?? []} dinheiro={dinheiro} /></Expansivel>}>
      <RankingAnalise titulo="Serviços mais realizados" itens={servicos} dinheiro={dinheiro} numerado />
      <RankingAnalise titulo="Receita por serviço" itens={servicos} inicial="receita" dinheiro={dinheiro} numerado />
    </SecaoAnalise>
    <SecaoAnalise nome="atendimentos" titulo="Agenda" descricao="Veja como sua agenda está sendo utilizada e identifique os horários mais movimentados." icone="calendario" navegavel={navegavel} destaques={destaques.agenda}
      complemento={<><p className="dashboard-analises__nota">Dia e horário de início dos agendamentos ativos ou realizados no período. Cancelamentos e ausências ficam fora destes dois gráficos.</p><Expansivel titulo="Evolução, cancelamentos e comparecimento" impressao={!navegavel}><div id={navegavel ? 'dashboard-detalhe-cancelamentos' : undefined} tabIndex={navegavel ? -1 : undefined}><h3>Evolução dos agendamentos · todos os status</h3><GraficoLinha dados={dados.agendamentosPorDia ?? []} campo="quantidade" cor="var(--dashboard-roxo)" vazio="Nenhum agendamento para estes filtros." /><DistribuicaoStatus resumo={dados.resumo ?? {}} /><h3>Cancelamentos por motivo</h3><GraficoBarras dados={dados.cancelamentosPorMotivo ?? []} campo="motivo" valor="quantidade" formatar={(valor) => `${valor} agendamento(s)`} vazio="Nenhum cancelamento para estes filtros." /></div></Expansivel></>}>
      <PainelAnalise titulo="Agendamentos por dia da semana"><GraficoDias dados={dados.mapaCalor} /></PainelAnalise>
      <PainelAnalise titulo="Horários mais movimentados"><MapaAgenda dados={dados.mapaCalor} /></PainelAnalise>
    </SecaoAnalise>
    <SecaoAnalise nome="profissionais" titulo="Profissionais" descricao="Acompanhe o desempenho da sua equipe e identifique oportunidades de melhoria." icone="pessoa" navegavel={navegavel} destaques={destaques.profissionais}
      complemento={<><p className="dashboard-analises__nota">Um atendimento pode envolver mais de um profissional. Os percentuais do ranking usam a soma das participações. A ocupação é estimada pela grade semanal, sem descontar feriados ou bloqueios pontuais.</p><Expansivel titulo="Conferir desempenho de toda a equipe" impressao={!navegavel}><TabelaProfissionais profissionais={dados.profissionais ?? []} dinheiro={dinheiro} /></Expansivel></>}>
      <RankingAnalise titulo="Atendimentos por profissional" itens={profissionais} dinheiro={dinheiro} numerado />
      <PainelAnalise titulo="Taxa de ocupação por profissional"><OcupacaoProfissionais profissionais={dados.profissionais ?? []} /></PainelAnalise>
    </SecaoAnalise>
    <SecaoAnalise nome="promocoes" titulo="Promoções" descricao="Acompanhe a utilização das promoções e a receita dos serviços realizados." icone="desconto" navegavel={navegavel} destaques={destaques.promocoes}
      complemento={<><p className="dashboard-analises__nota">Participação calculada entre serviços com classificação conhecida nos filtros atuais. Serviços reservados e extras são contados separadamente; registros antigos ficam como “Não informado”.</p>
        {Number(dados.promocoes?.resumo?.servicosNaoInformados ?? 0) > 0 && <p className="dashboard-analises__nota">{dados.promocoes.resumo.servicosNaoInformados} serviço(s) sem classificação histórica. Os totais de descontos e acréscimos são parciais.</p>}
        <Expansivel titulo="Utilizações, descontos e evolução das promoções" impressao={!navegavel}><h3>Receita realizada com promoção</h3><GraficoLinha dados={dados.promocoes?.receitaPorDia ?? []} campo="valor" cor="var(--dashboard-coral)" vazio="Nenhum serviço com promoção realizado neste período e filtros." /><h3>Dez serviços com mais utilizações de promoção</h3><TabelaPromocoes itens={dados.promocoes?.ranking ?? []} dinheiro={dinheiro} /></Expansivel>
        <Expansivel titulo="Promoções ativas hoje" impressao={!navegavel}><p>Ofertas vigentes nos serviços ativos, considerando unidade, serviço e profissional. Independe do período e dos filtros históricos de promoção e ajuste de valor.</p><TabelaPromocoesAtivas itens={dados.visaoGeral?.listaPromocoesAtivas ?? []} dinheiro={dinheiro} /></Expansivel>
        <div id={navegavel ? 'dashboard-detalhe-ajustes' : undefined} tabIndex={navegavel ? -1 : undefined}><Expansivel titulo="Ajustes de valor por serviço e unidade" impressao={!navegavel}><TabelaAjustes itens={dados.promocoes?.ajustesPorServico ?? []} dinheiro={dinheiro} /></Expansivel></div>
      </>}>
      <PainelAnalise titulo="Utilização de promoções"><UsoPromocoes resumo={dados.promocoes?.resumo ?? {}} /></PainelAnalise>
      <RankingAnalise titulo="Receita com promoções" itens={receitaPromocoes(dados)} inicial="receita" dinheiro={dinheiro} fixo />
    </SecaoAnalise>
    <Expansivel titulo="Clientes e outras oportunidades" impressao={!navegavel}>
      <div className="dashboard-analises__clientes"><PainelAnalise titulo="Clientes atendidos"><p>Novos e recorrentes pela primeira visita concluída registrada no salão.</p><div className="dashboard-premium__cliente-metricas"><Indicador titulo="Clientes atendidos" valor={dados.clientes?.clientesAtendidos ?? 0} /><Indicador titulo="Novos clientes" valor={dados.clientes?.clientesNovos ?? 0} /><Indicador titulo="Clientes recorrentes" valor={dados.clientes?.clientesRecorrentes ?? 0} /></div></PainelAnalise><PainelAnalise titulo="Insights do negócio"><ListaInsights insights={dados.insights ?? []} /></PainelAnalise></div>
      <h3>Clientes sem retorno há 90 dias</h3><TabelaClientesInativos clientes={dados.clientesInativos ?? []} />
    </Expansivel>
  </div>;
}

function SecaoAnalise({ nome, titulo, descricao, icone, destaques, complemento, navegavel, children }) {
  return <section className={`dashboard-analise dashboard-analise--${nome}`} id={navegavel ? `dashboard-detalhe-${nome}` : undefined} tabIndex={navegavel ? -1 : undefined} aria-label={titulo}>
    <header className="dashboard-analise__cabecalho"><IconeDashboard nome={icone} /><div><h2>{titulo}</h2><p>{descricao}</p></div></header>
    <div className="dashboard-analise__grade">{children}<aside className="dashboard-analise__destaques" aria-label={`Destaques: ${titulo}`}>{destaques.map((item) => <article key={item.titulo} className={`dashboard-destaque dashboard-destaque--${item.tipo}`}><span className="dashboard-destaque__icone"><IconeDashboard nome={item.tipo === 'oportunidade' ? 'ideia' : item.tipo === 'neutro' ? 'info' : 'tendencia'} /></span><div><h3>{item.titulo}</h3><p>{item.texto}</p></div></article>)}</aside></div>
    {complemento}
  </section>;
}

function PainelAnalise({ titulo, acoes, children }) {
  const id = useId();
  return <section className="dashboard-analise__painel" aria-labelledby={id}><header><h3 id={id}>{titulo}</h3>{acoes}</header>{children}</section>;
}

function Expansivel({ titulo, impressao, children }) {
  return <details className="dashboard-analises__expansivel" open={impressao || undefined}><summary>{titulo}</summary><div>{children}</div></details>;
}

function RankingAnalise({ titulo, itens, dinheiro, inicial = 'quantidade', numerado = false, fixo = false }) {
  const [criterio, definirCriterio] = useState(inicial);
  const ranking = rankingDetalhado(itens, criterio);
  const maximo = Math.max(...ranking.map((item) => item[criterio]), 1);
  return <PainelAnalise titulo={titulo} acoes={!fixo && <div className="dashboard-analise__alternador" role="group" aria-label={`Critério: ${titulo}`}>{(inicial === 'receita' ? ['receita', 'quantidade'] : ['quantidade', 'receita']).map((campo) => <button aria-pressed={criterio === campo} key={campo} onClick={() => definirCriterio(campo)} type="button">{campo === 'receita' ? 'Valor (R$)' : 'Quantidade'}</button>)}</div>}>
    {ranking.some((item) => item.quantidade > 0 || item.receita > 0) ? <ol className={`dashboard-analise-ranking${numerado ? ' dashboard-analise-ranking--numerado' : ''}`}>{ranking.map((item, indice) => <li key={item.id} style={{ '--analise-cor': cores[indice % cores.length] }}>
      {numerado && <span className="dashboard-analise-ranking__posicao" aria-hidden="true">{indice + 1}</span>}
      <span className="dashboard-analise-ranking__nome" title={item.nome}>{item.nome}</span><span aria-hidden="true" className="dashboard-analise-ranking__trilho"><i style={{ width: `${item[criterio] / maximo * 100}%` }} /></span><strong>{criterio === 'receita' ? dinheiro(item.receita) : item.quantidade}</strong><small>{percentualDetalhado(item.percentual)}</small>
    </li>)}</ol> : <Vazio>Nenhum serviço ou atendimento realizado para estes filtros.</Vazio>}
  </PainelAnalise>;
}

const cores = ['var(--dashboard-coral)', 'var(--dashboard-azul)', 'var(--dashboard-roxo)', 'var(--dashboard-dourado)', 'var(--dashboard-suave)'];
function Vazio({ children }) { return <p className="dashboard-analise__vazio">{children}</p>; }

function EvolucaoReceita({ dados, dinheiro }) {
  const { atual, anterior, inicio, fim } = seriesFinanceiras(dados);
  if (!atual.length || (!atual.some(Boolean) && !anterior.some(Boolean))) return <Vazio>Nenhuma receita realizada neste período ou no período anterior.</Vazio>;
  const maximo = Math.max(...atual, ...anterior, 1), largura = 390 / atual.length;
  const pontos = anterior.map((valor, indice) => `${54 + (indice + .5) * largura},${170 - valor / maximo * 150}`).join(' ');
  return <div className="dashboard-evolucao"><div className="dashboard-evolucao__legenda"><span><i />Receita realizada</span><span><i />Período anterior</span></div><svg aria-hidden="true" viewBox="0 0 455 205">
    {[0, 1, 2, 3, 4].map((i) => <g key={i}><line x1="54" x2="444" y1={170 - i * 37.5} y2={170 - i * 37.5} /><text x="46" y={174 - i * 37.5} textAnchor="end">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(maximo * i / 4)}</text></g>)}
    {atual.map((valor, indice) => <rect key={indice} x={54 + indice * largura + largura * .18} y={170 - valor / maximo * 150} width={largura * .64} height={valor / maximo * 150} rx="1.5"><title>{dinheiro(valor)}</title></rect>)}
    <polyline points={pontos} />
    {anterior.length === 1 && <circle cx={54 + largura / 2} cy={170 - anterior[0] / maximo * 150} r="3" fill="var(--dashboard-suave)" />}
    <text x="54" y="194">{dataCurta(inicio)}</text><text x="444" y="194" textAnchor="end">{dataCurta(fim)}</text>
  </svg><small>Comparação por posição no período · até 60 faixas de datas.</small><div className="tabela-premium__rolagem visualmente-oculto"><table><caption>Receita realizada nas faixas atuais e correspondentes do período anterior</caption><thead><tr><th>Período atual</th><th>Receita realizada</th><th>Período anterior</th><th>Receita anterior</th></tr></thead><tbody>{atual.map((valor, i) => <tr key={i}><th>{rotuloFaixa(inicio, fim, i, atual.length)}</th><td>{dinheiro(valor)}</td><td>{rotuloFaixa(dados.periodoComparacao?.dataInicioAnterior, dados.periodoComparacao?.dataFimAnterior, i, atual.length)}</td><td>{dinheiro(anterior[i])}</td></tr>)}</tbody></table></div></div>;
}

function dataCurta(valor) { return valor?.slice(5).split('-').reverse().join('/') ?? '—'; }
function rotuloFaixa(inicio, fim, indice, total) {
  const primeiro = Date.parse(`${inicio}T00:00:00Z`), ultimo = Date.parse(`${fim}T00:00:00Z`);
  if (!Number.isFinite(primeiro) || !Number.isFinite(ultimo)) return '—';
  const dias = Math.round((ultimo - primeiro) / 86400000) + 1;
  const data = (posicao) => new Date(primeiro + posicao * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/');
  const de = Math.ceil(indice * dias / total), ate = Math.ceil((indice + 1) * dias / total) - 1;
  return de === ate ? data(de) : `${data(de)} a ${data(ate)}`;
}

function GraficoDias({ dados }) {
  const { dias, total } = resumirAgenda(dados);
  if (!total) return <Vazio>Nenhum agendamento ativo ou realizado neste período.</Vazio>;
  const maximo = Math.ceil(Math.max(...dias.map((item) => item.quantidade), 4) / 4) * 4;
  return <div className="dashboard-dias"><svg aria-hidden="true" viewBox="0 0 350 210">{[0, 1, 2, 3, 4].map((i) => <g key={i}><line x1="32" x2="342" y1={175 - i * 37} y2={175 - i * 37} /><text x="25" y={179 - i * 37} textAnchor="end">{Number((maximo * i / 4).toFixed(1))}</text></g>)}{dias.map((item, i) => <g key={item.nome}><rect x={39 + i * 44} y={175 - item.quantidade / maximo * 148} width="29" height={item.quantidade / maximo * 148} rx="3" /><text x={53 + i * 44} y="198" textAnchor="middle">{item.nome}</text></g>)}</svg><ul className="visualmente-oculto" aria-label="Agendamentos por dia da semana">{dias.map((item) => <li key={item.nome}>{item.nome}: {item.quantidade}</li>)}</ul></div>;
}

function MapaAgenda({ dados }) {
  const { dias, horas, celulas, total, maximo } = resumirAgenda(dados);
  if (!total) return <Vazio>Nenhum movimento de agenda para estes filtros.</Vazio>;
  return <div className="dashboard-mapa"><div className="dashboard-mapa__rolagem"><div className="dashboard-mapa__grade" style={{ gridTemplateColumns: `30px repeat(${horas.length}, minmax(15px, 1fr))` }}>{dias.map((dia) => <Fragment key={dia.nome}><strong>{dia.nome}</strong>{horas.map((hora) => { const item = celulas.get(`${dia.diaSemana}:${hora}`), quantidade = item?.quantidade ?? 0; return <span aria-hidden="true" key={hora} style={{ '--intensidade': quantidade ? `${20 + quantidade / maximo * 80}%` : '0%' }} title={`${dia.nome}, ${hora}h: ${quantidade} agendamento(s); ${item?.cancelados ?? 0} cancelado(s)`} />; })}</Fragment>)}<span />{horas.map((hora) => <small key={hora}>{hora % 2 === 0 ? `${hora}h` : ''}</small>)}</div></div><div className="dashboard-mapa__legenda"><span>Menor movimento</span>{[0, 25, 50, 75, 100].map((intensidade) => <i aria-hidden="true" key={intensidade} style={{ '--intensidade': `${intensidade}%` }} />)}<span>Maior movimento</span></div><table className="visualmente-oculto"><caption>Agendamentos ativos ou realizados por dia e hora</caption><thead><tr><th>Dia</th>{horas.map((hora) => <th key={hora}>{hora}h</th>)}</tr></thead><tbody>{dias.map((dia) => <tr key={dia.nome}><th>{dia.nome}</th>{horas.map((hora) => <td key={hora}>{celulas.get(`${dia.diaSemana}:${hora}`)?.quantidade ?? 0}</td>)}</tr>)}</tbody></table></div>;
}

function OcupacaoProfissionais({ profissionais }) {
  const itens = [...profissionais].sort((a, b) => (b.ocupacaoEstimada ?? -1) - (a.ocupacaoEstimada ?? -1) || a.profissional.localeCompare(b.profissional, 'pt-BR')).slice(0, 5);
  if (!itens.length) return <Vazio>Nenhum profissional encontrado para estes filtros.</Vazio>;
  return <><ul className="dashboard-ocupacao">{itens.map((item, i) => <li key={item.idFuncionario}><span>{item.profissional}</span><span className="dashboard-analise-ranking__trilho" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, Number(item.ocupacaoEstimada ?? 0)))}%`, background: ['var(--dashboard-verde)', ...cores.slice(1)][i % 5] }} /></span><strong>{item.ocupacaoEstimada == null ? 'Sem grade' : percentualDetalhado(item.ocupacaoEstimada)}</strong></li>)}</ul><p className="dashboard-analises__nota">Até cinco profissionais, por ocupação estimada. Consulte toda a equipe abaixo.</p></>;
}

function UsoPromocoes({ resumo }) {
  const com = Number(resumo.servicosComPromocao ?? 0), conhecidos = Number(resumo.servicosConhecidos ?? 0), desconhecidos = Number(resumo.servicosNaoInformados ?? 0);
  const sem = Math.max(0, conhecidos - com), participacao = conhecidos ? com / conhecidos * 100 : null;
  return <div className="dashboard-uso-promocoes"><div className="dashboard-uso-promocoes__anel" role="img" aria-label={conhecidos ? `${percentualDetalhado(participacao)} dos serviços conhecidos com promoção` : 'Sem serviços com classificação conhecida'} style={{ '--participacao': `${participacao ?? 0}%` }}><strong>{percentualDetalhado(participacao)}</strong></div><ul><li><i /><span>Com promoção</span><strong>{com} <small>({percentualDetalhado(participacao)})</small></strong></li><li><i /><span>Sem promoção</span><strong>{sem} <small>({percentualDetalhado(conhecidos ? sem / conhecidos * 100 : null)})</small></strong></li>{desconhecidos > 0 && <li><i /><span>Não informado</span><strong>{desconhecidos}</strong></li>}</ul></div>;
}

function TabelaPromocoes({ itens, dinheiro }) {
  if (!itens.length) return <p className="dashboard-premium__vazio">Nenhuma utilização de promoção para estes filtros.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><caption className="visualmente-oculto">Dez serviços com mais utilizações de promoção</caption><thead><tr><th scope="col">Serviço</th><th scope="col">Unidade</th><th scope="col">Utilizações</th><th scope="col">Receita realizada</th><th scope="col">Descontos promocionais</th></tr></thead><tbody>{itens.map((item) => <tr key={`${item.idUnidade}:${item.idServico}`}><th scope="row">{item.servico}</th><td>{item.unidade}</td><td>{item.utilizacoes}</td><td>{dinheiro(item.receitaRealizada)}</td><td>{dinheiro(item.descontosPromocionais)}</td></tr>)}</tbody></table></div>;
}

function TabelaAjustes({ itens, dinheiro }) {
  if (!itens.length) return <p className="dashboard-premium__vazio">Nenhum desconto adicional ou acréscimo para estes filtros.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><caption className="visualmente-oculto">Descontos adicionais e acréscimos em serviços extras</caption><thead><tr><th scope="col">Serviço</th><th scope="col">Unidade</th><th scope="col">Extras com desconto</th><th scope="col">Descontos adicionais</th><th scope="col">Extras com acréscimo</th><th scope="col">Acréscimos</th></tr></thead><tbody>{itens.map((item) => <tr key={`${item.idUnidade}:${item.idServico}`}><th scope="row">{item.servico}</th><td>{item.unidade}</td><td>{item.quantidadeDescontos}</td><td>{dinheiro(item.descontosAdicionais)}</td><td>{item.quantidadeAcrescimos}</td><td>{dinheiro(item.acrescimos)}</td></tr>)}</tbody></table></div>;
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
  const distribuicao = resumo.distribuicaoStatus ?? {};
  const itens = [
    ['Realizados', Number(distribuicao.realizados ?? 0)],
    ['Marcados', Number(distribuicao.marcados ?? 0)],
    ['Cancelados', Number(distribuicao.cancelados ?? 0)],
    ['Não presentes', Number(distribuicao.naoCompareceu ?? 0)],
  ];
  const total = Math.max(Number(resumo.quantidadeAgendamentosTotal ?? 0), 1);
  return <div className="dashboard-premium__status">{itens.map(([rotulo, quantidade]) => <div key={rotulo}><span>{rotulo}</span><div><i style={{ width: `${(quantidade / total) * 100}%` }} /></div><b>{quantidade}</b></div>)}</div>;
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

function TabelaServicosRealizados({ itens, dinheiro }) {
  if (!itens.length) return <p className="dashboard-premium__vazio">Nenhum serviço realizado para estes filtros.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><thead><tr><th scope="col">Serviço</th><th scope="col">Quantidade realizada</th><th scope="col">Receita realizada</th></tr></thead><tbody>{itens.map((item) => <tr key={item.servico}><th scope="row">{item.servico}</th><td>{item.quantidade}</td><td>{dinheiro(item.valor)}</td></tr>)}</tbody></table></div>;
}

function TabelaPromocoesAtivas({ itens, dinheiro }) {
  if (!itens.length) return <p className="dashboard-ranking__vazio">Nenhuma promoção ativa hoje para esta unidade, serviço e profissional.</p>;
  return <div className="tabela-premium__rolagem"><table className="tabela-premium"><thead><tr><th scope="col">Serviço</th><th scope="col">Unidade</th><th scope="col">Preço normal</th><th scope="col">Preço promocional</th><th scope="col">Término</th></tr></thead><tbody>{itens.map((item) => <tr key={item.idServico}><th scope="row">{item.servico}</th><td>{item.unidade}</td><td>{dinheiro(item.valorOriginal)}</td><td>{dinheiro(item.valorVigente)}</td><td>{item.promocao?.dataFim ? item.promocao.dataFim.split('-').reverse().join('/') : 'Sem término'}</td></tr>)}</tbody></table></div>;
}
