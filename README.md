# AgendeAki

> Uma plataforma para aproximar clientes e salões, simplificando a descoberta de serviços e o agendamento de horários.

## Objetivo

O **AgendeAki** centraliza a rotina de agendamentos de salões de beleza. Clientes podem encontrar salões próximos, consultar serviços, agendar horários e acompanhar seus atendimentos. Administradores podem gerenciar unidades, serviços, funcionários, disponibilidade e agendamentos em um só lugar.

O sistema também oferece páginas públicas de agendamento por filial, autenticação para clientes e salões, pagamentos de assinatura e notificações para administradores.

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

O script cria o banco `tcc_salao` e suas tabelas. Para uma base existente, faça backup e aplique as migrações pendentes em `database/migracoes/`; não use o script inicial como substituto de uma migração.

Crie também o usuário local configurado no `backend/.env` (ou ajuste as variáveis para uma conta MySQL existente):

```sql
CREATE USER 'agendeaki_user'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT ALL PRIVILEGES ON tcc_salao.* TO 'agendeaki_user'@'localhost';
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
mysql -u agendeaki_user -p tcc_salao < database/migracoes/2026-10-22-painel-administrativo.sql
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

Crie os preços recorrentes em BRL no Stripe, preencha os IDs no `backend/.env` e mantenha `ASSINATURA_MODO_TESTE=false`. Instale o Stripe CLI e autentique a máquina uma vez com `stripe login`. Com o backend rodando na porta `3001`, abra outro terminal e encaminhe os eventos para a API local:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3001/api/webhooks/stripe
```

Deixe o terminal do Stripe CLI aberto enquanto testa. Copie o `whsec_...` exibido pelo CLI para `STRIPE_WEBHOOK_SECRET` em `backend/.env` e reinicie o backend se alterar esse valor. O segredo é sensível: não o versione nem compartilhe. Para desenvolvimento sem checkout, use `ASSINATURA_MODO_TESTE=true`.

Em produção, configure no Dashboard Stripe o endpoint HTTPS `https://api.agendeaki.seudominio.com/api/webhooks/stripe` (substitua pelo seu domínio) para os mesmos eventos listados no comando acima.

### 7. Notificações push (opcional)

O envio usa Web Push com chaves VAPID. Gere um par com:

```bash
cd backend
npx web-push generate-vapid-keys
```

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no ambiente do backend. Mantenha a chave privada somente no servidor.

O painel do salão inclui uma central de notificações com contador de itens não lidos e avisos toast enquanto estiver aberto. Os eventos são persistidos em `tb_notificacao_salao` e enviados por push aos dispositivos inscritos. A ativação por dispositivo fica no dashboard Premium e em Configurações.

Em uma base existente, aplique `database/migracoes/2026-10-09-notificacoes-push.sql` e `database/migracoes/2026-10-09-central-notificacoes.sql` no MySQL. Em uma instalação nova, `database/script.sql` cria as tabelas necessárias.

O navegador e o sistema operacional precisam permitir notificações. Em produção, o site deve usar HTTPS; em desenvolvimento, `localhost` é aceito pelos navegadores.

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
GRANT ALL PRIVILEGES ON tcc_salao.* TO 'agendeaki_user'@'localhost';
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
