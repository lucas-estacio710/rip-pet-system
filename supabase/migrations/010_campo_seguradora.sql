-- Migration: Adicionar campo seguradora em contratos
-- Data: 2026-01-22
-- Descrição: Campo para armazenar qual seguradora solicitou o atendimento (quando conhecimento = Seguradora)

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS seguradora TEXT;

-- Índice para buscas por seguradora
CREATE INDEX IF NOT EXISTS idx_contratos_seguradora ON contratos(seguradora) WHERE seguradora IS NOT NULL;

COMMENT ON COLUMN contratos.seguradora IS 'Nome da seguradora que solicitou o atendimento (ex: Oi Pet, Ossel, Incluir)';
