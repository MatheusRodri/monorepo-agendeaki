-- Aplicar uma vez antes da atualização do backend e frontend.
-- Registros antigos permanecem sem observação; nenhum preço é recalculado.
ALTER TABLE tb_agendamento_servico_adicional
  ADD COLUMN ds_observacao_ajuste VARCHAR(500) NULL AFTER vl_cobrado;
