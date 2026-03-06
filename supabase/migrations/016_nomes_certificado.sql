-- Migration: 016_nomes_certificado.sql
-- Data: 2026-01-27
-- Descrição: Adiciona campos para nomes dos tutores no certificado (até 5 nomes)

-- Adiciona campos para nomes do certificado (armazenados em maiúsculas)
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS certificado_nome_1 TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS certificado_nome_2 TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS certificado_nome_3 TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS certificado_nome_4 TEXT;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS certificado_nome_5 TEXT;

-- Flag para indicar se os nomes foram confirmados
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS certificado_confirmado BOOLEAN DEFAULT FALSE;

-- Comentários
COMMENT ON COLUMN contratos.certificado_nome_1 IS 'Nome 1 para o certificado (maiúsculas)';
COMMENT ON COLUMN contratos.certificado_nome_2 IS 'Nome 2 para o certificado (maiúsculas)';
COMMENT ON COLUMN contratos.certificado_nome_3 IS 'Nome 3 para o certificado (maiúsculas)';
COMMENT ON COLUMN contratos.certificado_nome_4 IS 'Nome 4 para o certificado (maiúsculas)';
COMMENT ON COLUMN contratos.certificado_nome_5 IS 'Nome 5 para o certificado (maiúsculas)';
COMMENT ON COLUMN contratos.certificado_confirmado IS 'Se os nomes do certificado foram confirmados';
