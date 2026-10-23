import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sobrepoe } from '../src/servicos/disponibilidade.js';
import { validarItensReserva, valorMonetario } from '../src/servicos/agendamentos.js';

test('intervalos consecutivos são válidos e sobreposições parciais são conflitos', () => {
  assert.equal(sobrepoe('09:00', '09:30', '09:30', '10:00'), false);
  assert.equal(sobrepoe('09:00', '09:45', '09:30', '10:00'), true);
  assert.equal(sobrepoe('09:15', '09:30', '09:00', '10:00'), true);
});

test('a lista exige serviços e profissionais confirmados e identifica o item inválido', () => {
  const valido = { idServico: 1, idFuncionario: 2, dataHoraInicio: '2026-10-24T09:00:00' };
  validarItensReserva(1, [valido]);
  assert.throws(() => validarItensReserva(1, []), { codigo: 'LISTA_INVALIDA' });
  assert.throws(() => validarItensReserva(1, [valido, { ...valido, idFuncionario: null }]), { indiceItem: 1, codigo: 'ITEM_INVALIDO' });
  assert.throws(() => validarItensReserva(1, [{ ...valido, observacao: 'x'.repeat(501) }]), { status: 400 });
  validarItensReserva(1, [{ ...valido, idFuncionario: null }], false);
});

test('valores extras aceitam zero e centavos e rejeitam valores ausentes, negativos ou imprecisos', () => {
  assert.equal(valorMonetario('12.30'), '12.30');
  assert.equal(valorMonetario(0), '0.00');
  for (const valor of [null, undefined, '', true, -1, '12.345', NaN, Infinity, '1e3', '100000000.00']) {
    assert.throws(() => valorMonetario(valor), { status: 400 });
  }
});

test('o mesmo serviço só pode aparecer uma vez por dia, mesmo em horários e profissionais diferentes', () => {
  const item = { idServico: 1, idFuncionario: 2, dataHoraInicio: '2026-10-24T09:00:00' };
  assert.throws(() => validarItensReserva(1, [item, { ...item, idFuncionario: 3, dataHoraInicio: '2026-10-24T15:00:00' }]), {
    status: 409, codigo: 'SERVICO_REPETIDO_DIA', indiceItem: 1,
  });
  validarItensReserva(1, [item, { ...item, dataHoraInicio: '2026-10-25T09:00:00' }]);
  validarItensReserva(1, [item, { ...item, idServico: 2, dataHoraInicio: '2026-10-24T15:00:00' }]);
});
