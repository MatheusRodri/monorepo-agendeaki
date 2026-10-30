import { QueryTypes, Transaction } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
export const FUSO_AGENDA = 'America/Sao_Paulo';

function partesHoje() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', month: '2-digit', timeZone: FUSO_AGENDA, year: 'numeric',
  }).formatToParts(new Date());
  const obter = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${obter('year')}-${obter('month')}-${obter('day')}`;
}

function dataUtc(data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function dataAgendaValida(data) {
  if (!FORMATO_DATA.test(String(data ?? ''))) return false;
  const convertida = dataUtc(data);
  return !Number.isNaN(convertida.getTime()) && convertida.toISOString().slice(0, 10) === data;
}

export function dataDentroDaJanela(data) {
  if (!dataAgendaValida(data)) return false;
  const hoje = dataUtc(partesHoje());
  const limite = new Date(hoje);
  limite.setUTCDate(limite.getUTCDate() + 60);
  const escolhida = dataUtc(data);
  return escolhida >= hoje && escolhida <= limite;
}

function diaSemana(data) {
  return dataUtc(data).getUTCDay();
}

function minutos(hora) {
  const [h, m] = String(hora).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function hora(minuto) {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
}

export function gerarCandidatosPeriodo(inicio, fim, duracaoMinutos) {
  const candidatos = [];
  for (let atual = minutos(inicio); atual + duracaoMinutos <= minutos(fim); atual += duracaoMinutos) {
    candidatos.push({ fim: hora(atual + duracaoMinutos), inicio: hora(atual) });
  }
  return candidatos;
}

function paraBanco(dataHora) {
  return `${dataHora.slice(0, 10)} ${dataHora.slice(11, 16)}:00`;
}

export function sobrepoe(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && fimA > inicioB;
}

export function criarTransacaoAgenda() {
  return bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });
}

// Todos os escritores seguem: filiais em ordem, cliente, profissionais, agendamento.
// A filial serializa reservas sem preferência e bloqueios gerais. Travá-la antes do
// cliente evita ciclos com as FKs das notificações de cancelamento dos bloqueios.
export async function bloquearRecursosAgenda({ idUsuario = null, idClienteSalao = null, idsUnidades, transaction }) {
  const unidades = [...new Set(idsUnidades.map(Number))].sort((a, b) => a - b);
  for (const idUnidade of unidades) {
    await bancoDeDados.query('SELECT id_unidade FROM tb_unidade WHERE id_unidade=:idUnidade FOR UPDATE', {
      replacements: { idUnidade }, transaction, type: QueryTypes.SELECT,
    });
  }
  if (idUsuario) await bancoDeDados.query('SELECT id_usuario FROM tb_usuario WHERE id_usuario=:idUsuario FOR UPDATE', {
    replacements: { idUsuario }, transaction, type: QueryTypes.SELECT,
  });
  if (idClienteSalao) await bancoDeDados.query('SELECT id_cliente_salao FROM tb_cliente_salao WHERE id_cliente_salao=:idClienteSalao FOR UPDATE', {
    replacements: { idClienteSalao }, transaction, type: QueryTypes.SELECT,
  });
  for (const idUnidade of unidades) {
    await bancoDeDados.query('SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade=:idUnidade ORDER BY id_funcionario FOR UPDATE', {
      replacements: { idUnidade }, transaction, type: QueryTypes.SELECT,
    });
  }
}

export async function ocupacoesDoCliente({ data, idUsuario = null, idClienteSalao = null, ignorarIdAgendamento = null, transaction }) {
  if (!idUsuario && !idClienteSalao) return [];
  return bancoDeDados.query(`SELECT DATE_FORMAT(dt_inicio, '%Y-%m-%dT%H:%i:%s') AS inicio,
    DATE_FORMAT(dt_fim, '%Y-%m-%dT%H:%i:%s') AS fim FROM tb_agendamento
    WHERE ((:idUsuario IS NOT NULL AND fk_usuario=:idUsuario)
      OR (:idClienteSalao IS NOT NULL AND fk_cliente_salao=:idClienteSalao))
      AND cd_status='AGENDADO' AND dt_inicio < DATE_ADD(:data, INTERVAL 1 DAY)
      AND dt_fim > CONCAT(:data, ' 00:00:00')
      AND (:ignorarIdAgendamento IS NULL OR id_agendamento<>:ignorarIdAgendamento)`, {
    replacements: { data, idUsuario, idClienteSalao, ignorarIdAgendamento }, transaction, type: QueryTypes.SELECT,
  });
}

export async function validarConflitoCliente({ dataInicioBanco, dataFimBanco, idUsuario = null, idClienteSalao = null, ignorarIdAgendamento = null, transaction }) {
  const ocupacoes = await ocupacoesDoCliente({ data: dataInicioBanco.slice(0, 10), idUsuario, idClienteSalao, ignorarIdAgendamento, transaction });
  if (ocupacoes.some(({ inicio, fim }) => sobrepoe(dataInicioBanco.replace(' ', 'T'), dataFimBanco.replace(' ', 'T'), inicio, fim))) {
    throw Object.assign(new Error('O cliente já tem um serviço reservado neste intervalo.'), { status: 409, codigo: 'CONFLITO_CLIENTE' });
  }
}

export async function validarServicoNoDia({ data, idServico, idUsuario = null, idClienteSalao = null, ignorarIdAgendamento = null, transaction }) {
  if (!idUsuario && !idClienteSalao) return;
  const existentes = await bancoDeDados.query(`SELECT id_agendamento FROM tb_agendamento
    WHERE fk_servico=:idServico AND cd_status IN ('AGENDADO','REALIZADO')
      AND ((:idUsuario IS NOT NULL AND fk_usuario=:idUsuario)
        OR (:idClienteSalao IS NOT NULL AND fk_cliente_salao=:idClienteSalao))
      AND dt_inicio >= CONCAT(:data, ' 00:00:00') AND dt_inicio < DATE_ADD(:data, INTERVAL 1 DAY)
      AND (:ignorarIdAgendamento IS NULL OR id_agendamento<>:ignorarIdAgendamento) LIMIT 1`, {
    replacements: { data, idServico, idUsuario, idClienteSalao, ignorarIdAgendamento }, transaction, type: QueryTypes.SELECT,
  });
  if (existentes.length) throw Object.assign(new Error('Você já tem este serviço nesta data. Escolha outro dia.'), {
    status: 409, codigo: 'SERVICO_REPETIDO_DIA',
  });
}

function normalizarDataHora(valor) {
  const texto = String(valor ?? '');
  if (!FORMATO_DATA_HORA.test(texto)) return null;
  return `${texto.slice(0, 16)}:00`;
}

async function buscarContexto({ idUnidade, idServico, idFuncionario = null, transaction }) {
  const profissionais = await bancoDeDados.query(
    `SELECT s.id_servico AS idServico, s.fk_unidade AS idUnidade,
            s.nm_servico AS nomeServico, s.vl_servico AS valorServico,
            s.nu_duracao_minutos AS duracaoMinutos,
            f.id_funcionario AS idFuncionario, f.nm_funcionario AS nomeFuncionario
     FROM tb_servico s
     INNER JOIN tb_funcionario_servico fs ON fs.fk_servico = s.id_servico
     INNER JOIN tb_funcionario f ON f.id_funcionario = fs.fk_funcionario
     INNER JOIN tb_unidade u ON u.id_unidade = s.fk_unidade AND u.id_unidade = f.fk_unidade
     INNER JOIN tb_salao sa ON sa.id_salao = u.fk_salao
     WHERE s.id_servico = :idServico AND s.fk_unidade = :idUnidade
       AND s.st_ativo = TRUE AND f.st_ativo = TRUE
       AND u.st_ativo = TRUE AND sa.st_ativo = TRUE AND sa.st_exclusao_pendente=FALSE
       AND (:idFuncionario IS NULL OR f.id_funcionario = :idFuncionario)
     ORDER BY f.id_funcionario`,
    { replacements: { idFuncionario, idServico, idUnidade }, transaction, type: QueryTypes.SELECT },
  );
  return profissionais;
}

async function periodosDoProfissional({ data, idFuncionario, idUnidade, transaction }) {
  const dia = diaSemana(data);
  const [unidade, funcionario] = await Promise.all([
    bancoDeDados.query(
      `SELECT hr_abertura AS inicio, hr_fechamento AS fim
       FROM tb_horario_unidade
       WHERE fk_unidade = :idUnidade AND nr_dia_semana = :dia AND st_fechado = FALSE`,
      { replacements: { dia, idUnidade }, transaction, type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT hr_inicio AS inicio, hr_fim AS fim
       FROM tb_disponibilidade_funcionario
       WHERE fk_funcionario = :idFuncionario AND nr_dia_semana = :dia AND st_ativo = TRUE
       ORDER BY hr_inicio`,
      { replacements: { dia, idFuncionario }, transaction, type: QueryTypes.SELECT },
    ),
  ]);
  if (!unidade.length) return [];
  if (!funcionario.length) return [];
  const periodosBase = funcionario;
  const periodos = [];
  for (const periodo of periodosBase) {
    for (const horarioUnidade of unidade) {
      const inicio = Math.max(minutos(periodo.inicio), minutos(horarioUnidade.inicio));
      const fim = Math.min(minutos(periodo.fim), minutos(horarioUnidade.fim));
      if (inicio < fim) periodos.push({ fim, inicio });
    }
  }
  return periodos.sort((a, b) => a.inicio - b.inicio);
}

