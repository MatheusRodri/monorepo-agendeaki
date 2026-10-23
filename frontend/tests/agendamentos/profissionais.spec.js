import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const filiais = [{ idUnidade: 1, nome: 'Centro' }, { idUnidade: 2, nome: 'Jardins' }, { idUnidade: 3, nome: 'Nova filial' }];
const servicos = [
  { idServico: 1, idUnidade: 1, nome: 'Barba', duracaoMinutos: 30, valor: 35 },
  { idServico: 2, idUnidade: 1, nome: 'Corte Masculino', duracaoMinutos: 45, valor: 60 },
  { idServico: 3, idUnidade: 2, nome: 'Coloração', duracaoMinutos: 90, valor: 180 },
];

async function preparar(page, { aoSalvar, tema = 'claro' } = {}) {
  await page.addInitScript((tema) => {
    localStorage.setItem('tokenAcessoSalao', 'teste');
    localStorage.setItem('tema-agendeaki', tema);
    document.documentElement.dataset.tema = tema;
  }, tema);
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  await page.route('**/api/salao/**', async (route) => {
    const caminho = new URL(route.request().url()).pathname;
    const responder = (dados, status = 200) => route.fulfill({ status, json: dados });
    if (['PATCH', 'POST'].includes(route.request().method()) && caminho.includes('/funcionarios')) return aoSalvar?.(route, responder) ?? responder({ mensagem: 'Profissional salvo com sucesso.' });
    if (caminho.endsWith('/funcionarios')) return responder({ funcionarios: [{ idFuncionario: 7, nome: 'Ana', idUnidade: 1, filial: 'Centro', idsServicos: [1], servicos: 'Barba' }] });
    if (caminho.endsWith('/filiais')) return responder({ filiais });
    if (caminho.endsWith('/servicos')) return responder({ servicos });
    if (caminho.endsWith('/notificacoes')) return responder({ notificacoes: [], naoLidas: 0 });
    if (caminho.endsWith('/assinatura')) return responder({ assinatura: { temAcessoPremium: false } });
    return responder({});
  });
  await page.goto('/salao/funcionarios');
}

async function avancarAteServicos(page, { editando = false, filial = '1' } = {}) {
  if (editando) await page.locator('.cartao-gestao').filter({ hasText: 'Ana' }).getByRole('button', { name: 'Editar', exact: true }).click();
  else await page.getByRole('textbox', { name: 'Nome do profissional' }).fill('Bruno');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption(filial);
  await page.getByRole('button', { name: 'Continuar →' }).click();
}

test('cadastra por etapas e seleciona vários serviços sem atalhos de teclado especiais', async ({ page }) => {
  let enviado;
  await preparar(page, { aoSalvar: (route, responder) => { enviado = route.request().postDataJSON(); return responder({ mensagem: 'Profissional salvo.' }, 201); } });
  await expect(page.getByRole('button', { name: 'Continuar →' })).toBeDisabled();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Nome do profissional' }).fill('Bruno');
  await page.getByRole('textbox', { name: 'Nome do profissional' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Em qual filial vai atender?' })).toBeFocused();
  expect(enviado).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Continuar →' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await expect(page.getByRole('button', { name: 'Adicionar profissional' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Barba/ }).check();
  await page.getByRole('checkbox', { name: /^Corte Masculino/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').filter({ hasText: '2 serviços selecionados' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Coloração/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Adicionar profissional' }).click();
  await expect.poll(() => enviado).toEqual({ nome: 'Bruno', idUnidade: '1', idsServicos: [1, 2] });
});

test('edita somente serviços, preserva seleção ao voltar e permite tentar novamente após erro', async ({ page }) => {
  const envios = [];
  await preparar(page, { aoSalvar: (route, responder) => {
    expect(route.request().method()).toBe('PATCH');
    expect(new URL(route.request().url()).pathname).toBe('/api/salao/funcionarios/7');
    envios.push(route.request().postDataJSON());
    return responder({ mensagem: envios.length === 1 ? 'Tente novamente.' : 'Profissional atualizado com sucesso.' }, envios.length === 1 ? 400 : 200);
  } });
  await avancarAteServicos(page, { editando: true });
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /^Corte Masculino/ }).check();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await expect(page.getByRole('checkbox', { name: /^Corte Masculino/ })).toBeChecked();
  await page.getByRole('button', { name: 'Salvar profissional' }).click();
  await expect(page.getByText('Tente novamente.', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).toBeChecked();
  await page.getByRole('button', { name: 'Salvar profissional' }).click();
  await expect.poll(() => envios.length).toBe(2);
  expect(envios).toEqual(Array(2).fill({ nome: 'Ana', idUnidade: '1', idsServicos: [1, 2] }));
});

test('trocar filial limpa os serviços anteriores e orienta quando o catálogo está vazio', async ({ page }) => {
  await preparar(page);
  await avancarAteServicos(page, { editando: true });
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await expect(page.getByRole('checkbox', { name: /Coloração/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Barba/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar profissional' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Coloração/ }).check();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filial', exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await expect(page.getByRole('link', { name: 'Cadastrar serviços' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar profissional' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancelar edição' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do profissional' })).toHaveValue('');
});

for (const tema of ['claro', 'escuro']) test(`serviços acessíveis no celular em tema ${tema}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, { tema });
  await avancarAteServicos(page, { editando: true });
  // Garante o tema mesmo se a preferência for aplicada após a hidratação.
  await page.evaluate((tema) => { document.documentElement.dataset.tema = tema; }, tema);
  const resultado = await new AxeBuilder({ page }).include('.formulario-profissional').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(resultado.violations.map(({ id, nodes }) => ({ id, alvos: nodes.map(({ target }) => target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`profissional-${tema}.png`), fullPage: true });
});
