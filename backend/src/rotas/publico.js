import { QueryTypes } from 'sequelize';
import { Router } from 'express';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { listarHorariosDisponiveis } from '../servicos/disponibilidade.js';

const roteadorPublico = Router();

function agruparServicos(linhas) {
  const porId = new Map();
  for (const linha of linhas) {
    if (!porId.has(linha.idServico)) porId.set(linha.idServico, {
      descricao: linha.descricao,
      duracaoMinutos: Number(linha.duracaoMinutos),
      idServico: Number(linha.idServico),
      nome: linha.nome,
      profissionais: [],
      valor: Number(linha.valor),
    });
    if (linha.idFuncionario) porId.get(linha.idServico).profissionais.push({
      idFuncionario: Number(linha.idFuncionario), nome: linha.nomeFuncionario,
    });
  }
  return [...porId.values()].filter((servico) => servico.profissionais.length);
}

async function buscarPagina(slugSalao, slugFilial) {
  const filiais = await bancoDeDados.query(
    `SELECT s.id_salao AS idSalao, s.nm_salao AS nomeSalao, s.ds_slug AS slugSalao,
            s.ds_email AS emailSalao, s.nu_telefone AS telefoneSalao,
            u.id_unidade AS idUnidade, u.nm_unidade AS nomeUnidade, u.ds_slug AS slugFilial,
            u.tp_categoria AS categoria, u.ds_rua AS rua, u.nu_endereco AS numero,
            u.ds_complemento AS complemento, u.ds_bairro AS bairro,
            u.ds_municipio AS municipio, u.ds_estado AS estado, u.nu_cep AS cep,
            COALESCE(u.nu_telefone, s.nu_telefone) AS telefone
     FROM tb_salao s INNER JOIN tb_unidade u ON u.fk_salao = s.id_salao
     WHERE s.ds_slug = :slugSalao AND u.ds_slug = :slugFilial
       AND s.st_ativo = TRUE AND u.st_ativo = TRUE LIMIT 1`,
    { replacements: { slugFilial, slugSalao }, type: QueryTypes.SELECT },
  );
  return filiais[0] ?? null;
}

async function consultarPagina(requisicao, resposta) {
  const filial = await buscarPagina(requisicao.params.slugSalao, requisicao.params.slugFilial);
  if (!filial) { resposta.status(404).json({ mensagem: 'Esta página de agendamento não foi encontrada.' }); return; }
  const linhas = await bancoDeDados.query(
    `SELECT se.id_servico AS idServico, se.nm_servico AS nome, se.ds_servico AS descricao,
            se.vl_servico AS valor, se.nu_duracao_minutos AS duracaoMinutos,
            f.id_funcionario AS idFuncionario, f.nm_funcionario AS nomeFuncionario
     FROM tb_servico se
     LEFT JOIN tb_funcionario_servico fs ON fs.fk_servico = se.id_servico
     LEFT JOIN tb_funcionario f ON f.id_funcionario = fs.fk_funcionario
       AND f.fk_unidade = se.fk_unidade AND f.st_ativo = TRUE
     WHERE se.fk_unidade = :idUnidade AND se.st_ativo = TRUE
     ORDER BY se.nm_servico, f.nm_funcionario`,
    { replacements: filial, type: QueryTypes.SELECT },
  );
  const servicos = agruparServicos(linhas);
  resposta.status(200).json({ filial, servicos, disponivel: servicos.length > 0 });
}

async function consultarHorarios(requisicao, resposta) {
  const filial = await buscarPagina(requisicao.params.slugSalao, requisicao.params.slugFilial);
  if (!filial) { resposta.status(404).json({ mensagem: 'Esta página de agendamento não foi encontrada.' }); return; }
  const idServico = Number(requisicao.query.idServico);
  const qualquer = requisicao.query.idFuncionario === 'qualquer' || !requisicao.query.idFuncionario;
  const idFuncionario = qualquer ? null : Number(requisicao.query.idFuncionario);
  if (!Number.isInteger(idServico) || (!qualquer && !Number.isInteger(idFuncionario))) {
    resposta.status(400).json({ mensagem: 'Informe serviço e profissional válidos.' }); return;
  }
  try {
    const disponibilidade = await listarHorariosDisponiveis({
      data: String(requisicao.query.data ?? ''), idFuncionario, idServico, idUnidade: filial.idUnidade,
    });
    resposta.status(200).json(disponibilidade);
  } catch (erro) { resposta.status(erro.status ?? 500).json({ mensagem: erro.message }); }
}

async function consultarEnderecoLegado(requisicao, resposta) {
  const filiais = await bancoDeDados.query(
    `SELECT s.ds_slug AS slugSalao, u.ds_slug AS slugFilial
     FROM tb_unidade u INNER JOIN tb_salao s ON s.id_salao = u.fk_salao
     WHERE u.id_unidade = :idUnidade AND u.st_ativo = TRUE AND s.st_ativo = TRUE LIMIT 1`,
    { replacements: { idUnidade: Number(requisicao.params.idUnidade) }, type: QueryTypes.SELECT },
  );
  if (!filiais.length) { resposta.status(404).json({ mensagem: 'Filial não encontrada.' }); return; }
  resposta.status(200).json({ caminho: `/${filiais[0].slugSalao}/${filiais[0].slugFilial}` });
}

roteadorPublico.get('/agendamento/unidade/:idUnidade', consultarEnderecoLegado);
roteadorPublico.get('/agendamento/:slugSalao/:slugFilial/horarios', consultarHorarios);
roteadorPublico.get('/agendamento/:slugSalao/:slugFilial', consultarPagina);

export default roteadorPublico;
