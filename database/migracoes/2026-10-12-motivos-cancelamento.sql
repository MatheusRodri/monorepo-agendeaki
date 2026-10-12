ALTER TABLE tb_agendamento
  ADD COLUMN cd_motivo_cancelamento ENUM(
    'BLOQUEIO_AGENDA',
    'INDISPONIBILIDADE_PROFISSIONAL',
    'SOLICITACAO_CLIENTE',
    'PROBLEMA_UNIDADE',
    'ERRO_AGENDAMENTO',
    'OUTRO'
  ) NULL AFTER ds_motivo_cancelamento,
  ADD COLUMN cd_origem_cancelamento ENUM(
    'CLIENTE',
    'SALAO',
    'NAO_IDENTIFICADO'
  ) NULL AFTER cd_motivo_cancelamento;

UPDATE tb_agendamento
SET cd_motivo_cancelamento = CASE
      WHEN ds_motivo_cancelamento LIKE 'Bloqueio de agenda:%' THEN 'BLOQUEIO_AGENDA'
      WHEN ds_motivo_cancelamento IS NOT NULL AND ds_motivo_cancelamento <> '' THEN 'OUTRO'
      ELSE NULL
    END,
    cd_origem_cancelamento = CASE
      WHEN fk_usuario_cancelamento IS NOT NULL THEN 'SALAO'
      WHEN ds_motivo_cancelamento = 'Solicitação do cliente' THEN 'CLIENTE'
      ELSE 'NAO_IDENTIFICADO'
    END
WHERE cd_status = 'CANCELADO';
