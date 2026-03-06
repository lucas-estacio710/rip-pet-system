-- Migration: 015_clinica_coleta.sql
-- Data: 2026-01-27
-- Descrição: Adiciona campo para nome da clínica quando local_coleta = 'Clínica'

-- Adiciona campo clinica_coleta
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS clinica_coleta TEXT;

-- Comentário
COMMENT ON COLUMN contratos.clinica_coleta IS 'Nome da clínica quando local_coleta = Clínica';
