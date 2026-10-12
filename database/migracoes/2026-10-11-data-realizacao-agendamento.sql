ALTER TABLE tb_agendamento
  ADD COLUMN dt_realizacao DATETIME NULL AFTER dt_fim;

UPDATE tb_agendamento
SET dt_realizacao = dt_atualizacao
WHERE cd_status = 'REALIZADO'
  AND dt_realizacao IS NULL;
