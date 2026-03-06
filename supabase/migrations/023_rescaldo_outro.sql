-- Migration 023: Adicionar 'outro' ao enum tipo_rescaldo
-- Permite registrar itens de rescaldo personalizados (cobertinha, etc.)

ALTER TYPE tipo_rescaldo ADD VALUE IF NOT EXISTS 'outro';
