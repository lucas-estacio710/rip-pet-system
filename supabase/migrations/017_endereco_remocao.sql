-- Migration: 017_endereco_remocao.sql
-- Data: 2026-01-28
-- Descrição: Adiciona campos de endereço de remoção (onde o pet foi coletado)
--            Separado do endereço residencial do tutor para fins de estatística

-- Campos de endereço de remoção
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS remocao_endereco TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS remocao_bairro TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS remocao_cidade TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS remocao_cep TEXT;

-- Comentários
COMMENT ON COLUMN contratos.remocao_endereco IS 'Endereço onde o pet foi coletado';
COMMENT ON COLUMN contratos.remocao_bairro IS 'Bairro onde o pet foi coletado';
COMMENT ON COLUMN contratos.remocao_cidade IS 'Cidade onde o pet foi coletado (para estatísticas)';
COMMENT ON COLUMN contratos.remocao_cep IS 'CEP onde o pet foi coletado';

-- Popular com dados existentes (copia do endereço cadastral)
UPDATE contratos SET
    remocao_endereco = tutor_endereco,
    remocao_bairro = tutor_bairro,
    remocao_cidade = tutor_cidade,
    remocao_cep = tutor_cep
WHERE remocao_cidade IS NULL;
