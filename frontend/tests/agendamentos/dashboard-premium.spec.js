import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const arquivoExcel = join(__dirname, '../fixtures/analitico-bi.xlsx');

const registros = Array.from({ length: 60 }, (_, indice) => ({
  idAgendamento: indice + 1, cliente: `Cliente ${String(indice + 1).padStart(2, '0')}`, email: `cliente${indice + 1}@teste.local`, telefone: '11999999999',
  servico: 'Corte + Escova', profissional: 'Ana, Bia', unidade: 'Centro', status: indice % 3 ? 'REALIZADO' : 'CANCELADO',
  dataInicio: '2026-10-10T09:00:00-03:00', dataRealizacao: indice % 3 ? '2026-10-20T11:00:00-03:00' : null,
  valor: indice + 50, statusPagamento: 'APROVADO', quantidadeServicosExtras: indice % 3 && indice % 4 === 1 ? 2 : 0,
}));

async function preparar(page, { tema = 'claro', falharPrimeira = false, atraso } = {}) {
  const consultas = [], exportacoes = [], pdfs = [];
  await page.addInitScript((tema) => {
    localStorage.setItem('tokenAcessoSalao', 'teste'); localStorage.setItem('tema-agendeaki', tema);
    window.print = () => { window.__pdf = document.querySelector('.dashboard-premium__impressao')?.textContent; window.dispatchEvent(new Event('afterprint')); };
  }, tema);
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  let falhou = false;
  await page.route('**/api/salao/**', async (route) => {
    const url = new URL(route.request().url());
    const responder = (dados, status = 200) => route.fulfill({ status, json: dados });
    if (url.pathname.endsWith('/assinatura')) return responder({ assinatura: { temAcessoPremium: true } });
    if (url.pathname.endsWith('/notificacoes')) return responder({ notificacoes: [], naoLidas: 0 });
    if (url.pathname.endsWith('/analitico/exportar')) {
      exportacoes.push(Object.fromEntries(url.searchParams));
      return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: await readFile(arquivoExcel) });
    }
    if (url.pathname.endsWith('/analitico')) {
      const query = Object.fromEntries(url.searchParams); consultas.push(query);
      if (falharPrimeira && !falhou) { falhou = true; return responder({ mensagem: 'Falha temporária no analítico.' }, 500); }
      if (atraso) await atraso(query);
      let lista = [...registros];
      if (query.recorte === 'comparecimento') lista = lista.filter((item) => ['REALIZADO', 'NAO_COMPARECEU'].includes(item.status));
      if (query.recorte === 'realizados') lista = lista.filter((item) => item.status === 'REALIZADO');
      if (query.recorte === 'extras') lista = lista.filter((item) => item.quantidadeServicosExtras > 0).map((item) => ({ ...item, servico: 'Escova', valor: 35.5 }));
      if (query.recorte === 'cancelados') lista = lista.filter((item) => item.status === 'CANCELADO');
      if (query.recorte === 'naoCompareceu' || query.recorte === 'previstos') lista = [];
      if (query.idUnidade === '2') lista = [];
      const totalAtendimentos = lista.length;
      const totalServicosExtras = lista.reduce((total, item) => total + item.quantidadeServicosExtras, 0);
      if (query.visualizarPor === 'servico') lista = lista.flatMap((item) => [
        ...(query.recorte === 'extras' ? [] : [{ ...item, idLinha: `ORIGINAL:${item.idAgendamento}`, tipoItem: 'ORIGINAL', servico: 'Corte', profissional: 'Ana', valor: 50 }]),
        ...Array.from({ length: item.quantidadeServicosExtras }, (_, indice) => ({ ...item, idLinha: `EXTRA:${item.idAgendamento * 10 + indice}`, tipoItem: 'EXTRA', idExtra: item.idAgendamento * 10 + indice, servico: 'Escova', profissional: 'Bia', valor: indice ? 0 : 35.5 })),
      ]);
      const campo = query.ordenarPor || 'dataInicio', sinal = query.direcao === 'asc' ? 1 : -1;
      lista.sort((a, b) => (a[campo] > b[campo] ? 1 : a[campo] < b[campo] ? -1 : b.idAgendamento - a.idAgendamento) * sinal);
      const pagina = Number(query.pagina || 1), porPagina = Number(query.porPagina || 25);
      return responder({ agendamentos: lista.slice((pagina - 1) * porPagina, pagina * porPagina), pagina, porPagina, total: lista.length, totalAtendimentos, totalServicosExtras, totalPaginas: Math.max(1, Math.ceil(lista.length / porPagina)) });
    }
    if (url.pathname.endsWith('/indicadores/premium')) {
      if (url.searchParams.get('incluirAnalise') === 'true') pdfs.push(Object.fromEntries(url.searchParams));
      const filtros = { dataInicio: url.searchParams.get('dataInicio') || '2026-10-01', dataFim: url.searchParams.get('dataFim') || '2026-10-23', idUnidade: url.searchParams.get('idUnidade') || '', idServico: '', idFuncionario: '' };
      return responder({ filtros, resumo: { receitaRealizada: 3000, receitaPrevista: 150, atendimentosRealizados: 40, quantidadeAgendamentosRealizados: 40, quantidadeServicosExtras: 20, quantidadeServicosRealizados: 60, receitaServicosExtras: 355, taxaComparecimento: filtros.idUnidade === '2' ? null : 100, quantidadeAgendamentosTotal: 60, quantidadeAgendamentosCancelados: 20, quantidadeAgendamentosElegiveis: 60, quantidadeNaoCompareceu: 0 }, comparacaoAnterior: { quantidadeServicosExtras: 10, quantidadeServicosRealizados: 30, receitaServicosExtras: 177.5, taxaComparecimento: 80 }, periodoComparacao: {}, insights: [{ titulo: 'Mais movimento', descricao: 'Teste', tipo: 'info' }], opcoesFiltros: { filiais: [{ idUnidade: 1, nome: 'Centro' }, { idUnidade: 2, nome: 'Jardins' }], servicos: [], funcionarios: [] }, analiseAgendamentos: url.searchParams.get('incluirAnalise') === 'true' ? registros : [] });
    }
    return responder({});
  });
  await page.goto('/salao/dashboard');
  await expect(page.getByRole('tab', { name: 'Geral', exact: true })).toBeVisible();
  return { consultas, exportacoes, pdfs };
}

