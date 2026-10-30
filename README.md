# AgendeAki

> Uma plataforma para aproximar clientes e salões, simplificando a descoberta de serviços e o agendamento de horários.

## Objetivo

O **AgendeAki** centraliza a rotina de agendamentos de salões de beleza. Clientes podem encontrar salões próximos, consultar serviços, agendar horários e acompanhar seus atendimentos. Administradores podem gerenciar unidades, serviços, funcionários, disponibilidade e agendamentos em um só lugar.

O sistema também oferece páginas públicas de agendamento por filial, autenticação para clientes e salões, pagamentos de assinatura e notificações para administradores.

Salões Premium também podem configurar **promoções em serviços**, por preço final ou desconto percentual, com datas opcionais. Consulte os [contratos, regras e preparação da migração](docs/promocoes-servicos.md). Em bases existentes, aplique `database/migracoes/2026-10-29-promocoes-servicos.sql` antes de publicar esta funcionalidade; o esquema inicial já inclui a estrutura.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | Next.js 16, React 19, Axios e MapLibre GL |
| Backend | Node.js, Express 5, Sequelize e CORS |
| Banco de dados | MySQL 8 |
| Autenticação | Supabase Auth |
| Pagamentos | Stripe |
| Geolocalização | HERE Maps |

## Estrutura do projeto

```text
.
├── frontend/
│   ├── app/                 # Rotas e layouts do Next.js
│   ├── components/          # Componentes das áreas de cliente e salão
│   ├── public/              # Recursos estáticos e service worker
│   └── utils/               # Chamadas à API e utilitários do frontend
├── backend/
│   ├── src/rotas/            # Endpoints da API Express
│   ├── src/servicos/         # Regras de negócio e integrações
│   └── scripts/              # Scripts operacionais, incluindo migrações
├── database/
│   ├── script.sql            # Estrutura inicial do banco
│   └── migracoes/            # Migrações para bases existentes
└── template/                 # Modelos de e-mail
```

## Requisitos

