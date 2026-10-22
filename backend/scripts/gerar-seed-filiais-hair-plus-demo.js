import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cnpjValido } from '../src/servicos/documentos.js';
import { prepararDocumento, prepararIndiceRaizCnpj, validarChavesDocumentos } from '../src/servicos/documentosProtegidos.js';

const raizCnpj = '68750840';
const cnpjMatriz = '68750840000105';
const indiceRaizEsperado = '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e';
const origem = { latitude: -23.67352, longitude: -46.71413 };
const unidades = [
  {
    nome: 'Hair Plus Demo - Vila Lisboa', slug: 'hair-plus-demo-vila-lisboa',
    rua: 'Rua Pedro Andrade Lemos', numero: '143', bairro: 'Socorro', cep: '04776137',
    categoria: 'UNISSEX', email: 'hairplus-demo-vilalisboa@example.com', telefone: '11990000002', cnpjEstabelecimento: '0002',
  },
  {
    nome: 'Hair Plus Demo - Socorro', slug: 'hair-plus-demo-socorro',
    rua: 'Avenida de Pinedo', numero: '839', bairro: 'Socorro', cep: '04764000',
    categoria: 'UNISSEX', email: 'hairplus-demo-socorro@example.com', telefone: '11990000003', cnpjEstabelecimento: '0003',
  },
  {
    nome: 'Hair Plus Demo - Vila Friburgo', slug: 'hair-plus-demo-vila-friburgo',
    rua: 'Avenida do Rio Bonito', numero: '1300', bairro: 'Vila Friburgo', cep: '04776002',
    categoria: 'UNISSEX', email: 'hairplus-demo-vilafriburgo@example.com', telefone: '11990000004', cnpjEstabelecimento: '0004',
  },
  {
    nome: 'Hair Plus Demo - Socorro Norte', slug: 'hair-plus-demo-socorro-norte',
    rua: 'Rua Professor Francisco Lopes Chagas', numero: '130', bairro: 'Socorro', cep: '04776120',
    categoria: 'UNISSEX', email: 'hairplus-demo-socorronorte@example.com', telefone: '11990000005', cnpjEstabelecimento: '0005',
  },
];

const servicos = [
  { nome: 'Corte unissex', descricao: 'Corte de cabelo personalizado.', valor: '65.00', duracao: 45 },
  { nome: 'Escova', descricao: 'Lavagem e escova.', valor: '55.00', duracao: 45 },
  { nome: 'Hidratação capilar', descricao: 'Tratamento hidratante para os fios.', valor: '90.00', duracao: 60 },
  { nome: 'Coloração', descricao: 'Coloração capilar completa.', valor: '180.00', duracao: 120 },
];

const profissionais = [
  { nome: 'Ana Demo', servicos: ['Corte unissex', 'Escova', 'Hidratação capilar'] },
  { nome: 'Caio Demo', servicos: ['Corte unissex', 'Escova', 'Coloração'] },
];

