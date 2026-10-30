'use client';

import IconeDashboard from './IconeDashboard';
import { montarRanking, montarSerie } from './resumoDashboard.mjs';

const dinheiro = (valor) => Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percentual = (valor) => valor == null ? '—' : `${Number(valor).toFixed(1).replace('.', ',')}%`;
function comparar(valor, anterior, pontos = false) {
  if (valor == null || anterior == null) return { texto: 'Sem base anterior', diferenca: 0 };
  const diferenca = Number(valor) - Number(anterior);
  if (!pontos && !Number(anterior)) return { texto: Number(valor) ? 'Sem base anterior' : '0% vs. período anterior', diferenca: 0 };
  const variacao = pontos ? diferenca : diferenca / Number(anterior) * 100;
  return { texto: `${variacao > 0 ? '+' : ''}${variacao.toFixed(1).replace(/\.0$/, '').replace('.', ',')}${pontos ? ' p.p.' : '%'} vs. período anterior`, diferenca };
}

export function IndicadoresDetalhados({ dados, aoAbrir, aoDetalhar }) {
  const resumo = dados.resumo ?? {};
  const anterior = dados.comparacaoAnterior ?? {};
  const promocoes = dados.promocoes?.resumo ?? {};
  const anteriores = dados.promocoes?.comparacaoAnterior ?? {};
  const ticket = Number(resumo.atendimentosRealizados) ? Number(resumo.receitaRealizada) / Number(resumo.atendimentosRealizados) : 0;
  const ticketAnterior = Number(anterior.atendimentosRealizados) ? Number(anterior.receitaRealizada) / Number(anterior.atendimentosRealizados) : 0;
  const financeiro = [
    { titulo: 'Receita realizada', valor: dinheiro(resumo.receitaRealizada), icone: 'dinheiro', cor: 'coral', comparacao: comparar(resumo.receitaRealizada, anterior.receitaRealizada), recorte: 'realizados' },
    { titulo: 'Receita prevista · próximos 30 dias', valor: dinheiro(resumo.receitaPrevista), icone: 'calendario', cor: 'roxo', descricao: 'Agendamentos ativos a partir de hoje.', recorte: 'previstos' },
    { titulo: 'Receita com serviços extras', valor: dinheiro(resumo.receitaServicosExtras), icone: 'financeiro', cor: 'dourado', comparacao: comparar(resumo.receitaServicosExtras, anterior.receitaServicosExtras), recorte: 'extras', visualizarPor: 'servico' },
    { titulo: 'Ticket médio realizado', valor: dinheiro(ticket), icone: 'estrela', cor: 'dourado', comparacao: comparar(ticket, ticketAnterior), recorte: 'realizados' },
  ];
  const atendimentos = [
    { titulo: 'Agendamentos no período', valor: resumo.quantidadeAgendamentosTotal ?? 0, icone: 'calendario', cor: 'azul', comparacao: comparar(resumo.quantidadeAgendamentosTotal, anterior.quantidadeAgendamentosTotal), recorte: 'agendamentos' },
    { titulo: 'Atendimentos realizados', valor: resumo.quantidadeAgendamentosRealizados ?? 0, icone: 'realizado', cor: 'verde', comparacao: comparar(resumo.quantidadeAgendamentosRealizados, anterior.atendimentosRealizados), recorte: 'realizados' },
    { titulo: 'Total de serviços realizados', valor: resumo.quantidadeServicosRealizados ?? 0, icone: 'grade', cor: 'azul', comparacao: comparar(resumo.quantidadeServicosRealizados, anterior.quantidadeServicosRealizados), recorte: 'realizados', visualizarPor: 'servico' },
    { titulo: 'Serviços extras realizados', valor: resumo.quantidadeServicosExtras ?? 0, icone: 'mais', cor: 'roxo', comparacao: comparar(resumo.quantidadeServicosExtras, anterior.quantidadeServicosExtras), recorte: 'extras', visualizarPor: 'servico' },
  ];
  const cancelamentos = [
    { titulo: 'Taxa de cancelamento', valor: percentual(resumo.taxaCancelamento), icone: 'cancelar', cor: 'coral', descricao: 'Cancelados ÷ elegíveis.', comparacao: comparar(resumo.taxaCancelamento, anterior.taxaCancelamento, true), recorte: 'taxaCancelamento', inverso: true },
    { titulo: 'Agendamentos cancelados', valor: resumo.quantidadeAgendamentosCancelados ?? 0, icone: 'menos', cor: 'coral', comparacao: comparar(resumo.quantidadeAgendamentosCancelados, anterior.quantidadeAgendamentosCancelados), recorte: 'cancelados', inverso: true },
    { titulo: 'Taxa de comparecimento', valor: percentual(resumo.taxaComparecimento), icone: 'realizado', cor: 'verde', comparacao: comparar(resumo.taxaComparecimento, anterior.taxaComparecimento, true), recorte: 'comparecimento' },
    { titulo: 'Não compareceram', valor: resumo.quantidadeNaoCompareceu ?? 0, icone: 'pessoa', cor: 'azul', comparacao: comparar(resumo.quantidadeNaoCompareceu, anterior.quantidadeNaoCompareceu), recorte: 'naoCompareceu', inverso: true },
  ];
  const promocao = (titulo, campo, icone, cor, monetario = false) => ({ titulo, valor: monetario ? dinheiro(promocoes[campo]) : promocoes[campo] ?? 0, icone, cor,
    comparacao: comparar(promocoes[campo], anteriores[campo]), recorte: 'realizados', visualizarPor: 'servico', filtros: { promocao: 'com' } });
  const ajuste = (titulo, campo, icone, cor, ajusteValor) => ({ titulo, valor: dinheiro(promocoes[campo]), icone, cor,
    comparacao: comparar(promocoes[campo], anteriores[campo]), neutro: true, recorte: 'realizados', visualizarPor: 'servico', filtros: { ajusteValor } });

  function cards(itens, compacto = false) {
    return <div className={`dashboard-metricas${compacto ? ' dashboard-metricas--compactas' : ''}`}>{itens.map((item) => <CardMetrica item={item} aoAbrir={aoAbrir} key={item.titulo} />)}</div>;
  }
  return <div className="dashboard-resumo">
    <section className="dashboard-grupo" aria-label="Financeiro">
      <CabecalhoGrupo titulo="Financeiro" icone="financeiro" detalhe="Ver detalhes financeiros" aoDetalhar={aoDetalhar && (() => aoDetalhar('financeiro'))} />
      {cards(financeiro)}
    </section>
    <section className="dashboard-grupo" aria-label="Atendimentos e serviços">
      <CabecalhoGrupo titulo="Atendimentos e serviços" icone="servicos" detalhe="Ver detalhes de atendimentos" aoDetalhar={aoDetalhar && (() => aoDetalhar('atendimentos'))} />
      {cards(atendimentos)}
    </section>
    <div className="dashboard-resumo__dupla">
      <section className="dashboard-grupo dashboard-grupo--painel dashboard-grupo--ajustes" aria-label="Ajustes de valor">
        <CabecalhoGrupo titulo="Ajustes de valor" complemento="serviços extras e descontos" icone="ajustes" detalhe="Ver detalhes de ajustes" aoDetalhar={aoDetalhar && (() => aoDetalhar('ajustes'))} />
        <div className="dashboard-ajustes">
          {cards([ajuste('Descontos adicionais', 'descontosAdicionais', 'desconto', 'coral', 'desconto'), ajuste('Acréscimos aplicados', 'acrescimos', 'mais', 'verde', 'acrescimo')], true)}
          <aside className="dashboard-ajustes__ajuda"><IconeDashboard nome="info" /><div><strong>Como funciona?</strong><p>Ao adicionar um serviço extra, o salão pode ajustar o valor para mais ou para menos. Descontos e acréscimos são contabilizados separadamente.</p></div></aside>
        </div>
      </section>
      <section className="dashboard-grupo dashboard-grupo--painel" aria-label="Promoções">
        <CabecalhoGrupo titulo="Promoções" icone="presente" detalhe="Ver detalhes de promoções" aoDetalhar={aoDetalhar && (() => aoDetalhar('promocoes'))} />
        {cards([promocao('Serviços com promoção', 'servicosComPromocao', 'percentual', 'roxo'), promocao('Receita com promoção', 'receitaComPromocao', 'desconto', 'azul', true)], true)}
        <div className="dashboard-promocoes__complementos">
          <CardMetrica compacto aoAbrir={aoAbrir} item={promocao('Descontos promocionais', 'descontosPromocionais', 'desconto', 'coral', true)} />
          <CardMetrica compacto aoAbrir={aoAbrir} item={{ titulo: 'Participação das promoções', valor: percentual(promocoes.participacaoPromocoes), cor: 'roxo', descricao: 'Com promoção ÷ serviços com classificação conhecida, nos filtros atuais.', comparacao: comparar(promocoes.participacaoPromocoes, anteriores.participacaoPromocoes, true), recorte: 'realizados', visualizarPor: 'servico', filtros: { promocao: 'com' } }} />
        </div>
      </section>
    </div>
    <section className="dashboard-grupo dashboard-grupo--cancelamentos" aria-label="Cancelamentos e comparecimento">
      <CabecalhoGrupo titulo="Cancelamentos e comparecimento" icone="cancelar" detalhe="Ver detalhes de cancelamentos" aoDetalhar={aoDetalhar && (() => aoDetalhar('cancelamentos'))} />
      {cards(cancelamentos)}
    </section>
  </div>;
}