async function ocupacoesDoProfissional({ data, idFuncionario, idUnidade, ignorarIdAgendamento, transaction }) {
  const inicioDia = `${data} 00:00:00`;
  const fimDia = `${data} 23:59:59`;
  const [agendamentos, bloqueios] = await Promise.all([
    bancoDeDados.query(
      `SELECT DATE_FORMAT(dt_inicio, '%Y-%m-%dT%H:%i:%s') AS inicio,
              DATE_FORMAT(dt_fim, '%Y-%m-%dT%H:%i:%s') AS fim FROM tb_agendamento
       WHERE fk_funcionario = :idFuncionario AND cd_status = 'AGENDADO'
         AND (:ignorarIdAgendamento IS NULL OR id_agendamento <> :ignorarIdAgendamento)
         AND dt_inicio < :fimDia AND dt_fim > :inicioDia`,
      { replacements: { fimDia, idFuncionario, ignorarIdAgendamento, inicioDia }, transaction, type: QueryTypes.SELECT },
    ),
    bancoDeDados.query(
      `SELECT DATE_FORMAT(dt_inicio, '%Y-%m-%dT%H:%i:%s') AS inicio,
              DATE_FORMAT(dt_fim, '%Y-%m-%dT%H:%i:%s') AS fim FROM tb_bloqueio_agenda
       WHERE fk_unidade = :idUnidade AND st_ativo = TRUE
         AND (fk_funcionario IS NULL OR fk_funcionario = :idFuncionario)
         AND dt_inicio < :fimDia AND dt_fim > :inicioDia`,
      { replacements: { fimDia, idFuncionario, idUnidade, inicioDia }, transaction, type: QueryTypes.SELECT },
    ),
  ]);
  return [...agendamentos, ...bloqueios];
}

