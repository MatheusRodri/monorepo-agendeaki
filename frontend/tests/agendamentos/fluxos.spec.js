import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const depois = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
const profissionais = [{ idFuncionario: 1, nome: 'Ana' }, { idFuncionario: 2, nome: 'Bia' }];
const servicos = [
  { idServico: 1, idUnidade: 1, nome: 'Corte', valor: 50, duracaoMinutos: 30, profissionais },
  { idServico: 2, idUnidade: 1, nome: 'Escova', valor: 40, duracaoMinutos: 30, profissionais },
];
const filial = { idUnidade: 1, nomeUnidade: 'Centro', nomeSalao: 'Salão teste', categoria: 'UNISSEX', rua: 'Rua', numero: '1', bairro: 'Centro', municipio: 'São Paulo', estado: 'SP' };
const horarios = ['09:00', '09:30', '10:00', '10:30'].map((inicio, indice) => ({ inicio, fim: ['09:30', '10:00', '10:30', '11:00'][indice], profissionais, profissionalSugerido: profissionais[0] }));
const agendamento = { idAgendamento: 10, idUnidade: 1, idFuncionario: 1, servico: 'Corte', valor: 50, funcionario: 'Ana', cliente: 'Cliente teste', filial: 'Centro', status: 'AGENDADO', dataHoraInicio: `${amanha}T09:00:00-03:00` };

async function preparar(page, { autenticado = true, aoLote, indisponivel = () => false, profissionaisDisponiveis = () => profissionais, aoConcluir } = {}) {
  await page.route('https://vlibras.gov.br/**', (route) => route.abort());
  if (autenticado) await page.addInitScript(() => { localStorage.setItem('tokenAcessoCliente', 'cliente-teste'); localStorage.setItem('tokenAcessoSalao', 'salao-teste'); });
  await page.route('http://localhost:3001/api/**', async (route) => {
    const url = new URL(route.request().url());
    const caminho = url.pathname;
    const responder = (dados, status = 200) => route.fulfill({ status, json: dados });
    if (caminho === '/api/publico/agendamento/teste/centro') return responder({ filial, servicos, disponivel: true });
    if (caminho.startsWith('/api/publico/avaliacoes')) return responder({ resumo: {}, servicos: [], avaliacoes: [] });
    if (caminho.endsWith('/horarios')) {
      const servico = servicos.find((item) => String(item.idServico) === url.searchParams.get('idServico')) ?? servicos[0];
      const idFuncionario = url.searchParams.get('idFuncionario');
      const habilitados = profissionaisDisponiveis().filter((p) => !idFuncionario || idFuncionario === 'qualquer' || String(p.idFuncionario) === idFuncionario);
      const disponiveis = habilitados.length ? horarios.filter((h) => !indisponivel(url, h)).map((h) => ({ ...h, profissionais: habilitados, profissionalSugerido: habilitados[0] })) : [];
      return responder({ horarios: disponiveis, duracaoMinutos: 30, servico });
    }
    if (caminho === '/api/clientes/agendamentos/lote') return aoLote ? aoLote(route, responder) : responder({ agendamentos: [] }, 201);
    if (caminho.endsWith('/confirmar-atendimento')) return aoConcluir ? aoConcluir(route, responder) : responder({ mensagem: 'Atendimento confirmado.' });
    if (caminho === '/api/salao/agendamentos') return responder({ agendamentos: [agendamento] });
    if (caminho === '/api/salao/filiais') return responder({ filiais: [{ idUnidade: 1, nome: 'Centro' }] });
    if (caminho === '/api/salao/servicos') return responder({ servicos });
    if (caminho === '/api/salao/funcionarios') return responder({ funcionarios: profissionais.map((p) => ({ ...p, idUnidade: 1, idsServicos: [1,2] })) });
    if (caminho === '/api/salao/clientes') return responder({ clientes: [] });
    if (caminho === '/api/salao/notificacoes') return responder({ notificacoes: [], naoLidas: 0 });
    if (caminho === '/api/salao/assinatura') return responder({ assinatura: { temAcessoPremium: false } });
    if (caminho.startsWith('/api/clientes/agendamentos/')) return responder({ agendamentos: [] });
    return responder({});
  });
}
async function selecionar(page, nomes = ['Corte']) {
  for (const nome of nomes) await page.getByRole('button',{name:new RegExp(`^${nome}\\b`)}).click();
  await page.getByRole('button',{name:'Escolher horários →'}).click();
}
async function definirHorario(page, { data = amanha, hora = '09:00', profissional = 'qualquer' } = {}) {
  await page.getByRole('combobox',{name:'Profissional',exact:true}).selectOption(profissional);
  await page.getByLabel('Data do atendimento').fill(data);
  await page.getByRole('button',{name:hora,exact:true}).click();
  await page.getByRole('button',{name:/^(Próximo serviço →|Salvar horário)$/}).click();
}
async function registrarTela(page,nome) {
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:test.info().outputPath(nome),fullPage:true});
}
async function semViolacoes(page) {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  expect(resultado.violations.map(({ id,nodes }) => ({ id,seletores:nodes.map(({target})=>target) }))).toEqual([]);
}

