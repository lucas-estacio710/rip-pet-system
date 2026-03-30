-- Migration 043: Migrar modulos_ativos para novo padrão com prefixos
-- tela_, func_, campo_ para separar Telas, Funcionalidades e Campos

UPDATE unidades SET modulos_ativos = ARRAY(
  SELECT CASE
    WHEN v = 'fichas' THEN 'tela_fichas'
    WHEN v = 'pipeline' THEN 'tela_pipeline'
    WHEN v = 'leads' THEN 'tela_leads'
    WHEN v = 'produtos' THEN 'tela_estoque'
    WHEN v = 'recepcao' THEN 'tela_recepcao'
    WHEN v = 'preventivos' THEN 'tela_preventivos'
    WHEN v = 'pagamentos' THEN 'func_financeiro'
    WHEN v = 'tutores' THEN 'tela_tutores'
    ELSE v
  END
  FROM unnest(modulos_ativos) AS v
);