export async function listarHorariosDisponiveis({
  data, idUnidade, idServico, idFuncionario = null, idUsuario = null, idClienteSalao = null, ignorarIdAgendamento = null, duracaoMinutos: duracaoPersonalizada = null, transaction,
}) {
  if (!dataDentroDaJanela(data)) {
    const erro = new Error('Escolha uma data entre hoje e os próximos 60 dias.');
    erro.status = 400;
    throw erro;
  }
  await validarServicoNoDia({ data, idServico, idUsuario, idClienteSalao, ignorarIdAgendamento, transaction });
  const contexto = await buscarContexto({ idFuncionario, idServico, idUnidade, transaction });
  if (!contexto.length) {
    const erro = new Error('O serviço ou profissional não está disponível nesta unidade.');
    erro.status = 404;
    throw erro;
  }

  const duracaoMinutos = Number(duracaoPersonalizada ?? contexto[0].duracaoMinutos);
  const agora = new Date();
  const horariosPorInicio = new Map();
  const ocupacoesCliente = await ocupacoesDoCliente({ data, idUsuario, idClienteSalao, ignorarIdAgendamento, transaction });

  for (const profissional of contexto) {
    const [periodos, ocupacoes] = await Promise.all([
      periodosDoProfissional({ data, idFuncionario: profissional.idFuncionario, idUnidade, transaction }),
      ocupacoesDoProfissional({ data, idFuncionario: profissional.idFuncionario, idUnidade, ignorarIdAgendamento, transaction }),
    ]);

    for (const periodo of periodos) {
      for (const candidato of gerarCandidatosPeriodo(hora(periodo.inicio), hora(periodo.fim), duracaoMinutos)) {
        const { fim, inicio } = candidato;
        const inicioCompleto = `${data}T${inicio}:00`;
        const fimCompleto = `${data}T${fim}:00`;
        if (new Date(`${inicioCompleto}-03:00`) <= agora) continue;
        if (ocupacoesCliente.some((ocupacao) => sobrepoe(inicioCompleto, fimCompleto, ocupacao.inicio, ocupacao.fim))) continue;
        if (ocupacoes.some((ocupacao) => sobrepoe(inicioCompleto, fimCompleto, ocupacao.inicio, ocupacao.fim))) continue;
        const existente = horariosPorInicio.get(inicio) ?? { fim, inicio, profissionais: [] };
        existente.profissionais.push({ idFuncionario: Number(profissional.idFuncionario), nome: profissional.nomeFuncionario });
        horariosPorInicio.set(inicio, existente);
      }
    }
  }

  return {
    data,
    duracaoMinutos,
    horarios: [...horariosPorInicio.values()]
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map((item) => ({
        ...item,
        profissionalSugerido: [...item.profissionais]
          .sort((a, b) => a.idFuncionario - b.idFuncionario)[0] ?? null,
      })),
    servico: {
      idServico: Number(contexto[0].idServico),
      nome: contexto[0].nomeServico,
      valor: Number(contexto[0].valorServico),
    },
  };
}

