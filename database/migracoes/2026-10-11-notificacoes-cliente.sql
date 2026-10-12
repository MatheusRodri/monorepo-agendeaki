CREATE TABLE IF NOT EXISTS tb_inscricao_notificacao_cliente (
  id_inscricao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_usuario BIGINT UNSIGNED NOT NULL,
  ds_endpoint VARCHAR(2048) NOT NULL,
  ds_endpoint_hash CHAR(64) NOT NULL,
  ds_chave_publica VARCHAR(255) NOT NULL,
  ds_chave_auth VARCHAR(255) NOT NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_inscricao),
  CONSTRAINT uk_inscricao_notificacao_cliente_endpoint UNIQUE (ds_endpoint_hash),
  INDEX idx_inscricao_notificacao_cliente_usuario (fk_usuario),
  CONSTRAINT fk_inscricao_notificacao_cliente_usuario FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tb_notificacao_cliente (
  id_notificacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_usuario BIGINT UNSIGNED NOT NULL,
  fk_agendamento BIGINT UNSIGNED NOT NULL,
  nm_titulo VARCHAR(120) NOT NULL,
  ds_mensagem VARCHAR(300) NOT NULL,
  ds_link VARCHAR(255) NOT NULL,
  st_lida BOOLEAN NOT NULL DEFAULT FALSE,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_notificacao),
  CONSTRAINT uk_notificacao_cliente_agendamento UNIQUE (fk_agendamento),
  INDEX idx_notificacao_cliente_usuario_nao_lida (fk_usuario, st_lida, dt_criacao),
  CONSTRAINT fk_notificacao_cliente_usuario FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notificacao_cliente_agendamento FOREIGN KEY (fk_agendamento)
    REFERENCES tb_agendamento (id_agendamento) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
