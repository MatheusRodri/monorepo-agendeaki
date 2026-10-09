-- Descomente somente quando quiser apagar completamente o banco.
-- DROP DATABASE IF EXISTS tcc_salao;

CREATE DATABASE IF NOT EXISTS tcc_salao
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tcc_salao;

-- =====================================================
-- USUÁRIOS
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_usuario (
  id_usuario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nm_usuario VARCHAR(120) NOT NULL,
  ds_email VARCHAR(254) NOT NULL,
  dt_nascimento DATE NULL,
  tp_documento ENUM('CPF', 'CNPJ') NULL,
  ds_documento_cifrado VARCHAR(255) NULL,
  ds_documento_indice CHAR(64) NULL,

  tp_usuario ENUM(
    'CLIENTE',
    'ADMIN_SALAO'
  ) NOT NULL,

  -- Identificador fornecido por Supabase, Auth0 ou outro serviço.
  id_autenticacao_externa VARCHAR(255) NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_usuario),

  CONSTRAINT uk_usuario_email
    UNIQUE (ds_email),

  CONSTRAINT uk_usuario_documento_indice
    UNIQUE (ds_documento_indice),

  CONSTRAINT uk_usuario_autenticacao_externa
    UNIQUE (id_autenticacao_externa)
) ENGINE = InnoDB;


-- =====================================================
-- SALÕES
-- Representa a marca ou estabelecimento geral.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_salao (
  id_salao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_usuario_administrador BIGINT UNSIGNED NOT NULL,

  nm_salao VARCHAR(120) NOT NULL,
  ds_slug VARCHAR(150) NOT NULL,
  ds_email VARCHAR(254) NULL,
  nu_telefone VARCHAR(20) NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  st_teste_premium_utilizado BOOLEAN NOT NULL DEFAULT FALSE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_salao),

  CONSTRAINT uk_salao_slug
    UNIQUE (ds_slug),

  INDEX idx_salao_administrador (
    fk_usuario_administrador
  ),

  CONSTRAINT fk_salao_usuario_administrador
    FOREIGN KEY (fk_usuario_administrador)
    REFERENCES tb_usuario (id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE = InnoDB;


-- =====================================================
-- CLIENTES CADASTRADOS DIRETAMENTE PELO SALÃO
-- Estas fichas não representam contas de acesso.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_cliente_salao (
  id_cliente_salao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_salao BIGINT UNSIGNED NOT NULL,
  nm_cliente VARCHAR(120) NOT NULL,
  ds_email VARCHAR(254) NULL,
  nu_telefone VARCHAR(20) NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_cliente_salao),
  INDEX idx_cliente_salao_salao_nome (fk_salao, nm_cliente),

  CONSTRAINT fk_cliente_salao_salao
    FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE = InnoDB;


-- =====================================================
-- ASSINATURAS DOS SALÕES
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_assinatura_salao (
  id_assinatura_salao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_salao BIGINT UNSIGNED NOT NULL,

  cd_periodicidade ENUM('MENSAL', 'ANUAL') NOT NULL,
  cd_periodicidade_pendente ENUM('MENSAL', 'ANUAL') NULL,
  cd_status ENUM(
    'PENDENTE',
    'EM_TESTE',
    'AUTORIZADA',
    'PAUSADA',
    'PAGAMENTO_PENDENTE',
    'CANCELAMENTO_AGENDADO',
    'CANCELADA'
  ) NOT NULL DEFAULT 'PENDENTE',
  vl_assinatura DECIMAL(10, 2) NOT NULL,
  st_teste_gratis BOOLEAN NOT NULL DEFAULT FALSE,

  ds_provedor VARCHAR(20) NOT NULL DEFAULT 'STRIPE',
  id_cliente_provedor VARCHAR(150) NULL,
  id_preco_provedor VARCHAR(150) NOT NULL,
  id_assinatura_provedor VARCHAR(150) NULL,
  id_checkout_provedor VARCHAR(150) NULL,
  ds_referencia_externa CHAR(36) NOT NULL,

  dt_inicio DATETIME NULL,
  dt_proxima_cobranca DATETIME NULL,
  dt_cancelamento_solicitado DATETIME NULL,
  dt_cancelamento DATETIME NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_assinatura_salao),
  CONSTRAINT uk_assinatura_salao_referencia UNIQUE (ds_referencia_externa),
  CONSTRAINT uk_assinatura_salao_provedor UNIQUE (id_assinatura_provedor),
  INDEX idx_assinatura_salao_status (fk_salao, cd_status),
  CONSTRAINT fk_assinatura_salao_salao
    FOREIGN KEY (fk_salao) REFERENCES tb_salao (id_salao)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_assinatura_salao_valor CHECK (vl_assinatura >= 0)
) ENGINE = InnoDB;


