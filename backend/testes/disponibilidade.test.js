import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarCandidatosPeriodo } from '../src/servicos/disponibilidade.js';

test('gera horários consecutivos de acordo com a duração do serviço', () => {
  assert.deepEqual(gerarCandidatosPeriodo('09:00', '12:00', 45), [
    { inicio: '09:00', fim: '09:45' },
    { inicio: '09:45', fim: '10:30' },
    { inicio: '10:30', fim: '11:15' },
    { inicio: '11:15', fim: '12:00' },
  ]);
});

test('não oferece horário que ultrapassa o fim do expediente', () => {
  assert.deepEqual(gerarCandidatosPeriodo('09:00', '10:00', 45), [
    { inicio: '09:00', fim: '09:45' },
  ]);
});
