import { QueryTypes } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { bloquearRecursosAgenda, criarTransacaoAgenda, resolverReserva } from './disponibilidade.js';

export function idValido(valor) {
  return Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
}

export function validarItensReserva(idUnidade, itens, exigirProfissional = true) {
  if (!idValido(idUnidade) || !Array.isArray(itens) || !itens.length || itens.length > 50) {
    throw Object.assign(new Error('Informe a unidade e entre 1 e 50 serviços.'), { status: 400, codigo: 'LISTA_INVALIDA' });
  }
  const servicosPorDia = new Set();
  itens.forEach((item, indiceItem) => {
    if (!item || !idValido(item.idServico)
      || ((exigirProfissional || item.idFuncionario != null) && !idValido(item.idFuncionario))
      || typeof item.dataHoraInicio !== 'string'
      || (item.observacao != null && (typeof item.observacao !== 'string' || item.observacao.length > 500))) {
      throw Object.assign(new Error('Confira serviço, profissional, horário e observação do item.'), { status: 400, codigo: 'ITEM_INVALIDO', indiceItem });
    }
    const chave = `${Number(item.idServico)}:${item.dataHoraInicio.slice(0, 10)}`;
    if (servicosPorDia.has(chave)) {
      throw Object.assign(new Error('Escolha outra data: o mesmo serviço só pode ser agendado uma vez por dia.'), {
        status: 409, codigo: 'SERVICO_REPETIDO_DIA', indiceItem,
      });
    }
    servicosPorDia.add(chave);
  });
}

export async function criarReservasCliente({ idUsuario, idUnidade, itens, exigirProfissional = true }) {
  validarItensReserva(idUnidade, itens, exigirProfissional);
  const transaction = await criarTransacaoAgenda();
  const agendamentos = [];
  let indiceItem = 0;
  try {
    await bloquearRecursosAgenda({ idUsuario, idsUnidades: [idUnidade], transaction });
    const agoraPreco = new Date();
    for (const item of itens) {
      const reserva = await resolverReserva({
        dataHoraInicio: item.dataHoraInicio, idUnidade: Number(idUnidade),
        idServico: Number(item.idServico), idFuncionario: item.idFuncionario == null ? null : Number(item.idFuncionario),
        idUsuario, transaction, valorEsperado: item.valorEsperado, agoraPreco,
      });
      const [idAgendamento] = await bancoDeDados.query(`INSERT INTO tb_agendamento
        (fk_usuario, fk_unidade, fk_funcionario, fk_servico, dt_inicio, dt_fim,
         nm_servico_agendado, vl_servico_agendado, nu_duracao_minutos, ds_observacao)
        VALUES (:idUsuario, :idUnidade, :idFuncionario, :idServico, :dataInicioBanco, :dataFimBanco,
         :nomeServico, :valorServico, :duracaoMinutos, :observacao)`, {
        replacements: { ...reserva, idUsuario, idUnidade: Number(idUnidade), idServico: Number(item.idServico), observacao: item.observacao?.trim() || null }, transaction,
      });
      agendamentos.push({ ...reserva, idAgendamento: Number(idAgendamento), idServico: Number(item.idServico) });
      indiceItem += 1;
    }
    await transaction.commit();
    return agendamentos;
  } catch (erro) {
    await transaction.rollback();
    throw Object.assign(erro, { indiceItem, codigo: erro.codigo ?? (erro.status === 409 ? 'CONFLITO_HORARIO' : 'RESERVA_INVALIDA') });
  }
}

export function valorMonetario(valor) {
  if ((typeof valor !== 'number' && typeof valor !== 'string') || !/^\d+(?:\.\d{1,2})?$/.test(String(valor))
    || !Number.isFinite(Number(valor)) || Number(valor) > 99999999.99) {
    throw Object.assign(new Error('Informe um valor não negativo com até duas casas decimais.'), { status: 400 });
  }
  return Number(valor).toFixed(2);
}

export async function salvarServicosAdicionais({ idAgendamento, idUnidade, servicosAdicionais = [], transaction }) {
  if (!Array.isArray(servicosAdicionais) || servicosAdicionais.length > 50) {
    throw Object.assign(new Error('Informe uma lista de até 50 serviços adicionais.'), { status: 400 });
  }
  for (const item of servicosAdicionais) {
    if (!item || !idValido(item.idServico) || !idValido(item.idFuncionario)) {
      throw Object.assign(new Error('Selecione serviço e profissional válidos para cada extra.'), { status: 400 });
    }
    const [servico] = await bancoDeDados.query(`SELECT s.nm_servico AS nomeServico,
      s.vl_servico AS valorReferencia, s.nu_duracao_minutos AS duracaoMinutos,
      f.nm_funcionario AS nomeFuncionario
      FROM tb_servico s INNER JOIN tb_funcionario_servico fs ON fs.fk_servico=s.id_servico
      INNER JOIN tb_funcionario f ON f.id_funcionario=fs.fk_funcionario AND f.fk_unidade=s.fk_unidade
      WHERE s.id_servico=:idServico AND f.id_funcionario=:idFuncionario AND s.fk_unidade=:idUnidade
        AND s.st_ativo=TRUE AND f.st_ativo=TRUE`, {
      replacements: { idServico: Number(item.idServico), idFuncionario: Number(item.idFuncionario), idUnidade }, transaction, type: QueryTypes.SELECT,
    });
    if (!servico) throw Object.assign(new Error('O serviço extra ou profissional não está disponível nesta unidade.'), { status: 400 });
    const valorCobrado = valorMonetario(item.valorCobrado ?? servico.valorReferencia);
    await bancoDeDados.query(`INSERT INTO tb_agendamento_servico_adicional
      (fk_agendamento, fk_servico, fk_funcionario, nm_servico, nm_funcionario, vl_referencia, vl_cobrado, nu_duracao_minutos)
      VALUES (:idAgendamento, :idServico, :idFuncionario, :nomeServico, :nomeFuncionario, :valorReferencia, :valorCobrado, :duracaoMinutos)`, {
      replacements: { ...servico, idAgendamento, idServico: Number(item.idServico), idFuncionario: Number(item.idFuncionario), valorCobrado }, transaction,
    });
  }
}

export async function incluirServicosAdicionais(agendamentos, { transaction } = {}) {
  if (!agendamentos.length) return agendamentos;
  const adicionais = await bancoDeDados.query(`SELECT fk_agendamento AS idAgendamento,
    fk_servico AS idServico, fk_funcionario AS idFuncionario, nm_servico AS servico,
    nm_funcionario AS profissional, vl_referencia AS valorReferencia, vl_cobrado AS valorCobrado,
    nu_duracao_minutos AS duracaoMinutos FROM tb_agendamento_servico_adicional
    WHERE fk_agendamento IN (:ids) ORDER BY id_servico_adicional`, {
    replacements: { ids: agendamentos.map(({ idAgendamento }) => idAgendamento) }, type: QueryTypes.SELECT, transaction,
  });
  return agendamentos.map((agendamento) => {
    const servicosAdicionais = adicionais.filter((item) => Number(item.idAgendamento) === Number(agendamento.idAgendamento));
    const totalCentavos = servicosAdicionais.reduce((total, item) => total + Math.round(Number(item.valorCobrado) * 100), Math.round(Number(agendamento.valor) * 100));
    return { ...agendamento, servicosAdicionais, valorTotal: totalCentavos / 100 };
  });
}
