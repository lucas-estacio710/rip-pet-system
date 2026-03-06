-- 028: Adicionar campo valor na tabela fichas
-- Valor do plano/cremação informado na ficha de entrada

ALTER TABLE fichas ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2);
