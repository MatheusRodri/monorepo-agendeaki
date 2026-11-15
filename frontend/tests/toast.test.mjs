import { beforeEach, expect, jest, test } from '@jest/globals';

const toast = { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() };
jest.unstable_mockModule('react-toastify', () => ({ toast }));
const avisos = await import('../utils/toast.js');

beforeEach(() => Object.values(toast).forEach((funcao) => funcao.mockReset()));

test.each([
  ['toastErro', 'error'], ['toastSucesso', 'success'], ['toastAviso', 'warn'], ['toastInfo', 'info'],
])('%s exibe a mensagem com fechamento automático em 15 s e aceita opções', (funcao, metodo) => {
  avisos[funcao]('Mensagem');
  expect(toast[metodo]).toHaveBeenCalledWith('Mensagem', { autoClose: 15000 });
  avisos[funcao]('Outra', { autoClose: 1000, toastId: 'x' });
  expect(toast[metodo]).toHaveBeenLastCalledWith('Outra', { autoClose: 1000, toastId: 'x' });
});

test.each(['toastErro', 'toastSucesso', 'toastAviso', 'toastInfo'])('%s ignora mensagem vazia', (funcao) => {
  avisos[funcao]('');
  avisos[funcao](undefined);
  Object.values(toast).forEach((metodo) => expect(metodo).not.toHaveBeenCalled());
});
