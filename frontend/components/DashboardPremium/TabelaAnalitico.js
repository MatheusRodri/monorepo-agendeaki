'use client';

export const colunasAnalitico = [
  ['idAgendamento', '#'], ['dataInicio', 'Data agendada'], ['dataRealizacao', 'Realizado em'],
  ['cliente', 'Cliente'], ['contato', 'Contato'], ['servico', 'Serviço'], ['quantidadeServicosExtras', 'Extras'], ['unidade', 'Filial'],
  ['profissional', 'Profissional'], ['status', 'Status'], ['valor', 'Valor'], ['statusPagamento', 'Pagamento'],
  ['motivoCancelamento', 'Motivo do cancelamento'], ['origemCancelamento', 'Cancelado por'],
];
const statusLegivel = { AGENDADO: 'Agendado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', NAO_COMPARECEU: 'Não compareceu' };
const pagamentoLegivel = { PENDENTE: 'Pendente', APROVADO: 'Aprovado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado', REEMBOLSADO: 'Reembolsado' };
const origemLegivel = { CLIENTE: 'Cliente', SALAO: 'Salão', NAO_IDENTIFICADO: 'Não identificada' };
const dataHora = (valor) => valor ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(valor)) : '—';

export default function TabelaAnalitico({ agendamentos, dinheiro, visualizarPor = 'atendimento', ordenarPor, direcao, aoOrdenar }) {
  const porServico = visualizarPor === 'servico';
  const colunas = porServico ? colunasAnalitico.filter(([campo]) => campo !== 'quantidadeServicosExtras').flatMap(([campo, rotulo]) => campo === 'servico' ? [[campo, rotulo], ['tipoItem', 'Tipo']] : [[campo, campo === 'idAgendamento' ? 'Atendimento' : rotulo]]) : colunasAnalitico;
  if (!agendamentos.length) return <p className="dashboard-premium__vazio">{porServico ? 'Nenhum serviço encontrado para estes filtros.' : 'Nenhum agendamento encontrado para estes filtros.'}</p>;
  function celula(item, campo) {
    if (campo === 'dataInicio' || campo === 'dataRealizacao') return dataHora(item[campo]);
    if (campo === 'valor') return dinheiro(item.valor);
    if (campo === 'quantidadeServicosExtras') return Number(item.quantidadeServicosExtras ?? 0);
    if (campo === 'tipoItem') return <span className={`tipo-servico tipo-servico--${item.tipoItem === 'EXTRA' ? 'extra' : 'reservado'}`}>{item.tipoItem === 'EXTRA' ? 'Extra' : 'Reservado'}</span>;
    if (campo === 'contato') return [item.email, item.telefone].filter(Boolean).join(' · ') || '—';
    if (campo === 'status') return <span className={`status-agendamento status-agendamento--${String(item.status).toLowerCase()}`}>{statusLegivel[item.status] ?? item.status}</span>;
    if (campo === 'statusPagamento') return pagamentoLegivel[item.statusPagamento] ?? '—';
    if (campo === 'origemCancelamento') return origemLegivel[item.origemCancelamento] ?? '—';
    if (campo === 'motivoCancelamento') return item.status === 'CANCELADO' ? [item.motivoCancelamento, item.detalheCancelamento].filter(Boolean).join(': ') || 'Sem motivo informado' : '—';
    return item[campo] ?? '—';
  }
  return <div className="tabela-premium__rolagem"><table className="tabela-premium tabela-premium--agendamentos">
    <caption className="visualmente-oculto">{porServico ? 'Análise por serviço, uma linha por serviço reservado ou extra' : 'Análise de agendamentos, com data agendada e data de realização'}</caption>
    <thead><tr>{colunas.map(([campo, rotulo]) => <th aria-sort={aoOrdenar && campo === ordenarPor ? (direcao === 'asc' ? 'ascending' : 'descending') : undefined} key={campo} scope="col">
      {aoOrdenar ? <button aria-label={`Ordenar por ${rotulo}`} onClick={() => aoOrdenar(campo)} type="button">{rotulo}<span aria-hidden="true">{campo === ordenarPor ? (direcao === 'asc' ? '↑' : '↓') : '↕'}</span></button> : rotulo}
    </th>)}</tr></thead>
    <tbody>{agendamentos.map((item) => <tr key={porServico ? item.idLinha ?? `${item.tipoItem}:${item.idExtra ?? item.idAgendamento}` : item.idAgendamento}>{colunas.map(([campo]) => campo === 'cliente' ? <th key={campo} scope="row">{celula(item, campo)}</th> : <td key={campo}>{celula(item, campo)}</td>)}</tr>)}</tbody>
  </table></div>;
}