- Node.js **20.9 ou superior** e npm;
- MySQL Server e cliente de linha de comando, **8 ou superior**;
- Projeto no [Supabase](https://supabase.com/) com Auth habilitado;
- Chave da [HERE](https://www.here.com/) para mapas e geocodificação;
- Conta Stripe para testar ou publicar pagamentos;
- Git para clonar o repositório.

Para notificações push, configure também as chaves VAPID. Elas são opcionais para executar o restante da aplicação.

## Como rodar local

### 1. Obtenha o projeto

```bash
git clone <URL_DO_REPOSITORIO>
cd monorepo-agendeaki
```

Se o projeto já estiver na sua máquina, entre na pasta raiz dele.

### 2. Prepare o banco de dados

Para uma instalação nova, execute o script inicial:

```bash
mysql -u root -p < database/script.sql
```

O script cria o banco `tccsalao` e suas tabelas. Se já houver uma base com outro nome, transfira os dados para `tccsalao` antes de reiniciar o backend com a configuração atualizada. Para uma base existente, faça backup e aplique as migrações pendentes em `database/migracoes/`; não use o script inicial como substituto de uma migração.

Crie também o usuário local configurado no `backend/.env` (ou ajuste as variáveis para uma conta MySQL existente):

```sql
CREATE USER 'agendeaki_user'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT ALL PRIVILEGES ON tccsalao.* TO 'agendeaki_user'@'localhost';
FLUSH PRIVILEGES;
```

#### Atualizar uma base existente para documentos protegidos e avaliações

Gere duas chaves diferentes e guarde-as em local seguro:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Configure a primeira como `DOCUMENT_ENCRYPTION_KEY` e a segunda como `DOCUMENT_HMAC_KEY` no `backend/.env`. Sem essas chaves, os documentos cifrados não poderão ser lidos.

Antes de executar os comandos de migração, conclua a configuração do ambiente e instale as dependências do backend nas etapas 3 e 4 abaixo.

1. Faça backup do banco e interrompa as gravações durante a migração.
2. Na pasta `backend`, execute `npm run migrar:documentos`. O script converte CPF/CNPJ existentes e pode ser repetido se a conversão for interrompida.
3. Execute `database/migracoes/2026-10-09-avaliacoes.sql` no MySQL.
4. Publique as versões atuais do backend e frontend e confira o cadastro e a consulta de perfil.
5. Depois de confirmar que nenhum processo antigo usa as colunas anteriores, execute `database/migracoes/2026-10-09-remover-documentos-legados.sql`.

A remoção final apaga os documentos em texto simples da tabela. Revise também a retenção dos backups antigos. Mantenha as chaves em um gerenciador de segredos; substituir uma delas exige planejar a migração dos dados cifrados ou dos índices HMAC.

#### Ativar o painel administrativo global

Em uma base existente, aplique a migração antes de publicar a versão que inclui `/admin`:

```bash
mysql -u agendeaki_user -p tccsalao < database/migracoes/2026-10-22-painel-administrativo.sql
```

Em uma base nova, `database/script.sql` já cria o perfil e as tabelas de histórico.

Para gerar inserts de demonstração para quatro filiais do salão Hair Plus, configure no `backend/.env` as mesmas chaves de proteção documental do banco de teste e `HERE_API_KEY`. Execute:

```bash
cd backend
npm run gerar:seed-filiais-demo
```

O comando gera `database/seeds/filiais-hair-plus-demo.sql` na raiz do projeto; ele não conecta nem grava no MySQL. Revise e aplique manualmente somente no banco de teste que usa as mesmas chaves. O seed inclui endereços reais de referência, mas usa contatos, CNPJs, serviços e profissionais fictícios. Nunca use esses dados em produção.

O painel não tem cadastro público e não exige uma conta administrativa no Supabase nem uma linha de administrador em `tb_usuario`. Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` e `ADMIN_SESSION_SECRET` no `backend/.env`; use uma senha exclusiva e gere um segredo aleatório com pelo menos 32 bytes:

```bash
openssl rand -base64 48
```

Copie o resultado para `ADMIN_SESSION_SECRET` e reinicie o backend. A sessão administrativa expira após oito horas; entre diretamente em `/admin`. Mantenha essas variáveis apenas no backend e não versione o arquivo `.env`.

Para importar as faturas de assinatura já disponíveis no Stripe, configure `STRIPE_SECRET_KEY` no backend e execute o comando abaixo uma vez após aplicar a migração. Ele pode ser repetido sem duplicar faturas:

```bash
cd backend
npm run importar:faturas-stripe
```

Mudanças de status, periodicidade e valor das assinaturas serão guardadas a partir da instalação do gatilho incluído na migração; o histórico anterior dessas mudanças não é reconstruído.

### 3. Configure as variáveis de ambiente

Crie os arquivos locais a partir dos modelos:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Preencha os valores reais. O backend usa:

| Variável | Uso |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT` | Endereço e porta do MySQL |
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Credenciais e nome do banco |
| `DOCUMENT_ENCRYPTION_KEY` | Chave base64 de 32 bytes para cifrar CPF/CNPJ |
| `DOCUMENT_HMAC_KEY` | Chave base64 diferente, usada no índice de documentos |
| `PORT` | Porta da API; padrão `3001` |
| `FRONTEND_URL` | URL do frontend; padrão `http://localhost:3000` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | URL e chave pública do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta usada somente pelo backend |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credenciais privadas para o acesso ao painel em `/admin` |
| `ADMIN_NAME` | Nome exibido no cabeçalho do painel |
| `ADMIN_SESSION_SECRET` | Segredo aleatório com pelo menos 32 bytes para assinar sessões administrativas de oito horas |
| `HERE_API_KEY` | Chave de servidor da HERE para geocodificação |
| `ASSINATURA_MODO_TESTE` | `true` ativa Premium localmente; `false` usa checkout Stripe |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Credenciais Stripe para checkout e webhooks |
| `STRIPE_PRICE_ID_MENSAL`, `STRIPE_PRICE_ID_ANUAL` | IDs dos preços recorrentes criados no Stripe |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Chaves de envio de notificações push |

No `frontend/.env.local`, configure:

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | URL da API; localmente `http://localhost:3001` |
| `NEXT_PUBLIC_HERE_API_KEY` | Chave HERE usada pelo mapa no navegador |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Valores públicos do Supabase presentes no modelo; o fluxo atual de autenticação usa a API backend |

Restrinja `NEXT_PUBLIC_HERE_API_KEY` ao domínio do frontend no painel da HERE. Nunca exponha `SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ou `VAPID_PRIVATE_KEY` no frontend nem versione arquivos `.env` reais.

### 4. Instale as dependências

```bash
cd backend
npm install
cd ../frontend
npm install
```

### 5. Inicie API e frontend

Em um terminal, inicie a API:

```bash
cd backend
npm run dev
```

A API estará em [http://localhost:3001](http://localhost:3001). Confira a conexão em [http://localhost:3001/saude](http://localhost:3001/saude).

Em outro terminal, inicie o frontend:

```bash
cd frontend
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### 6. Teste pagamentos com Stripe (opcional)

Crie no Stripe os preços recorrentes em BRL de **R$ 50,00 por mês** e **R$ 400,00 por ano**, atualize `STRIPE_PRICE_ID_MENSAL` e `STRIPE_PRICE_ID_ANUAL` no `backend/.env` com os novos IDs, e mantenha `ASSINATURA_MODO_TESTE=false`. Os preços Stripe existentes não são alterados automaticamente; assinaturas já contratadas continuam seguindo o preço registrado no Stripe até uma migração explícita. Instale o Stripe CLI e autentique a máquina uma vez com `stripe login`. Com o backend rodando na porta `3001`, abra outro terminal e encaminhe os eventos para a API local:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3001/api/webhooks/stripe
```

Deixe o terminal do Stripe CLI aberto enquanto testa. Copie o `whsec_...` exibido pelo CLI para `STRIPE_WEBHOOK_SECRET` em `backend/.env` e reinicie o backend se alterar esse valor. O segredo é sensível: não o versione nem compartilhe. Para desenvolvimento sem checkout, use `ASSINATURA_MODO_TESTE=true`.

Em produção, configure no Dashboard Stripe o endpoint HTTPS `https://api.agendeaki.seudominio.com/api/webhooks/stripe` (substitua pelo seu domínio) para os mesmos eventos listados no comando acima.

O cancelamento da renovação mantém o Premium até o fim do período vigente. Nesse intervalo, o botão **Reativar assinatura** chama `PATCH /api/salao/assinatura/reativar` para retomar a renovação com o mesmo plano e a mesma data de cobrança, seguindo o [fluxo de reativação do Stripe](https://docs.stripe.com/billing/subscriptions/cancel#stop-a-pending-cancellation). Após o encerramento, **Assinar novamente** inicia um novo checkout na mesma conta; os dados do salão são preservados e o teste grátis não é repetido quando já foi utilizado. O status é sincronizado com o Stripe antes de reativar ou iniciar outra contratação. Não é necessária uma migração de banco para esta mudança.

### 7. Notificações push (opcional)

O envio usa Web Push com chaves VAPID. Gere um par com:

```bash
cd backend
npx web-push generate-vapid-keys
```

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no ambiente do backend. Mantenha a chave privada somente no servidor.

O painel do salão inclui uma central de notificações com contador de itens não lidos e avisos toast enquanto estiver aberto. Os eventos são persistidos em `tb_notificacao_salao` e enviados por push aos dispositivos inscritos. A ativação por dispositivo fica no dashboard Premium e em Configurações.

O salão pode marcar um atendimento como **Realizado** desde 00h do dia anterior à data agendada, no horário de São Paulo. O cliente somente pode avaliar a partir do término previsto salvo na reserva, com status Realizado e uma avaliação por agendamento. Após reagendamento, vale o horário vigente; a duração preservada na reserva não é substituída por alterações posteriores no catálogo ou por serviços extras.

O convite para avaliar fica oculto até essa liberação, inclusive dos contadores e das marcações de leitura. O backend verifica os envios pendentes ao iniciar e a cada 30 segundos, sem depender do app aberto. Reservas de processamento interrompidas e falhas transitórias são retomadas após dois minutos; o aviso continua disponível na central mesmo sem dispositivo inscrito para push. O processo da API precisa permanecer ativo, como na configuração de PM2 descrita abaixo.

Para essa alteração, aplique **uma vez**, em bases existentes, `database/migracoes/2026-10-30-liberacao-avaliacoes.sql` **antes de publicar o backend** e depois publique o frontend. O histórico de notificações é preservado e não é reenviado. Instalações novas usam o `database/script.sql` atualizado e não devem executar essa migração adicional.

Em uma base existente, aplique `database/migracoes/2026-10-09-notificacoes-push.sql` e `database/migracoes/2026-10-09-central-notificacoes.sql` no MySQL. Em uma instalação nova, `database/script.sql` cria as tabelas necessárias.

O navegador e o sistema operacional precisam permitir notificações. Em produção, o site deve usar HTTPS; em desenvolvimento, `localhost` é aceito pelos navegadores.

## Agendamento de vários serviços e serviços adicionais

O cliente seleciona vários serviços na primeira etapa e depois escolhe profissional, data e horário para cada um, em cartões dentro do mesmo fluxo. A opção **Agendar em outro dia** permite repetir um serviço em datas diferentes. O mesmo serviço não pode ser reservado mais de uma vez por cliente no mesmo dia, mesmo com horários ou profissionais diferentes; reservas canceladas ou com ausência não impedem uma nova tentativa. A confirmação é integral: qualquer conflito impede a gravação de toda a lista. Os agendamentos confirmados continuam independentes para cancelar, reagendar, concluir e avaliar. A disponibilidade também considera os outros horários do cliente, inclusive em outras filiais. A lista em andamento fica no armazenamento de sessão do navegador, separada por filial, e é preservada durante o login.

Ao clicar em **Realizado**, o salão pode incluir serviços adicionais do catálogo da filial, com profissional habilitado e valor cobrado ajustável. Os adicionais aparecem no histórico e na receita realizada, atribuídos a seus serviços e profissionais. Eles não alteram o horário reservado nem a ocupação estimada; a avaliação continua vinculada ao serviço original.

### Atualizar uma instalação existente

1. Aplique a migração aditiva antes de publicar a aplicação:

   ```bash
   mysql -u agendeaki_user -p tccsalao < database/migracoes/2026-10-23-servicos-adicionais.sql
   ```

2. Publique o backend, que mantém a criação individual e acrescenta a confirmação em lote.
3. Gere e publique o frontend atualizado. A consulta antiga `/agendamentos/verificar-data` foi substituída por `/agendamentos/horarios`; atualize as duas aplicações na mesma janela de publicação.

A migração cria a tabela de adicionais e a view de serviços para os relatórios. Pode ser reaplicada e não converte os agendamentos antigos. O esquema inicial já inclui essas estruturas. O usuário de banco da migração precisa de permissão para criar tabelas e views; o usuário da aplicação precisa consultar a view.

### API

- `GET /api/clientes/agendamentos/horarios`: recebe `idUnidade`, `idServico`, `idFuncionario` (ou `qualquer`) e `data`; retorna horários livres para o cliente autenticado.
- `POST /api/clientes/agendamentos/lote`: recebe `{ idUnidade, itens: [{ idServico, idFuncionario, dataHoraInicio, observacao }] }`. Aceita de 1 a 50 itens com profissional confirmado. O início usa o formato local `YYYY-MM-DDTHH:mm:ss`, no fuso de São Paulo. Em caso de erro, retorna `mensagem`, `codigo` e, quando relacionado a um item, `indiceItem` começando em zero. O sucesso retorna `agendamentos` com os IDs e dados das reservas.
- `PATCH /api/salao/agendamentos/:idAgendamento/confirmar-atendimento`: aceita a lista opcional `servicosAdicionais: [{ idServico, idFuncionario, valorCobrado }]`, com até 50 extras. A omissão de `valorCobrado` usa o preço cadastrado. Os valores aceitam até duas casas decimais e não podem ser negativos. Uma conclusão repetida retorna conflito, sem duplicar extras nem notificações.
- As listagens de agendamentos acrescentam `servicosAdicionais` e `valorTotal`, mantendo `valor` como preço original da reserva.

## Filtros e paginação da agenda do salão

A aba Próximos da Agenda oferece **Todos**, **Hoje**, **Amanhã** e **Próximos 7 dias**, com datas no fuso de São Paulo. A janela de sete dias inclui hoje e os seis dias seguintes. Os filtros valem para a data agendada, incluindo reagendamentos. Próximos mantém os agendamentos ativos a partir de agora; Histórico reúne horários passados e atendimentos realizados, cancelados ou com ausência, sem filtros de datas futuras. O período selecionado em Próximos é preservado ao alternar as abas; ambas preservam seu tamanho de página e sua página.

`GET /api/salao/agendamentos` recebe `tipo` (`futuros`, padrão, ou `historico`), `periodo` (`todos`, padrão, `hoje`, `amanha` ou `7dias`), `pagina` (a partir de 1) e `porPagina` (10, padrão, 25 ou 50). Retorna `agendamentos`, `pagina`, `porPagina`, `total`, `totalPaginas`, `tipo` e `periodo`. Parâmetros inválidos retornam HTTP 400. A consulta é restrita ao salão autenticado, filtra e ordena antes de paginar, com desempate por ID. Próximos usa ordem crescente de horário e ID; Histórico usa ordem decrescente. Cada agendamento conta uma vez, mesmo com extras ou vários pagamentos. Extras e totais dos cartões são preservados.

Mudar o período ou o tamanho da página retorna à primeira página. Concluir, cancelar, reagendar ou criar atualiza a lista mantendo os controles; se a última página deixar de existir, a consulta retorna a última página válida. Carregamento, erro com nova tentativa e lista vazia têm estados próprios. Publicar o backend antes do frontend; esta mudança não exige migração.

A agenda do **cliente** também pagina Próximos horários e Histórico, com 10 registros por padrão e opções de 25 e 50. Cada lista preserva sua página e seu tamanho ao alternar. `GET /api/clientes/agendamentos/futuros` e `/historico` aceitam `pagina` e `porPagina` e retornam `agendamentos`, `pagina`, `porPagina`, `total` e `totalPaginas`; páginas além do fim são ajustadas. O Histórico aceita `localizar=<idAgendamento>` para abrir a página do atendimento indicado em uma notificação de avaliação. A busca respeita o cliente autenticado e retorna `localizado` para indicar se o atendimento foi encontrado. A consulta mantém os extras e o total em cada cartão, e ações como cancelamento e avaliação atualizam a página. `podeAvaliar` considera o status, o término previsto e a ausência de avaliação anterior. A agenda do salão retorna também `podeConcluir` e `conclusaoDisponivelEm`. Para os prazos de conclusão e avaliação, seguir a preparação da migração de notificações descrita acima e publicar o backend antes do frontend.

## Dashboard Premium e dados para BI

O painel Premium possui três abas: **Geral**, com indicadores e destaques; **Detalhado**, com gráficos, profissionais e clientes; e **Analítico**, com tabela paginada e ordenável. Os filtros de período, filial, serviço e profissional são compartilhados. Clicar em um indicador abre o recorte correspondente no Analítico.

No Analítico, **Visualizar por: Atendimento | Serviço** alterna a granularidade. **Atendimento** é a visão inicial, com os serviços agrupados em uma linha por atendimento. **Serviço** exibe uma linha por serviço reservado ou extra, identificando o tipo, o profissional e o valor daquele item; repetições do mesmo serviço permanecem separadas. Datas, cliente, status e pagamento continuam pertencendo ao atendimento. Trocar a visão mantém filtros e recorte e volta à primeira página, com ordenação por data agendada decrescente. A visão escolhida permanece ao alternar abas ou atualizar filtros.

Na aba Geral, **Serviços extras realizados** conta cada serviço adicional dos atendimentos concluídos no período, inclusive os gratuitos, pela data da confirmação e respeitando os filtros. Mostra a comparação com o período anterior. Um atendimento com dois extras soma dois serviços extras, mantendo um único atendimento. O mesmo indicador aparece no PDF completo.

Os três indicadores complementares também respeitam os filtros, comparam o período anterior e aparecem no PDF:

- **Total de serviços realizados:** conta o serviço reservado e cada extra, inclusive os gratuitos, pela data da confirmação. Ao clicar, abre `realizados` na visão por serviço.
- **Receita com serviços extras:** soma os valores efetivamente cobrados pelos extras realizados, pela data da confirmação. Ao clicar, abre `extras` na visão por serviço. O valor reservado não entra nessa receita.
- **Taxa de comparecimento:** realizados ÷ (realizados + não compareceram) × 100, ambos pela **data agendada**. Cada atendimento conta uma vez, mesmo com vários extras. Cancelados e agendamentos ainda sem confirmação ficam fora. Realizados antigos sem data de confirmação entram nessa taxa pela data agendada. Sem base, exibe **—**; a comparação usa pontos percentuais. Ao clicar, abre `comparecimento` na visão por atendimento, mostrando os registros usados no cálculo.

Ao clicar nesse indicador, o recorte `extras` mostra somente os atendimentos realizados com extras correspondentes aos filtros. Na visão por atendimento, a coluna **Extras** indica a quantidade e pode ser ordenada; o cabeçalho dos resultados informa o total de extras em todos os atendimentos do recorte, além da página aberta. Nesse recorte, serviços, profissionais, valores e exportações se referem somente aos itens adicionais.

**Data agendada** representa o último horário reservado, incluindo reagendamentos. **Realizado em** é a data/hora da confirmação em “Realizado”, no fuso `America/Sao_Paulo`; não representa uma data manual de execução. Dados antigos sem realização registrada permanecem vazios.

### Consulta e exportação

- `GET /api/salao/indicadores/premium/analitico`: recebe `dataInicio`, `dataFim`, `idUnidade`, `idServico`, `idFuncionario`, `recorte`, `visualizarPor` (`atendimento`, padrão, ou `servico`), `pagina`, `porPagina`, `ordenarPor` e `direcao`. Retorna `agendamentos`, `pagina`, `porPagina`, `total`, `totalPaginas`, `totalAtendimentos`, `recorte` e `visualizarPor`. `total` conta as linhas da visão; `totalAtendimentos` conta os atendimentos distintos. Na visão por serviço, cada linha contém `idLinha`, `tipoItem` (`ORIGINAL` ou `EXTRA`), `idExtra`, `idServico` e `idFuncionario`. São permitidos 25 (padrão), 50 ou 100 registros por página, aplicados aos itens antes de responder. Ordenação padrão: `dataInicio desc`, com desempate por ID de atendimento decrescente, reservado antes dos extras e ID do extra crescente; ausências ficam por último.
- Recortes: `todos` (cancelados pela data do cancelamento, demais pela data agendada), `agendamentos` (todos pela data agendada), `realizados` (pela confirmação), `extras` (realizados com extras correspondentes aos filtros, pela confirmação), `cancelados` (pelo cancelamento), `naoCompareceu` (pela data agendada), `comparecimento` (realizados e ausências pela data agendada) e `previstos` (ativos entre agora e os próximos 30 dias, independentemente do período geral). Cancelamentos sem data usam a data agendada. O resumo e sua comparação anterior retornam `quantidadeServicosExtras`, `quantidadeServicosRealizados`, `receitaServicosExtras`, `quantidadeComparecimentos`, `quantidadeNaoCompareceu` e `taxaComparecimento` (percentual numérico ou `null` quando não há base). Cada linha analítica retorna a quantidade de extras e a resposta inclui `totalServicosExtras` para todo o recorte.
- Campos ordenáveis: `idAgendamento`, `dataInicio`, `dataRealizacao`, `cliente`, `contato`, `servico`, `quantidadeServicosExtras`, `unidade`, `profissional`, `status`, `valor`, `statusPagamento`, `motivoCancelamento` e `origemCancelamento`; `tipoItem` também é permitido na visão por serviço. Direções: `asc` e `desc`. Valores, profissionais e serviços são ordenados pelos itens individuais na visão por serviço. Parâmetros inválidos retornam HTTP 400; as consultas exigem acesso Premium e restringem os dados ao salão autenticado.
- `GET /api/salao/indicadores/premium/analitico/exportar?formato=xlsx`: exporta um Excel com as abas Analítico, Filiais, Serviços e Profissionais. Inclui todos os registros do recorte e dos filtros, na ordenação escolhida, sem limite de páginas. A geração usa lotes de 500 agendamentos e uma leitura consistente entre os lotes. `formato=csv` (ou a ausência de formato) preserva a exportação CSV anterior para integrações existentes.
- `GET /api/salao/indicadores/premium?incluirAnalise=false`: carrega os indicadores sem a lista integral. O comportamento anterior é mantido quando o parâmetro é omitido. O PDF solicita a lista completa sob demanda e imprime indicadores, gráficos e tabela, independentemente da aba, recorte local ou página aberta.

### Importar o Excel em uma ferramenta de BI

**Exportar para Excel**, na aba Analítico, gera um único `.xlsx` com quatro abas, cabeçalhos congelados e filtros nas colunas:

- **Analítico:** uma linha por serviço reservado ou extra, com valores numéricos e identificadores como texto.
- **Filiais:** `id_unidade`, `filial` e `ativo` das filiais vinculadas aos registros exportados.
- **Serviços:** `id_servico`, `id_unidade`, `servico`, `valor_referencia`, `duracao_minutos` e `ativo` dos serviços presentes no Analítico.
- **Profissionais:** `id_funcionario`, `id_unidade`, `profissional` e `ativo` dos profissionais presentes no Analítico.

Relacione as abas por `id_unidade`, `id_servico` e `id_funcionario`. Os cadastros aparecem uma vez por ID, incluindo inativos vinculados ao histórico, e usam os nomes e dados atuais. Os nomes dos serviços e extras no Analítico preservam os dados históricos disponíveis. Somente os cadastros associados ao recorte são incluídos; filiais de vínculo dos cadastros também são incluídas para manter os relacionamentos, inclusive se um profissional mudou de filial.

Datas permanecem como texto ISO 8601 com `-03:00`, valores são números com duas casas decimais, IDs e telefones são texto, e ausências ficam vazias. Não há títulos, subtotais ou gráficos misturados às linhas. Um recorte vazio gera as quatro abas apenas com cabeçalhos. O arquivo é preparado temporariamente no servidor e removido após o download; se uma aba exceder o limite de 1.048.576 linhas do Excel, a API pede um recorte menor em vez de truncar os dados.

Cada linha é um serviço: o reservado (`tipo_item=ORIGINAL`) ou um extra (`tipo_item=EXTRA`). Os cabeçalhos são estáveis:

```text
id_agendamento;tipo_item;id_servico_adicional;id_usuario;id_cliente_salao;cliente;email;telefone;id_unidade;filial;id_servico;servico;id_funcionario;profissional;data_agendada;data_realizacao;data_cancelamento;status;status_pagamento;valor_item;motivo_cancelamento;detalhe_cancelamento;origem_cancelamento
```

Importe identificadores e telefone como texto. Os dois identificadores de cliente distinguem clientes da plataforma e clientes cadastrados pelo salão. O ID do extra fica vazio no serviço original. Para contar **atendimentos**, use a contagem distinta de `id_agendamento`; para calcular **receita realizada**, filtre `status=REALIZADO` e some `valor_item`. O status do pagamento é independente da realização. Não some quantidades de linhas como se fossem atendimentos e não há total do atendimento repetido nas linhas.

Filtrar serviço/profissional exporta somente os itens correspondentes; os valores de cada extra pertencem ao serviço e ao profissional daquela linha. O Excel mantém uma linha por serviço nas duas visões. Na visão por atendimento, os serviços seguem agrupados pela ordem dos atendimentos; na visão por serviço, o arquivo acompanha a ordenação dos itens, incluindo o tipo, sem expandir novamente cada atendimento. A paginação da tela não limita a exportação. O PDF completo mantém a visão por atendimento.

O CSV continua disponível pela API, com os mesmos campos do Analítico, UTF-8 com BOM, separador `;`, campos entre aspas e valores com ponto decimal. CSV não suporta múltiplas abas.

### Publicação e verificação

Esta melhoria não exige migração. Publique primeiro o backend com os novos endpoints e depois o frontend. Na pasta `frontend`, execute `npm run build` antes da publicação.

## Como rodar VPS

As instruções abaixo usam uma VPS Ubuntu/Debian com MySQL, Node.js 20.9 ou superior e npm instalados. O exemplo usa `agendeaki.seudominio.com` para o frontend e `api.agendeaki.seudominio.com` para a API; substitua pelos domínios configurados no DNS. Nginx e Certbot serão instalados na etapa de configuração do proxy.

### 1. Prepare o servidor e o banco

Configure os registros DNS dos dois domínios para o IP da VPS e permita tráfego nas portas **22**, **80** e **443**. Mantenha as portas da aplicação (`3000` e `3001`) acessíveis somente localmente.

Clone o repositório na VPS:

```bash
sudo mkdir -p /var/www/monorepo-agendeaki
sudo chown "$USER":"$USER" /var/www/monorepo-agendeaki
git clone <URL_DO_REPOSITORIO> /var/www/monorepo-agendeaki
```

Instale Nginx e Certbot:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crie o banco e um usuário MySQL com acesso local. Para uma base nova, importe o esquema a partir da raiz do repositório:

```bash
cd /var/www/monorepo-agendeaki
mysql -u root -p < database/script.sql
```

No MySQL, conceda acesso ao usuário que será configurado no `backend/.env`:

```sql
CREATE USER 'agendeaki_user'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT ALL PRIVILEGES ON tccsalao.* TO 'agendeaki_user'@'localhost';
FLUSH PRIVILEGES;
```

Se a aplicação já tiver dados, faça backup e aplique as migrações pendentes conforme a seção de atualização de base existente acima.

### 2. Publique o código e configure os ambientes

Crie `backend/.env` e `frontend/.env.local` usando os modelos:

```bash
cp /var/www/monorepo-agendeaki/backend/.env.example /var/www/monorepo-agendeaki/backend/.env
cp /var/www/monorepo-agendeaki/frontend/.env.example /var/www/monorepo-agendeaki/frontend/.env.local
```

Na VPS, use:

- `FRONTEND_URL=https://agendeaki.seudominio.com` no `backend/.env`;
- `NEXT_PUBLIC_API_URL=https://api.agendeaki.seudominio.com` no `frontend/.env.local`;
- `PORT=3001` e credenciais de produção para MySQL, Supabase, HERE e Stripe;
- `ASSINATURA_MODO_TESTE=false` para pagamentos reais;
- chaves `DOCUMENT_ENCRYPTION_KEY` e `DOCUMENT_HMAC_KEY` geradas separadamente e persistentes.

Configure também o webhook Stripe no Dashboard para `https://api.agendeaki.seudominio.com/api/webhooks/stripe` e os eventos listados na seção local do Stripe. Se usar notificações push, gere e configure as chaves VAPID no backend e aplique as duas migrações de notificações em uma base existente.

### 3. Instale dependências e gere o build

```bash
cd /var/www/monorepo-agendeaki/backend
npm ci

cd /var/www/monorepo-agendeaki/frontend
npm ci
npm run build
```

`NEXT_PUBLIC_API_URL` é incorporada ao build do frontend. Se alterar o domínio da API, gere o build novamente.

### 4. Mantenha os processos ativos com PM2

Instale PM2 uma vez no servidor e inicie cada aplicação em modo de produção:

```bash
npm install --global pm2

cd /var/www/monorepo-agendeaki/backend
pm2 start npm --name agendeaki-api -- start

cd /var/www/monorepo-agendeaki/frontend
pm2 start npm --name agendeaki-web -- start

pm2 save
pm2 startup
```

Execute o comando adicional exibido por `pm2 startup` para habilitar a inicialização automática após reinicializações. A API escuta em `3001` e o Next.js em `3000`.

### 5. Configure Nginx e HTTPS

Configure dois hosts Nginx que encaminhem para as portas locais. Salve os blocos abaixo em `/etc/nginx/sites-available/agendeaki`. Exemplo do host do frontend:

```nginx
server {
    listen 80;
    server_name agendeaki.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Crie um segundo bloco para a API:

```nginx
server {
    listen 80;
    server_name api.agendeaki.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative os hosts no Nginx, valide a configuração e emita certificados HTTPS com Certbot para os dois domínios:

```bash
sudo ln -s /etc/nginx/sites-available/agendeaki /etc/nginx/sites-enabled/agendeaki
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d agendeaki.seudominio.com -d api.agendeaki.seudominio.com
```

Depois, confira `https://api.agendeaki.seudominio.com/saude`, acesse o frontend e verifique os logs com `pm2 logs`.

### Atualizações futuras

Faça backup do banco antes de cada atualização. Baixe a nova versão do código, aplique apenas as migrações necessárias, instale dependências com `npm ci`, gere novamente o build do frontend e reinicie os processos:

```bash
pm2 restart agendeaki-api
pm2 restart agendeaki-web
```

Não substitua as chaves de proteção de documentos ao atualizar o código. Preserve os arquivos `.env` fora do controle de versão e mantenha cópias seguras das chaves e dos backups.

---

Feito com foco em tornar o agendamento de serviços de beleza mais simples para clientes e salões.

## Correções da revisão de código — 28/10/2026

As correções dos itens 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14 e 15 estão descritas em [CHANGELOG.md](CHANGELOG.md). Os itens 1 (migrações legadas), 5 (restrição de destinos push) e 10 (edição em outro fuso) ficaram fora do escopo por decisão do projeto.

### Restaurar contas após recriar o MySQL

A autorização usa o perfil e a situação do usuário no MySQL, vinculados ao identificador autenticado pelo Supabase. O campo editável `user_metadata.perfil` não concede acesso. Depois de recriar manualmente a base com `database/script.sql`, a restauração ocorre automaticamente no próximo login válido, inclusive em produção.

O login de uma identidade Supabase válida sem cadastro local cria o perfil local na área escolhida (cliente ou salão) e abre **Completar cadastro**. A pessoa informa os dados ausentes e aceita os documentos legais. Não é necessário apagar a identidade Supabase nem preparar metadados para contas antigas. O primeiro perfil local criado para o UID determina a área dessa conta; um perfil confiável já definido no Supabase também precisa corresponder à área escolhida. Situações inativas registradas em metadados confiáveis e operações de exclusão ainda registradas no MySQL impedem a restauração.

O fluxo recria apenas o perfil local; não restaura salões, filiais, assinaturas nem histórico apagado. Recriar o banco também remove as restrições que existiam somente no MySQL, como registros de exclusão pendente.

Nenhuma migração de base antiga é fornecida nesta entrega.

Recriar o MySQL não cancela recursos Stripe. Concilie ou encerre os recursos descartáveis no sandbox antes de apagar suas referências locais. Os scripts desta entrega não recriam automaticamente a base da aplicação.

### Assinaturas, cancelamento e exclusão

- O checkout é reservado sob bloqueio do salão no MySQL e criado no Stripe com referência e parâmetros estáveis. Repetições recuperam a mesma contratação; uma preparação concorrente retorna `409` com `CHECKOUT_EM_PREPARACAO`.
- O status da assinatura pode reconciliar um checkout cujo ID ainda não tenha sido persistido. Erros de comunicação mantêm a pendência; não liberam automaticamente uma segunda contratação. Sem ID conhecido e após 24 horas, a API retorna `CHECKOUT_REQUER_CONCILIACAO` em vez de arriscar recriar um checkout cuja chave de idempotência possa ter expirado. Concilie a referência no Stripe antes de prosseguir.
- Assinaturas em dia ou em teste mantêm o cancelamento no fim do ciclo. Assinaturas inadimplentes, pausadas ou incompletas são encerradas imediatamente, sem reembolso automático nem fatura proporcional final. Faturas já emitidas não são apagadas ou perdoadas pela aplicação.
- Excluir a conta do salão encerra imediatamente todos os recursos Stripe vinculados antes de remover os dados locais e a identidade Supabase. A operação registra etapas persistentes e bloqueia novas contratações e restauração da conta durante a exclusão.
- `GET /api/salao/conta/exclusao` consulta a etapa; repetir `DELETE /api/salao/conta` retoma a operação. Falhas parciais retornam `EXCLUSAO_PENDENTE`, `etapa` e `cobrancaEncerrada`. Cobranças já encerradas não são reativadas.
- Se a identidade já não permitir entrar, o operador pode retomar exclusões previamente solicitadas pelo comando abaixo. Ele simula por padrão e só executa com `--aplicar`.

```bash
cd backend
npm run retomar:exclusoes
npm run retomar:exclusoes -- --aplicar
```

As referências mínimas das operações de exclusão são preservadas fora das exclusões em cascata para permitir retomada e reconhecer eventos Stripe atrasados de assinaturas já encerradas. Nenhum token é gravado nesse registro.

### Sessões e notificações do dispositivo

As sessões administrativas continuam durando oito horas, mas agora dependem de um registro revogável no MySQL. Logout revoga a sessão atual; alterar e-mail, senha ou segredo administrativo invalida as sessões anteriores. Tokens são armazenados somente como hash.

O logout do salão utiliza `/api/saloes/logout`. Cliente, salão e administrador podem sair localmente quando a API estiver indisponível; a interface informa que não houve confirmação do encerramento remoto.

Os avisos push do sistema operacional exibem **“Você tem uma nova atualização.”** Os detalhes continuam na central autenticada. Inscrições recebem um vínculo por destinatário/dispositivo; o service worker persiste os identificadores em IndexedDB e descarta mensagens antigas ou de outra conta. Ao sair, trocar de conta ou excluir o cadastro, o vínculo local é removido. A remoção no servidor exige o vínculo correspondente e a desativação de uma área preserva a inscrição compartilhada quando a outra área ainda estiver vinculada.

Publique backend, frontend e service worker compatíveis; após a atualização, registre novamente o dispositivo se o painel solicitar e verifique a entrega de notificações em navegador e dispositivo reais.

### Agenda e indicadores

A edição da jornada e do expediente utiliza os mesmos bloqueios transacionais das reservas. Uma alteração que deixe um atendimento ativo, inclusive em andamento, fora do expediente retorna `409`.

A taxa de cancelamento considera a data agendada e conta cada atendimento uma vez:

```text
cancelados elegíveis / atendimentos elegíveis × 100
```

São elegíveis os atendimentos do período cujo horário já começou ou cujo status é cancelado. Sem base, a taxa é `null` e a interface mostra **—**. O período anterior segue a mesma regra. O card usa o recorte `taxaCancelamento` no Analítico; os indicadores, insights e PDF usam o valor calculado pela API. O contador operacional de cancelamentos por data de cancelamento é preservado separadamente. A distribuição de status usa somente a data agendada.

O detalhe do motivo de bloqueio permanece limitado a 200 caracteres; a coluna do motivo completo comporta 300 caracteres, preservando o prefixo e a mensagem da central sem truncamento.

### Build do frontend

Para gerar o build de produção:

```bash
cd frontend
npm run build
```

### Coleção da API

A coleção Postman utiliza variáveis separadas por perfil, dados fictícios e data de agendamento futura. Configure seus identificadores, horários disponíveis, e-mails e tokens no ambiente Postman.
