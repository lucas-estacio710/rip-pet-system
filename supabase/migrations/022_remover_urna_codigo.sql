-- Migration: 022_remover_urna_codigo.sql
-- Data: 2026-02-10
-- Descrição: Remove campo desnormalizado urna_codigo de contratos.
-- A informação de urna agora vem exclusivamente de contrato_produtos (tipo='urna').

DROP INDEX IF EXISTS idx_contratos_urna_codigo;
ALTER TABLE contratos DROP COLUMN IF EXISTS urna_codigo;
