-- Migration: 018_estabelecimento_id.sql
-- Data: 2026-01-28
-- Descrição: Adiciona vínculo entre contratos e estabelecimentos (local de remoção)

-- Adiciona campo estabelecimento_id
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimentos(id);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_contratos_estabelecimento ON contratos(estabelecimento_id);

-- Comentário
COMMENT ON COLUMN contratos.estabelecimento_id IS 'ID do estabelecimento onde foi feita a remoção (clínica)';
