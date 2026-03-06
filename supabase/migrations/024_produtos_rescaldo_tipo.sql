-- Migration 024 - PARTE 1: Rodar PRIMEIRO no SQL Editor
-- Adiciona enum + coluna + indice (sem usar o novo valor)

-- Adicionar 'itens_pessoais' ao enum tipo_rescaldo
ALTER TYPE tipo_rescaldo ADD VALUE IF NOT EXISTS 'itens_pessoais';
