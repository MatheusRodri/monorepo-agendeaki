-- GERADO por backend/scripts/gerar-seed-filiais-hair-plus-demo.js
-- SOMENTE para ambiente de teste. Endereços são reais; dados de unidades, equipe e documentos são fictícios.
-- Os campos de documento foram cifrados com as chaves locais do backend. Use somente no banco que compartilha essas chaves.
-- Execução repetida não duplica filiais, horários, serviços, profissionais, associações ou disponibilidades.
-- Raiz protegida esperada para tb_salao.id_salao=1: 94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e
START TRANSACTION;

-- Hair Plus Demo - Vila Lisboa: aproximadamente 2.2 km da unidade Senac.
-- Hair Plus Demo - Vila Lisboa: documento sintético de demonstração; o CNPJ não é uma inscrição empresarial real.
INSERT INTO tb_unidade (
  fk_salao, nm_unidade, ds_slug, tp_categoria, ds_rua, nu_endereco, ds_complemento,
  ds_bairro, ds_municipio, ds_estado, ds_pais, nu_cep, ds_email, tp_documento,
  ds_documento_cifrado, ds_documento_indice, ds_cnpj_raiz_indice,
  nu_latitude, nu_longitude, nu_telefone
)
SELECT 1, 'Hair Plus Demo - Vila Lisboa', 'hair-plus-demo-vila-lisboa', 'UNISSEX',
  'Rua Pedro Andrade Lemos', '143', NULL, 'Socorro',
  'São Paulo', 'SP', 'BR', '04776137', 'hairplus-demo-vilalisboa@example.com', 'CNPJ',
  'v1:stuhm2HcAolsAKZX:RiKaSQJCYBQv-oTCPsleSQ:Js9FKhghaMYM6gclYfs', '6b96446771aa9b915fcdb9f77e6bcd190c34d2e6c46613febc0a3d4bb9fb0021', '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e',
  -23.6896600, -46.7009600, '11990000002'
FROM tb_salao salao
WHERE salao.id_salao = 1
  AND salao.ds_cnpj_raiz_indice = '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e'
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-vila-lisboa')
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE ds_documento_indice = '6b96446771aa9b915fcdb9f77e6bcd190c34d2e6c46613febc0a3d4bb9fb0021');
SET @id_unidade_demo = (SELECT id_unidade FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-vila-lisboa' LIMIT 1);


-- Horários da filial: segunda a sexta, 09:00–19:00; sábado, 09:00–17:00; domingo fechado.
INSERT INTO tb_horario_unidade (fk_unidade, nr_dia_semana, hr_abertura, hr_fechamento, st_fechado)
SELECT @id_unidade_demo, horario.nr_dia_semana, horario.hr_abertura, horario.hr_fechamento, horario.st_fechado
FROM (
  SELECT 0 AS nr_dia_semana, NULL AS hr_abertura, NULL AS hr_fechamento, TRUE AS st_fechado
  UNION ALL SELECT 1, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 2, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 3, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 4, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 5, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 6, '09:00:00', '17:00:00', FALSE
) horario
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_horario_unidade WHERE fk_unidade = @id_unidade_demo AND nr_dia_semana = horario.nr_dia_semana);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Corte unissex', 'Corte de cabelo personalizado.', 65.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Escova', 'Lavagem e escova.', 55.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Hidratação capilar', 'Tratamento hidratante para os fios.', 90.00, 60
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Coloração', 'Coloração capilar completa.', 180.00, 120
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração' LIMIT 1);

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Ana Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo');
SET @id_profissional_demo_1 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_1, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Caio Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo');
SET @id_profissional_demo_2 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_2, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_2 IS NOT NULL;

-- Hair Plus Demo - Socorro: aproximadamente 0.2 km da unidade Senac.
-- Hair Plus Demo - Socorro: documento sintético de demonstração; o CNPJ não é uma inscrição empresarial real.
INSERT INTO tb_unidade (
  fk_salao, nm_unidade, ds_slug, tp_categoria, ds_rua, nu_endereco, ds_complemento,
  ds_bairro, ds_municipio, ds_estado, ds_pais, nu_cep, ds_email, tp_documento,
  ds_documento_cifrado, ds_documento_indice, ds_cnpj_raiz_indice,
  nu_latitude, nu_longitude, nu_telefone
)
SELECT 1, 'Hair Plus Demo - Socorro', 'hair-plus-demo-socorro', 'UNISSEX',
  'Avenida de Pinedo', '839', NULL, 'Socorro',
  'São Paulo', 'SP', 'BR', '04764000', 'hairplus-demo-socorro@example.com', 'CNPJ',
  'v1:axLcj6jmF9sZeVDl:gEQIaZkbkyjoEaJN-39iZQ:lZuh9dOjuIyz1WlF_dw', '531bced150bf2c27d3bb191f543a4b531c94b0e21f87eba55880559847192178', '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e',
  -23.6722700, -46.7159400, '11990000003'
