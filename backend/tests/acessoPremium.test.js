import assert from 'node:assert/strict';
import { assinaturaTemAcessoPremium } from '../src/servicos/acessoPremium.js';

const agora = new Date('2026-10-30T12:00:00Z');

test('status AUTORIZADA e EM_TESTE têm acesso Premium', () => {
  for (const status of ['AUTORIZADA', 'EM_TESTE']) assert.equal(assinaturaTemAcessoPremium({ status }, agora), true);
});

test('CANCELAMENTO_AGENDADO mantém acesso até a próxima cobrança', () => {
  const base = { status: 'CANCELAMENTO_AGENDADO' };
  assert.equal(assinaturaTemAcessoPremium({ ...base, dataProximaCobranca: '2026-11-05T00:00:00Z' }, agora), true);
  assert.equal(assinaturaTemAcessoPremium({ ...base, dataProximaCobranca: '2026-10-29T00:00:00Z' }, agora), false);
  assert.equal(assinaturaTemAcessoPremium(base, agora), false);
});

test('sem assinatura ou com outros status não há acesso', () => {
  assert.equal(assinaturaTemAcessoPremium(null, agora), false);
  assert.equal(assinaturaTemAcessoPremium(undefined, agora), false);
  for (const status of ['CANCELADA', 'PENDENTE', 'PAUSADA']) assert.equal(assinaturaTemAcessoPremium({ status }, agora), false);
});