-- =====================================================
-- UNIDADES
-- Representa cada endereço físico de um salão.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_unidade (
  id_unidade BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_salao BIGINT UNSIGNED NOT NULL,

  nm_unidade VARCHAR(120) NOT NULL,
  ds_slug VARCHAR(150) NOT NULL,

  tp_categoria ENUM(
    'FEMININO',
    'MASCULINO',
    'UNISSEX',
    'OUTRO'
  ) NOT NULL,

  ds_rua VARCHAR(150) NOT NULL,
  nu_endereco VARCHAR(20) NOT NULL,
  ds_complemento VARCHAR(100) NULL,
  ds_bairro VARCHAR(100) NOT NULL,
  ds_municipio VARCHAR(100) NOT NULL,
  ds_estado CHAR(2) NOT NULL,
  ds_pais CHAR(2) NOT NULL DEFAULT 'BR',
  nu_cep CHAR(8) NOT NULL,

  nu_latitude DECIMAL(10, 7) NULL,
  nu_longitude DECIMAL(10, 7) NULL,

  nu_telefone VARCHAR(20) NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_unidade),

  CONSTRAINT uk_unidade_nome_salao
    UNIQUE (fk_salao, nm_unidade),

  CONSTRAINT uk_unidade_slug_salao
    UNIQUE (fk_salao, ds_slug),

  INDEX idx_unidade_salao (
    fk_salao
  ),

  INDEX idx_unidade_localizacao (
    nu_latitude,
    nu_longitude
  ),

  CONSTRAINT fk_unidade_salao
    FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT ck_unidade_latitude
    CHECK (
      nu_latitude IS NULL
      OR nu_latitude BETWEEN -90 AND 90
    ),

  CONSTRAINT ck_unidade_longitude
    CHECK (
      nu_longitude IS NULL
      OR nu_longitude BETWEEN -180 AND 180
    )
) ENGINE = InnoDB;


-- =====================================================
-- HORÁRIOS DAS UNIDADES
--
-- Dia da semana:
-- 0 = domingo
-- 1 = segunda-feira
-- 2 = terça-feira
-- 3 = quarta-feira
-- 4 = quinta-feira
-- 5 = sexta-feira
-- 6 = sábado
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_horario_unidade (
  id_horario_unidade BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_unidade BIGINT UNSIGNED NOT NULL,

  nr_dia_semana TINYINT UNSIGNED NOT NULL,

  hr_abertura TIME NULL,
  hr_fechamento TIME NULL,

  st_fechado BOOLEAN NOT NULL DEFAULT FALSE,

  PRIMARY KEY (id_horario_unidade),

  CONSTRAINT uk_horario_unidade_dia
    UNIQUE (fk_unidade, nr_dia_semana),

  INDEX idx_horario_unidade (
    fk_unidade
  ),

  CONSTRAINT fk_horario_unidade
    FOREIGN KEY (fk_unidade)
    REFERENCES tb_unidade (id_unidade)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT ck_horario_unidade_dia
    CHECK (
      nr_dia_semana BETWEEN 0 AND 6
    ),

  CONSTRAINT ck_horario_unidade_periodo
    CHECK (
      (
        st_fechado = TRUE
        AND hr_abertura IS NULL
        AND hr_fechamento IS NULL
      )
      OR
      (
        st_fechado = FALSE
        AND hr_abertura IS NOT NULL
        AND hr_fechamento IS NOT NULL
        AND hr_abertura < hr_fechamento
      )
    )
) ENGINE = InnoDB;


-- =====================================================
-- SERVIÇOS
-- Cada serviço pertence a uma unidade.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_servico (
  id_servico BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_unidade BIGINT UNSIGNED NOT NULL,

  nm_servico VARCHAR(120) NOT NULL,
  ds_servico TEXT NULL,

  vl_servico DECIMAL(10, 2) NOT NULL,
  nu_duracao_minutos SMALLINT UNSIGNED NOT NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_servico),

  CONSTRAINT uk_servico_unidade_nome
    UNIQUE (fk_unidade, nm_servico),

  INDEX idx_servico_unidade (
    fk_unidade
  ),

  CONSTRAINT fk_servico_unidade
    FOREIGN KEY (fk_unidade)
    REFERENCES tb_unidade (id_unidade)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT ck_servico_valor
    CHECK (
      vl_servico >= 0
    ),

  CONSTRAINT ck_servico_duracao
    CHECK (
      nu_duracao_minutos > 0
    )
) ENGINE = InnoDB;


-- =====================================================
-- FUNCIONÁRIOS
-- Cada funcionário pertence a uma unidade.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_funcionario (
  id_funcionario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_unidade BIGINT UNSIGNED NOT NULL,

  nm_funcionario VARCHAR(120) NOT NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_funcionario),

  INDEX idx_funcionario_unidade (
    fk_unidade
  ),

  CONSTRAINT fk_funcionario_unidade
    FOREIGN KEY (fk_unidade)
    REFERENCES tb_unidade (id_unidade)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE = InnoDB;


