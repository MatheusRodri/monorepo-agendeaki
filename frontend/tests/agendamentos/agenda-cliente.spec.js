import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function preparar(page, { quantidadeFuturos = 25, falharPrimeira = false, atraso } = {}) {
  const consultas = [], notificacoes = [], avaliacoes = [];
  const registros = [
    ...Array.from({ length: quantidadeFuturos }, (_, indice) => ({
      idAgendamento: indice + 1, grupo: 'futuros', status: 'AGENDADO',
      dataHoraInicio: '2026-12-25T09:00:00-03:00',
    })),
    ...Array.from({ length: 23 }, (_, indice) => ({
      idAgendamento: 101 + indice, grupo: 'historico', status: 'REALIZADO',
      dataHoraInicio: '2020-01-01T09:00:00-03:00', podeAvaliar: true,
    })),
  ].map((item) => ({ ...item, idUnidade: 1, idServico: 1, idFuncionario: 1, servico: 'Corte', valor: 50,
    valorTotal: 50, salao: 'Salão teste', unidade: 'Centro', municipio: 'São Paulo', profissional: 'Ana', servicosAdicionais: [] }));
  await page.addInitScript(() => localStorage.setItem('tokenAcessoCliente', 'teste'));
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  let falhou = false;
  await page.route('**/api/clientes/**', async (route) => {
    const url = new URL(route.request().url());
    const responder = (dados, status = 200) => route.fulfill({ status, json: dados });
    if (url.pathname.endsWith('/perfil')) return responder({ perfil: { nome: 'Ana Cliente' } });
    if (url.pathname.endsWith('/notificacoes')) return responder({ notificacoes: [], naoLidas: 0 });
    if (url.pathname.includes('/notificacoes/agendamentos/') && url.pathname.endsWith('/lida')) {
      notificacoes.push(url.pathname); return responder({ mensagem: 'Notificação lida.' });
    }
    if (url.pathname.endsWith('/cancelar')) {
      const item = registros.find((registro) => registro.idAgendamento === Number(url.pathname.split('/').at(-2)));
      item.grupo = 'historico'; item.status = 'CANCELADO'; item.motivoCancelamento = 'Solicitação do cliente';
      return responder({ mensagem: 'Agendamento cancelado.' });
    }
    if (url.pathname.endsWith('/avaliacao')) {
      const item = registros.find((registro) => registro.idAgendamento === Number(url.pathname.split('/').at(-2)));
      avaliacoes.push(route.request().postDataJSON());
      item.idAvaliacao = 1; return responder({ mensagem: 'Avaliação publicada.' });
    }
    if (url.pathname.endsWith('/futuros') || url.pathname.endsWith('/historico')) {
      const tipo = url.pathname.split('/').at(-1);
      const query = Object.fromEntries(url.searchParams); consultas.push({ tipo, ...query });
      if (falharPrimeira && !falhou) { falhou = true; return responder({ mensagem: 'Falha temporária nos agendamentos.' }, 500); }
      if (atraso) await atraso({ tipo, ...query });
      const lista = registros.filter((item) => item.grupo === tipo).sort((a, b) => {
        const ordem = new Date(a.dataHoraInicio) - new Date(b.dataHoraInicio) || a.idAgendamento - b.idAgendamento;
        return tipo === 'futuros' ? ordem : -ordem;
      });
      const porPagina = Number(query.porPagina), total = lista.length, totalPaginas = Math.max(1, Math.ceil(total / porPagina));
      const indice = lista.findIndex((item) => String(item.idAgendamento) === query.localizar);
      const localizado = indice >= 0;
      const pagina = localizado ? Math.floor(indice / porPagina) + 1 : Math.min(Number(query.pagina), totalPaginas);
      return responder({ agendamentos: lista.slice((pagina - 1) * porPagina, pagina * porPagina),
        pagina, porPagina, total, totalPaginas, localizado });
    }
    return responder({});
  });
  return { consultas, notificacoes, avaliacoes };
}

const paginacao = (page) => page.getByRole('navigation', { name: 'Paginação dos agendamentos' });

