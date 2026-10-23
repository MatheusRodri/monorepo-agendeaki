import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const filiais = [{ idUnidade: 1, nome: 'Centro' }, { idUnidade: 2, nome: 'Jardins' }];
const servicoExistente = { idServico: 7, idUnidade: 1, filial: 'Centro', nome: 'Corte', descricao: 'Corte completo', valor: 50, duracaoMinutos: 45 };

async function preparar(page, { aoSalvar, tema = 'claro' } = {}) {
  await page.addInitScript((valor) => {
    localStorage.setItem('tokenAcessoSalao', 'teste');
    localStorage.setItem('tema-agendeaki', valor);
    document.documentElement.dataset.tema = valor;
  }, tema);
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  await page.route('**/api/salao/**', async (route) => {
    const caminho = new URL(route.request().url()).pathname;
    const responder = (dados, status = 200) => route.fulfill({ status, json: dados });
    if (['POST', 'PATCH'].includes(route.request().method()) && caminho.includes('/servicos')) return aoSalvar?.(route, responder) ?? responder({ mensagem: 'Serviço salvo.' });
    if (caminho.endsWith('/servicos')) return responder({ servicos: [servicoExistente] });
    if (caminho.endsWith('/filiais')) return responder({ filiais });
    if (caminho.endsWith('/funcionarios')) return responder({ funcionarios: [] });
    if (caminho.endsWith('/notificacoes')) return responder({ notificacoes: [], naoLidas: 0 });
    if (caminho.endsWith('/assinatura')) return responder({ assinatura: { temAcessoPremium: false } });
    return responder({});
  });
  await page.goto('/salao/servicos');
  await expect(page.getByRole('form', { name: 'Cadastrar serviço' })).toBeVisible();
}

test('cadastra serviço por etapas e preserva os campos ao voltar', async ({ page }) => {
  let enviado;
  await preparar(page, { aoSalvar: (route, responder) => { enviado = route.request().postDataJSON(); return responder({ mensagem: 'Serviço criado.' }, 201); } });
  const formulario = page.getByRole('form', { name: 'Cadastrar serviço' });
  await expect(formulario.getByRole('button', { name: 'Continuar →' })).toBeDisabled();
  await formulario.getByRole('textbox', { name: 'Nome do serviço' }).fill('Escova');
  await formulario.getByRole('textbox', { name: /Descrição/ }).fill('Escova e finalização');
  await formulario.getByRole('textbox', { name: 'Nome do serviço' }).press('Enter');
  await expect(formulario.getByRole('heading', { name: 'Em qual filial estará disponível?' })).toBeFocused();
  await formulario.getByRole('combobox', { name: 'Filial' }).selectOption('2');
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  await expect(formulario.getByRole('button', { name: 'Adicionar serviço' })).toBeDisabled();
  await formulario.getByRole('spinbutton', { name: 'Valor (R$)' }).fill('79.90');
  await formulario.getByRole('combobox', { name: 'Duração' }).selectOption('60');
  await formulario.getByRole('button', { name: 'Voltar' }).click();
  await expect(formulario.getByRole('combobox', { name: 'Filial' })).toHaveValue('2');
  await formulario.getByRole('button', { name: 'Voltar' }).click();
  await expect(formulario.getByRole('textbox', { name: /Descrição/ })).toHaveValue('Escova e finalização');
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  await expect(formulario.getByRole('spinbutton', { name: 'Valor (R$)' })).toHaveValue('79.90');
  await formulario.getByRole('button', { name: 'Adicionar serviço' }).click();
  await expect.poll(() => enviado).toEqual({ nome: 'Escova', descricao: 'Escova e finalização', idUnidade: '2', valor: '79.90', duracaoMinutos: '60' });
  await expect(formulario.getByRole('heading', { name: 'Qual serviço você oferece?' })).toBeVisible();
});

test('edita serviço com valores preenchidos e permite repetir envio após erro', async ({ page }) => {
  const envios = [];
  await preparar(page, { aoSalvar: (route, responder) => {
    expect(route.request().method()).toBe('PATCH');
    expect(new URL(route.request().url()).pathname).toBe('/api/salao/servicos/7');
    envios.push(route.request().postDataJSON());
    return responder({ mensagem: envios.length === 1 ? 'Tente novamente.' : 'Serviço atualizado.' }, envios.length === 1 ? 400 : 200);
  } });
  await page.locator('.cartao-gestao').filter({ hasText: 'Corte' }).getByRole('button', { name: 'Alterar' }).click();
  const formulario = page.getByRole('form', { name: 'Editar serviço' });
  await expect(formulario.getByRole('textbox', { name: 'Nome do serviço' })).toHaveValue('Corte');
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  await expect(formulario.getByRole('combobox', { name: 'Filial' })).toHaveValue('1');
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  await expect(formulario.getByRole('spinbutton', { name: 'Valor (R$)' })).toHaveValue('50');
  await expect(formulario.getByRole('combobox', { name: 'Duração' })).toHaveValue('45');
  await formulario.getByRole('spinbutton', { name: 'Valor (R$)' }).fill('55.50');
  await formulario.getByRole('button', { name: 'Salvar serviço' }).click();
  await expect(page.getByText('Tente novamente.', { exact: true })).toBeVisible();
  await expect(formulario.getByRole('spinbutton', { name: 'Valor (R$)' })).toHaveValue('55.50');
  await formulario.getByRole('button', { name: 'Salvar serviço' }).click();
  await expect.poll(() => envios.length).toBe(2);
  expect(envios).toEqual(Array(2).fill({ nome: 'Corte', descricao: 'Corte completo', idUnidade: '1', valor: '55.50', duracaoMinutos: '45' }));
  await expect(page.getByRole('form', { name: 'Cadastrar serviço' })).toBeVisible();
});

test('etapas do serviço são acessíveis no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, { tema: 'escuro' });
  const formulario = page.getByRole('form', { name: 'Cadastrar serviço' });
  await formulario.getByRole('textbox', { name: 'Nome do serviço' }).fill('Escova');
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  await formulario.getByRole('combobox', { name: 'Filial' }).selectOption('1');
  await formulario.getByRole('button', { name: 'Continuar →' }).click();
  const resultado = await new AxeBuilder({ page }).include('.formulario-servico').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(resultado.violations.map(({ id, nodes }) => ({ id, alvos: nodes.map(({ target }) => target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
