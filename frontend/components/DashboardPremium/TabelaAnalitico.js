'use client';

import { Fragment, useId, useState } from 'react';

export const colunasAnalitico = [
  ['idAgendamento', '#'], ['dataInicio', 'Data agendada'], ['dataRealizacao', 'Realizado em'],
  ['cliente', 'Cliente'], ['contato', 'Contato'], ['servico', 'Serviço'], ['quantidadeServicosExtras', 'Extras'], ['unidade', 'Unidade'],
  ['profissional', 'Profissional'], ['status', 'Status'], ['promocaoAplicada', 'Promoção'], ['precoNormal', 'Preço normal'], ['precoVigente', 'Preço vigente'],
  ['descontoPromocional', 'Desconto promocional'], ['descontoAdicional', 'Desconto adicional'], ['acrescimo', 'Acréscimo'], ['valor', 'Valor final'], ['statusPagamento', 'Pagamento'],
  ['motivoCancelamento', 'Motivo do cancelamento'], ['origemCancelamento', 'Cancelado por'],
];
const colunasAtendimento = [
  ['idAgendamento', '#'], ['dataInicio', 'Data agendada'], ['dataRealizacao', 'Realizado em'],
  ['cliente', 'Cliente'], ['contato', 'Contato'], ['unidade', 'Unidade'], ['profissional', 'Profissional(is)'],
  ['status', 'Status'], ['quantidadeServicosExtras', 'Extras'], ['valor', 'Valor total'],
  ['motivoCancelamento', 'Motivo do cancelamento'], ['origemCancelamento', 'Cancelado por'],
];
const colunasComposicao = [
  ['tipoItem', 'Tipo'], ['servico', 'Serviço'], ['profissional', 'Profissional'], ['duracaoMinutos', 'Duração'],
  ['promocaoAplicada', 'Promoção'], ['precoNormal', 'Preço normal'], ['precoVigente', 'Preço vigente'],
  ['descontoPromocional', 'Desc. promocional'], ['descontoAdicional', 'Desc. adicional'], ['acrescimo', 'Acréscimo'], ['valor', 'Valor final'],
];
const statusLegivel = { AGENDADO: 'Agendado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', NAO_COMPARECEU: 'Não compareceu' };
const pagamentoLegivel = { PENDENTE: 'Pendente', APROVADO: 'Aprovado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado', REEMBOLSADO: 'Reembolsado' };
const origemLegivel = { CLIENTE: 'Cliente', SALAO: 'Salão', NAO_IDENTIFICADO: 'Não identificada' };
const promocaoLegivel = { COM: 'Com promoção', SEM: 'Sem promoção', MISTA: 'Mista', NAO_INFORMADO: 'Não informado' };
const camposPreco = ['precoNormal', 'precoVigente', 'descontoPromocional', 'descontoAdicional', 'acrescimo'];
const dataHora = (valor) => valor && Number.isFinite(new Date(valor).getTime())
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(valor)) : '—';

function celula(item, campo, dinheiro) {
  if (campo === 'dataInicio' || campo === 'dataRealizacao') return dataHora(item[campo]);
  if (campo === 'valor') return dinheiro(item.valor);
  if (camposPreco.includes(campo)) return item[campo] == null ? <span className="analitico-nao-informado">Não informado</span>
    : <>{dinheiro(item[campo])}{Number(item.totaisParciais) > 0 && <small className="analitico-parcial"> · Parcial</small>}</>;
  if (campo === 'promocaoAplicada') return promocaoLegivel[item.promocaoAplicada] ?? 'Não informado';
  if (campo === 'quantidadeServicosExtras') return Number(item.quantidadeServicosExtras ?? 0);
  if (campo === 'duracaoMinutos') return item.duracaoMinutos == null ? 'Não informado' : `${Number(item.duracaoMinutos)} min`;
  if (campo === 'tipoItem') return <span className={`tipo-servico tipo-servico--${item.tipoItem === 'EXTRA' ? 'extra' : 'reservado'}`}>{item.tipoItem === 'EXTRA' ? 'Extra' : 'Reservado'}</span>;
  if (campo === 'contato') return [item.email, item.telefone].filter(Boolean).join(' · ') || '—';
  if (campo === 'status') return <span className={`status-agendamento status-agendamento--${String(item.status).toLowerCase()}`}>{statusLegivel[item.status] ?? item.status}</span>;
  if (campo === 'statusPagamento') return pagamentoLegivel[item.statusPagamento] ?? '—';
  if (campo === 'origemCancelamento') return origemLegivel[item.origemCancelamento] ?? '—';
  if (campo === 'motivoCancelamento') return item.status === 'CANCELADO' ? [item.motivoCancelamento, item.detalheCancelamento].filter(Boolean).join(': ') || 'Sem motivo informado' : '—';
  return item[campo] ?? '—';
}