-- =====================================================
-- SERVIÇOS REALIZADOS PELOS FUNCIONÁRIOS
--
-- Um funcionário pode realizar vários serviços.
-- Um serviço pode ser realizado por vários funcionários.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_funcionario_servico (
  fk_funcionario BIGINT UNSIGNED NOT NULL,
  fk_servico BIGINT UNSIGNED NOT NULL,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (
    fk_funcionario,
    fk_servico
  ),

  INDEX idx_funcionario_servico_servico (
    fk_servico
  ),

  CONSTRAINT fk_funcionario_servico_funcionario
    FOREIGN KEY (fk_funcionario)
    REFERENCES tb_funcionario (id_funcionario)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_funcionario_servico_servico
    FOREIGN KEY (fk_servico)
    REFERENCES tb_servico (id_servico)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE = InnoDB;


-- =====================================================
-- DISPONIBILIDADE DOS FUNCIONÁRIOS
--
-- É possível cadastrar mais de um período no mesmo dia.
-- Exemplo:
-- 08:00 até 12:00
-- 13:00 até 18:00
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_disponibilidade_funcionario (
  id_disponibilidade BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_funcionario BIGINT UNSIGNED NOT NULL,

  nr_dia_semana TINYINT UNSIGNED NOT NULL,

  hr_inicio TIME NOT NULL,
  hr_fim TIME NOT NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_disponibilidade),

  CONSTRAINT uk_disponibilidade_funcionario
    UNIQUE (
      fk_funcionario,
      nr_dia_semana,
      hr_inicio,
      hr_fim
    ),

  INDEX idx_disponibilidade_funcionario_dia (
    fk_funcionario,
    nr_dia_semana
  ),

  CONSTRAINT fk_disponibilidade_funcionario
    FOREIGN KEY (fk_funcionario)
    REFERENCES tb_funcionario (id_funcionario)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT ck_disponibilidade_dia
    CHECK (
      nr_dia_semana BETWEEN 0 AND 6
    ),

  CONSTRAINT ck_disponibilidade_periodo
    CHECK (
      hr_inicio < hr_fim
    )
) ENGINE = InnoDB;


-- =====================================================
-- BLOQUEIOS DE AGENDA
-- Sem funcionário, o bloqueio vale para toda a filial.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_bloqueio_agenda (
  id_bloqueio BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_unidade BIGINT UNSIGNED NOT NULL,
  fk_funcionario BIGINT UNSIGNED NULL,
  dt_inicio DATETIME NOT NULL,
  dt_fim DATETIME NOT NULL,
  ds_motivo VARCHAR(200) NULL,
  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_bloqueio),

  INDEX idx_bloqueio_unidade_periodo (fk_unidade, dt_inicio, dt_fim),
  INDEX idx_bloqueio_funcionario_periodo (fk_funcionario, dt_inicio, dt_fim),

  CONSTRAINT fk_bloqueio_unidade
    FOREIGN KEY (fk_unidade) REFERENCES tb_unidade (id_unidade)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_bloqueio_funcionario
    FOREIGN KEY (fk_funcionario) REFERENCES tb_funcionario (id_funcionario)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT ck_bloqueio_periodo CHECK (dt_inicio < dt_fim)
) ENGINE = InnoDB;


