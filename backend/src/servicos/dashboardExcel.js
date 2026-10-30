import ExcelJS from 'exceljs';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished, pipeline } from 'node:stream/promises';
import { QueryTypes, Transaction } from 'sequelize';
import { bancoDeDados } from '../configuracoes/bancoDeDados.js';
import { colunasExportacao, consultarLinhasAnaliticas, prepararLinhasExportacao } from './dashboardAnalitico.js';

function criarAba(workbook, nome, colunas) {
  const sheet = workbook.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = colunas.map(([header, key, tipo]) => ({ header, key, width: header.startsWith('data_') ? 29 : header.startsWith('id_') ? 21 : 25, style: tipo === 'valor' ? { numFmt: '#,##0.00' } : {} }));
  const cabecalho = sheet.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F1D3B' } };
  cabecalho.height = 25;
  cabecalho.commit();
  return { sheet, colunas, linhas: 1, ids: new Set() };
}

function adicionarLinha(aba, dados) {
  if (aba.linhas >= 1048576) throw Object.assign(new Error('O recorte excede o limite de linhas do Excel. Reduza o período ou aplique mais filtros.'), { status: 400 });
  const valores = {};
  for (const [nome, campo, tipo] of aba.colunas) {
    const valor = dados[campo];
    valores[campo] = valor == null ? null : nome.startsWith('id_') ? String(valor) : tipo === 'valor' ? Number(valor) : valor;
  }
  // Textos são células de texto, sem interpretar nomes como fórmulas.
  aba.sheet.addRow(valores).commit();
  aba.linhas++;
}

async function adicionarCadastros(consulta, lote, itens, abas, transaction) {
  const unidades = new Set(lote.map((linha) => String(linha.idUnidade)));
  const novosIds = (tipo, campo) => [...new Set(itens.map((item) => String(item[campo])))].filter((id) => !abas[tipo].ids.has(id));
  const idsServicos = novosIds('servicos', 'idServico');
  const idsProfissionais = novosIds('profissionais', 'idFuncionario');
  if (idsServicos.length) {
    const registros = await bancoDeDados.query(`SELECT s.id_servico AS idServico, s.fk_unidade AS idUnidade,
      s.nm_servico AS servico, s.vl_servico AS valorReferencia, s.nu_duracao_minutos AS duracaoMinutos, s.st_ativo AS ativo
      FROM tb_servico s INNER JOIN tb_unidade u ON u.id_unidade = s.fk_unidade
      WHERE u.fk_salao = :idSalao AND s.id_servico IN (:ids) ORDER BY s.id_servico`, {
      replacements: { idSalao: consulta.filtros.idSalao, ids: idsServicos }, type: QueryTypes.SELECT, transaction,
    });
    for (const registro of registros) {
      adicionarLinha(abas.servicos, registro); abas.servicos.ids.add(String(registro.idServico)); unidades.add(String(registro.idUnidade));
    }
  }
  if (idsProfissionais.length) {
    const registros = await bancoDeDados.query(`SELECT f.id_funcionario AS idFuncionario, f.fk_unidade AS idUnidade,
      f.nm_funcionario AS profissional, f.st_ativo AS ativo
      FROM tb_funcionario f INNER JOIN tb_unidade u ON u.id_unidade = f.fk_unidade
      WHERE u.fk_salao = :idSalao AND f.id_funcionario IN (:ids) ORDER BY f.id_funcionario`, {
      replacements: { idSalao: consulta.filtros.idSalao, ids: idsProfissionais }, type: QueryTypes.SELECT, transaction,
    });
    for (const registro of registros) {
      adicionarLinha(abas.profissionais, registro); abas.profissionais.ids.add(String(registro.idFuncionario)); unidades.add(String(registro.idUnidade));
    }
  }
  const idsUnidades = [...unidades].filter((id) => !abas.filiais.ids.has(id));
  if (idsUnidades.length) {
    const registros = await bancoDeDados.query(`SELECT id_unidade AS idUnidade, nm_unidade AS filial, st_ativo AS ativo
      FROM tb_unidade WHERE fk_salao = :idSalao AND id_unidade IN (:ids) ORDER BY id_unidade`, {
      replacements: { idSalao: consulta.filtros.idSalao, ids: idsUnidades }, type: QueryTypes.SELECT, transaction,
    });
    for (const registro of registros) { adicionarLinha(abas.filiais, registro); abas.filiais.ids.add(String(registro.idUnidade)); }
  }
}

export async function exportarAnaliticoExcel(consulta, resposta) {
  const diretorio = await mkdtemp(join(tmpdir(), 'agendeaki-bi-'));
  const caminho = join(diretorio, 'analitico.xlsx');
  const arquivo = createWriteStream(caminho);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: arquivo, useStyles: true, useSharedStrings: false });
  const fimArquivo = finished(arquivo);
  // O handler é instalado antes das consultas, inclusive quando o disco falha cedo.
  fimArquivo.catch(() => {});
  let falhaArquivo;
  arquivo.on('error', (erro) => { falhaArquivo = erro; });
  workbook.zip.on('error', (erro) => arquivo.destroy(erro));
  try {
    const abas = {
      analitico: criarAba(workbook, 'Analítico', colunasExportacao.map(([nome, campo]) => [nome, campo, ['valor_item', 'preco_normal', 'preco_vigente', 'desconto_promocional', 'desconto_adicional', 'acrescimo'].includes(nome) ? 'valor' : undefined])),
      filiais: criarAba(workbook, 'Unidades', [['id_unidade', 'idUnidade'], ['unidade', 'filial'], ['ativo', 'ativo']]),
      servicos: criarAba(workbook, 'Serviços', [['id_servico', 'idServico'], ['id_unidade', 'idUnidade'], ['servico', 'servico'], ['valor_referencia', 'valorReferencia', 'valor'], ['duracao_minutos', 'duracaoMinutos'], ['ativo', 'ativo']]),
      profissionais: criarAba(workbook, 'Profissionais', [['id_funcionario', 'idFuncionario'], ['id_unidade', 'idUnidade'], ['profissional', 'profissional'], ['ativo', 'ativo']]),
    };
    await bancoDeDados.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
      let offset = 0;
      while (true) {
        if (resposta.destroyed) throw new Error('Exportação interrompida.');
        if (falhaArquivo) throw falhaArquivo;
        const lote = await consultarLinhasAnaliticas(consulta, { limite: 500, offset, transaction });
        if (!lote.length) break;
        const linhas = await prepararLinhasExportacao(consulta, lote, transaction);
        for (const linha of linhas) adicionarLinha(abas.analitico, linha);
        await adicionarCadastros(consulta, lote, linhas, abas, transaction);
        if (lote.length < 500) break;
        offset += lote.length;
      }
    });
    for (const aba of Object.values(abas)) {
      aba.sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: aba.linhas, column: aba.colunas.length } };
      aba.sheet.commit();
    }
    await workbook.commit();
    await fimArquivo;
    if (resposta.destroyed) throw new Error('Exportação interrompida.');
    resposta.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    resposta.setHeader('Content-Disposition', `attachment; filename="analitico-bi-${consulta.filtros.dataInicio}-${consulta.filtros.dataFim}.xlsx"`);
    await pipeline(createReadStream(caminho), resposta);
  } finally {
    workbook.zip.abort();
    arquivo.destroy();
    await fimArquivo.catch(() => {});
    await rm(diretorio, { recursive: true, force: true });
  }
}
