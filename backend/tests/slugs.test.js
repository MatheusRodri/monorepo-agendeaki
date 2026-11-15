import assert from 'node:assert/strict';
import { criarSlug } from '../src/servicos/slugs.js';

test('criarSlug remove acentos, normaliza caixa e separadores', () => {
  assert.equal(criarSlug('Salão da Maria & Cia!'), 'salao-da-maria-cia');
  assert.equal(criarSlug('  --Barbearia   Ção--  '), 'barbearia-cao');
});

test('criarSlug usa fallback para valores vazios', () => {
  for (const valor of [null, undefined, '', '   ', '!!!']) assert.equal(criarSlug(valor), 'sem-nome');
});

test('criarSlug limita a 140 caracteres', () => {
  assert.equal(criarSlug('a'.repeat(300)).length, 140);
});
