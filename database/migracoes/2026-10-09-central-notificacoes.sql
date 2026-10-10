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
