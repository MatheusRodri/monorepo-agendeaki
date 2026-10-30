# Agende Aki

## Objetivo

O **Agende Aki** conecta clientes a salões de beleza e centraliza a gestão de agendamentos. Clientes podem encontrar salões próximos, consultar serviços e profissionais, reservar horários e avaliar atendimentos. Os salões podem gerenciar filiais, serviços, equipes, disponibilidade, clientes e agenda.

A plataforma também oferece páginas públicas de agendamento por filial, planos de assinatura, promoções, notificações e relatórios com exportação de dados. O painel administrativo global fica em `/admin`.

## Requisitos

- **Git**, para obter o código do repositório.
- **Node.js 22 ou superior** e **npm**. O lockfile do backend inclui pacotes Supabase que exigem Node.js 22; o mínimo do Next.js isoladamente não atende ao projeto inteiro. Recomenda-se **Node.js 24 LTS**, usando a mesma versão no desenvolvimento e na VPS. Consulte as [versões do Node.js](https://nodejs.org/en/about/previous-releases).
- **MySQL Server 8.0 ou superior** e o cliente de linha de comando `mysql`.
- Projeto no **Supabase**, com autenticação por e-mail e senha e as chaves pública e secreta.
- Chaves da **HERE**, para mapas no navegador e geocodificação no backend.
- Conta **Stripe**, para testar ou receber pagamentos de assinatura. O desenvolvimento sem checkout pode usar `ASSINATURA_MODO_TESTE=true`.
- Chaves **VAPID**, opcionais, para envio de notificações push.

Para hospedar, também são necessários uma VPS Linux com acesso administrativo e SSH, CloudPanel v2, domínio e acesso ao DNS. Os requisitos da VPS estão na seção de hospedagem.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Front-end | Next.js 16, React 19, JavaScript, CSS, Axios, MapLibre GL e React Toastify |
| Back-end | Node.js, Express 5, Sequelize 6, mysql2 e CORS |
| Banco de dados | MySQL 8 |
| Autenticação | Supabase Auth |
| Pagamentos de assinatura | Stripe |
| Mapas e geocodificação | HERE Maps |
| Notificações | Web Push, VAPID e service worker |
| Exportação de relatórios | ExcelJS, CSV e impressão em PDF pelo navegador |
| Hospedagem descrita neste guia | VPS Linux, CloudPanel v2, Nginx e PM2 |

## Estrutura do projeto

```text
monorepo-agendeaki/
├── frontend/
│   ├── app/                       # Páginas, rotas e layouts do Next.js
│   ├── components/                # Componentes da interface
│   ├── public/                    # Arquivos estáticos e service worker
│   ├── scripts/                   # Preparação do worker do MapLibre
│   ├── utils/                     # Integração com a API e utilitários
│   ├── .env.example               # Modelo de configuração do front-end
│   └── package.json               # Dependências e comandos do front-end
├── backend/
│   ├── conteudo/                  # Termos de uso e política de privacidade
│   ├── src/
│   │   ├── configuracoes/         # Conexões com MySQL e Supabase
│   │   ├── rotas/                 # Endpoints da API
│   │   ├── servicos/              # Regras de negócio e integrações
│   │   └── servidor.js            # Inicialização da API Express
│   ├── .env.example               # Modelo de configuração do back-end
│   ├── agendeaki.postman_collection.json
│   └── package.json               # Dependências e comandos do back-end
├── database/
│   ├── migracoes/                 # Alterações pontuais para bases existentes
│   └── script.sql                 # Esquema para uma instalação nova
├── Diagramas/                     # Fontes dos diagramas em PlantUML
├── out/Diagramas/                 # Diagramas renderizados
├── template/                      # Modelos de e-mail do Supabase
└── README.md
```

As dependências são instaladas separadamente em `backend` e `frontend`; não há um `package.json` na raiz para iniciar as duas aplicações juntas.

## Como rodar localmente (Windows, Linux e Mac)

### 1. Prepare o sistema e obtenha o projeto

Instale Git, Node.js e MySQL nas versões indicadas em **Requisitos**. Mantenha o serviço MySQL iniciado e o executável `mysql` disponível no `PATH` do terminal.

#### Windows

Use o **PowerShell**. Instale Git, Node.js e MySQL pelos instaladores dos respectivos projetos e abra um novo terminal após a instalação. Caso `mysql` não seja reconhecido, adicione a pasta `bin` da instalação do MySQL ao `PATH`.

```powershell
git clone https://github.com/MatheusRodri/monorepo-agendeaki.git
cd monorepo-agendeaki
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

#### Linux

Use Bash ou um terminal equivalente. Instale Git e MySQL pelo gerenciador de pacotes da distribuição e Node.js na versão indicada em **Requisitos**; confira a versão fornecida pela distribuição antes de utilizá-la.

```bash
git clone https://github.com/MatheusRodri/monorepo-agendeaki.git
cd monorepo-agendeaki
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

#### Mac (macOS)

Use o **Terminal**, com Zsh ou Bash. Instale Git, Node.js e MySQL pelos instaladores oficiais ou por um gerenciador de pacotes, como Homebrew, respeitando as versões indicadas em **Requisitos**.

```bash
git clone https://github.com/MatheusRodri/monorepo-agendeaki.git
cd monorepo-agendeaki
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Se já tiver o repositório, entre na pasta dele e crie somente os arquivos de ambiente que ainda não existirem. Os comandos das próximas etapas funcionam nos três sistemas, exceto quando houver indicação específica.

Confira as ferramentas:

```text
git --version
node --version
npm --version
mysql --version
```

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd` no lugar de `npm` nos comandos deste guia.

### 2. Configure as variáveis de ambiente

Edite `backend/.env` e `frontend/.env.local`, substituindo os valores de exemplo. Não versione esses arquivos nem compartilhe suas chaves. Atenção: o `.gitignore` atual não cobre `frontend/.env.local`.

**Back-end — `backend/.env`:**

| Variável | Configuração |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT` | Localmente, `localhost` e `3306` |
| `MYSQL_USER`, `MYSQL_PASSWORD` | Usuário e senha que serão criados na etapa do banco |
| `MYSQL_DATABASE` | `tccsalao`, nome utilizado pelo esquema SQL |
| `DOCUMENT_ENCRYPTION_KEY` | Chave aleatória de 32 bytes, em base64, para cifrar CPF/CNPJ |
| `DOCUMENT_HMAC_KEY` | Outra chave aleatória de 32 bytes, em base64, para indexar documentos |
| `PORT` | `3001` |
| `FRONTEND_URL` | `http://localhost:3000`; também determina a origem permitida pelo CORS |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | URL e chave pública do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta do Supabase, exclusiva do servidor |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Credenciais e nome do administrador global; preencha para habilitar `/admin` |
| `ADMIN_SESSION_SECRET` | Segredo aleatório de pelo menos 32 bytes para as sessões administrativas |
| `HERE_API_KEY` | Chave HERE para geocodificação no servidor |
| `ASSINATURA_MODO_TESTE` | `true` para ativação local de Premium sem checkout; `false` para usar Stripe |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Chave Stripe e segredo do webhook, necessários ao fluxo de pagamentos |
| `STRIPE_PRICE_ID_MENSAL`, `STRIPE_PRICE_ID_ANUAL` | IDs dos preços recorrentes configurados no Stripe |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Configuração opcional de push; o assunto pode ser `mailto:seu-email@seudominio.com` |

`DATABASE_URL` está presente no modelo, mas a conexão atual usa as variáveis `MYSQL_*`.

Gere cada chave documental separadamente com o comando abaixo, compatível com os três sistemas:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Execute-o duas vezes e copie um resultado para cada variável. Para `ADMIN_SESSION_SECRET`, execute novamente usando `randomBytes(48)`. Guarde as chaves documentais junto à estratégia de backup: substituir ou perder as chaves compromete a leitura e a identificação dos documentos já gravados.

**Front-end — `frontend/.env.local`:**

| Variável | Configuração |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001`, sem acrescentar `/api` |
| `NEXT_PUBLIC_HERE_API_KEY` | Chave HERE do navegador, com restrições aos domínios utilizados |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Valores públicos previstos no modelo; a autenticação atual passa pelo back-end |
| `NEXT_PUBLIC_MANUTENCAO` | `false` para disponibilizar a aplicação |

Variáveis `NEXT_PUBLIC_*` são públicas. Mantenha chaves secretas do Supabase e Stripe, senhas, chaves documentais e a chave privada VAPID exclusivamente no back-end.

No Supabase, configure a **Site URL** como `http://localhost:3000` e autorize os redirecionamentos `http://localhost:3000/cliente/redefinir-senha` e `http://localhost:3000/salao/redefinir-senha`. Configure também o envio de e-mails; os modelos estão em `template/`. Consulte a [configuração de URLs do Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls).

### 3. Prepare o banco de dados

Para uma **instalação nova**, execute a partir da raiz do repositório:

```bash
mysql -u root -p --execute="SOURCE database/script.sql"
```

Esse formato também funciona no PowerShell. Se a instalação Linux autenticar o administrador do MySQL pelo usuário do sistema, use `sudo mysql --execute="SOURCE database/script.sql"`.

O script cria o banco `tccsalao`, tabelas, views e gatilhos. A conta que executa a importação precisa de permissão para criar essas estruturas. Abra o cliente MySQL como administrador e crie a conta da aplicação, substituindo a senha pela mesma configurada em `backend/.env`:

```sql
CREATE USER 'agendeaki_user'@'localhost' IDENTIFIED BY 'SUBSTITUA_POR_UMA_SENHA_FORTE';
GRANT ALL PRIVILEGES ON tccsalao.* TO 'agendeaki_user'@'localhost';
```

Se esse usuário já existir, utilize suas credenciais ou ajuste-as administrativamente. O esquema inicial não cria contas de acesso à aplicação; faça o cadastro pela interface.

Para uma **base existente**, faça backup e consulte a subseção de atualização do banco na hospedagem. Não recrie o banco nem reaplique todos os scripts indiscriminadamente.

### 4. Instale as dependências

A partir da raiz do repositório:

```bash
cd backend
npm ci
cd ../frontend
npm ci
cd ..
```

`npm ci` utiliza os arquivos `package-lock.json` versionados em cada aplicação.

### 5. Inicie o back-end e o front-end

Abra dois terminais na raiz do repositório e mantenha ambos em execução.

**Terminal 1 — back-end:**

```bash
cd backend
npm run dev
```

**Terminal 2 — front-end:**

```bash
cd frontend
npm run dev
```

| Serviço | Endereço local |
| --- | --- |
| Interface | [http://localhost:3000](http://localhost:3000) |
| API | [http://localhost:3001](http://localhost:3001) |
| Saúde da API | [http://localhost:3001/saude](http://localhost:3001/saude) |
| Painel administrativo | [http://localhost:3000/admin](http://localhost:3000/admin) |

A rota `/saude` responde `{"status":"online"}`. O servidor valida as chaves documentais e a conexão com o MySQL antes de começar a escutar. Essa rota não verifica as integrações externas.

### 6. Configure recursos opcionais

**Pagamentos:** crie no Stripe preços recorrentes em BRL de **R$ 50,00 por mês** e **R$ 400,00 por ano**. Preencha as variáveis Stripe com credenciais de teste e mantenha `ASSINATURA_MODO_TESTE=false`. Com o Stripe CLI instalado, execute `stripe login` e, em outro terminal:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3001/api/webhooks/stripe
```

Copie o segredo `whsec_...` mostrado pelo CLI para `STRIPE_WEBHOOK_SECRET` e reinicie o back-end. Mantenha o CLI aberto durante o teste. Para desenvolver sem checkout, use `ASSINATURA_MODO_TESTE=true` apenas no ambiente local.

**Notificações push:** na pasta `backend`, gere as chaves:

```bash
npx web-push generate-vapid-keys
```

Preencha as variáveis VAPID e reinicie a API. Ative as notificações na interface e conceda a permissão no navegador. Push exige HTTPS em produção; `localhost` pode ser usado no desenvolvimento. O processador de convites de avaliação depende da API em execução contínua.

**Build de produção local:** na pasta `frontend`, execute `npm run build` e depois `npm start`, mantendo a API ativa em outro terminal e encerrando o servidor de desenvolvimento que utiliza a mesma porta. A coleção em `backend/agendeaki.postman_collection.json` pode ser importada no Postman para explorar a API com dados e tokens próprios.

## Como hospedar na VPS usando o CloudPanel

Neste guia, **front-end, back-end e MySQL ficam na mesma VPS**. Supabase Auth, HERE e Stripe continuam sendo serviços externos. Substitua os domínios, usuários e senhas de exemplo pelos seus valores.

### 1. Prepare a VPS e o CloudPanel

Utilize uma VPS com sistema suportado, como Ubuntu 24.04 ou Debian 12, e instale o CloudPanel v2 escolhendo **MySQL 8**. Siga o [guia oficial de instalação](https://www.cloudpanel.io/docs/v2/getting-started/other/), que inclui a verificação do instalador. O painel exige ao menos 1 núcleo, 2 GB de RAM e 10 GB de disco; esses valores são mínimos do painel, e o build do Next.js e a carga da aplicação exigem dimensionamento adicional. Consulte os [requisitos do CloudPanel](https://www.cloudpanel.io/docs/v2/requirements/).

Configure os registros DNS do tipo **A** para o IP público da VPS:

| Domínio de exemplo | Destino |
| --- | --- |
| `agendeaki.seudominio.com` | Front-end |
| `api.agendeaki.seudominio.com` | Back-end |

Permita HTTP/HTTPS nas portas `80` e `443`, acesso SSH na porta configurada e acesso administrativo ao CloudPanel (`8443`) restrito aos IPs de administração. Mantenha `3000`, `3001` e `3306` bloqueadas para acesso externo, inclusive no firewall do provedor. A API atual escuta sem restringir o endereço de rede; o firewall é necessário para impedir acesso direto à porta.

### 2. Crie os sites do front-end e do back-end

No CloudPanel, em **Sites → Add Site → Create a Node.js Site**, crie dois sites com estes valores. Consulte a [documentação de criação de sites](https://www.cloudpanel.io/docs/v2/frontend-area/add-site/).

| Campo | Front-end | Back-end |
| --- | --- | --- |
| Domain Name | `agendeaki.seudominio.com` | `api.agendeaki.seudominio.com` |
| Node.js Version | `24 LTS` | `24 LTS` |
| App Port | `3000` | `3001` |
| Site User de exemplo | `agendeaki-web` | `agendeaki-api` |

O Nginx gerenciado pelo painel encaminha as requisições para cada processo Node.js. Confira o destino no **Vhost** de cada site: front-end para `http://127.0.0.1:3000` e back-end para `http://127.0.0.1:3001`. Ajustes devem ser feitos pelo [editor de Vhost do CloudPanel](https://www.cloudpanel.io/docs/v2/frontend-area/vhost/).

O front-end é executado com `next start` após o build. Use o tipo Node.js para os dois sites. A criação dos sites configura o proxy; os processos serão iniciados com PM2 nas etapas seguintes.

### 3. Publique o código nos usuários dos sites

Entre por SSH com cada **Site User**, confira a versão do Node.js e clone o repositório separadamente:

```bash
ssh agendeaki-api@IP_DA_VPS
node --version
npm --version
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/MatheusRodri/monorepo-agendeaki.git
```

Em outra sessão, repita para o usuário do front-end:

```bash
ssh agendeaki-web@IP_DA_VPS
node --version
npm --version
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/MatheusRodri/monorepo-agendeaki.git
```

Os comandos seguintes usam `~/apps/monorepo-agendeaki` dentro da conta correspondente. O código fica fora do diretório público `htdocs`; o acesso HTTP ocorre pelo proxy para Node.js. Cada usuário executará somente a aplicação correspondente ao seu site. Se o repositório exigir autenticação, configure acesso de leitura para esses usuários.

### 4. Configure o banco de dados na VPS

No site do **back-end**, abra **Databases → Add Database** e crie o banco `tccsalao` com o usuário `agendeaki_user` e uma senha forte. Utilize o MySQL local. Consulte o [gerenciamento de bancos no CloudPanel](https://www.cloudpanel.io/docs/v2/frontend-area/databases/).

Na sessão SSH do usuário `agendeaki-api`, para uma instalação nova:

```bash
cd ~/apps/monorepo-agendeaki
mysql -h localhost -u agendeaki_user -p tccsalao --execute="SOURCE database/script.sql"
```

O nome precisa corresponder ao `CREATE DATABASE` e ao `USE tccsalao` presentes no script. A conta de importação precisa criar tabelas, views e gatilhos; se houver restrição de privilégios, solicite a importação ao administrador do MySQL. Configure o back-end com a conta criada no painel, sem usar o administrador do banco na aplicação.

Para transportar uma instalação existente, restaure um backup compatível e preserve suas chaves documentais, em vez de importar o esquema inicial. Para exportar um banco pelo CloudPanel, execute como usuário do site, salvando o arquivo fora dos diretórios públicos:

```bash
mkdir -p ~/backups
clpctl db:export --databaseName=tccsalao --file="$HOME/backups/tccsalao-antes-atualizacao.sql.gz"
```

Utilize um nome diferente para cada backup. Para importar um dump com `clpctl db:import`, siga o guia de bancos citado acima e confirme o destino antes de sobrescrever dados.

#### Atualização de uma base existente

Faça backup, interrompa gravações e compare o esquema existente com a versão que será publicada. Os arquivos de `database/migracoes/` são alterações pontuais; não há um executor automático nem garantia de que todos possam ser reaplicados. O esquema inicial usa `IF NOT EXISTS`, mas não atualiza automaticamente as tabelas que já existem.

- **Documentos legados:** a conversão de documentos em texto simples para o formato protegido exige um procedimento específico para a base existente. Remova as colunas antigas com `2026-10-09-remover-documentos-legados.sql` somente depois de validar a conversão e retirar os processos antigos. Essa última etapa apaga os documentos em texto simples.
- **Notificações e agenda:** revise as migrações de push, central de notificações e avaliações de `2026-10-09`, as de realização e notificações do cliente de `2026-10-11` e as de motivos de cancelamento e tipos de notificação de `2026-10-12`, conforme o estado da base.
- **Painel administrativo:** aplique `2026-10-22-painel-administrativo.sql` quando pendente. Sessões administrativas revogáveis e operações persistentes de exclusão também precisam das estruturas atuais de `database/script.sql`; os arquivos de migração legados não cobrem todas as diferenças de versões antigas.
- **Serviços adicionais:** aplique `2026-10-23-servicos-adicionais.sql` antes da atualização das aplicações. A migração também cria a view utilizada pelos relatórios.
- **Promoções:** aplique `2026-10-29-promocoes-servicos.sql` uma vez, antes do back-end e do front-end que utilizam promoções.
- **Liberação de avaliações:** aplique `2026-10-30-liberacao-avaliacoes.sql` uma vez, antes de publicar o back-end. A migração preserva o histórico sem reenviar notificações antigas.

Instalações novas já recebem essas estruturas pelo `database/script.sql` e não devem executar as migrações adicionais.

### 5. Configure e inicie o back-end

Na sessão do usuário `agendeaki-api`:

```bash
cd ~/apps/monorepo-agendeaki/backend
cp .env.example .env
chmod 600 .env
npm ci
```

Edite `.env` com as variáveis da seção local, usando as configurações de produção:

```dotenv
PORT=3001
FRONTEND_URL=https://agendeaki.seudominio.com
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=agendeaki_user
MYSQL_DATABASE=tccsalao
ASSINATURA_MODO_TESTE=false
```

Preencha também `MYSQL_PASSWORD`, chaves documentais, Supabase, HERE, Stripe e, se utilizados, administrador e VAPID. Preserve as chaves originais ao migrar um banco. Inicie a API com PM2:

```bash
npm install --global pm2
pm2 start npm --name agendeaki-api -- start
pm2 save
curl --fail http://127.0.0.1:3001/saude
```

O processo precisa permanecer ativo também para processar convites de avaliação. Use `pm2 logs agendeaki-api` para investigar falhas.

### 6. Configure e inicie o front-end

Na sessão do usuário `agendeaki-web`:

```bash
cd ~/apps/monorepo-agendeaki/frontend
cp .env.example .env.local
chmod 600 .env.local
```

Edite `.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=https://api.agendeaki.seudominio.com
NEXT_PUBLIC_HERE_API_KEY=SUBSTITUA_PELA_CHAVE_PUBLICA_HERE
NEXT_PUBLIC_MANUTENCAO=false
```

Os demais valores públicos do modelo podem ser preenchidos conforme a seção local. Instale as dependências, gere o build e inicie o servidor:

```bash
npm ci
npm run build
npm install --global pm2
pm2 start npm --name agendeaki-web -- start -- --hostname 127.0.0.1 --port 3000
pm2 save
curl --fail --head http://127.0.0.1:3000
```

As variáveis `NEXT_PUBLIC_*` são incorporadas ao build. Alterar o domínio da API ou a chave pública HERE exige gerar outro build e reiniciar o front-end.

### 7. Habilite reinicialização automática e HTTPS

Configure a recuperação dos processos **para cada Site User**. Na sessão de cada usuário, execute `pm2 save`, obtenha o caminho com `printenv PATH` e abra `crontab -e`. Adicione as linhas abaixo, substituindo o marcador pelo caminho completo retornado para aquele usuário:

```cron
PATH=COLE_AQUI_O_PATH_COMPLETO_DESTE_USUARIO
@reboot pm2 resurrect
```

O PM2 utiliza configurações próprias por usuário. Salve e configure a recuperação de `agendeaki-api` na conta da API e de `agendeaki-web` na conta do front-end. Confira `pm2 status` após uma reinicialização planejada. Esse procedimento segue o [deploy com PM2 do CloudPanel](https://www.cloudpanel.io/docs/v2/nodejs/deployment/pm2/).

Em cada site, abra **SSL/TLS → Actions → New Let's Encrypt Certificate**, informe o domínio correspondente e emita o certificado. O DNS precisa apontar para a VPS. Consulte a [documentação de certificados do CloudPanel](https://www.cloudpanel.io/docs/v2/frontend-area/tls/).

### 8. Ajuste as integrações e valide a publicação

- **Supabase:** atualize a Site URL para `https://agendeaki.seudominio.com` e autorize as URLs HTTPS de `/cliente/redefinir-senha` e `/salao/redefinir-senha`. Valide confirmação de e-mail e recuperação de senha.
- **HERE:** restrinja a chave pública ao domínio do front-end e valide mapa e geocodificação.
- **Stripe:** utilize credenciais e preços de produção. Cadastre o endpoint `https://api.agendeaki.seudominio.com/api/webhooks/stripe` com os mesmos eventos listados no comando local do Stripe CLI. Configure no back-end o segredo desse endpoint, que é diferente do segredo do CLI.
- **Push:** configure VAPID, conceda permissão no navegador e teste a entrega em dispositivo real com HTTPS.

Confira `https://api.agendeaki.seudominio.com/saude`, abra o front-end e valide login, cadastro, agendamento e, quando habilitados, `/admin` e pagamentos. Examine `pm2 status` e os logs dentro da conta de cada aplicação. CORS depende de `FRONTEND_URL` corresponder à origem acessada no navegador.

### 9. Atualizações e manutenção

Faça backup do banco, dos arquivos de configuração e das chaves. Em cada conta de site, atualize o clone para a mesma versão aprovada do código. Aplique somente as migrações necessárias antes de publicar as aplicações, conforme suas instruções.

**Back-end — usuário `agendeaki-api`:**

```bash
cd ~/apps/monorepo-agendeaki/backend
npm ci
pm2 restart agendeaki-api
pm2 save
```

**Front-end — usuário `agendeaki-web`:**

```bash
cd ~/apps/monorepo-agendeaki/frontend
npm ci
npm run build
pm2 restart agendeaki-web
pm2 save
```

Publique o back-end antes do front-end e valide os fluxos afetados. Para versões que alteram contratos entre as aplicações, programe uma janela de manutenção. As alterações feitas no diretório em uso, incluindo `npm ci` e o build, podem causar indisponibilidade temporária.

Preserve as configurações e chaves nas atualizações. Mantenha cópias de backup fora da VPS e verifique periodicamente se podem ser restauradas.
