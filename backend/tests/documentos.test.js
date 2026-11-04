import assert from 'node:assert/strict';
import { cnpjValido, cpfValido, dataNascimentoValida, normalizarCnpj, somenteNumeros } from '../src/servicos/documentos.js';

test('somenteNumeros e normalizarCnpj limpam a máscara', () => {
  assert.equal(somenteNumeros('529.982.247-25'), '52998224725');
  assert.equal(somenteNumeros(null), '');
  assert.equal(normalizarCnpj('11.222.333/0001-81'), '11222333000181');
  assert.equal(normalizarCnpj('ab.cde.fgh/0001-xx'), 'ABCDEFGH0001XX');
});

test('cpfValido aceita CPF correto e rejeita inválidos', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  for (const cpf of ['529.982.247-24', '111.111.111-11', '123', '', null]) assert.equal(cpfValido(cpf), false);
});

test('cnpjValido aceita CNPJ numérico correto e rejeita inválidos', () => {
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  for (const cnpj of ['11.222.333/0001-80', '00000000000000', '123', '', null]) assert.equal(cnpjValido(cnpj), false);
});

test('dataNascimentoValida exige formato, data real e maioridade', () => {
  assert.equal(dataNascimentoValida('1990-05-20'), true);
  for (const data of ['1990-02-30', '20/05/1990', '', null, '2999-01-01']) assert.equal(dataNascimentoValida(data), false);
  const menor = `${new Date().getFullYear() - 17}-06-15`;
  assert.equal(dataNascimentoValida(menor), false);
});