test('pagina Próximos e Histórico, preserva os controles de cada lista e altera o tamanho', async ({ page }) => {
  const { consultas } = await preparar(page);
  await page.goto('/cliente/agendamentos');
  await expect(paginacao(page)).toContainText('1–10 de 25 agendamentos · Página 1 de 3');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–20 de 25');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(paginacao(page)).toContainText('1–10 de 23');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–20 de 23');
  await page.getByRole('button', { name: 'Próximos horários', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–20 de 25');
  await page.getByRole('combobox', { name: 'Agendamentos por página' }).selectOption('25');
  await expect(paginacao(page)).toContainText('1–25 de 25 agendamentos · Página 1 de 1');
  await expect(page.getByRole('button', { name: 'Próxima', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–20 de 23');
  await expect(page.getByRole('combobox', { name: 'Agendamentos por página' })).toHaveValue('10');
  expect(consultas.at(-1)).toMatchObject({ tipo: 'historico', pagina: '2', porPagina: '10' });
});

test('notificação de avaliação abre o atendimento na terceira página do Histórico', async ({ page }) => {
  const { consultas, notificacoes, avaliacoes } = await preparar(page);
  await page.goto('/cliente/agendamentos?avaliar=102');
  await expect(page.getByRole('heading', { name: 'Avaliar atendimento' })).toBeVisible();
  await expect(paginacao(page)).toContainText('21–23 de 23 agendamentos · Página 3 de 3');
  expect(consultas.some((consulta) => consulta.tipo === 'historico' && consulta.localizar === '102')).toBe(true);
  await expect.poll(() => notificacoes.length).toBe(1);
  const filial = page.getByRole('group', { name: 'Nota da filial' });
  const servico = page.getByRole('group', { name: 'Nota do serviço' });
  await expect(filial.getByRole('radio', { name: '5 estrelas' })).toBeChecked();
  await filial.getByRole('radio', { name: '2 estrelas' }).check();
  await expect(filial.getByText('2 de 5 estrelas')).toBeVisible();
  await servico.getByRole('radio', { name: '5 estrelas' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(servico.getByRole('radio', { name: '4 estrelas' })).toBeChecked();
  await page.getByRole('button', { name: 'Publicar avaliação' }).click();
  expect(avaliacoes.at(-1)).toMatchObject({ idAgendamento: 102, notaSalao: 2, notaServico: 4 });
  await expect(page.getByRole('heading', { name: 'Avaliar atendimento' })).toHaveCount(0);
  await expect(page.getByText('Avaliado ✓')).toBeVisible();
  await expect(paginacao(page)).toContainText('Página 3 de 3');
});

test('cancelamento atualiza o Histórico e localiza o agendamento cancelado', async ({ page }) => {
  const { consultas } = await preparar(page, { quantidadeFuturos: 11 });
  await page.goto('/cliente/agendamentos');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(paginacao(page)).toContainText('11–11 de 11');
  page.once('dialog', (dialogo) => dialogo.accept());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Histórico', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Motivo do cancelamento:')).toBeVisible();
  await expect(paginacao(page)).toContainText('1–10 de 24');
  expect(consultas.some((consulta) => consulta.tipo === 'historico' && consulta.localizar === '11')).toBe(true);
  await page.getByRole('button', { name: 'Próximos horários', exact: true }).click();
  await expect(paginacao(page)).toContainText('1–10 de 10 agendamentos · Página 1 de 1');
});

test('erro pode ser repetido e resposta antiga não substitui a página atual', async ({ page }) => {
  await preparar(page, { falharPrimeira: true, atraso: async (query) => {
    if (query.pagina === '2') await new Promise((resolve) => setTimeout(resolve, 300));
  } });
  await page.goto('/cliente/agendamentos');
  await expect(page.getByRole('alert')).toContainText('Falha temporária nos agendamentos.');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(paginacao(page)).toContainText('de 25 agendamentos');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(paginacao(page)).toContainText('de 23 agendamentos');
  await page.waitForTimeout(400);
  await expect(paginacao(page)).toContainText('de 23 agendamentos');
});

test('paginação funciona no teclado e cabe na tela do celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page);
  await page.goto('/cliente/agendamentos');
  const proxima = page.getByRole('button', { name: 'Próxima', exact: true });
  await expect(proxima).toBeEnabled();
  await proxima.focus(); await page.keyboard.press('Enter');
  await expect(paginacao(page)).toContainText('11–20 de 25');
  const resultado = await new AxeBuilder({ page }).include('.conteudo-agendamentos').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(resultado.violations.map(({ id, nodes }) => ({ id, alvos: nodes.map(({ target }) => target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