function escaparSql(valor) {
  if (valor === null || valor === undefined) return 'NULL';
  return `'${String(valor).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function calcularDigitoCnpj(cnpj, quantidade) {
  const pesos = quantidade === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = cnpj.slice(0, quantidade).split('').reduce(
    (total, digito, indice) => total + (digito.charCodeAt(0) - 48) * pesos[indice],
    0,
  );
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

function criarCnpjTeste(estabelecimento) {
  const base = `${raizCnpj}${estabelecimento}`;
  const primeiro = calcularDigitoCnpj(base, 12);
  const cnpj = `${base}${primeiro}${calcularDigitoCnpj(`${base}${primeiro}`, 13)}`;
  if (!cnpjValido(cnpj)) throw new Error(`Falha ao calcular o CNPJ sintético de demonstração ${estabelecimento}.`);
  return cnpj;
}

function calcularDistanciaKm(a, b) {
  const radianos = (graus) => graus * Math.PI / 180;
  const deltaLatitude = radianos(b.latitude - a.latitude);
  const deltaLongitude = radianos(b.longitude - a.longitude);
  const haverseno = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radianos(a.latitude)) * Math.cos(radianos(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haverseno), Math.sqrt(1 - haverseno));
}

async function geocodificar(unidade) {
  const chave = process.env.HERE_API_KEY;
  if (!chave || chave === 'your_here_server_api_key') throw new Error('Configure HERE_API_KEY no backend/.env para geocodificar os endereços.');
  const partes = [
    ['houseNumber', unidade.numero], ['street', unidade.rua], ['district', unidade.bairro],
    ['city', 'São Paulo'], ['state', 'SP'], ['postalCode', unidade.cep], ['country', 'BRA'],
  ].map(([campo, valor]) => `${campo}=${valor}`);
  const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
  url.search = new URLSearchParams({
    apiKey: chave,
    lang: 'pt-BR',
    limit: '5',
    qq: partes.join(';'),
    types: 'address,houseNumber,street',
  }).toString();

  let resposta;
  try {
    resposta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error(`Não foi possível consultar a localização de ${unidade.rua}, ${unidade.numero}.`);
  }
  if (!resposta.ok) throw new Error(`A HERE recusou a consulta de localização (HTTP ${resposta.status}).`);
  const dados = await resposta.json();
  const resultados = dados.items ?? [];
  const resultado = resultados.find((item) => String(item.address?.postalCode ?? '').replace(/\D/g, '') === unidade.cep)
    ?? resultados.find((item) => {
      const endereco = item.address ?? {};
      const ruaRetornada = String(endereco.street ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const ruaEsperada = unidade.rua.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return String(endereco.houseNumber ?? '') === unidade.numero
        && (ruaRetornada.includes(ruaEsperada) || ruaEsperada.includes(ruaRetornada))
        && String(endereco.city ?? '').toLowerCase() === 'são paulo';
    });
  if (!resultado?.position) {
    const sugestoes = resultados.map((item) => ({
      endereco: item.address?.label ?? item.title,
      cep: item.address?.postalCode ?? null,
      numero: item.address?.houseNumber ?? null,
      rua: item.address?.street ?? null,
    }));
    throw new Error(`A HERE não confirmou o endereço ${unidade.rua}, ${unidade.numero} (CEP ${unidade.cep}). Sugestões: ${JSON.stringify(sugestoes)}`);
  }
  const posicao = { latitude: Number(resultado.position.lat), longitude: Number(resultado.position.lng) };
  if (!Number.isFinite(posicao.latitude) || !Number.isFinite(posicao.longitude)) throw new Error(`Coordenadas inválidas para ${unidade.rua}, ${unidade.numero}.`);
  const distanciaKm = calcularDistanciaKm(origem, posicao);
  if (distanciaKm > 10) throw new Error(`O endereço ${unidade.rua}, ${unidade.numero} ficou a ${distanciaKm.toFixed(1)} km da unidade Senac; revise o resultado da geocodificação.`);
  return { ...posicao, distanciaKm };
}

function gerarInsertUnidade(unidade) {
  const cnpj = criarCnpjTeste(unidade.cnpjEstabelecimento);
  const documento = prepararDocumento('CNPJ', cnpj);
  return `-- ${unidade.nome}: documento sintético de demonstração; o CNPJ não é uma inscrição empresarial real.
INSERT INTO tb_unidade (
  fk_salao, nm_unidade, ds_slug, tp_categoria, ds_rua, nu_endereco, ds_complemento,
  ds_bairro, ds_municipio, ds_estado, ds_pais, nu_cep, ds_email, tp_documento,
  ds_documento_cifrado, ds_documento_indice, ds_cnpj_raiz_indice,
  nu_latitude, nu_longitude, nu_telefone
)
SELECT 1, ${escaparSql(unidade.nome)}, ${escaparSql(unidade.slug)}, ${escaparSql(unidade.categoria)},
  ${escaparSql(unidade.rua)}, ${escaparSql(unidade.numero)}, NULL, ${escaparSql(unidade.bairro)},
  'São Paulo', 'SP', 'BR', ${escaparSql(unidade.cep)}, ${escaparSql(unidade.email)}, 'CNPJ',
  ${escaparSql(documento.documentoCifrado)}, ${escaparSql(documento.documentoIndice)}, ${escaparSql(indiceRaizEsperado)},
  ${unidade.latitude.toFixed(7)}, ${unidade.longitude.toFixed(7)}, ${escaparSql(unidade.telefone)}
FROM tb_salao salao
WHERE salao.id_salao = 1
  AND salao.ds_cnpj_raiz_indice = ${escaparSql(indiceRaizEsperado)}
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = ${escaparSql(unidade.slug)})
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE ds_documento_indice = ${escaparSql(documento.documentoIndice)});
SET @id_unidade_demo = (SELECT id_unidade FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = ${escaparSql(unidade.slug)} LIMIT 1);
`;
}

function gerarSql(unidadesGeocodificadas) {
  const linhas = [
    '-- GERADO por backend/scripts/gerar-seed-filiais-hair-plus-demo.js',
    '-- SOMENTE para ambiente de teste. Endereços são reais; dados de unidades, equipe e documentos são fictícios.',
    '-- Os campos de documento foram cifrados com as chaves locais do backend. Use somente no banco que compartilha essas chaves.',
    '-- Execução repetida não duplica filiais, horários, serviços, profissionais, associações ou disponibilidades.',
    `-- Raiz protegida esperada para tb_salao.id_salao=1: ${indiceRaizEsperado}`,
    'START TRANSACTION;',
    '',
  ];

  for (const unidade of unidadesGeocodificadas) {
    linhas.push(`-- ${unidade.nome}: aproximadamente ${unidade.distanciaKm.toFixed(1)} km da unidade Senac.`);
    linhas.push(gerarInsertUnidade(unidade));
    linhas.push(`
