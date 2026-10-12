ALTER TABLE tb_notificacao_cliente
  ADD INDEX idx_notificacao_cliente_agendamento (fk_agendamento);

ALTER TABLE tb_notificacao_cliente
  DROP INDEX uk_notificacao_cliente_agendamento,
  ADD COLUMN cd_tipo ENUM('AVALIACAO', 'CANCELAMENTO', 'REAGENDAMENTO') NOT NULL DEFAULT 'AVALIACAO'
    AFTER fk_agendamento;