function CabecalhoGrupo({ titulo, complemento, icone, detalhe, aoDetalhar }) {
  return <header className="dashboard-grupo__cabecalho"><h2><IconeDashboard nome={icone} /><span>{titulo}{complemento && <small> ({complemento})</small>}</span></h2>{aoDetalhar && <button aria-label={detalhe === 'Ver todos' ? `${detalhe}: ${titulo}` : undefined} className="dashboard-grupo__detalhes" onClick={aoDetalhar} type="button">{detalhe}<IconeDashboard nome="seta" /></button>}</header>;
}

function CardMetrica({ item, aoAbrir, compacto = false }) {
  const clicavel = item.aoClicar || aoAbrir;
  const Tag = clicavel ? 'button' : 'article';
  const diferenca = item.comparacao?.diferenca ?? 0;
  const tendencia = item.neutro || !diferenca ? 'neutra' : (item.inverso ? diferenca < 0 : diferenca > 0) ? 'positiva' : 'negativa';
  return <Tag className={`dashboard-metrica dashboard-metrica--${item.cor}${compacto ? ' dashboard-metrica--mini' : ''}${item.serie ? ' dashboard-metrica--com-serie' : ''}`} {...(clicavel ? { type: 'button', onClick: item.aoClicar || (() => aoAbrir(item.recorte, item.visualizarPor, item.filtros)), 'aria-label': `${item.titulo}: ${item.valor}. ${item.aoClicar ? 'Ver detalhes' : 'Ver no Analítico'}` } : {})} title={item.descricao ?? 'Valores correspondentes aos filtros aplicados.'}>
    {!compacto && <span className="dashboard-metrica__icone"><IconeDashboard nome={item.icone} /></span>}
    <div className="dashboard-metrica__conteudo"><span className="dashboard-metrica__titulo">{item.titulo}</span><strong className="dashboard-metrica__valor">{item.valor}</strong>
      {item.comparacao ? <small className={`dashboard-metrica__variacao dashboard-metrica__variacao--${tendencia}`}>{diferenca !== 0 && <span aria-hidden="true">{diferenca > 0 ? '↗' : '↘'}</span>}{item.comparacao.texto}</small> : item.descricao && <small className="dashboard-metrica__descricao">{item.descricao}</small>}
    </div>
    {item.serie && <MiniGrafico valores={item.serie} />}
  </Tag>;
}