-- =====================================================
-- AGENDAMENTOS
--
-- O nome, valor e duração do serviço são armazenados
-- no agendamento para preservar o histórico.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_agendamento (
  id_agendamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  fk_usuario BIGINT UNSIGNED NULL,
  fk_cliente_salao BIGINT UNSIGNED NULL,
  fk_unidade BIGINT UNSIGNED NOT NULL,
  fk_funcionario BIGINT UNSIGNED NOT NULL,
  fk_servico BIGINT UNSIGNED NOT NULL,

  dt_inicio DATETIME NOT NULL,
  dt_fim DATETIME NOT NULL,

  nm_servico_agendado VARCHAR(120) NOT NULL,
  vl_servico_agendado DECIMAL(10, 2) NOT NULL,
  nu_duracao_minutos SMALLINT UNSIGNED NOT NULL,

  cd_status ENUM(
    'AGENDADO',
    'REALIZADO',
    'CANCELADO',
    'NAO_COMPARECEU'
  ) NOT NULL DEFAULT 'AGENDADO',

  ds_observacao VARCHAR(500) NULL,

  ds_motivo_cancelamento VARCHAR(500) NULL,
  dt_cancelamento DATETIME NULL,
  fk_usuario_cancelamento BIGINT UNSIGNED NULL,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_agendamento),

  INDEX idx_agendamento_usuario (
    fk_usuario
  ),

  INDEX idx_agendamento_cliente_salao (
    fk_cliente_salao
  ),

  INDEX idx_agendamento_unidade (
    fk_unidade
  ),

  INDEX idx_agendamento_funcionario_periodo (
    fk_funcionario,
    dt_inicio,
    dt_fim
  ),

  INDEX idx_agendamento_servico (
    fk_servico
  ),

  INDEX idx_agendamento_status (
    cd_status
  ),

  CONSTRAINT fk_agendamento_usuario
    FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_agendamento_cliente_salao
    FOREIGN KEY (fk_cliente_salao)
    REFERENCES tb_cliente_salao (id_cliente_salao)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_agendamento_unidade
    FOREIGN KEY (fk_unidade)
    REFERENCES tb_unidade (id_unidade)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_agendamento_funcionario
    FOREIGN KEY (fk_funcionario)
    REFERENCES tb_funcionario (id_funcionario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_agendamento_servico
    FOREIGN KEY (fk_servico)
    REFERENCES tb_servico (id_servico)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_agendamento_usuario_cancelamento
    FOREIGN KEY (fk_usuario_cancelamento)
    REFERENCES tb_usuario (id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT ck_agendamento_periodo
    CHECK (
      dt_inicio < dt_fim
    ),

  CONSTRAINT ck_agendamento_valor
    CHECK (
      vl_servico_agendado >= 0
    ),

  CONSTRAINT ck_agendamento_duracao
    CHECK (
      nu_duracao_minutos > 0
    )
) ENGINE = InnoDB;

-- =====================================================
-- AVALIAÇÕES DE AGENDAMENTOS REALIZADOS
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_avaliacao (
  id_avaliacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_agendamento BIGINT UNSIGNED NOT NULL,
  fk_usuario BIGINT UNSIGNED NOT NULL,
  fk_unidade BIGINT UNSIGNED NOT NULL,
  fk_servico BIGINT UNSIGNED NOT NULL,
  nu_nota_salao TINYINT UNSIGNED NOT NULL,
  nu_nota_servico TINYINT UNSIGNED NOT NULL,
  ds_comentario VARCHAR(500) NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_avaliacao),
  CONSTRAINT uk_avaliacao_agendamento UNIQUE (fk_agendamento),
  INDEX idx_avaliacao_unidade_data (fk_unidade, dt_criacao),
  INDEX idx_avaliacao_servico (fk_servico),
  CONSTRAINT ck_avaliacao_nota_salao CHECK (nu_nota_salao BETWEEN 1 AND 5),
  CONSTRAINT ck_avaliacao_nota_servico CHECK (nu_nota_servico BETWEEN 1 AND 5),
  CONSTRAINT fk_avaliacao_agendamento FOREIGN KEY (fk_agendamento) REFERENCES tb_agendamento (id_agendamento) ON DELETE CASCADE,
  CONSTRAINT fk_avaliacao_usuario FOREIGN KEY (fk_usuario) REFERENCES tb_usuario (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_avaliacao_unidade FOREIGN KEY (fk_unidade) REFERENCES tb_unidade (id_unidade),
  CONSTRAINT fk_avaliacao_servico FOREIGN KEY (fk_servico) REFERENCES tb_servico (id_servico)
) ENGINE = InnoDB;


-- =====================================================
-- PAGAMENTOS
--
-- Um agendamento pode possuir mais de uma tentativa
-- de pagamento.
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_pagamento (
  id_pagamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_agendamento BIGINT UNSIGNED NOT NULL,

  ds_provedor_pagamento VARCHAR(50) NULL,
  id_transacao_provedor VARCHAR(150) NULL,

  vl_pagamento DECIMAL(10, 2) NOT NULL,

  tp_pagamento ENUM(
    'PIX',
    'CARTAO_CREDITO',
    'CARTAO_DEBITO',
    'DINHEIRO',
    'OUTRO'
  ) NOT NULL,

  cd_status_pagamento ENUM(
    'PENDENTE',
    'APROVADO',
    'RECUSADO',
    'CANCELADO',
    'REEMBOLSADO'
  ) NOT NULL DEFAULT 'PENDENTE',

  dt_pagamento DATETIME NULL,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_pagamento),

  INDEX idx_pagamento_agendamento (
    fk_agendamento
  ),

  INDEX idx_pagamento_status (
    cd_status_pagamento
  ),

  CONSTRAINT uk_pagamento_transacao
    UNIQUE (
      ds_provedor_pagamento,
      id_transacao_provedor
    ),

  CONSTRAINT fk_pagamento_agendamento
    FOREIGN KEY (fk_agendamento)
    REFERENCES tb_agendamento (id_agendamento)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT ck_pagamento_valor
    CHECK (
      vl_pagamento >= 0
    )
) ENGINE = InnoDB;
