# Relatório de testes do backend

Gerado em 2026-11-04 com Jest 30 (ESM nativo) e Node 26.13.0.

## Como executar

- `npm test`: roda todos os testes.
- `npm run test:cobertura`: testes e cobertura (tabela no terminal, HTML em `coverage/index.html` e `coverage/lcov.info`). Falha se a cobertura cair abaixo do piso definido em `jest.config.js` (instruções, linhas e funções 99%, ramificações 99%).
- `npm run test:integracao`: testes contra MySQL real (`promocoes.integracao.test.js`), ver `README.md`.

## Resultado

| Comando | Suítes | Testes | Aprovados | Falhas |
| --- | --- | --- | --- | --- |
| `npm run test:cobertura` | 34 | 323 | 323 | 0 |
| `npm run test:integracao` (MySQL real) | não executado | – | – | – |

## Cobertura (`src/`, exceto `servidor.js` e `assinaturas.js`)

| Métrica | Cobertura |
| --- | --- |
| Instruções | **100%** (6302/6302) |
| Linhas | **100%** (6302/6302) |
| Funções | **100%** (327/327) |
| Ramificações | 99,46% (3143/3160) |

Ramificações: 92,15% antes desta rodada.

## Arquivos de teste

| Arquivo | Tipo | Cobre |
| --- | --- | --- |
| `regrasTemporaisAgendamento`, `slugs`, `documentos`, `acessoPremium`, `disponibilidade`, `promocoesServicos`, `metricasAgenda` | unitário | Regras puras de datas, preços, documentos e métricas |
| `historicoPrecos`, `dashboardVisaoGeral`, `dashboardAnalitico`, `observacaoAjuste` | unitário | Já existiam, convertidos para Jest |
| `rotasPublico`, `rotasAdmin`, `rotasAutenticacao`, `rotasAutenticacaoDocumentos`, `rotasCliente` | integração HTTP | Express real, banco/Supabase/autenticação simulados |
| `rotasSalaoConta`, `rotasSalaoCadastros`, `rotasSalaoAgenda`, `rotasSalaoPremium` | integração HTTP | Rotas do salão: conta, assinatura, filiais, serviços, profissionais, agenda, indicadores, exportações |
| `notificacoesPush`, `stripeContratacoes`, `servicosGerais`, `supabaseConfig` | unitário/serviço | Push, Stripe (SDK simulado), exclusão de conta, exportações CSV/Excel, autorização |
| `convitesAvaliacao.integracao`, `faturasAssinaturas.integracao`, `webhooks.integracao` | integração | Fila de convites, faturas Stripe, webhook HTTP |
| `auxiliares/ambiente.js` | apoio | Banco falso por regras de SQL, Supabase falso e servidor Express |

## O que falta para 100% de ramificações

Restam 17 ramificações (0,54%), todas **inalcançáveis** pelo código atual (código defensivo morto). Cobri-las exigiria alterar o código de produção:

- `rotas/salao.js` (14): `cep ?? ''` (o parâmetro de rota sempre existe); `horariosPorUnidade.get(...) ?? []` e `servicosPorFuncionario.get(...) ?? []` (mapas já semeados com todos os ids); 11 ramos `dataInicio ? ... : null` do dashboard Premium (as datas sempre são preenchidas antes).
- `servicos/disponibilidade.js` (1): `?? null` do profissional sugerido (todo horário tem ao menos um profissional).
- `rotas/autenticacao.js` (2): `erro?.code` com erro indefinido e um artefato de mapeamento do V8.

## Limitações

- Os testes de rotas usam **banco simulado**: validam lógica, validações, respostas HTTP e que o SQL esperado é executado, mas **não** validam o SQL contra o MySQL. A cobertura de 100% das linhas mede execução do código, não correção das consultas.
- `promocoes.integracao.test.js` (MySQL real) foi convertido para Jest, mas **não foi executado**: não há MySQL nesta máquina.
- `servicos/assinaturas.js` (sem nenhum importador) está fora da cobertura, em `coveragePathIgnorePatterns`.
