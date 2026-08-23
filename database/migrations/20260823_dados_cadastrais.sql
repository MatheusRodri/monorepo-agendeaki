-- Execute uma vez no banco local e uma vez no banco da VPS, após realizar backup.
ALTER TABLE tb_usuario
  ADD COLUMN tp_documento ENUM('CPF', 'CNPJ') NULL AFTER dt_nascimento,
  ADD COLUMN nu_documento VARCHAR(14) NULL AFTER tp_documento,
  ADD CONSTRAINT uk_usuario_documento UNIQUE (nu_documento);
