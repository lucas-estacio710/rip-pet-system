-- Migration: 019_foto_recebida.sql
-- Data: 2026-01-28
-- Descrição: Adiciona controle de foto recebida por produto no contrato

-- Campo para marcar se a foto foi recebida para produtos que exigem foto
ALTER TABLE contrato_produtos ADD COLUMN IF NOT EXISTS foto_recebida BOOLEAN DEFAULT false;

-- Comentário
COMMENT ON COLUMN contrato_produtos.foto_recebida IS 'Indica se a foto do pet foi recebida para este produto (só relevante quando produto.precisa_foto = true)';
