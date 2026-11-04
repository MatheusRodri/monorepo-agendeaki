import assert from 'node:assert/strict';
import {
  horarioBanco, instanteAgendamento, liberacaoConclusao, podeAvaliarAgendamento, podeConcluirAgendamento,
} from '../src/servicos/regrasTemporaisAgendamento.js';

test('instanteAgendamento interpreta DATETIME do MySQL como horário de São Paulo (-03:00)', () => {
  assert.equal(instanteAgendamento('2026-10-30 10:00:00').toISOString(), '2026-10-30T13:00:00.000Z');
  assert.equal(instanteAgendamento('2026-10-30T10:00:00Z').toISOString(), '2026-10-30T10:00:00.000Z');
  assert.equal(instanteAgendamento('2026-10-30T10:00:00+02:00').toISOString(), '2026-10-30T08:00:00.000Z');
});

test('instanteAgendamento devolve null para valores vazios ou inválidos', () => {
  for (const valor of [null, undefined, '', 'texto']) assert.equal(instanteAgendamento(valor), null);
});

test('horarioBanco formata no fuso de São Paulo', () => {
  assert.equal(horarioBanco(new Date('2026-10-30T15:30:45Z')), '2026-10-30 12:30:45');
  assert.equal(horarioBanco(new Date('2026-10-31T02:00:00Z')), '2026-10-30 23:00:00');
});

test('liberacaoConclusao libera a partir da meia-noite do dia anterior ao atendimento', () => {
  assert.equal(liberacaoConclusao('2026-10-30 10:00:00').toISOString(), '2026-10-29T03:00:00.000Z');
  assert.equal(liberacaoConclusao('invalido'), null);
});

test('podeConcluirAgendamento exige status AGENDADO e janela liberada', () => {
  const agendamento = { status: 'AGENDADO', dataHoraInicio: '2026-10-30 10:00:00' };
  assert.equal(podeConcluirAgendamento(agendamento, new Date('2026-10-29T02:59:59Z')), false);
  assert.equal(podeConcluirAgendamento(agendamento, new Date('2026-10-29T03:00:00Z')), true);
  assert.equal(podeConcluirAgendamento({ ...agendamento, status: 'CANCELADO' }, new Date('2026-11-01T00:00:00Z')), false);
  assert.equal(podeConcluirAgendamento({ status: 'AGENDADO', dataHoraInicio: null }, new Date()), false);
});

test('podeAvaliarAgendamento exige REALIZADO, sem avaliação e atendimento encerrado', () => {
  const agendamento = { status: 'REALIZADO', dataHoraFim: '2026-10-30 11:00:00', idAvaliacao: null };
  assert.equal(podeAvaliarAgendamento(agendamento, new Date('2026-10-30T13:59:59Z')), false);
  assert.equal(podeAvaliarAgendamento(agendamento, new Date('2026-10-30T14:00:00Z')), true);
  assert.equal(podeAvaliarAgendamento({ ...agendamento, idAvaliacao: 7 }, new Date('2026-11-01T00:00:00Z')), false);
  assert.equal(podeAvaliarAgendamento({ ...agendamento, status: 'AGENDADO' }, new Date('2026-11-01T00:00:00Z')), false);
});
