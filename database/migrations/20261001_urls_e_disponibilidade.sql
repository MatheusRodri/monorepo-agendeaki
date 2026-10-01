-- Execute uma vez em bases criadas antes das URLs públicas e dos bloqueios.
-- Faça backup antes de aplicar esta migração.

ALTER TABLE tb_salao
  ADD COLUMN ds_slug VARCHAR(150) NULL AFTER nm_salao;

UPDATE tb_salao
  SET ds_slug = CONCAT('salao-', id_salao)
  WHERE ds_slug IS NULL OR ds_slug = '';

ALTER TABLE tb_salao
  MODIFY COLUMN ds_slug VARCHAR(150) NOT NULL,
  ADD CONSTRAINT uk_salao_slug UNIQUE (ds_slug);

ALTER TABLE tb_unidade
  ADD COLUMN ds_slug VARCHAR(150) NULL AFTER nm_unidade;

UPDATE tb_unidade
  SET ds_slug = CONCAT('filial-', id_unidade)
  WHERE ds_slug IS NULL OR ds_slug = '';

ALTER TABLE tb_unidade
  MODIFY COLUMN ds_slug VARCHAR(150) NOT NULL,
  ADD CONSTRAINT uk_unidade_slug_salao UNIQUE (fk_salao, ds_slug);

CREATE TABLE tb_bloqueio_agenda (
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
  CONSTRAINT fk_bloqueio_unidade FOREIGN KEY (fk_unidade)
    REFERENCES tb_unidade (id_unidade) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bloqueio_funcionario FOREIGN KEY (fk_funcionario)
    REFERENCES tb_funcionario (id_funcionario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_bloqueio_periodo CHECK (dt_inicio < dt_fim)
) ENGINE = InnoDB;
