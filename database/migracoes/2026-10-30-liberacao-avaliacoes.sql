-- Aplicar uma vez em bases existentes, antes de publicar o backend.
-- Instalações novas já recebem estes campos pelo script.sql.
ALTER TABLE tb_notificacao_cliente
  ADD COLUMN dt_disponivel_em DATETIME NULL,
  ADD COLUMN dt_push_processado DATETIME NULL,
  ADD COLUMN dt_push_reservado DATETIME NULL,
  ADD INDEX idx_notificacao_cliente_push (cd_tipo, dt_push_processado, dt_disponivel_em);

-- Não reenviar o histórico. Convites antigos ainda futuros ficam ocultos até dt_fim.
UPDATE tb_notificacao_cliente n
INNER JOIN tb_agendamento a ON a.id_agendamento=n.fk_agendamento
SET n.dt_disponivel_em=CASE WHEN n.cd_tipo='AVALIACAO' THEN a.dt_fim ELSE n.dt_criacao END,
    n.dt_push_processado=n.dt_criacao;