test('seleciona vários serviços na primeira etapa e configura os horários sem sair do contêiner', async ({ page }) => {
  let enviado;
  await preparar(page,{aoLote:(route,responder)=>{
    enviado=route.request().postDataJSON();
    return responder({agendamentos:enviado.itens.map((item,indice)=>({idAgendamento:indice+1,nomeServico:servicos.find((s)=>s.idServico===item.idServico).nome,
      dataInicioBanco:item.dataHoraInicio.replace('T',' '),nomeFuncionario:'Ana',valorServico:50}))},201);
  }});
  await page.goto('/teste/centro');
  await page.getByRole('button',{name:/^Corte\b/}).click();
  await page.getByRole('button',{name:/^Escova\b/}).click();
  await expect(page.getByRole('button',{pressed:true})).toHaveCount(2);
  await expect(page.getByText('2 serviços selecionados')).toBeVisible();
  await registrarTela(page,'servicos-desktop.png');
  await page.getByRole('button',{name:'Escolher horários →'}).click();
  await definirHorario(page);
  await page.getByLabel('Data do atendimento').fill(amanha);
  await expect(page.getByRole('button',{name:'09:30',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'09:00',exact:true})).toHaveCount(0);
  await definirHorario(page,{hora:'09:30'});
  await registrarTela(page,'horarios-desktop.png');
  const fluxo = await page.locator('.fluxo-agendamento').boundingBox();
  const resumo = await page.getByRole('region',{name:'Resumo do agendamento'}).boundingBox();
  expect(resumo.x).toBeGreaterThanOrEqual(fluxo.x); expect(resumo.x+resumo.width).toBeLessThanOrEqual(fluxo.x+fluxo.width+1);
  await page.getByRole('button',{name:/Revisar agendamentos/}).click();
  await expect(page.getByRole('dialog')).toContainText('Total: R$ 90,00');
  await semViolacoes(page);
  await page.getByRole('button',{name:'Confirmar agendamentos',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Agendamentos confirmados!'})).toBeVisible();
  expect(enviado.itens).toHaveLength(2);
  expect(await page.evaluate(()=>sessionStorage.getItem('agendamentos:teste:centro'))).toBeNull();
});

test('impede o mesmo serviço no mesmo dia e permite agendar em outra data', async ({ page }) => {
  await preparar(page); await page.goto('/teste/centro'); await selecionar(page); await definirHorario(page);
  await page.getByRole('button',{name:'+ Agendar em outro dia',exact:true}).click();
  await page.getByLabel('Data do atendimento').fill(amanha);
  await expect(page.getByText('Este serviço já foi escolhido para este dia. Selecione outra data.')).toBeVisible();
  await expect(page.getByRole('button',{name:/Revisar agendamentos/})).toBeDisabled();
  await expect(page.getByRole('button',{name:'09:30',exact:true})).toHaveCount(0);
  await definirHorario(page,{data:depois});
  await expect(page.getByText('2 de 2 serviços com horário definido')).toBeVisible();
  await expect(page.getByRole('button',{name:/Revisar agendamentos/})).toBeEnabled();
});

test('desmarca serviços na primeira etapa e preserva os horários ao alterar a seleção', async ({page})=>{
  await preparar(page);await page.goto('/teste/centro');await selecionar(page);await definirHorario(page);
  await page.getByRole('button',{name:'Alterar serviços'}).click();
  await expect(page.getByRole('button',{name:/^Corte\b/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/^Escova\b/}).click();
  await page.getByRole('button',{name:/Escolher horários/}).click();
  await expect(page.getByText('1 de 2 serviços com horário definido')).toBeVisible();
  await page.getByRole('button',{name:'Remover serviço 2: Escova'}).click();
  await expect(page.getByText('1 de 1 serviço com horário definido')).toBeVisible();
});

test('preserva seleção e horários na ida ao login e separa rascunhos por filial', async ({ page }) => {
  await preparar(page,{autenticado:false}); await page.goto('/teste/centro');await selecionar(page);await definirHorario(page);
  await page.getByRole('button',{name:/Entrar para continuar/}).click();
  await expect(page).toHaveURL(/\/cliente\?retorno=/);
  await page.evaluate(()=>localStorage.setItem('tokenAcessoCliente','teste'));
  await page.goto('/teste/centro');await expect(page.getByText('1 de 1 serviço com horário definido')).toBeVisible();
  await page.getByRole('button',{name:/Corte.*09:00/}).click();
  await page.reload();await expect(page.getByLabel('Data do atendimento')).toHaveValue(amanha);
  const rascunhos=await page.evaluate(()=>({atual:sessionStorage.getItem('agendamentos:teste:centro'),outra:sessionStorage.getItem('agendamentos:teste:outra')}));
  expect(JSON.parse(rascunhos.atual).itens).toHaveLength(1);expect(rascunhos.outra).toBeNull();
});

test('conflito na confirmação preserva a lista e abre o serviço para correção', async ({page})=>{
  await preparar(page,{aoLote:(route,responder)=>responder({codigo:'CONFLITO_HORARIO',indiceItem:0,mensagem:'Horário ocupado.'},409)});
  await page.goto('/teste/centro');await selecionar(page);await definirHorario(page);
  await page.getByRole('button',{name:/Revisar agendamentos/}).click();
  await page.getByRole('button',{name:'Confirmar agendamentos',exact:true}).click();
  await expect(page.getByText('Revise este serviço antes de confirmar: a disponibilidade mudou.')).toBeVisible();
  await definirHorario(page,{hora:'09:30'});
  await expect(page.getByRole('button',{name:/Corte.*09:30/})).toBeVisible();
});

test('sessão expirada durante confirmação mantém os serviços para o novo login', async ({page})=>{
  await preparar(page,{aoLote:(route,responder)=>responder({mensagem:'Sessão expirada'},401)});
  await page.goto('/teste/centro');await selecionar(page);await definirHorario(page);
  await page.getByRole('button',{name:/Revisar agendamentos/}).click();
  await page.getByRole('button',{name:'Confirmar agendamentos',exact:true}).click();
  await expect(page).toHaveURL(/\/cliente\?retorno=/);
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('agendamentos:teste:centro')).itens.length)).toBe(1);
});

