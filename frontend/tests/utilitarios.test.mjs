import assert from 'node:assert/strict';
import {
  dataNascimentoMaiorDeIdade, dataParaExibicao, dataParaIso, formatarCnpj, formatarCpf, formatarData,
  formatarTelefone, somenteNumeros,
} from '../utils/formatadores.js';
import { normalizarRetornoInterno } from '../utils/retornoSeguro.mjs';
import { agendarAtualizacaoTemporal } from '../utils/atualizacaoTemporal.mjs';

test('somenteNumeros remove tudo que não é dígito', () => {
  assert.equal(somenteNumeros('(11) 98765-4321'), '11987654321');
  assert.equal(somenteNumeros(null), '');
});

test('formatarCpf aplica a máscara progressivamente e limita a 11 dígitos', () => {
  assert.equal(formatarCpf('529'), '529');
  assert.equal(formatarCpf('5299822'), '529.982.2');
  assert.equal(formatarCpf('52998224725'), '529.982.247-25');
  assert.equal(formatarCpf('529982247259999'), '529.982.247-25');
});

test('formatarCnpj aplica a máscara, aceita letras e limita a 14 caracteres', () => {
  assert.equal(formatarCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatarCnpj('11'), '11');
  assert.equal(formatarCnpj('112223'), '11.222.3');
  assert.equal(formatarCnpj('ab123456000100'), 'AB.123.456/0001-00');
  assert.equal(formatarCnpj(undefined), '');
});

test('formatarTelefone distingue fixo e celular', () => {
  assert.equal(formatarTelefone('1134567890'), '(11) 3456-7890');
  assert.equal(formatarTelefone('11987654321'), '(11) 98765-4321');
  assert.equal(formatarTelefone('119'), '(11) 9');
});

test('formatarData, dataParaIso e dataParaExibicao convertem entre formatos', () => {
  assert.equal(formatarData('30101990'), '30/10/1990');
  assert.equal(dataParaIso('30/10/1990'), '1990-10-30');
  assert.equal(dataParaIso('3010'), '');
  assert.equal(dataParaExibicao('1990-10-30'), '30/10/1990');
  assert.equal(dataParaExibicao('3010'), '30/10');
});

test('dataNascimentoMaiorDeIdade valida formato, data real e maioridade', () => {
  assert.equal(dataNascimentoMaiorDeIdade('1990-05-20'), true);
  for (const valor of ['1990-02-30', '20/05/1990', '', null, '2999-01-01']) assert.equal(dataNascimentoMaiorDeIdade(valor), false);
  assert.equal(dataNascimentoMaiorDeIdade(`${new Date().getFullYear() - 17}-06-15`), false);
});

test('normalizarRetornoInterno só aceita caminhos internos da mesma origem', () => {
  const origem = 'https://agendeaki.com';
  assert.equal(normalizarRetornoInterno('/cliente/agenda?x=1#topo', origem), '/cliente/agenda?x=1#topo');
  for (const valor of ['//evil.com', 'https://evil.com', '/\\evil.com', 'cliente', '/a b', '', null, 42]) {
    assert.equal(normalizarRetornoInterno(valor, origem), null);
  }
});

function criarAmbiente(inicio) {
  let agora = inicio;
  const ouvintes = { janela: {}, documento: {} };
  const temporizadores = [];
  const janela = {
    setTimeout: (fn, ms) => { temporizadores.push({ fn, ms }); return temporizadores.length; },
    clearTimeout: (id) => { temporizadores[id - 1] = null; },
    addEventListener: (nome, fn) => { ouvintes.janela[nome] = fn; },
    removeEventListener: (nome) => { delete ouvintes.janela[nome]; },
  };
  const documento = {
    visibilityState: 'visible',
    addEventListener: (nome, fn) => { ouvintes.documento[nome] = fn; },
    removeEventListener: (nome) => { delete ouvintes.documento[nome]; },
  };
  return { janela, documento, ouvintes, temporizadores, agora: () => agora, avancar: (ms) => { agora += ms; } };
}

test('agendarAtualizacaoTemporal atualiza ao chegar o próximo instante futuro', () => {
  const ambiente = criarAmbiente(1000);
  let atualizacoes = 0;
  agendarAtualizacaoTemporal([500, 1000 + 10_000, 1000 + 20_000], () => atualizacoes++, ambiente);
  assert.equal(ambiente.temporizadores.length, 1);
  assert.equal(ambiente.temporizadores[0].ms, 10_050);
  ambiente.avancar(10_050);
  ambiente.temporizadores[0].fn();
  assert.equal(atualizacoes, 1);
});

test('agendarAtualizacaoTemporal limita a espera a 60 s e reagenda antes da hora', () => {
  const ambiente = criarAmbiente(0);
  let atualizacoes = 0;
  agendarAtualizacaoTemporal([300_000], () => atualizacoes++, ambiente);
  assert.equal(ambiente.temporizadores[0].ms, 60_000);
  ambiente.avancar(60_000);
  ambiente.temporizadores[0].fn();
  assert.equal(atualizacoes, 0);
  assert.equal(ambiente.temporizadores.length, 2);
});

test('agendarAtualizacaoTemporal reconsulta ao voltar à aba e remove ouvintes ao cancelar', () => {
  const ambiente = criarAmbiente(0);
  let atualizacoes = 0;
  const cancelar = agendarAtualizacaoTemporal([], () => atualizacoes++, ambiente);
  assert.equal(ambiente.temporizadores.length, 0);
  ambiente.ouvintes.janela.focus();
  ambiente.documento.visibilityState = 'hidden';
  ambiente.ouvintes.documento.visibilitychange();
  assert.equal(atualizacoes, 1);
  cancelar();
  assert.deepEqual(ambiente.ouvintes, { janela: {}, documento: {} });
});
