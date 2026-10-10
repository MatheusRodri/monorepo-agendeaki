-- Execute somente depois de confirmar a conversão de todos os documentos e
-- de publicar apenas processos que usem as colunas protegidas.
ALTER TABLE tb_usuario
  DROP INDEX uk_usuario_cpf,
  DROP INDEX uk_usuario_documento,
  DROP COLUMN nu_cpf,
  DROP COLUMN nu_documento;