test('conclui atendimento com extra de outro profissional e preço ajustado', async ({ page }) => {
  let enviado;
  await preparar(page,{ aoConcluir:(route,responder)=>{ enviado=route.request().postDataJSON();return responder({mensagem:'Atendimento confirmado.'}); } });
  await page.goto('/salao/agendamentos');
  await page.getByRole('button',{name:'Realizado',exact:true}).click();
  await page.getByRole('button',{name:'Adicionar serviço extra'}).click();
  const extra = page.getByRole('group',{name:'Serviço extra 1'});
  await extra.getByRole('combobox',{name:'Serviço',exact:true}).selectOption('2');
  await extra.getByRole('combobox',{name:'Profissional que realizou'}).selectOption('2');
  await extra.getByLabel('Valor cobrado (R$)').fill('35.50');
  await expect(page.getByRole('dialog')).toContainText('Total do atendimento: R$ 85,50');
  await semViolacoes(page);
  await page.getByRole('button',{name:'Confirmar como realizado'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(enviado.servicosAdicionais).toEqual([{idServico:2,idFuncionario:2,valorCobrado:'35.50'}]);
});

test('modal permite concluir sem extras e devolve foco ao fechar', async ({ page }) => {
  let enviado;
  await preparar(page,{aoConcluir:(route,responder)=>{enviado=route.request().postDataJSON();return responder({mensagem:'Atendimento confirmado.'});}});
  await page.goto('/salao/agendamentos');
  const realizado = page.getByRole('button',{name:'Realizado',exact:true});
  await realizado.click();await page.keyboard.press('Escape');await expect(realizado).toBeFocused();
  await realizado.click();await page.getByRole('button',{name:'Confirmar como realizado'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(enviado.servicosAdicionais).toEqual([]);
});

test('nova atribuição sem preferência aparece na revisão antes da confirmação', async ({ page }) => {
  let trocar = false;
  let enviado;
  await preparar(page,{ profissionaisDisponiveis:()=>trocar?[profissionais[1]]:profissionais,
    aoLote:(route,responder)=>{ enviado=route.request().postDataJSON();return responder({agendamentos:[]},201); } });
  await page.goto('/teste/centro');await selecionar(page);await definirHorario(page);
  trocar = true;
  await page.getByRole('button',{name:/Revisar agendamentos/}).click();
  await expect(page.getByRole('dialog')).toContainText('Bia');
  await expect(page.getByRole('dialog')).toContainText('houve nova atribuição de profissional');
  expect(enviado).toBeUndefined();
  await page.getByRole('button',{name:'Confirmar agendamentos',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Agendamentos confirmados!'})).toBeVisible();
  expect(enviado.itens[0].idFuncionario).toBe(2);
});

test('lista e revisão mantêm acessibilidade em celular e permitem remover serviços', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await preparar(page);await page.goto('/teste/centro');await selecionar(page);await definirHorario(page);
  await registrarTela(page,'horarios-celular.png');
  await page.getByRole('button',{name:/Revisar agendamentos/}).click();
  await semViolacoes(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:/Revisar agendamentos/})).toBeFocused();
  await page.getByRole('button',{name:'Remover serviço 1: Corte'}).click();
  await expect(page.locator('.servico-selecionado')).toHaveCount(0);
});

test('mantém o padrão visual e o contraste no tema escuro',async ({page})=>{
  await preparar(page);await page.goto('/teste/centro');
  await page.getByRole('button',{name:'Ativar tema escuro'}).click();
  await page.getByRole('button',{name:/^Corte\b/}).click();
  await page.getByRole('button',{name:/^Escova\b/}).click();
  await registrarTela(page,'servicos-escuro.png');
  await semViolacoes(page);
  await page.getByRole('button',{name:/Escolher horários/}).click();
  await definirHorario(page);await definirHorario(page,{hora:'09:30'});
  await registrarTela(page,'horarios-escuro.png');
  await semViolacoes(page);
  const excesso=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(excesso).toBe(false);
});

test('rascunho anterior com serviços repetidos abre a data para correção',async ({page})=>{
  await preparar(page);
  await page.addInitScript(({data})=>{
    const item={idServico:'1',nome:'Corte',valor:50,duracaoMinutos:30,idFuncionario:'qualquer',data,horario:'09:00',fim:'09:30',profissional:{idFuncionario:1,nome:'Ana'},observacao:''};
    sessionStorage.setItem('agendamentos:teste:centro',JSON.stringify({itens:[item,{...item,horario:'10:00',fim:'10:30'}]}));
  },{data:amanha});
  await page.goto('/teste/centro');
  await expect(page.getByText('Este serviço já foi escolhido para este dia. Selecione outra data.')).toBeVisible();
  await expect(page.getByRole('button',{name:/Revisar agendamentos/})).toBeDisabled();
  await definirHorario(page,{data:depois});
  await expect(page.getByText('2 de 2 serviços com horário definido')).toBeVisible();
});
