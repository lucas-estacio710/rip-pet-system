-- =============================================
-- R.I.P. PET CRM - Migration 005
-- Adicionar updated_at em tabelas editáveis
-- Data: 2026-01-21
-- =============================================

-- 1. Adicionar coluna updated_at nas tabelas que não têm

ALTER TABLE contrato_produtos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE pagamentos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE estoque_entradas
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE estoque_emprestimos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Criar função genérica para atualizar updated_at (se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Criar triggers para cada tabela

-- contrato_produtos
DROP TRIGGER IF EXISTS set_updated_at_contrato_produtos ON contrato_produtos;
CREATE TRIGGER set_updated_at_contrato_produtos
    BEFORE UPDATE ON contrato_produtos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- pagamentos
DROP TRIGGER IF EXISTS set_updated_at_pagamentos ON pagamentos;
CREATE TRIGGER set_updated_at_pagamentos
    BEFORE UPDATE ON pagamentos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- estoque_entradas
DROP TRIGGER IF EXISTS set_updated_at_estoque_entradas ON estoque_entradas;
CREATE TRIGGER set_updated_at_estoque_entradas
    BEFORE UPDATE ON estoque_entradas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- estoque_emprestimos
DROP TRIGGER IF EXISTS set_updated_at_estoque_emprestimos ON estoque_emprestimos;
CREATE TRIGGER set_updated_at_estoque_emprestimos
    BEFORE UPDATE ON estoque_emprestimos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Comentários
COMMENT ON COLUMN contrato_produtos.updated_at IS 'Data/hora da última atualização';
COMMENT ON COLUMN pagamentos.updated_at IS 'Data/hora da última atualização';
COMMENT ON COLUMN estoque_entradas.updated_at IS 'Data/hora da última atualização';
COMMENT ON COLUMN estoque_emprestimos.updated_at IS 'Data/hora da última atualização';

-- =============================================
-- FIM DA MIGRATION 005
-- =============================================