export default function TabelaAnalitico({ agendamentos = [], dinheiro, visualizarPor = 'atendimento', ordenarPor, direcao, aoOrdenar, impressao = false }) {
  const porServico = visualizarPor === 'servico';
  const expansivel = !porServico && !impressao;
  const colunas = porServico ? colunasAnalitico.filter(([campo]) => campo !== 'quantidadeServicosExtras').flatMap(([campo, rotulo]) => campo === 'servico' ? [[campo, rotulo], ['tipoItem', 'Tipo'], ['duracaoMinutos', 'Duração']] : campo === 'acrescimo' ? [[campo, rotulo], ['observacaoAjuste', 'Observação do ajuste']] : [[campo, campo === 'idAgendamento' ? 'Atendimento' : rotulo]]) : impressao ? colunasAnalitico : colunasAtendimento;
  if (!agendamentos.length) return <p className="dashboard-premium__vazio">{porServico ? 'Nenhum serviço encontrado para estes filtros.' : 'Nenhum agendamento encontrado para estes filtros.'}</p>;
  return <div className={`tabela-premium__rolagem analitico-tabela__rolagem${impressao ? ' analitico-tabela__rolagem--impressao' : ''}`} role="region" aria-label={porServico ? 'Tabela de serviços, role para conferir todas as colunas' : 'Tabela de atendimentos, role para conferir todas as colunas'} tabIndex={impressao ? undefined : 0}>
    <table className={`tabela-premium tabela-premium--agendamentos analitico-tabela${porServico ? ' analitico-tabela--servicos' : ''}`}>
      <caption className="visualmente-oculto">{porServico ? 'Análise por serviço, uma linha por serviço reservado ou extra' : 'Análise por atendimento. Use o botão de cada linha para conferir os serviços selecionados.'} Datas no horário de São Paulo.</caption>
      <thead><tr>{expansivel && <th className="analitico-tabela__expandir" scope="col"><span className="visualmente-oculto">Serviços</span></th>}{colunas.map(([campo, rotulo]) => <th className={`analitico-coluna analitico-coluna--${campo}`} aria-sort={aoOrdenar && campo === ordenarPor ? (direcao === 'asc' ? 'ascending' : 'descending') : undefined} key={campo} scope="col">
        {aoOrdenar && !['duracaoMinutos', 'observacaoAjuste'].includes(campo) ? <button aria-label={`Ordenar por ${rotulo}`} onClick={() => aoOrdenar(campo)} type="button"><span className="analitico-tabela__titulo-coluna">{rotulo}</span><span aria-hidden="true" className="analitico-tabela__ordenacao">{campo === ordenarPor ? (direcao === 'asc' ? '↑' : '↓') : '↕'}</span></button> : rotulo}
      </th>)}</tr></thead>
      <tbody>{agendamentos.map((item, indice) => expansivel
        ? <LinhaAtendimento colunas={colunas} dinheiro={dinheiro} inicialmenteExpandido={indice === 0} item={item} key={item.idAgendamento} />
        : <tr key={porServico ? item.idLinha ?? `${item.tipoItem}:${item.idExtra ?? item.idAgendamento}` : item.idAgendamento}><Celulas colunas={colunas} item={item} dinheiro={dinheiro} /></tr>)}</tbody>
    </table>
  </div>;
}

