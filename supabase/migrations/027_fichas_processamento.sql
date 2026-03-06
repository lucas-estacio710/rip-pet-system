-- Migration 027: Adicionar campos de processamento na tabela fichas
-- Permite rastrear quais fichas já foram convertidas em contratos

ALTER TABLE fichas ADD COLUMN IF NOT EXISTS processada BOOLEAN DEFAULT false;
ALTER TABLE fichas ADD COLUMN IF NOT EXISTS contrato_id UUID REFERENCES contratos(id);
ALTER TABLE fichas ADD COLUMN IF NOT EXISTS processada_em TIMESTAMPTZ;
ALTER TABLE fichas ADD COLUMN IF NOT EXISTS processada_por UUID REFERENCES funcionarios(id);

-- Index parcial para buscar fichas pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_fichas_processada ON fichas(processada) WHERE processada = false;
