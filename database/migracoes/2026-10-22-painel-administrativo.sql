ALTER TABLE tb_usuario
  MODIFY COLUMN tp_usuario ENUM('CLIENTE', 'ADMIN_SALAO', 'ADMIN_AGENDEAKI') NOT NULL;

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