export async function resolverReserva({
  dataHoraInicio, idUnidade, idServico, idFuncionario = null, idUsuario = null, idClienteSalao = null, ignorarIdAgendamento = null, duracaoMinutos = null, transaction,
}) {
  const inicioNormalizado = normalizarDataHora(dataHoraInicio);
  if (!inicioNormalizado) {
    const erro = new Error('Informe um horário válido.');
    erro.status = 400;
    throw erro;
  }
  const disponibilidade = await listarHorariosDisponiveis({
    data: inicioNormalizado.slice(0, 10), idFuncionario, idServico, idUnidade, ignorarIdAgendamento, duracaoMinutos, transaction,
  });
  await validarServicoNoDia({ data: inicioNormalizado.slice(0, 10), idServico, idUsuario, idClienteSalao, ignorarIdAgendamento, transaction });
  const opcao = disponibilidade.horarios.find((item) => item.inicio === inicioNormalizado.slice(11, 16));
  if (!opcao) {
    const erro = new Error('Este horário não está mais disponível. Escolha outra opção.');
    erro.status = 409;
    throw erro;
  }
  const profissional = opcao.profissionais.sort((a, b) => a.idFuncionario - b.idFuncionario)[0];
  const reserva = {
    dataFimBanco: paraBanco(`${inicioNormalizado.slice(0, 10)}T${opcao.fim}:00`),
    dataInicioBanco: paraBanco(inicioNormalizado),
    duracaoMinutos: disponibilidade.duracaoMinutos,
    idFuncionario: profissional.idFuncionario,
    nomeFuncionario: profissional.nome,
    nomeServico: disponibilidade.servico.nome,
    valorServico: disponibilidade.servico.valor,
  };
  await validarConflitoCliente({ ...reserva, idUsuario, idClienteSalao, ignorarIdAgendamento, transaction });
  return reserva;
}