test('abas separam a visão rápida dos gráficos e indicadores abrem os recortes corretos', async ({ page }) => {
  const { consultas } = await preparar(page);
  await expect(page.getByRole('heading', { name: 'Evolução da receita' })).toHaveCount(0);
  expect(consultas.length).toBe(0);
  await page.getByRole('tab', { name: 'Detalhado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evolução da receita' })).toBeVisible();
  for (const [titulo, recorte] of [['Receita realizada', 'realizados'], ['Receita prevista', 'previstos'], ['Ticket médio realizado', 'realizados'], ['Agendamentos no período', 'agendamentos'], ['Taxa de cancelamento', 'cancelados'], ['Atendimentos realizados', 'realizados'], ['Total de serviços realizados', 'realizados'], ['Receita com serviços extras', 'extras'], ['Taxa de comparecimento', 'comparecimento'], ['Serviços extras realizados', 'extras'], ['Agendamentos cancelados', 'cancelados'], ['Não compareceram', 'naoCompareceu']]) {
    await page.getByRole('tab', { name: 'Geral', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^${titulo}:|^${titulo} ·`) }).click();
    await expect(page.getByRole('tab', { name: 'Analítico', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('combobox', { name: 'Recorte', exact: true })).toHaveValue(recorte);
    await expect.poll(() => consultas.at(-1)?.recorte).toBe(recorte);
    await expect(page.getByRole('heading', { name: 'Análise de agendamentos' })).toBeFocused();
  }
});

test('indicador de extras mostra quantidade, comparação e atendimentos sem duplicar', async ({ page }) => {
  await preparar(page);
  const indicador = page.getByRole('button', { name: /^Serviços extras realizados: 20/ });
  await expect(indicador).toContainText('+100,0%');
  await indicador.click();
  await expect(page.getByText('20 serviços extras em 10 atendimentos.', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Extras', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–10 de 10 registros');
});

test('novos indicadores mostram serviços, receita de extras e comparecimento com atalhos e filtros', async ({ page }) => {
  const { consultas } = await preparar(page);
  await expect(page.locator('.dashboard-premium__indicadores > button')).toHaveCount(12);
  const grupos = page.locator('.dashboard-premium__grupo');
  await expect(grupos.locator('h2')).toHaveText(['Financeiro', 'Atendimentos e serviços', 'Cancelamentos e comparecimento']);
  for (const [indice, titulos] of [
    ['Receita realizada', 'Receita prevista · próximos 30 dias', 'Receita com serviços extras', 'Ticket médio realizado'],
    ['Agendamentos no período', 'Atendimentos realizados', 'Total de serviços realizados', 'Serviços extras realizados'],
    ['Taxa de cancelamento', 'Agendamentos cancelados', 'Taxa de comparecimento', 'Não compareceram'],
  ].entries()) await expect(grupos.nth(indice).locator('.indicador > span:first-child')).toHaveText(titulos);
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption('1');
  for (const [titulo, valor, variacao, recorte, visualizacao, total] of [
    ['Total de serviços realizados', '60', '+100,0%', 'realizados', 'Serviço', 60],
    ['Receita com serviços extras', 'R$ 355,00', '+100,0%', 'extras', 'Serviço', 20],
    ['Taxa de comparecimento', '100,0%', '+20,0 p.p.', 'comparecimento', 'Atendimento', 40],
  ]) {
    await page.getByRole('tab', { name: 'Geral', exact: true }).click();
    const indicador = page.getByRole('button', { name: new RegExp(`^${titulo}:`) });
    await expect(indicador.locator('strong')).toHaveText(valor);
    await expect(indicador).toContainText(variacao);
    await indicador.click();
    await expect(page.getByRole('button', { name: visualizacao, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('combobox', { name: 'Recorte', exact: true })).toHaveValue(recorte);
    await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText(`de ${total} registros`);
    await expect.poll(() => consultas.at(-1)?.idUnidade).toBe('1');
  }
  await expect(page.getByText(/Taxa = realizados ÷/)).toBeVisible();
  await page.getByRole('tab', { name: 'Geral', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption('2');
  const semBase = page.getByRole('button', { name: /^Taxa de comparecimento:/ });
  await expect(semBase.locator('strong')).toHaveText('—');
  await expect(semBase).toContainText('Sem realizados ou ausências no período.');
  await expect(semBase.locator('.indicador__variacao')).toHaveCount(0);
});

test('pagina, ordena no cabeçalho e preserva controles ao alternar abas e atualizar filtros', async ({ page }) => {
  const { consultas } = await preparar(page);
  await page.getByRole('tab', { name: 'Analítico', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–25 de 60');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('Página 2 de 3');
  await page.getByRole('button', { name: 'Ordenar por Valor', exact: true }).click();
  await expect.poll(() => consultas.at(-1)?.direcao).toBe('asc');
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Valor', exact: true })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('Página 1 de 3');
  await page.getByRole('button', { name: 'Ordenar por Valor', exact: true }).click();
  await expect.poll(() => consultas.at(-1)?.direcao).toBe('desc');
  await page.getByRole('tab', { name: 'Detalhado', exact: true }).click();
  await page.getByRole('tab', { name: 'Analítico', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Valor', exact: true })).toHaveAttribute('aria-sort', 'descending');
  await page.getByRole('combobox', { name: 'Registros por página' }).selectOption('50');
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–50 de 60');
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption('2');
  await expect(page.getByRole('tab', { name: 'Analítico', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Nenhum agendamento encontrado para estes filtros.')).toBeVisible();
  await expect.poll(() => consultas.at(-1)?.idUnidade).toBe('2');
  await expect(page.getByRole('columnheader', { name: 'Realizado em' })).toHaveCount(0);
});

test('alterna atendimento e serviço, preserva filtros e pagina os serviços antes de exportar', async ({ page }) => {
  const { consultas, exportacoes } = await preparar(page);
  await page.getByRole('tab', { name: 'Analítico', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Atendimento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–25 de 60');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  const servico = page.getByRole('button', { name: 'Serviço', exact: true });
  await servico.focus(); await page.keyboard.press('Space');
  await expect(servico).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–25 de 80');
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Tipo', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Extras', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Recorte', exact: true }).selectOption('extras');
  await expect(page.getByText('20 serviços extras em 10 atendimentos.', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–20 de 20');
  await expect(page.locator('tbody .tipo-servico--extra')).toHaveCount(20);
  await page.getByRole('button', { name: 'Ordenar por Tipo', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Tipo', exact: true })).toHaveAttribute('aria-sort', 'ascending');
  const baixando = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar para Excel', exact: true }).click();
  await baixando;
  expect(exportacoes.at(-1)).toMatchObject({ visualizarPor: 'servico', recorte: 'extras', ordenarPor: 'tipoItem', direcao: 'asc' });
  await page.getByRole('tab', { name: 'Detalhado', exact: true }).click();
  await page.getByRole('tab', { name: 'Analítico', exact: true }).click();
  await expect(servico).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Atendimento', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Recorte', exact: true })).toHaveValue('extras');
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('1–10 de 10');
  await expect.poll(() => consultas.at(-1)?.ordenarPor).toBe('dataInicio');
});

test('Excel exporta todo o recorte e PDF mantém o relatório completo independente da aba', async ({ page }) => {
  const { exportacoes, pdfs } = await preparar(page);
  await page.getByRole('tab', { name: 'Analítico', exact: true }).click();
  await page.getByRole('combobox', { name: 'Recorte', exact: true }).selectOption('realizados');
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Realizado em' })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  const baixando = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar para Excel' }).click();
  const arquivo = await baixando;
  const conteudo = await readFile(await arquivo.path());
  expect(conteudo.equals(await readFile(arquivoExcel))).toBe(true);
  expect(arquivo.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(exportacoes.at(-1)).toMatchObject({ recorte: 'realizados', ordenarPor: 'dataInicio', direcao: 'desc', visualizarPor: 'atendimento', formato: 'xlsx' });
  expect(exportacoes.at(-1).pagina).toBeUndefined();
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__pdf || '')).toContain('Cliente 60');
  expect(await page.evaluate(() => window.__pdf)).toContain('Evolução da receita');
  for (const titulo of ['Total de serviços realizados', 'Receita com serviços extras', 'Taxa de comparecimento']) expect(await page.evaluate(() => window.__pdf)).toContain(titulo);
  expect(pdfs.at(-1).recorte).toBeUndefined(); expect(pdfs.at(-1).pagina).toBeUndefined();
  await expect(page.getByRole('tab', { name: 'Analítico', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('erro permite repetir e respostas antigas não sobrescrevem o novo recorte', async ({ page }) => {
  const { consultas } = await preparar(page, { falharPrimeira: true, atraso: async (query) => { if (query.recorte === 'realizados') await new Promise((resolve) => setTimeout(resolve, 300)); } });
  await page.getByRole('tab', { name: 'Analítico', exact: true }).click();
  await expect(page.getByText('Falha temporária no analítico.')).toBeVisible();
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('de 60 registros');
  await page.getByRole('combobox', { name: 'Recorte', exact: true }).selectOption('realizados');
  await expect.poll(() => consultas.at(-1)?.recorte).toBe('realizados');
  await page.getByRole('combobox', { name: 'Recorte', exact: true }).selectOption('cancelados');
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('de 20 registros');
  // Espera a resposta antiga chegar para verificar que foi ignorada.
  await page.waitForTimeout(400);
  await expect(page.getByRole('navigation', { name: 'Paginação do analítico' })).toContainText('de 20 registros');
});

for (const tema of ['claro', 'escuro']) test(`navegação acessível e tabela no celular em tema ${tema}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, { tema });
  const geral = page.getByRole('tab', { name: 'Geral', exact: true });
  await geral.focus(); await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Analítico', exact: true })).toBeFocused();
  await expect(page.getByRole('columnheader', { name: 'Ordenar por Realizado em' })).toBeVisible();
  const resultado = await new AxeBuilder({ page }).include('.dashboard-premium').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(resultado.violations.map(({ id, nodes }) => ({ id, alvos: nodes.map(({ target }) => target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`dashboard-${tema}.png`), fullPage: true });
});
