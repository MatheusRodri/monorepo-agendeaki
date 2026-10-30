-- Aplicar uma vez antes do backend e frontend. Não recalcula registros antigos.
ALTER TABLE tb_agendamento
  ADD COLUMN vl_preco_normal DECIMAL(10,2) NULL,
  ADD COLUMN vl_preco_vigente DECIMAL(10,2) NULL,
  ADD COLUMN st_promocao_aplicada BOOLEAN NULL,
  ADD COLUMN tp_promocao_aplicada ENUM('PRECO_FIXO', 'PERCENTUAL') NULL,
  ADD COLUMN vl_promocao_aplicada DECIMAL(10,2) NULL;

ALTER TABLE tb_agendamento_servico_adicional
  ADD COLUMN vl_preco_normal DECIMAL(10,2) NULL,
  ADD COLUMN vl_preco_vigente DECIMAL(10,2) NULL,
  ADD COLUMN st_promocao_aplicada BOOLEAN NULL,
  ADD COLUMN tp_promocao_aplicada ENUM('PRECO_FIXO', 'PERCENTUAL') NULL,
  ADD COLUMN vl_promocao_aplicada DECIMAL(10,2) NULL;

CREATE OR REPLACE VIEW vw_servico_atendimento AS
SELECT itens.*,
       CASE WHEN st_promocao_aplicada IS NULL THEN NULL ELSE vl_preco_normal - vl_preco_vigente END AS desconto_promocional,
       CASE WHEN st_promocao_aplicada IS NULL THEN NULL ELSE GREATEST(vl_preco_vigente - valor, 0) END AS desconto_adicional,
       CASE WHEN st_promocao_aplicada IS NULL THEN NULL ELSE GREATEST(valor - vl_preco_vigente, 0) END AS acrescimo
FROM (
  SELECT a.id_agendamento, a.fk_servico, a.fk_funcionario, a.nm_servico_agendado AS servico,
         a.vl_servico_agendado AS valor, a.nu_duracao_minutos AS minutos_reservados,
         _utf8mb4'ORIGINAL' COLLATE utf8mb4_unicode_ci AS tipo_item, NULL AS id_extra, f.nm_funcionario AS profissional,
         a.vl_preco_normal, a.vl_preco_vigente, a.st_promocao_aplicada, a.tp_promocao_aplicada, a.vl_promocao_aplicada
  FROM tb_agendamento a INNER JOIN tb_funcionario f ON f.id_funcionario = a.fk_funcionario
  UNION ALL
  SELECT e.fk_agendamento, e.fk_servico, e.fk_funcionario, e.nm_servico,
         e.vl_cobrado, 0, _utf8mb4'EXTRA' COLLATE utf8mb4_unicode_ci, e.id_servico_adicional, e.nm_funcionario,
         e.vl_preco_normal, e.vl_preco_vigente, e.st_promocao_aplicada, e.tp_promocao_aplicada, e.vl_promocao_aplicada
  FROM tb_agendamento_servico_adicional e
) itens;
