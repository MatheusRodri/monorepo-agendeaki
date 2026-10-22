import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const paginas = [
  '/',
  '/cliente',
  '/cliente/cadastro',
  '/cliente/recuperar-senha',
  '/cliente/redefinir-senha',
  '/cliente/inicio',
  '/cliente/agendamento',
  '/cliente/agendamentos',
  '/cliente/agendamentos/futuros',
  '/cliente/agendamentos/historico',
  '/cliente/configuracoes',
  '/cliente/notificacoes',
  '/cliente/saloes/1',
  '/salao',
  '/salao/cadastro',
  '/salao/recuperar-senha',
  '/salao/redefinir-senha',
  '/salao/dashboard',
  '/salao/agendamentos',
  '/salao/avaliacoes',
  '/salao/clientes',
  '/salao/configuracoes',
  '/salao/disponibilidade',
  '/salao/filiais',
  '/salao/funcionarios',
  '/salao/meu-salao',
  '/salao/notificacoes',
  '/salao/servicos',
  '/salao/assinatura',
  '/admin',
  '/offline',
  '/hair-plus/senac',
];

async function abrirPagina(page, caminho) {
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  await page.goto(caminho, { waitUntil: 'load' });
  await expect(page.locator('.acessibilidade-global')).toHaveAttribute('data-carregado', 'true');
}

for (const caminho of paginas) {
  test(`verifica critérios WCAG na rota ${caminho}`, async ({ page }) => {
    await abrirPagina(page, caminho);
    await expect(page.locator('main')).toBeAttached();

    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(resultado.violations, JSON.stringify(resultado.violations.map(({ id, impact, description, nodes }) => ({
      id, impact, description, seletores: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })), null, 2)).toEqual([]);
  });
}

test('rotas principais mantêm acessibilidade em viewport móvel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const caminho of ['/', '/cliente/cadastro', '/salao/cadastro', '/admin']) {
    await abrirPagina(page, caminho);
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(resultado.violations, `${caminho}: ${JSON.stringify(resultado.violations.map(({ id, nodes }) => ({ id, seletores: nodes.map(({ target }) => target) })))}`).toEqual([]);
  }
});

test('atalho de teclado leva ao conteúdo principal', async ({ page }) => {
  await abrirPagina(page, '/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conteudo-principal')).toBeFocused();
});

test('preferências de acessibilidade funcionam e persistem entre visitas', async ({ page }) => {
  await abrirPagina(page, '/');
  await page.getByRole('button', { name: 'Acessibilidade' }).click();
  await expect(page.getByRole('button', { name: 'Acessibilidade' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /Aumentar/ }).click();
  await page.getByRole('button', { name: /Alto contraste/ }).click();
  await page.getByRole('button', { name: /Reduzir movimento/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tamanho-fonte', '125');
  await expect(page.locator('html')).toHaveAttribute('data-alto-contraste', 'ativo');
  await expect(page.locator('html')).toHaveAttribute('data-reducao-movimento', 'ativa');

  await page.reload();
  await expect(page.locator('.acessibilidade-global')).toHaveAttribute('data-carregado', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-alto-contraste', 'ativo');
  await expect(page.locator('html')).toHaveAttribute('data-reducao-movimento', 'ativa');
});