export default function IndicadoresDashboard({ dados, aoAbrir, aoDetalhar }) {
  const resumo = dados.resumo ?? {};
  const anterior = dados.comparacaoAnterior ?? {};
  const geral = dados.visaoGeral ?? {};
  const inicio = dados.filtros?.dataInicio;
  const fim = dados.filtros?.dataFim;
  const ticket = Number(resumo.atendimentosRealizados) ? Number(resumo.receitaRealizada) / Number(resumo.atendimentosRealizados) : 0;
  const ticketAnterior = Number(anterior.atendimentosRealizados) ? Number(anterior.receitaRealizada) / Number(anterior.atendimentosRealizados) : 0;
  const serie = (campo, divisor) => montarSerie(dados.receitaPorDia, inicio, fim, campo, divisor);
  const itens = [
    { titulo: 'Receita realizada', valor: dinheiro(resumo.receitaRealizada), icone: 'dinheiro', cor: 'coral', recorte: 'realizados', comparacao: comparar(resumo.receitaRealizada, anterior.receitaRealizada), serie: serie('valor') },
    { titulo: 'Atendimentos realizados', valor: resumo.atendimentosRealizados ?? 0, icone: 'calendario', cor: 'verde', recorte: 'realizados', comparacao: comparar(resumo.atendimentosRealizados, anterior.atendimentosRealizados), serie: serie('atendimentosRealizados') },
    { titulo: 'Agendamentos futuros', valor: resumo.quantidadeAgendamentosFuturos ?? 0, icone: 'calendario', cor: 'azul', recorte: 'previstos', descricao: 'Próximos 30 dias', serie: montarSerie(geral.futurosPorDia, geral.inicioPrevisao, geral.fimPrevisao, 'quantidade') },
    { titulo: 'Agendamentos cancelados', valor: resumo.quantidadeAgendamentosCancelados ?? 0, icone: 'cancelar', cor: 'coral', recorte: 'cancelados', inverso: true, descricao: resumo.taxaCancelamento == null ? 'Sem base para a taxa de cancelamento' : `${percentual(resumo.taxaCancelamento)} de cancelamento`, serie: montarSerie(geral.cancelamentosPorDia, inicio, fim, 'quantidade') },
    { titulo: 'Ticket médio', valor: dinheiro(ticket), icone: 'estrela', cor: 'dourado', recorte: 'realizados', comparacao: comparar(ticket, ticketAnterior), serie: serie('valor', 'atendimentosRealizados') },
  ];
  const servicos = montarRanking((dados.receitaPorServico ?? []).map((item) => ({ id: `servico:${item.servico}`, nome: item.servico, quantidade: item.quantidade })));
  const profissionais = montarRanking((dados.profissionais ?? []).map((item) => ({ id: item.idFuncionario, nome: item.profissional, quantidade: item.atendimentosRealizados })));
  return <div className="dashboard-geral">
    <section className="dashboard-grupo" aria-label="Resumo do período">
      <CabecalhoGrupo titulo="Resumo do período" icone="financeiro" />
      <div className="dashboard-metricas dashboard-metricas--resumo">{itens.map((item) => <CardMetrica item={item} aoAbrir={aoAbrir} key={item.titulo} />)}</div>
    </section>
    <div className="dashboard-geral__paineis">
      <PainelRanking titulo="Serviços mais realizados" icone="servicos" itens={servicos} aoVerTodos={aoDetalhar && (() => aoDetalhar('servicos'))} descricao="Serviços reservados e extras realizados, pela data da confirmação." />
      <PainelRanking titulo="Atendimentos por profissional" icone="pessoa" itens={profissionais} azul aoVerTodos={aoDetalhar && (() => aoDetalhar('profissionais'))} descricao="Percentuais sobre a soma das participações dos profissionais. Um atendimento pode envolver mais de um profissional." />
      <section className="dashboard-grupo dashboard-grupo--painel dashboard-geral__promocoes" aria-label="Promoções">
        <CabecalhoGrupo titulo="Promoções" icone="desconto" detalhe="Ver todos" aoDetalhar={aoDetalhar && (() => aoDetalhar('promocoes'))} />
        <CardMetrica item={{ titulo: 'Promoções ativas', valor: geral.promocoesAtivas ?? 0, icone: 'desconto', cor: 'roxo', descricao: 'Ativas hoje · unidade, serviço e profissional', aoClicar: aoDetalhar && (() => aoDetalhar('promocoes')) }} />
        <CardMetrica aoAbrir={aoAbrir} item={{ titulo: 'Agendamentos com promoção', valor: geral.agendamentosComPromocao ?? 0, icone: 'percentual', cor: 'roxo', recorte: 'agendamentos', filtros: { promocao: 'com' }, comparacao: comparar(geral.agendamentosComPromocao, geral.agendamentosComPromocaoAnterior), descricao: 'Todos os status, pela data agendada. Cada atendimento é contado uma vez.' }} />
      </section>
    </div>
    <aside className="dashboard-geral__explicacao"><IconeDashboard nome="info" /><div><strong>Como são calculados os indicadores?</strong><p>A receita e os atendimentos realizados usam a data da confirmação. O ticket médio é a receita dividida pelos atendimentos realizados. Agendamentos futuros consideram os próximos 30 dias, independentemente do período selecionado. Cancelados usam a data do cancelamento; a taxa considera os horários elegíveis pela data agendada. As promoções ativas refletem o cadastro de hoje; agendamentos com promoção usam a data agendada e incluem todos os status. Registros antigos sem identificação de promoção ficam fora dessa contagem.</p></div></aside>
  </div>;
}

