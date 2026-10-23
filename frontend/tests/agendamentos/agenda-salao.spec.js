import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function preparar(page, { quantidadeFuturos = 28, falharPrimeira = false, atraso } = {}) {
  const consultas = [];
  const registros = [
    ...Array.from({ length: quantidadeFuturos }, (_, indice) => ({
      idAgendamento: indice + 1, grupo: 'futuros', dia: indice < 14 ? 'hoje' : indice < 20 ? 'amanha' : indice < 24 ? 'semana' : 'depois',
      cliente: `Cliente próximo ${indice + 1}`, status: 'AGENDADO', dataHoraInicio: '2026-10-23T15:00:00-03:00',
    })),
    ...Array.from({ length: 16 }, (_, indice) => ({
      idAgendamento: 100 + indice, grupo: 'historico', dia: 'passado', cliente: `Cliente histórico ${indice + 1}`,
      status: 'REALIZADO', dataHoraInicio: '2020-01-01T09:00:00-03:00',
    })),
  ].map((item) => ({ ...item, idUnidade: 1, idFuncionario: 1, servico: 'Corte', valor: 50, funcionario: 'Ana', filial: 'Centro', servicosAdicionais: [] }));
  await page.addInitScript(() => localStorage.setItem('tokenAcessoSalao', 'teste'));
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  let falhou = false;
  await page.route('**/api/salao/**', async (route) => {
    const url = new URL(route.request().url());
    const responder = (dados, status = 200) => route.fulfill({ status, json: dados });
    if (url.pathname.endsWith('/assinatura')) return responder({ assinatura: { temAcessoPremium: false } });
    if (url.pathname.endsWith('/notificacoes')) return responder({ notificacoes: [], naoLidas: 0 });
    if (url.pathname.endsWith('/clientes')) return responder({ clientes: [] });
    if (url.pathname.endsWith('/filiais')) return responder({ filiais: [{ idUnidade: 1, nome: 'Centro' }] });
    if (url.pathname.endsWith('/servicos')) return responder({ servicos: [{ idServico: 1, idUnidade: 1, nome: 'Corte', valor: 50 }] });
    if (url.pathname.endsWith('/funcionarios')) return responder({ funcionarios: [{ idFuncionario: 1, idUnidade: 1, nome: 'Ana', idsServicos: [1] }] });
    if (url.pathname.endsWith('/confirmar-atendimento')) {
      const item = registros.find((item) => item.idAgendamento === Number(url.pathname.split('/').at(-2)));
      item.grupo = 'historico'; item.status = 'REALIZADO';
      return responder({ mensagem: 'Atendimento confirmado.' });
    }
    if (url.pathname.endsWith('/agendamentos')) {
      const query = Object.fromEntries(url.searchParams); consultas.push(query);
      if (falharPrimeira && !falhou) { falhou = true; return responder({ mensagem: 'Falha temporária na agenda.' }, 500); }
      if (atraso) await atraso(query);
      let lista = registros.filter((item) => item.grupo === query.tipo);
      if (query.periodo !== 'todos') lista = lista.filter((item) => query.periodo === '7dias' ? ['hoje', 'amanha', 'semana'].includes(item.dia) : item.dia === query.periodo);
      const porPagina = Number(query.porPagina), total = lista.length, totalPaginas = Math.max(1, Math.ceil(total / porPagina));
      const pagina = Math.min(Number(query.pagina), totalPaginas);
      return responder({ agendamentos: lista.slice((pagina - 1) * porPagina, pagina * porPagina), pagina, porPagina, total, totalPaginas, tipo: query.tipo, periodo: query.periodo });
    }
    return responder({});
  });
  await page.goto('/salao/agendamentos');
  await expect(page.getByRole('heading', { name: 'Atendimentos do salão.' })).toBeVisible();
  return { consultas };
}

const paginacao = (page) => page.getByRole('navigation', { name: 'Paginação da agenda' });

