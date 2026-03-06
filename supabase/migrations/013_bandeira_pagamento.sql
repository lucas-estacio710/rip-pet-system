-- Migration: Adicionar bandeira do cartão em pagamentos
-- Data: 2026-01-22
-- Descrição: Campo para armazenar a bandeira do cartão usado no pagamento

ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS bandeira VARCHAR(20);

COMMENT ON COLUMN pagamentos.bandeira IS 'Bandeira do cartão: master, visa, elo, amex, hiper';
