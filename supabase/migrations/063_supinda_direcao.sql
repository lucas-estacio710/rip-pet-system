-- ============================================
-- 063: Direção do contrato na supinda (ida/volta)
-- Uma mesma supinda pode levar pets (ida) e trazer cinzas (volta)
-- ============================================

ALTER TABLE contratos ADD COLUMN supinda_direcao VARCHAR(10)
  CHECK (supinda_direcao IN ('ida', 'volta'));

-- NULL = legado (tratado como 'ida' no código)
-- 'ida' = pet sendo levado pra Pinda
-- 'volta' = cinzas/certificado voltando pra unidade