test('filtra hoje, amanhã e sete dias e preserva a página de cada lista ao alternar', async ({ page }) => {
  const { consultas } = await preparar(page);
  await expect(paginacao(page)).toContainText('1–10 de 28 agendamentos · Página 1 de 3');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–20 de 28');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(paginacao(page)).toContainText('1–10 de 16');
  await expect(page.getByRole('group', { name: 'Período dos agendamentos' })).toHaveCount(0);
  expect(consultas.at(-1)).toMatchObject({ tipo: 'historico', periodo: 'todos' });
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–16 de 16');
  await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–20 de 28');
  for (const [rotulo, periodo, total] of [['Hoje', 'hoje', 14], ['Amanhã', 'amanha', 6], ['Próximos 7 dias', '7dias', 24]]) {
    const botao = page.getByRole('button', { name: rotulo, exact: true });
    await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
    await expect(paginacao(page)).toContainText(`1–${Math.min(total, 10)} de ${total}`);
    await expect.poll(() => consultas.at(-1)?.pagina).toBe('1');
    expect(consultas.at(-1).periodo).toBe(periodo);
  }
  await page.getByRole('combobox', { name: 'Agendamentos por página' }).selectOption('25');
  await expect(paginacao(page)).toContainText('1–24 de 24');
  await expect(page.getByRole('button', { name: 'Próxima', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–16 de 16');
  await expect(page.getByRole('combobox', { name: 'Agendamentos por página' })).toHaveValue('10');
  await expect(page.getByRole('button', { name: 'Amanhã', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Próximos 7 dias', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(paginacao(page)).toContainText('1–24 de 24');
});

test('permite repetir falhas e ignora a resposta de um filtro anterior', async ({ page }) => {
  const { consultas } = await preparar(page, { falharPrimeira: true, atraso: async (query) => {
    if (query.periodo === 'hoje') await new Promise((resolve) => setTimeout(resolve, 300));
  } });
  await expect(page.getByRole('alert')).toContainText('Falha temporária na agenda.');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(paginacao(page)).toContainText('de 28 agendamentos');
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect.poll(() => consultas.at(-1)?.periodo).toBe('hoje');
  await expect(page.getByRole('group', { name: 'Período dos agendamentos' })).toBeVisible();
  await page.getByRole('button', { name: 'Amanhã', exact: true }).click();
  await expect(paginacao(page)).toContainText('de 6 agendamentos');
  await page.waitForTimeout(400);
  await expect(paginacao(page)).toContainText('de 6 agendamentos');
});

test('concluir o último item da última página atualiza a lista sem perder o filtro', async ({ page }) => {
  const { consultas } = await preparar(page, { quantidadeFuturos: 11 });
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(paginacao(page)).toContainText('de 11 agendamentos');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–11 de 11');
  await page.getByRole('button', { name: 'Realizado', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar como realizado', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(paginacao(page)).toContainText('1–10 de 10 agendamentos · Página 1 de 1');
  await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(consultas.at(-1)).toMatchObject({ tipo: 'futuros', periodo: 'hoje', pagina: '2' });
});

test('filtros e paginação funcionam pelo teclado e cabem no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page);
  const hoje = page.getByRole('button', { name: 'Hoje', exact: true });
  await hoje.focus(); await page.keyboard.press('Space');
  await expect(hoje).toHaveAttribute('aria-pressed', 'true');
  await expect(paginacao(page)).toContainText('de 14 agendamentos');
  const proxima = page.getByRole('button', { name: 'Próxima', exact: true });
  await proxima.focus(); await page.keyboard.press('Enter');
  await expect(paginacao(page)).toContainText('11–14 de 14');
  await expect(proxima).toBeDisabled();
  const resultado = await new AxeBuilder({ page }).include('.conteudo-salao').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(resultado.violations.map(({ id, nodes }) => ({ id, alvos: nodes.map(({ target }) => target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
