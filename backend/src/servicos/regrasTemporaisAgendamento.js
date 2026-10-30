export const FUSO_AGENDAMENTO = 'America/Sao_Paulo';

// DATETIME do MySQL usa o mesmo -03:00 configurado na conexão Sequelize.
export function instanteAgendamento(valor) {
  if (valor == null || valor === '') return null;
  const texto = typeof valor === 'string' ? valor.replace(' ', 'T') : valor;
  const instante = new Date(typeof texto === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto)
    ? `${texto}-03:00` : texto);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

export function horarioBanco(agora = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO_AGENDAMENTO, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(agora);
}

export function liberacaoConclusao(dataHoraInicio) {
  const inicio = instanteAgendamento(dataHoraInicio);
  if (!inicio) return null;
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_AGENDAMENTO,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(inicio);
  const anterior = new Date(`${dia}T12:00:00Z`);
  anterior.setUTCDate(anterior.getUTCDate() - 1);
  return new Date(`${anterior.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

export function podeConcluirAgendamento(agendamento, agora = new Date()) {
  const liberacao = liberacaoConclusao(agendamento.dataHoraInicio);
  return agendamento.status === 'AGENDADO' && liberacao !== null && agora >= liberacao;
}

export function podeAvaliarAgendamento(agendamento, agora = new Date()) {
  const fim = instanteAgendamento(agendamento.dataHoraFim);
  return agendamento.status === 'REALIZADO' && !agendamento.idAvaliacao && fim !== null && agora >= fim;
}
