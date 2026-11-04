import assert from 'node:assert/strict';
import { jest, test } from '@jest/globals';

// O .env real não pode influenciar o resultado.
jest.unstable_mockModule('dotenv/config', () => ({}));

// Conexão Sequelize só é criada (nenhuma consulta é feita): valida porta padrão e socket opcional.
delete process.env.MYSQL_PORT;
process.env.MYSQL_SOCKET = '/tmp/mysql-teste.sock';
const { bancoDeDados } = await import('../src/configuracoes/bancoDeDados.js');

test('conexão usa a porta 3306 por padrão e o socket quando informado', () => {
  assert.equal(bancoDeDados.config.port, 3306);
  assert.equal(bancoDeDados.options.dialectOptions.socketPath, '/tmp/mysql-teste.sock');
  assert.equal(bancoDeDados.options.timezone, '-03:00');
});

test('sem socket nem porta configurados a conexão usa TCP', async () => {
  delete process.env.MYSQL_SOCKET;
  process.env.MYSQL_PORT = '3307';
  const { bancoDeDados: outro } = await import('../src/configuracoes/bancoDeDados.js?tcp');
  assert.equal(outro.config.port, 3307);
  assert.deepEqual(outro.options.dialectOptions, {});
});