function Celulas({ colunas, item, dinheiro }) {
  return colunas.map(([campo]) => {
    const valor = celula(item, campo, dinheiro);
    const Tag = campo === 'cliente' ? 'th' : 'td';
    const texto = ['cliente', 'contato', 'profissional', 'servico', 'motivoCancelamento'].includes(campo);
    return <Tag className={`analitico-coluna analitico-coluna--${campo}`} key={campo} scope={campo === 'cliente' ? 'row' : undefined}>{texto ? <span className="analitico-tabela__texto" title={String(valor)}>{valor}</span> : valor}</Tag>;
  });
}

function LinhaAtendimento({ item, colunas, dinheiro, inicialmenteExpandido }) {
  const [expandido, definirExpandido] = useState(inicialmenteExpandido);
  const id = useId();
  const servicos = item.servicos ?? [];
  const alternar = () => definirExpandido((atual) => !atual);
  return <Fragment>
    <tr className={`analitico-tabela__linha${expandido ? ' analitico-tabela__linha--aberta' : ''}`} onClick={(evento) => { if (!evento.target.closest('button, a, input, select, textarea')) alternar(); }}>
      <td className="analitico-tabela__expandir"><button aria-controls={id} aria-expanded={expandido} aria-label={`${expandido ? 'Recolher' : 'Ver'} serviços do atendimento ${item.idAgendamento}`} className="analitico-tabela__alternar" onClick={alternar} type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 20 20"><path d="m7 4 6 6-6 6" /></svg></button></td>
      <Celulas colunas={colunas} item={item} dinheiro={dinheiro} />
    </tr>
    <tr className="analitico-tabela__detalhe" hidden={!expandido}><td colSpan={colunas.length + 1}>
      <section className="analitico-composicao" id={id} aria-label={`Serviços do atendimento ${item.idAgendamento}`}>
        <header><h3>Serviços deste atendimento ({servicos.length})</h3><span>Pagamento: {pagamentoLegivel[item.statusPagamento] ?? 'Não informado'}</span></header>
        <p>Serviços correspondentes aos filtros e ao recorte atuais. O valor total reúne apenas estes serviços.</p>
        {Number(item.totaisParciais) > 0 && <p className="analitico-composicao__aviso">Há serviços sem classificação histórica. Os totais de preços, descontos e acréscimos são parciais; o valor final permanece completo.</p>}
        <div className="analitico-composicao__resumo"><span>Promoção: <strong>{promocaoLegivel[item.promocaoAplicada] ?? 'Não informado'}</strong></span>{[['descontoPromocional', 'Descontos promocionais'], ['descontoAdicional', 'Descontos adicionais'], ['acrescimo', 'Acréscimos']].map(([campo, rotulo]) => <span key={campo}>{rotulo}: <strong>{celula(item, campo, dinheiro)}</strong></span>)}</div>
        {servicos.length ? <table className="tabela-premium analitico-composicao__tabela"><caption className="visualmente-oculto">Composição dos serviços do atendimento {item.idAgendamento}</caption><thead><tr>{colunasComposicao.map(([campo, rotulo]) => <th key={campo} scope="col">{rotulo}</th>)}</tr></thead><tbody>{servicos.map((servico, indice) => {
          const linha = { ...servico, servico: servico.nomeServico, profissional: servico.nomeFuncionario, valor: servico.valorItem };
          return <Fragment key={`${servico.tipoItem}:${servico.idExtra ?? indice}`}><tr>{colunasComposicao.map(([campo]) => campo === 'servico' ? <th key={campo} scope="row">{celula(linha, campo, dinheiro)}</th> : <td key={campo}>{celula(linha, campo, dinheiro)}</td>)}</tr>{servico.observacaoAjuste && <tr className="analitico-composicao__observacao"><td colSpan={colunasComposicao.length}><strong>Observação do ajuste:</strong> {servico.observacaoAjuste}</td></tr>}</Fragment>;
        })}</tbody></table> : <p className="analitico-composicao__vazio">Composição indisponível para este registro.</p>}
      </section>
    </td></tr>
  </Fragment>;
}