-- Horários da filial: segunda a sexta, 09:00–19:00; sábado, 09:00–17:00; domingo fechado.
INSERT INTO tb_horario_unidade (fk_unidade, nr_dia_semana, hr_abertura, hr_fechamento, st_fechado)
SELECT @id_unidade_demo, horario.nr_dia_semana, horario.hr_abertura, horario.hr_fechamento, horario.st_fechado
FROM (
  SELECT 0 AS nr_dia_semana, NULL AS hr_abertura, NULL AS hr_fechamento, TRUE AS st_fechado
  UNION ALL SELECT 1, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 2, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 3, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 4, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 5, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 6, '09:00:00', '17:00:00', FALSE
) horario
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_horario_unidade WHERE fk_unidade = @id_unidade_demo AND nr_dia_semana = horario.nr_dia_semana);
`);

    for (const servico of servicos) {
      linhas.push(`INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, ${escaparSql(servico.nome)}, ${escaparSql(servico.descricao)}, ${servico.valor}, ${servico.duracao}
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = ${escaparSql(servico.nome)});
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = ${escaparSql(servico.nome)} LIMIT 1);
`);
    }

    for (const [indiceProfissional, profissional] of profissionais.entries()) {
      linhas.push(`INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, ${escaparSql(profissional.nome)}, TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = ${escaparSql(profissional.nome)});
SET @id_profissional_demo_${indiceProfissional + 1} = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = ${escaparSql(profissional.nome)} LIMIT 1);
`);

      for (const nomeServico of profissional.servicos) {
        linhas.push(`INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_${indiceProfissional + 1}, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = ${escaparSql(nomeServico)}
  AND @id_profissional_demo_${indiceProfissional + 1} IS NOT NULL;
`);
      }

      linhas.push(`INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_${indiceProfissional + 1}, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_${indiceProfissional + 1} IS NOT NULL;
`);
    }
  }

  const slugs = unidadesGeocodificadas.map((unidade) => escaparSql(unidade.slug)).join(', ');
  linhas.push(`
COMMIT;

-- Resultado: deve haver quatro filiais de demonstração para o salão 1.
SELECT COUNT(*) AS filiais_demo
FROM tb_unidade
WHERE fk_salao = 1 AND ds_slug IN (${slugs});
`);
  return linhas.join('\n');
}

async function gerar() {
  validarChavesDocumentos();
  const indiceRaizCalculado = prepararIndiceRaizCnpj(cnpjMatriz);
  if (indiceRaizCalculado !== indiceRaizEsperado) {
    throw new Error('As chaves locais não correspondem ao índice da raiz informado para Hair Plus. Não gere SQL com chaves de outro ambiente.');
  }

  const localizacoes = await Promise.all(unidades.map(geocodificar));
  const dadosComLocalizacao = unidades.map((unidade, indice) => ({ ...unidade, ...localizacoes[indice] }));
  const raizCalculadaNovamente = prepararIndiceRaizCnpj(criarCnpjTeste(unidades[0].cnpjEstabelecimento));
  if (raizCalculadaNovamente !== indiceRaizEsperado) throw new Error('O índice HMAC calculado para a filial não corresponde à raiz da matriz.');

  const diretorioProjeto = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const caminhoSaida = resolve(diretorioProjeto, 'database/seeds/filiais-hair-plus-demo.sql');
  mkdirSync(dirname(caminhoSaida), { recursive: true });
  writeFileSync(caminhoSaida, gerarSql(dadosComLocalizacao), { encoding: 'utf8', mode: 0o600 });
  console.log(`SQL de demonstração gerado em ${caminhoSaida}`);
  dadosComLocalizacao.forEach((unidade) => console.log(`${unidade.nome}: ${unidade.distanciaKm.toFixed(1)} km da unidade Senac`));
}

gerar().catch((erro) => {
  console.error(`Não foi possível gerar o SQL: ${erro.message}`);
  process.exitCode = 1;
});
