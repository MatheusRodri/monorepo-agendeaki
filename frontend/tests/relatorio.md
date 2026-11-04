# Relatório de testes do frontend

Gerado em 2026-11-04 com Jest 30 (ESM nativo) e Node 26.13.0.

## Como executar

- `npm test`: roda todos os testes.
- `npm run test:cobertura`: testes e cobertura (tabela no terminal, HTML em `coverage/index.html` e `coverage/lcov.info`).

## Resultado

| Comando | Suítes | Testes | Aprovados | Falhas |
| --- | --- | --- | --- | --- |
| `npm run test:cobertura` | 5 | 32 | 32 | 0 |

## Cobertura (`utils/` e `components/**/*.mjs`)

| Métrica | Cobertura |
| --- | --- |
| Instruções | 56,48% (305/540) |
| Ramificações | 83,33% (190/228) |
| Funções | 89,47% (34/38) |
| Linhas | 56,48% (305/540) |

| Arquivo | Linhas |
| --- | --- |
| `DashboardPremium/detalhadoDashboard.mjs`, `resumoDashboard.mjs` | 100% |
| `utils/atualizacaoTemporal.mjs`, `formatadores.js`, `retornoSeguro.mjs` | 100% |
| `utils/respostaApi.js` | 91,96% |
| `utils/api.js`, `notificacoesDispositivo.js`, `toast.js` | 0% |

## Testes

| Arquivo | O que cobre |
| --- | --- |
| `utilitarios.test.mjs` (novo) | Máscaras de CPF, CNPJ, telefone e data, maioridade, retorno interno seguro, agendador de atualização |
| `sessao.test.mjs` (novo) | Tokens por perfil, migração da sessão legada, identidade pelo JWT, limpeza de sessão |
| `dashboard-resumo`, `dashboard-detalhado`, `pwa-offline` | Já existentes, convertidos para Jest |

## Limitações e pendências

- **E2E (Playwright + axe) não foi criado.**
- Componentes React (`.jsx`) não têm testes e ficam fora da cobertura medida.
- `utils/api.js` (axios, interceptors) está sem testes.
- Foi criado `utils/package.json` com `"type": "module"` para o Jest tratar os `.js` de `utils` como ESM sem alterar o projeto Next.
