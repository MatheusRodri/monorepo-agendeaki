import assert from 'node:assert/strict';
import { dataAgendaValida, dataDentroDaJanela, gerarCandidatosPeriodo, sobrepoe } from '../src/servicos/disponibilidade.js';

function hojeSaoPaulo(deslocamentoDias = 0) {
  const base = new Date(Date.now() + deslocamentoDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
}

test('dataAgendaValida valida formato e existência da data', () => {
  assert.equal(dataAgendaValida('2026-10-30'), true);
  for (const data of ['2026-02-30', '30/10/2026', '2026-1-1', '', null]) assert.equal(dataAgendaValida(data), false);
});

test('dataDentroDaJanela aceita de hoje até 60 dias à frente', () => {
  assert.equal(dataDentroDaJanela(hojeSaoPaulo(0)), true);
  assert.equal(dataDentroDaJanela(hojeSaoPaulo(60)), true);
  assert.equal(dataDentroDaJanela(hojeSaoPaulo(62)), false);
  assert.equal(dataDentroDaJanela(hojeSaoPaulo(-2)), false);
  assert.equal(dataDentroDaJanela('lixo'), false);
});

test('gerarCandidatosPeriodo divide o período em blocos da duração do serviço', () => {
  assert.deepEqual(gerarCandidatosPeriodo('09:00', '11:00', 30), [
    { inicio: '09:00', fim: '09:30' }, { inicio: '09:30', fim: '10:00' },
    { inicio: '10:00', fim: '10:30' }, { inicio: '10:30', fim: '11:00' },
  ]);
  assert.deepEqual(gerarCandidatosPeriodo('09:00', '10:00', 45), [{ inicio: '09:00', fim: '09:45' }]);
  assert.deepEqual(gerarCandidatosPeriodo('09:00', '09:20', 30), []);
});

test('sobrepoe trata intervalos que apenas se tocam como sem conflito', () => {
  assert.equal(sobrepoe('09:00', '10:00', '09:30', '10:30'), true);
  assert.equal(sobrepoe('09:00', '10:00', '10:00', '11:00'), false);
  assert.equal(sobrepoe('09:00', '12:00', '10:00', '11:00'), true);
  assert.equal(sobrepoe('09:00', '10:00', '07:00', '09:00'), false);
});
