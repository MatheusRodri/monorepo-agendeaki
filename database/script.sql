-- Descomente somente quando quiser apagar completamente o banco.
-- DROP DATABASE IF EXISTS tccsalao;

CREATE DATABASE IF NOT EXISTS tccsalao
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tccsalao;

-- =====================================================
-- USUÁRIOS
-- =====================================================

CREATE TABLE IF NOT EXISTS tb_usuario (
  id_usuario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nm_usuario VARCHAR(120) NOT NULL,
  ds_email VARCHAR(254) NOT NULL,
  nu_telefone VARCHAR(20) NULL,
  dt_nascimento DATE NULL,
  tp_documento ENUM('CPF', 'CNPJ') NULL,
  ds_documento_cifrado VARCHAR(255) NULL,
  ds_documento_indice CHAR(64) NULL,

  tp_usuario ENUM(
    'CLIENTE',
    'ADMIN_SALAO',
    'ADMIN_AGENDEAKI'
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

-- Sessões administrativas revogáveis; nunca armazena o token em texto.
CREATE TABLE IF NOT EXISTS tb_sessao_admin (
  ds_token_hash CHAR(64) NOT NULL PRIMARY KEY,
  ds_credencial_versao CHAR(64) NOT NULL,
  dt_expiracao DATETIME NOT NULL,
  dt_revogacao DATETIME NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessao_admin_expiracao (dt_expiracao)
) ENGINE=InnoDB;

-- Sobrevive à remoção do salão para permitir retomar falhas entre provedores.
CREATE TABLE IF NOT EXISTS tb_exclusao_conta_salao (
  id_operacao CHAR(36) NOT NULL PRIMARY KEY,
  id_autenticacao_externa VARCHAR(255) NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  id_salao BIGINT UNSIGNED NULL,
  cd_etapa ENUM('PREPARACAO','COBRANCA','DADOS_LOCAIS','IDENTIDADE','CONCLUIDA') NOT NULL DEFAULT 'PREPARACAO',
  ds_erro_codigo VARCHAR(80) NULL,
  js_referencias_stripe JSON NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_exclusao_identidade (id_autenticacao_externa)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tb_aceite_documento_legal (
  fk_usuario BIGINT UNSIGNED NOT NULL,
  cd_documento ENUM('TERMOS_USO', 'POLITICA_PRIVACIDADE') NOT NULL,
  ds_versao VARCHAR(40) NOT NULL,
  dt_aceite DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_usuario, cd_documento, ds_versao),
  INDEX idx_aceite_documento_legal_usuario (fk_usuario),
  CONSTRAINT fk_aceite_documento_legal_usuario
    FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario)
    ON DELETE CASCADE
    ON UPDATE CASCADE
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
  ds_cnpj_raiz_indice CHAR(64) NOT NULL,

  st_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  st_teste_premium_utilizado BOOLEAN NOT NULL DEFAULT FALSE,
  st_exclusao_pendente BOOLEAN NOT NULL DEFAULT FALSE,

  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id_salao),

  CONSTRAINT uk_salao_slug
    UNIQUE (ds_slug),

  CONSTRAINT uk_salao_cnpj_raiz
    UNIQUE (ds_cnpj_raiz_indice),

  INDEX idx_salao_administrador (
    fk_usuario_administrador
  ),

  CONSTRAINT fk_salao_usuario_administrador
    FOREIGN KEY (fk_usuario_administrador)
    REFERENCES tb_usuario (id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS tb_inscricao_notificacao (
  id_inscricao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_salao BIGINT UNSIGNED NOT NULL,
  ds_endpoint VARCHAR(2048) NOT NULL,
  ds_endpoint_hash CHAR(64) NOT NULL,
  ds_chave_publica VARCHAR(255) NOT NULL,
  ds_chave_auth VARCHAR(255) NOT NULL,
  id_vinculo_dispositivo CHAR(36) NOT NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_inscricao),
  CONSTRAINT uk_inscricao_notificacao_endpoint UNIQUE (ds_endpoint_hash),
  INDEX idx_inscricao_notificacao_salao (fk_salao),
  CONSTRAINT fk_inscricao_notificacao_salao FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tb_notificacao_salao (
  id_notificacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_salao BIGINT UNSIGNED NOT NULL,
  nm_titulo VARCHAR(120) NOT NULL,
  ds_mensagem VARCHAR(300) NOT NULL,
  ds_link VARCHAR(255) NOT NULL DEFAULT '/salao/notificacoes',
  st_lida BOOLEAN NOT NULL DEFAULT FALSE,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_notificacao),
  INDEX idx_notificacao_salao_nao_lidas (fk_salao, st_lida, dt_criacao),
  CONSTRAINT fk_notificacao_salao_salao FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tb_inscricao_notificacao_cliente (
  id_inscricao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_usuario BIGINT UNSIGNED NOT NULL,
  ds_endpoint VARCHAR(2048) NOT NULL,
  ds_endpoint_hash CHAR(64) NOT NULL,
  ds_chave_publica VARCHAR(255) NOT NULL,
  ds_chave_auth VARCHAR(255) NOT NULL,
  id_vinculo_dispositivo CHAR(36) NOT NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_inscricao),
  CONSTRAINT uk_inscricao_notificacao_cliente_endpoint UNIQUE (ds_endpoint_hash),
  INDEX idx_inscricao_notificacao_cliente_usuario (fk_usuario),
  CONSTRAINT fk_inscricao_notificacao_cliente_usuario FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

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
  js_parametros_checkout JSON NULL,
  dt_tentativa_checkout DATETIME NULL,

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

CREATE TABLE IF NOT EXISTS tb_fatura_assinatura_salao (
  id_fatura_salao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_assinatura_salao BIGINT UNSIGNED NOT NULL,
  fk_salao BIGINT UNSIGNED NOT NULL,
  id_fatura_provedor VARCHAR(150) NOT NULL,
  id_assinatura_provedor VARCHAR(150) NOT NULL,
  id_cliente_provedor VARCHAR(150) NULL,
  cd_status VARCHAR(30) NOT NULL,
  cd_motivo VARCHAR(80) NULL,
  ds_moeda CHAR(3) NOT NULL DEFAULT 'brl',
  vl_total_centavos BIGINT UNSIGNED NOT NULL DEFAULT 0,
  vl_pago_centavos BIGINT UNSIGNED NOT NULL DEFAULT 0,
  dt_criacao_provedor DATETIME NULL,
  dt_periodo_inicio DATETIME NULL,
  dt_periodo_fim DATETIME NULL,
  dt_pago DATETIME NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dt_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_fatura_salao),
  CONSTRAINT uk_fatura_salao_provedor UNIQUE (id_fatura_provedor),
  INDEX idx_fatura_salao_pago (fk_salao, cd_status, dt_pago),
  INDEX idx_fatura_assinatura_pago (fk_assinatura_salao, dt_pago),
  CONSTRAINT fk_fatura_salao_assinatura FOREIGN KEY (fk_assinatura_salao)
    REFERENCES tb_assinatura_salao (id_assinatura_salao) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fatura_salao_salao FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS tb_historico_assinatura_salao (
  id_historico_assinatura BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_assinatura_salao BIGINT UNSIGNED NOT NULL,
  fk_salao BIGINT UNSIGNED NOT NULL,
  cd_status_anterior VARCHAR(30) NULL,
  cd_status_novo VARCHAR(30) NOT NULL,
  cd_periodicidade_anterior VARCHAR(20) NULL,
  cd_periodicidade_nova VARCHAR(20) NOT NULL,
  cd_periodicidade_pendente_anterior VARCHAR(20) NULL,
  cd_periodicidade_pendente_nova VARCHAR(20) NULL,
  vl_assinatura_anterior DECIMAL(10,2) NULL,
  vl_assinatura_nova DECIMAL(10,2) NOT NULL,
  dt_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_historico_assinatura),
  INDEX idx_historico_assinatura (fk_assinatura_salao, dt_evento),
  INDEX idx_historico_salao (fk_salao, dt_evento),
  CONSTRAINT fk_historico_assinatura_salao FOREIGN KEY (fk_assinatura_salao)
    REFERENCES tb_assinatura_salao (id_assinatura_salao) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_historico_salao FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS tg_historico_assinatura_salao_ai$$
CREATE TRIGGER tg_historico_assinatura_salao_ai
AFTER INSERT ON tb_assinatura_salao
FOR EACH ROW
BEGIN
  INSERT INTO tb_historico_assinatura_salao (
    fk_assinatura_salao, fk_salao, cd_status_anterior, cd_status_novo,
    cd_periodicidade_anterior, cd_periodicidade_nova,
    cd_periodicidade_pendente_anterior, cd_periodicidade_pendente_nova,
    vl_assinatura_anterior, vl_assinatura_nova
  ) VALUES (
    NEW.id_assinatura_salao, NEW.fk_salao, NULL, NEW.cd_status,
    NULL, NEW.cd_periodicidade, NULL, NEW.cd_periodicidade_pendente, NULL, NEW.vl_assinatura
  );
END$$
DROP TRIGGER IF EXISTS tg_historico_assinatura_salao_au$$
CREATE TRIGGER tg_historico_assinatura_salao_au
AFTER UPDATE ON tb_assinatura_salao
FOR EACH ROW
BEGIN
  IF NOT (OLD.cd_status <=> NEW.cd_status)
    OR NOT (OLD.cd_periodicidade <=> NEW.cd_periodicidade)
    OR NOT (OLD.cd_periodicidade_pendente <=> NEW.cd_periodicidade_pendente)
    OR NOT (OLD.vl_assinatura <=> NEW.vl_assinatura) THEN
    INSERT INTO tb_historico_assinatura_salao (
      fk_assinatura_salao, fk_salao, cd_status_anterior, cd_status_novo,
      cd_periodicidade_anterior, cd_periodicidade_nova,
      cd_periodicidade_pendente_anterior, cd_periodicidade_pendente_nova,
      vl_assinatura_anterior, vl_assinatura_nova
    ) VALUES (
      NEW.id_assinatura_salao, NEW.fk_salao, OLD.cd_status, NEW.cd_status,
      OLD.cd_periodicidade, NEW.cd_periodicidade,
      OLD.cd_periodicidade_pendente, NEW.cd_periodicidade_pendente,
      OLD.vl_assinatura, NEW.vl_assinatura
    );
  END IF;
END$$
DELIMITER ;


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

  ds_email VARCHAR(254) NOT NULL,
  tp_documento ENUM('CNPJ') NOT NULL,
  ds_documento_cifrado VARCHAR(255) NOT NULL,
  ds_documento_indice CHAR(64) NOT NULL,
  ds_cnpj_raiz_indice CHAR(64) NOT NULL,

  nu_latitude DECIMAL(10, 7) NULL,
  nu_longitude DECIMAL(10, 7) NULL,

  nu_telefone VARCHAR(20) NOT NULL,

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

  CONSTRAINT uk_unidade_documento_indice
    UNIQUE (ds_documento_indice),

  INDEX idx_unidade_cnpj_raiz (ds_cnpj_raiz_indice),

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

  tp_promocao ENUM('PRECO_FIXO', 'PERCENTUAL') NULL,
  vl_promocao DECIMAL(10,2) NULL,
  st_promocao_ativa BOOLEAN NOT NULL DEFAULT FALSE,
  dt_promocao_inicio DATE NULL,
  dt_promocao_fim DATE NULL,

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
    ),
  CONSTRAINT ck_servico_promocao_dados CHECK (
    (tp_promocao IS NULL AND vl_promocao IS NULL AND st_promocao_ativa=FALSE
      AND dt_promocao_inicio IS NULL AND dt_promocao_fim IS NULL)
    OR (tp_promocao IS NOT NULL AND vl_promocao IS NOT NULL AND vl_promocao >= 0
      AND (tp_promocao <> 'PERCENTUAL' OR (vl_promocao > 0 AND vl_promocao <= 100)))
  ),
  CONSTRAINT ck_servico_promocao_preco CHECK (
    st_promocao_ativa=FALSE OR (vl_servico > 0 AND
      ((tp_promocao='PRECO_FIXO' AND vl_promocao < vl_servico)
       OR (tp_promocao='PERCENTUAL' AND ROUND(vl_servico * (1-vl_promocao/100),2) < vl_servico)))
  ),
  CONSTRAINT ck_servico_promocao_periodo CHECK (
    dt_promocao_inicio IS NULL OR dt_promocao_fim IS NULL OR dt_promocao_fim >= dt_promocao_inicio
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
  ds_motivo VARCHAR(300) NULL,
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
  dt_realizacao DATETIME NULL,

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
  cd_motivo_cancelamento ENUM(
    'BLOQUEIO_AGENDA',
    'INDISPONIBILIDADE_PROFISSIONAL',
    'SOLICITACAO_CLIENTE',
    'PROBLEMA_UNIDADE',
    'ERRO_AGENDAMENTO',
    'OUTRO'
  ) NULL,
  cd_origem_cancelamento ENUM('CLIENTE', 'SALAO', 'NAO_IDENTIFICADO') NULL,
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

-- Aplicar antes de publicar o backend e o frontend. Não altera reservas existentes.
CREATE TABLE IF NOT EXISTS tb_agendamento_servico_adicional (
  id_servico_adicional BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_agendamento BIGINT UNSIGNED NOT NULL,
  fk_servico BIGINT UNSIGNED NOT NULL,
  fk_funcionario BIGINT UNSIGNED NOT NULL,
  nm_servico VARCHAR(120) NOT NULL,
  nm_funcionario VARCHAR(120) NOT NULL,
  vl_referencia DECIMAL(10,2) NOT NULL,
  vl_cobrado DECIMAL(10,2) NOT NULL,
  nu_duracao_minutos SMALLINT UNSIGNED NOT NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_servico_adicional),
  INDEX idx_adicional_agendamento (fk_agendamento),
  INDEX idx_adicional_servico (fk_servico),
  INDEX idx_adicional_funcionario (fk_funcionario),
  CONSTRAINT fk_adicional_agendamento FOREIGN KEY (fk_agendamento)
    REFERENCES tb_agendamento (id_agendamento) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_adicional_servico FOREIGN KEY (fk_servico)
    REFERENCES tb_servico (id_servico) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_adicional_funcionario FOREIGN KEY (fk_funcionario)
    REFERENCES tb_funcionario (id_funcionario) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_adicional_valores CHECK (vl_referencia >= 0 AND vl_cobrado >= 0),
  CONSTRAINT ck_adicional_duracao CHECK (nu_duracao_minutos > 0)
) ENGINE=InnoDB;

-- Uma linha por serviço, mantendo as contagens de atendimentos por id_agendamento.
CREATE OR REPLACE VIEW vw_servico_atendimento AS
SELECT id_agendamento, fk_servico, fk_funcionario, nm_servico_agendado AS servico,
       vl_servico_agendado AS valor, nu_duracao_minutos AS minutos_reservados
FROM tb_agendamento
UNION ALL
SELECT fk_agendamento, fk_servico, fk_funcionario, nm_servico,
       vl_cobrado, 0
FROM tb_agendamento_servico_adicional;


CREATE TABLE IF NOT EXISTS tb_notificacao_cliente (
  id_notificacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_usuario BIGINT UNSIGNED NOT NULL,
  fk_agendamento BIGINT UNSIGNED NOT NULL,
  cd_tipo ENUM('AVALIACAO', 'CANCELAMENTO', 'REAGENDAMENTO') NOT NULL DEFAULT 'AVALIACAO',
  nm_titulo VARCHAR(120) NOT NULL,
  ds_mensagem VARCHAR(300) NOT NULL,
  ds_link VARCHAR(255) NOT NULL,
  st_lida BOOLEAN NOT NULL DEFAULT FALSE,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_notificacao),
  INDEX idx_notificacao_cliente_agendamento (fk_agendamento),
  INDEX idx_notificacao_cliente_usuario_nao_lida (fk_usuario, st_lida, dt_criacao),
  CONSTRAINT fk_notificacao_cliente_usuario FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notificacao_cliente_agendamento FOREIGN KEY (fk_agendamento)
    REFERENCES tb_agendamento (id_agendamento) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

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
