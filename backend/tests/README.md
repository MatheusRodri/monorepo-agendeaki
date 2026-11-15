# Testes de promoções e ajustes de valor

Na pasta `backend`, com Node.js 24 LTS:

- `npm test`: regras de preço, validade das promoções, arredondamento, ajustes e validação dos filtros. Não utiliza banco nem serviços externos.
- `npm run test:integracao`: consultas reais, reservas e reagendamentos, fechamento, migração e exportações CSV/Excel. Simula somente a identidade autenticada e o envio de notificações; as permissões Premium e as consultas são reais.

Os testes de integração exigem o cliente `mysql` e uma instância MySQL 8 descartável, exclusiva, executada pelo seu usuário. Não usam as credenciais MySQL do `.env`. Criam bancos com nomes aleatórios `test_promocoes_*` e removem esses bancos ao terminar.

Para preparar uma instância local, inicialize **uma única vez em um diretório vazio**:

```bash
mkdir -p /tmp/agendeaki-metricas-mysql
mysqld --no-defaults --initialize-insecure --datadir=/tmp/agendeaki-metricas-mysql
```

Inicie o servidor em outro terminal e mantenha-o ativo durante os testes:

```bash
mysqld --no-defaults --datadir=/tmp/agendeaki-metricas-mysql --socket=/tmp/agendeaki-metricas-mysql/mysql.sock --pid-file=/tmp/agendeaki-metricas-mysql/mysql.pid --skip-networking --mysqlx=OFF
```

O usuário `root` dessa instância descartável não tem senha e o servidor não aceita conexões de rede. Para outro socket temporário, configure `TEST_MYSQL_SOCKET` com um caminho dentro de `/tmp` terminado em `.sock`. Não aponte para uma instância com dados reais.

Os testes usam Jest em modo ESM (`--experimental-vm-modules`) e `jest.unstable_mockModule` para substituir módulos. Use `npm run test:cobertura` para o relatório de cobertura.