FROM tb_salao salao
WHERE salao.id_salao = 1
  AND salao.ds_cnpj_raiz_indice = '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e'
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-socorro')
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE ds_documento_indice = '531bced150bf2c27d3bb191f543a4b531c94b0e21f87eba55880559847192178');
SET @id_unidade_demo = (SELECT id_unidade FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-socorro' LIMIT 1);


-- Horários da filial: segunda a sexta, 09:00–19:00; sábado, 09:00–17:00; domingo fechado.
INSERT INTO tb_horario_unidade (fk_unidade, nr_dia_semana, hr_abertura, hr_fechamento, st_fechado)
SELECT @id_unidade_demo, horario.nr_dia_semana, horario.hr_abertura, horario.hr_fechamento, horario.st_fechado
FROM (
  SELECT 0 AS nr_dia_semana, NULL AS hr_abertura, NULL AS hr_fechamento, TRUE AS st_fechado
  UNION ALL SELECT 1, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 2, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 3, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 4, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 5, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 6, '09:00:00', '17:00:00', FALSE
) horario
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_horario_unidade WHERE fk_unidade = @id_unidade_demo AND nr_dia_semana = horario.nr_dia_semana);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Corte unissex', 'Corte de cabelo personalizado.', 65.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Escova', 'Lavagem e escova.', 55.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Hidratação capilar', 'Tratamento hidratante para os fios.', 90.00, 60
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Coloração', 'Coloração capilar completa.', 180.00, 120
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração' LIMIT 1);

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Ana Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo');
SET @id_profissional_demo_1 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_1, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Caio Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo');
SET @id_profissional_demo_2 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_2, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_2 IS NOT NULL;

-- Hair Plus Demo - Vila Friburgo: aproximadamente 1.6 km da unidade Senac.
-- Hair Plus Demo - Vila Friburgo: documento sintético de demonstração; o CNPJ não é uma inscrição empresarial real.
INSERT INTO tb_unidade (
  fk_salao, nm_unidade, ds_slug, tp_categoria, ds_rua, nu_endereco, ds_complemento,
  ds_bairro, ds_municipio, ds_estado, ds_pais, nu_cep, ds_email, tp_documento,
  ds_documento_cifrado, ds_documento_indice, ds_cnpj_raiz_indice,
  nu_latitude, nu_longitude, nu_telefone
)
SELECT 1, 'Hair Plus Demo - Vila Friburgo', 'hair-plus-demo-vila-friburgo', 'UNISSEX',
  'Avenida do Rio Bonito', '1300', NULL, 'Vila Friburgo',
  'São Paulo', 'SP', 'BR', '04776002', 'hairplus-demo-vilafriburgo@example.com', 'CNPJ',
  'v1:A2Q53dfoGrK4Adsu:xAgiUkVgC595_3eHpC3ryg:Avj9NQL8BbyOmFRJRUY', 'bbca04deb6de9196e8961a5623be090b164e87831d703d832a33ec19f748bffd', '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e',
  -23.6842100, -46.7033500, '11990000004'
FROM tb_salao salao
WHERE salao.id_salao = 1
  AND salao.ds_cnpj_raiz_indice = '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e'
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-vila-friburgo')
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE ds_documento_indice = 'bbca04deb6de9196e8961a5623be090b164e87831d703d832a33ec19f748bffd');
SET @id_unidade_demo = (SELECT id_unidade FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-vila-friburgo' LIMIT 1);


-- Horários da filial: segunda a sexta, 09:00–19:00; sábado, 09:00–17:00; domingo fechado.
INSERT INTO tb_horario_unidade (fk_unidade, nr_dia_semana, hr_abertura, hr_fechamento, st_fechado)
SELECT @id_unidade_demo, horario.nr_dia_semana, horario.hr_abertura, horario.hr_fechamento, horario.st_fechado
FROM (
  SELECT 0 AS nr_dia_semana, NULL AS hr_abertura, NULL AS hr_fechamento, TRUE AS st_fechado
  UNION ALL SELECT 1, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 2, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 3, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 4, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 5, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 6, '09:00:00', '17:00:00', FALSE
) horario
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_horario_unidade WHERE fk_unidade = @id_unidade_demo AND nr_dia_semana = horario.nr_dia_semana);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Corte unissex', 'Corte de cabelo personalizado.', 65.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Escova', 'Lavagem e escova.', 55.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Hidratação capilar', 'Tratamento hidratante para os fios.', 90.00, 60
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Coloração', 'Coloração capilar completa.', 180.00, 120
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração' LIMIT 1);

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Ana Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo');
SET @id_profissional_demo_1 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_1, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Caio Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo');
SET @id_profissional_demo_2 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_2, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_2 IS NOT NULL;

