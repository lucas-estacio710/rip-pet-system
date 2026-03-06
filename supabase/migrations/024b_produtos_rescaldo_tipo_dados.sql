-- Migration 024 - PARTE 2: Rodar DEPOIS da parte 1
-- Cria coluna, indice e flaga os produtos

-- Coluna na tabela produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS rescaldo_tipo tipo_rescaldo NULL;

-- Indice parcial para queries de produtos de rescaldo
CREATE INDEX IF NOT EXISTS idx_produtos_rescaldo_tipo ON produtos(rescaldo_tipo) WHERE rescaldo_tipo IS NOT NULL;

-- Flagar produtos existentes
UPDATE produtos SET rescaldo_tipo = 'molde_patinha' WHERE codigo IN (
  '0003',                                            -- Molde de Patinha (avulso)
  '1401','1402','1403','1404','1405','1406','1406p',  -- Porta-Retrato + Molde combos
  '1408b','1408p',                                    -- Porta-Retrato + Molde Patas
  '0401','0402','0403'                                -- Urna Porta-Retrato
);
UPDATE produtos SET rescaldo_tipo = 'carimbo' WHERE codigo = '1407';
UPDATE produtos SET rescaldo_tipo = 'pelo_extra' WHERE codigo IN (
  '0007',                                              -- Pelo Extra (avulso legado)
  '2005b','2003b','2005','2005a','2005aaa','2005AA',   -- Pingente c/ Visor Porta Pelo (variantes)
  '2003a','2003aaa','2003AA',                          -- Pingente c/ Visor Porta Pelo Prata
  '1810b','1810a',                                     -- Chaveiro com Visor Porta-Cinzas
  '2008','2007',                                       -- Pingente Coração Porta Pelo
  '2010','2011'                                        -- Pingente Visor Strass Porta-Pelo
);
UPDATE produtos SET rescaldo_tipo = 'itens_pessoais' WHERE codigo = '0006';

-- Pelinho (0004) NAO recebe flag — tem fluxo proprio (pelinho_quer/feito/quantidade)
