# Relatório de testes do frontend

Gerado em 2026-11-04 com Jest 30 (ESM nativo) e Node 26.13.0.

## Como executar

- `npm test`: roda todos os testes.
- `npm run test:cobertura`: testes e cobertura (tabela no terminal, HTML em `coverage/index.html` e `coverage/lcov.info`).

## Resultado

| Comando | Suítes | Testes | Aprovados | Falhas |
| --- | --- | --- | --- | --- |
| `npm run test:cobertura` | 10 | 84 | 84 | 0 |

## Cobertura (`utils/` e `components/**/*.mjs`)

| Métrica | Antes | Agora |
| --- | --- | --- |
| Instruções e linhas | 56,48% | **100%** (540/540) |
| Funções | 89,47% | **100%** (51/51) |
| Ramificações | 83,33% | 99,24% (396/399) |

Todos os arquivos medidos estão com 100% de linhas e funções.

## Testes

| Arquivo | O que cobre |
| --- | --- |
| `utilitarios.test.mjs` | Máscaras de CPF, CNPJ, telefone e data, maioridade, retorno interno seguro, agendador de atualização |
| `sessao.test.mjs` | Tokens por perfil, migração da sessão legada, identidade pelo JWT, limpeza de sessão |
| `api.test.mjs` (novo) | Cliente HTTP (axios simulado): token por perfil, erros, Blob, cadastro incompleto, renovação de sessão compartilhada entre chamadas |
| `notificacoesDispositivo.test.mjs` (novo) | Vínculos de push com o service worker simulado, desativação e encerramento de sessão |
| `toast.test.mjs` (novo) | Avisos do `react-toastify` simulado |
| `dashboard-ramificacoes.test.mjs`, `utils-ramificacoes.test.mjs` (novos) | Casos de borda: empates, valores ausentes, aniversário no mês, sessão sem janela, endereço da API |
| `dashboard-resumo`, `dashboard-detalhado`, `pwa-offline` | Já existentes, convertidos para Jest |

## O que falta para 100% de ramificações

Restam 3 ramificações, inalcançáveis pelo código atual:

- `utils/api.js`: caminho `/api/admin/refresh` (o administrador nunca renova a sessão).
- `utils/respostaApi.js`: `typeof window === 'undefined'` dentro de `migrarSessaoLegada` (todos os chamadores já verificam a janela).
- `DashboardPremium/detalhadoDashboard.mjs`: `pico?.quantidade ? … : ''` (com agendamentos, o pico sempre tem quantidade).

## Limitações e pendências

- **E2E (Playwright + axe) não foi criado.**
- Componentes React (`.js` com JSX) não têm testes e ficam fora da cobertura medida; testá-los exigiria jsdom, Testing Library e um transform de JSX.
- Foi criado `utils/package.json` com `"type": "module"` para o Jest tratar os `.js` de `utils` como ESM sem alterar o projeto Next.
