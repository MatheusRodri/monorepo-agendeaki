import assert from 'node:assert/strict';
import { iniciarProcessadorConvites, processarConvitesAvaliacao } from '../src/servicos/convitesAvaliacao.js';

// Banco simulado em memória: reproduz a fila de convites e as regras de reserva/conclusão.
function criarBancoSimulado({ convites, agendamento }) {
  const fila = convites.map((convite) => ({ ...convite, processado: false, reservado: false }));
  const consultas = [];
  return {
    fila, consultas,
    async transaction(fn) { return fn({}); },
    async query(sql, opcoes = {}) {
      consultas.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));
      if (sql.includes('FROM tb_notificacao_cliente')) {
        const proximo = fila.find((item) => !item.processado && !item.reservado);
        return proximo ? [{ ...proximo }] : [];
      }
      if (sql.includes('SET dt_push_reservado=:agora WHERE')) {
        fila.find((item) => item.id === opcoes.replacements.id).reservado = true;
        return [];
      }
      if (sql.includes('FROM tb_agendamento')) return [agendamento];
      if (sql.includes('dt_push_processado=:agora')) {
        const item = fila.find((registro) => registro.id === opcoes.replacements.id);
        item.processado = true;
        item.reservado = false;
        return [];
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  };
}

const convite = (id) => ({ id, idUsuario: 7, idAgendamento: 100 + id, titulo: 'Avalie', mensagem: 'Como foi?', link: '/avaliar' });
const agora = () => new Date('2026-10-30T20:00:00Z');
const elegivel = { status: 'REALIZADO', dataHoraFim: '2026-10-30 10:00:00', idAvaliacao: null };

test('envia o convite de agendamento elegível e marca como processado', async () => {
  const banco = criarBancoSimulado({ convites: [convite(1), convite(2)], agendamento: elegivel });
  const enviados = [];
  const total = await processarConvitesAvaliacao({ banco, agora, enviar: async (...args) => { enviados.push(args); return true; } });
  assert.equal(total, 2);
  assert.deepEqual(enviados[0], [7, 'Avalie', 'Como foi?', 1, '/avaliar']);
  assert.ok(banco.fila.every((item) => item.processado));
});

test('não envia push quando o agendamento já foi avaliado, mas encerra o convite', async () => {
  const banco = criarBancoSimulado({ convites: [convite(1)], agendamento: { ...elegivel, idAvaliacao: 5 } });
  let chamadas = 0;
  const total = await processarConvitesAvaliacao({ banco, agora, enviar: async () => { chamadas++; return true; } });
  assert.equal(chamadas, 0);
  assert.equal(total, 1);
  assert.equal(banco.fila[0].processado, true);
});

test('mantém o convite pendente quando o envio retorna false', async () => {
  const banco = criarBancoSimulado({ convites: [convite(1)], agendamento: elegivel });
  const total = await processarConvitesAvaliacao({ banco, agora, limite: 1, enviar: async () => false });
  assert.equal(total, 0);
  assert.equal(banco.fila[0].processado, false);
});

test('falha no envio não interrompe o processamento nem marca o convite', async () => {
  const banco = criarBancoSimulado({ convites: [convite(1)], agendamento: elegivel });
  const original = console.error;
  console.error = () => {};
  try {
    const total = await processarConvitesAvaliacao({ banco, agora, limite: 1, enviar: async () => { throw new Error('push fora'); } });
    assert.equal(total, 0);
    assert.equal(banco.fila[0].processado, false);
  } finally { console.error = original; }
});

test('respeita o limite de convites por ciclo', async () => {
  const banco = criarBancoSimulado({ convites: [convite(1), convite(2), convite(3)], agendamento: elegivel });
  const total = await processarConvitesAvaliacao({ banco, agora, limite: 2, enviar: async () => true });
  assert.equal(total, 2);
});

test('iniciarProcessadorConvites executa na partida, evita ciclos concorrentes e permite parar', async () => {
  let execucoes = 0;
  let liberar;
  const parar = iniciarProcessadorConvites({
    intervaloMs: 5,
    processar: () => { execucoes++; return new Promise((resolver) => { liberar = resolver; }); },
  });
  await new Promise((resolver) => setTimeout(resolver, 30));
  assert.equal(execucoes, 1);
  liberar();
  parar();
});