function PainelRanking({ titulo, icone, itens, azul, aoVerTodos, descricao }) {
  return <section className={`dashboard-grupo dashboard-grupo--painel dashboard-ranking${azul ? ' dashboard-ranking--azul' : ''}`} aria-label={titulo}>
    <CabecalhoGrupo titulo={titulo} icone={icone} detalhe="Ver todos" aoDetalhar={aoVerTodos} />
    {itens.length ? <ol className="dashboard-ranking__lista" aria-label={descricao}>{itens.map((item, indice) => <li key={item.id}>
      <span className="dashboard-ranking__posicao" aria-hidden="true">{indice + 1}</span>
      <div className="dashboard-ranking__servico"><span>{item.nome}</span><div className="dashboard-ranking__trilho" aria-hidden="true"><i style={{ width: `${item.percentual}%` }} /></div></div>
      <div className="dashboard-ranking__numeros"><strong>{item.quantidade}</strong><small>{percentual(item.percentual)}</small></div>
    </li>)}</ol> : <p className="dashboard-ranking__vazio">Nenhum atendimento realizado para estes filtros.</p>}
    <p className="visualmente-oculto">{descricao}</p>
  </section>;
}

function MiniGrafico({ valores }) {
  const maximo = Math.max(...valores, 1);
  const pontos = valores.map((valor, indice) => `${valores.length === 1 ? 100 : 4 + indice * 192 / (valores.length - 1)},${34 - valor / maximo * 28}`).join(' ');
  return <svg aria-hidden="true" className="dashboard-metrica__serie" fill="none" preserveAspectRatio="none" viewBox="0 0 200 40"><polyline points={pontos || '4,34 196,34'} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg>;
}
