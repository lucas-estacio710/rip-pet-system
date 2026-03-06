-- =============================================
-- Migration: 020_status_supinda.sql
-- Descrição: Adiciona campo status na tabela supindas
-- Data: 2026-01-30
-- =============================================

-- Criar ENUM para status da supinda
CREATE TYPE status_supinda AS ENUM (
  'planejada',      -- Supinda agendada, ainda não saiu
  'em_andamento',   -- Supinda em viagem para Pinda
  'retornada'       -- Supinda voltou, cinzas disponíveis
);

-- Adicionar coluna status na tabela supindas
ALTER TABLE supindas
ADD COLUMN status status_supinda DEFAULT 'planejada';

-- Atualizar supindas existentes para status correto baseado na data
-- Se a data já passou, provavelmente já retornou
UPDATE supindas
SET status = 'retornada'
WHERE data < CURRENT_DATE - INTERVAL '7 days';

-- Se a data é recente (últimos 7 dias), pode estar em andamento
UPDATE supindas
SET status = 'em_andamento'
WHERE data >= CURRENT_DATE - INTERVAL '7 days'
  AND data < CURRENT_DATE;

-- Se a data é hoje ou futura, está planejada
UPDATE supindas
SET status = 'planejada'
WHERE data >= CURRENT_DATE;

-- Índice para filtrar por status
CREATE INDEX idx_supindas_status ON supindas(status);
