-- Adiciona o estado de não comparecimento e as avaliações vinculadas a agendamentos.
ALTER TABLE tb_agendamento
  MODIFY cd_status ENUM('AGENDADO', 'REALIZADO', 'CANCELADO', 'NAO_COMPARECEU')
  NOT NULL DEFAULT 'AGENDADO';

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
  CONSTRAINT fk_avaliacao_agendamento FOREIGN KEY (fk_agendamento)
    REFERENCES tb_agendamento (id_agendamento) ON DELETE CASCADE,
  CONSTRAINT fk_avaliacao_usuario FOREIGN KEY (fk_usuario)
    REFERENCES tb_usuario (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_avaliacao_unidade FOREIGN KEY (fk_unidade)
    REFERENCES tb_unidade (id_unidade),
  CONSTRAINT fk_avaliacao_servico FOREIGN KEY (fk_servico)
    REFERENCES tb_servico (id_servico)
) ENGINE = InnoDB;
