CREATE TABLE IF NOT EXISTS tb_inscricao_notificacao (
  id_inscricao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fk_salao BIGINT UNSIGNED NOT NULL,
  ds_endpoint VARCHAR(2048) NOT NULL,
  ds_endpoint_hash CHAR(64) NOT NULL,
  ds_chave_publica VARCHAR(255) NOT NULL,
  ds_chave_auth VARCHAR(255) NOT NULL,
  dt_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_inscricao),
  CONSTRAINT uk_inscricao_notificacao_endpoint UNIQUE (ds_endpoint_hash),
  INDEX idx_inscricao_notificacao_salao (fk_salao),
  CONSTRAINT fk_inscricao_notificacao_salao FOREIGN KEY (fk_salao)
    REFERENCES tb_salao (id_salao) ON DELETE CASCADE
) ENGINE=InnoDB;
