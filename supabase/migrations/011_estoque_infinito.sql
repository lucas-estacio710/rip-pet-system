-- Migration: Adicionar campo estoque_infinito em produtos
-- Data: 2026-01-22
-- Descrição: Produtos com estoque infinito são serviços/lembretes que não precisam de controle de estoque

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_infinito BOOLEAN DEFAULT FALSE;

-- Índice para queries de estoque
CREATE INDEX IF NOT EXISTS idx_produtos_estoque_infinito ON produtos(estoque_infinito) WHERE estoque_infinito = TRUE;

COMMENT ON COLUMN produtos.estoque_infinito IS 'Se TRUE, produto não tem controle de estoque (ex: serviços, lembretes)';

-- Marcar produtos específicos como estoque infinito
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Nenhuma Urna%';
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Nenhum Rescaldo%';
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Molde de Patinha%';
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Protocolo de Retorno%';
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Pelo Extra%';
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Retorno de Itens Pessoais%';
UPDATE produtos SET estoque_infinito = TRUE WHERE nome ILIKE '%Foto Dentro do Pingente%';
