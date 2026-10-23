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