-- Hair Plus Demo - Socorro Norte: aproximadamente 2.4 km da unidade Senac.
-- Hair Plus Demo - Socorro Norte: documento sintético de demonstração; o CNPJ não é uma inscrição empresarial real.
INSERT INTO tb_unidade (
  fk_salao, nm_unidade, ds_slug, tp_categoria, ds_rua, nu_endereco, ds_complemento,
  ds_bairro, ds_municipio, ds_estado, ds_pais, nu_cep, ds_email, tp_documento,
  ds_documento_cifrado, ds_documento_indice, ds_cnpj_raiz_indice,
  nu_latitude, nu_longitude, nu_telefone
)
SELECT 1, 'Hair Plus Demo - Socorro Norte', 'hair-plus-demo-socorro-norte', 'UNISSEX',
  'Rua Professor Francisco Lopes Chagas', '130', NULL, 'Socorro',
  'São Paulo', 'SP', 'BR', '04776120', 'hairplus-demo-socorronorte@example.com', 'CNPJ',
  'v1:o7g4CMeKlmWDCgHf:8rJNAwGcdTDm3j4VNQUPFQ:agswqsEABBoYGWDdW5c', 'a3010a37e909bf7cff171f407aa04bdf0b3af50e175543a4ca4391acdb84263e', '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e',
  -23.6906800, -46.7003200, '11990000005'
FROM tb_salao salao
WHERE salao.id_salao = 1
  AND salao.ds_cnpj_raiz_indice = '94f275b3ce6177cb809ac1e733ce9288eec7e99d98c196951f9462d6fa5d5b5e'
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-socorro-norte')
  AND NOT EXISTS (SELECT 1 FROM tb_unidade WHERE ds_documento_indice = 'a3010a37e909bf7cff171f407aa04bdf0b3af50e175543a4ca4391acdb84263e');
SET @id_unidade_demo = (SELECT id_unidade FROM tb_unidade WHERE fk_salao = 1 AND ds_slug = 'hair-plus-demo-socorro-norte' LIMIT 1);


-- Horários da filial: segunda a sexta, 09:00–19:00; sábado, 09:00–17:00; domingo fechado.
INSERT INTO tb_horario_unidade (fk_unidade, nr_dia_semana, hr_abertura, hr_fechamento, st_fechado)
SELECT @id_unidade_demo, horario.nr_dia_semana, horario.hr_abertura, horario.hr_fechamento, horario.st_fechado
FROM (
  SELECT 0 AS nr_dia_semana, NULL AS hr_abertura, NULL AS hr_fechamento, TRUE AS st_fechado
  UNION ALL SELECT 1, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 2, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 3, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 4, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 5, '09:00:00', '19:00:00', FALSE
  UNION ALL SELECT 6, '09:00:00', '17:00:00', FALSE
) horario
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_horario_unidade WHERE fk_unidade = @id_unidade_demo AND nr_dia_semana = horario.nr_dia_semana);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Corte unissex', 'Corte de cabelo personalizado.', 65.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Escova', 'Lavagem e escova.', 55.00, 45
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Hidratação capilar', 'Tratamento hidratante para os fios.', 90.00, 60
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar' LIMIT 1);

INSERT INTO tb_servico (fk_unidade, nm_servico, ds_servico, vl_servico, nu_duracao_minutos)
SELECT @id_unidade_demo, 'Coloração', 'Coloração capilar completa.', 180.00, 120
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração');
SET @id_servico_demo = (SELECT id_servico FROM tb_servico WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração' LIMIT 1);

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Ana Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo');
SET @id_profissional_demo_1 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Ana Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_1, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Hidratação capilar'
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_1, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_1 IS NOT NULL;

INSERT INTO tb_funcionario (fk_unidade, nm_funcionario, st_ativo)
SELECT @id_unidade_demo, 'Caio Demo', TRUE
FROM DUAL
WHERE @id_unidade_demo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo');
SET @id_profissional_demo_2 = (SELECT id_funcionario FROM tb_funcionario WHERE fk_unidade = @id_unidade_demo AND nm_funcionario = 'Caio Demo' LIMIT 1);

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Corte unissex'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Escova'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_funcionario_servico (fk_funcionario, fk_servico)
SELECT @id_profissional_demo_2, id_servico
FROM tb_servico
WHERE fk_unidade = @id_unidade_demo AND nm_servico = 'Coloração'
  AND @id_profissional_demo_2 IS NOT NULL;

INSERT IGNORE INTO tb_disponibilidade_funcionario (fk_funcionario, nr_dia_semana, hr_inicio, hr_fim)
SELECT @id_profissional_demo_2, nr_dia_semana, hr_abertura, hr_fechamento
FROM tb_horario_unidade
WHERE fk_unidade = @id_unidade_demo AND st_fechado = FALSE
  AND @id_profissional_demo_2 IS NOT NULL;


COMMIT;

-- Resultado: deve haver quatro filiais de demonstração para o salão 1.
SELECT COUNT(*) AS filiais_demo
FROM tb_unidade
WHERE fk_salao = 1 AND ds_slug IN ('hair-plus-demo-vila-lisboa', 'hair-plus-demo-socorro', 'hair-plus-demo-vila-friburgo', 'hair-plus-demo-socorro-norte');
