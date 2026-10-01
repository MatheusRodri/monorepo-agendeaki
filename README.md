# AgendeAki

> Uma plataforma para aproximar clientes e salões, simplificando a descoberta de serviços e o agendamento de horários.

## Objetivo

O **AgendeAki** centraliza a rotina de agendamentos de salões de beleza. Clientes podem localizar salões, consultar serviços e acompanhar seus horários; administradores de salão podem organizar unidades, serviços, funcionários e atendimentos em um só lugar.

## Principais recursos

- Cadastro, login, recuperação e redefinição de senha para clientes e salões.
- Busca de salões próximos e consulta de serviços disponíveis.
- Agendamento por link público personalizado de cada filial.
- Horários calculados pela duração do serviço e pela jornada de cada profissional.
- Área administrativa para gerenciar dados do salão, filiais, funcionários, disponibilidade, bloqueios, clientes e serviços.
- Integração com mapas para localização das unidades.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | Next.js 16, React 19, Axios, Leaflet e MapLibre |
| Backend | Node.js, Express 5, Sequelize e CORS |
| Banco de dados | MySQL |
| Autenticação | Supabase Auth |

## Estrutura do projeto

```text
.
├── frontend/      # Aplicação web em Next.js
├── backend/       # API REST em Express
├── database/      # Script inicial e migrações MySQL
└── template/      # Modelos de e-mail
```

## Requisitos

Antes de começar, tenha instalado:

- [Node.js](https://nodejs.org/) **20.9 ou superior** e npm;
- [MySQL](https://www.mysql.com/) 8 ou superior, em execução localmente;
- Uma conta e um projeto no [Supabase](https://supabase.com/) para autenticação;
- Git (opcional, para clonar o repositório).

## Como rodar o projeto

### 1. Clone o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd monorepo-agendeaki
```

> Se você já possui o projeto na sua máquina, entre diretamente na pasta raiz dele.

### 2. Configure o banco de dados

Crie a estrutura do banco executando o script abaixo no MySQL:

```bash
mysql -u root -p < database/script.sql
```

O script cria o banco `tcc_salao` e suas tabelas. Para uma base já existente, consulte os arquivos em `database/migrations/` antes de aplicar qualquer migração e faça um backup.

Para atualizar uma base criada antes das URLs personalizadas e da nova disponibilidade:

```bash
mysql -u root -p < database/migrations/20261001_urls_e_disponibilidade.sql
```

### 3. Configure as variáveis de ambiente

Copie os arquivos de exemplo:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Depois, preencha os valores adequados em cada arquivo.

**`backend/.env`**

| Variável | Descrição |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT` | Host e porta do MySQL |
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Credenciais e nome do banco |
| `PORT` | Porta da API (padrão: `3001`) |
| `FRONTEND_URL` | URL do frontend (padrão: `http://localhost:3000`) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anônima do Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta do Supabase, usada somente no servidor |
| `HERE_API_KEY` | Chave privada da HERE, usada pela API para geocodificar endereços e cidades |

**`frontend/.env.local`**

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | URL da API (ex.: `http://localhost:3001`) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima pública do Supabase |
| `NEXT_PUBLIC_HERE_API_KEY` | Chave HERE para exibir os tiles no navegador; restrinja-a ao domínio do frontend |

> Nunca versione arquivos `.env` reais ou exponha a `SUPABASE_SECRET_KEY` ou `HERE_API_KEY` no frontend. A chave `NEXT_PUBLIC_HERE_API_KEY` fica visível no navegador por necessidade do mapa; use uma chave própria, limitada ao domínio do frontend no painel da HERE.

### 4. Instale as dependências

Em dois terminais, instale as dependências de cada aplicação:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

### 5. Inicie a API

No terminal do backend:

```bash
npm run dev
```

A API estará disponível em [http://localhost:3001](http://localhost:3001). Para confirmar que está ativa, acesse [http://localhost:3001/saude](http://localhost:3001/saude).

### 6. Inicie o frontend

No terminal do frontend:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Comandos úteis

| Diretório | Comando | Descrição |
| --- | --- | --- |
| `backend/` | `npm run dev` | Inicia a API em modo de desenvolvimento, com recarga automática |
| `backend/` | `npm start` | Inicia a API em modo normal |
| `backend/` | `npm test` | Executa os testes do motor de horários |
| `frontend/` | `npm run dev` | Inicia o Next.js em modo de desenvolvimento |
| `frontend/` | `npm run build` | Gera a versão de produção do frontend |
| `frontend/` | `npm start` | Serve o build de produção do frontend |

---

Feito com foco em tornar o agendamento de serviços de beleza mais simples para clientes e salões.
