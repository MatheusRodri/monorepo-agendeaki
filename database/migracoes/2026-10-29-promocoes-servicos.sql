-- Aplicar uma vez, antes de publicar o backend e o frontend.
-- Preserva preços e agendamentos existentes; serviços começam sem promoção.
ALTER TABLE tb_servico
  ADD COLUMN tp_promocao ENUM('PRECO_FIXO', 'PERCENTUAL') NULL,
  ADD COLUMN vl_promocao DECIMAL(10,2) NULL,
  ADD COLUMN st_promocao_ativa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN dt_promocao_inicio DATE NULL,
  ADD COLUMN dt_promocao_fim DATE NULL,
  ADD CONSTRAINT ck_servico_promocao_dados CHECK (
    (tp_promocao IS NULL AND vl_promocao IS NULL AND st_promocao_ativa=FALSE
      AND dt_promocao_inicio IS NULL AND dt_promocao_fim IS NULL)
    OR (tp_promocao IS NOT NULL AND vl_promocao IS NOT NULL AND vl_promocao >= 0
      AND (tp_promocao <> 'PERCENTUAL' OR (vl_promocao > 0 AND vl_promocao <= 100)))
  ),
  ADD CONSTRAINT ck_servico_promocao_preco CHECK (
    st_promocao_ativa=FALSE OR (vl_servico > 0 AND
      ((tp_promocao='PRECO_FIXO' AND vl_promocao < vl_servico)
       OR (tp_promocao='PERCENTUAL' AND ROUND(vl_servico * (1-vl_promocao/100),2) < vl_servico)))
  ),
  ADD CONSTRAINT ck_servico_promocao_periodo CHECK (
    dt_promocao_inicio IS NULL OR dt_promocao_fim IS NULL OR dt_promocao_fim >= dt_promocao_inicio
  );
