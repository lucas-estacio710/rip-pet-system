-- Migration: Taxas de cartão pré-programadas e valor_liquido_sem_taxa
-- Data: 2026-01-22
-- Descrição: Sistema de taxas automáticas por tipo de cartão

-- 1. Adicionar campos em pagamentos
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS valor_liquido_sem_taxa DECIMAL(10,2);
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS id_transacao VARCHAR(50);  -- Número da maquininha

COMMENT ON COLUMN pagamentos.valor_liquido_sem_taxa IS 'Valor que o cliente pagou (valor - desconto), antes da taxa do cartão';
COMMENT ON COLUMN pagamentos.valor_liquido IS 'Valor que entrou na conta (valor - desconto - taxa)';

-- 2. Atualizar registros existentes (calcular valor_liquido_sem_taxa)
UPDATE pagamentos
SET valor_liquido_sem_taxa = valor - COALESCE(desconto, 0)
WHERE valor_liquido_sem_taxa IS NULL;

-- 3. Criar tabela de taxas de cartão
CREATE TABLE IF NOT EXISTS taxas_cartao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(20) NOT NULL UNIQUE,  -- 'credito', 'debito', 'credito_parcelado', etc.
  nome VARCHAR(50) NOT NULL,         -- 'Crédito à Vista', 'Débito', 'Crédito 2x', etc.
  percentual DECIMAL(5,2) NOT NULL,  -- Ex: 4.99, 2.50
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,           -- Para ordenar na listagem
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
CREATE TRIGGER set_taxas_cartao_updated_at
  BEFORE UPDATE ON taxas_cartao
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. Inserir taxas Granito por bandeira e parcelas
-- Taxas: Débito usa taxa débito, Crédito à Vista usa taxa crédito,
-- 2x-6x usa taxa até 6x, 7x-12x usa taxa até 12x
INSERT INTO taxas_cartao (tipo, nome, percentual, ordem) VALUES
  -- Master
  ('master_debito', 'Débito', 1.01, 1),
  ('master_1x', 'Crédito à Vista', 2.31, 2),
  ('master_2x', 'Crédito 2x', 3.20, 3),
  ('master_3x', 'Crédito 3x', 3.20, 4),
  ('master_4x', 'Crédito 4x', 3.20, 5),
  ('master_5x', 'Crédito 5x', 3.20, 6),
  ('master_6x', 'Crédito 6x', 3.20, 7),
  ('master_7x', 'Crédito 7x', 3.86, 8),
  ('master_8x', 'Crédito 8x', 3.86, 9),
  ('master_9x', 'Crédito 9x', 3.86, 10),
  ('master_10x', 'Crédito 10x', 3.86, 11),
  ('master_11x', 'Crédito 11x', 3.86, 12),
  ('master_12x', 'Crédito 12x', 3.86, 13),
  -- Visa
  ('visa_debito', 'Débito', 1.28, 14),
  ('visa_1x', 'Crédito à Vista', 2.41, 15),
  ('visa_2x', 'Crédito 2x', 3.18, 16),
  ('visa_3x', 'Crédito 3x', 3.18, 17),
  ('visa_4x', 'Crédito 4x', 3.18, 18),
  ('visa_5x', 'Crédito 5x', 3.18, 19),
  ('visa_6x', 'Crédito 6x', 3.18, 20),
  ('visa_7x', 'Crédito 7x', 4.11, 21),
  ('visa_8x', 'Crédito 8x', 4.11, 22),
  ('visa_9x', 'Crédito 9x', 4.11, 23),
  ('visa_10x', 'Crédito 10x', 4.11, 24),
  ('visa_11x', 'Crédito 11x', 4.11, 25),
  ('visa_12x', 'Crédito 12x', 4.11, 26),
  -- Elo
  ('elo_debito', 'Débito', 1.59, 27),
  ('elo_1x', 'Crédito à Vista', 2.67, 28),
  ('elo_2x', 'Crédito 2x', 3.73, 29),
  ('elo_3x', 'Crédito 3x', 3.73, 30),
  ('elo_4x', 'Crédito 4x', 3.73, 31),
  ('elo_5x', 'Crédito 5x', 3.73, 32),
  ('elo_6x', 'Crédito 6x', 3.73, 33),
  ('elo_7x', 'Crédito 7x', 4.41, 34),
  ('elo_8x', 'Crédito 8x', 4.41, 35),
  ('elo_9x', 'Crédito 9x', 4.41, 36),
  ('elo_10x', 'Crédito 10x', 4.41, 37),
  ('elo_11x', 'Crédito 11x', 4.41, 38),
  ('elo_12x', 'Crédito 12x', 4.41, 39),
  -- American Express (sem débito)
  ('amex_1x', 'Crédito à Vista', 3.39, 40),
  ('amex_2x', 'Crédito 2x', 4.23, 41),
  ('amex_3x', 'Crédito 3x', 4.23, 42),
  ('amex_4x', 'Crédito 4x', 4.23, 43),
  ('amex_5x', 'Crédito 5x', 4.23, 44),
  ('amex_6x', 'Crédito 6x', 4.23, 45),
  ('amex_7x', 'Crédito 7x', 4.55, 46),
  ('amex_8x', 'Crédito 8x', 4.55, 47),
  ('amex_9x', 'Crédito 9x', 4.55, 48),
  ('amex_10x', 'Crédito 10x', 4.55, 49),
  ('amex_11x', 'Crédito 11x', 4.55, 50),
  ('amex_12x', 'Crédito 12x', 4.55, 51),
  -- Hipercard (sem débito)
  ('hiper_1x', 'Crédito à Vista', 2.20, 52),
  ('hiper_2x', 'Crédito 2x', 3.71, 53),
  ('hiper_3x', 'Crédito 3x', 3.71, 54),
  ('hiper_4x', 'Crédito 4x', 3.71, 55),
  ('hiper_5x', 'Crédito 5x', 3.71, 56),
  ('hiper_6x', 'Crédito 6x', 3.71, 57),
  ('hiper_7x', 'Crédito 7x', 4.35, 58),
  ('hiper_8x', 'Crédito 8x', 4.35, 59),
  ('hiper_9x', 'Crédito 9x', 4.35, 60),
  ('hiper_10x', 'Crédito 10x', 4.35, 61),
  ('hiper_11x', 'Crédito 11x', 4.35, 62),
  ('hiper_12x', 'Crédito 12x', 4.35, 63)
ON CONFLICT (tipo) DO NOTHING;

-- 5. Índice para busca
CREATE INDEX IF NOT EXISTS idx_taxas_cartao_ativo ON taxas_cartao(ativo) WHERE ativo = true;
