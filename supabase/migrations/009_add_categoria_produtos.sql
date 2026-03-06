-- Migration: Adiciona campo categoria para clustering de produtos
-- Categorias por Estilo/Formato das urnas

-- Adicionar coluna categoria
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50);

-- Criar índice para filtros
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);

-- ===========================================
-- CATEGORIZAR URNAS POR ESTILO/FORMATO
-- ===========================================

-- 1. PLANO (inclusas no plano - grátis)
UPDATE produtos SET categoria = 'Plano'
WHERE tipo = 'urna'
  AND (nome LIKE '%Plano%' OR nome LIKE '% Plano')
  AND categoria IS NULL;

-- 2. MDF (urnas de madeira MDF)
UPDATE produtos SET categoria = 'MDF'
WHERE tipo = 'urna'
  AND nome LIKE '%MDF%'
  AND categoria IS NULL;

-- 3. COM FOTO (porta-retrato, com foto)
UPDATE produtos SET categoria = 'Com Foto'
WHERE tipo = 'urna'
  AND (nome LIKE '%Porta-Retrato%' OR nome LIKE '%com Foto%' OR nome LIKE '%com 2 fotos%')
  AND categoria IS NULL;

-- 4. PET SLEEPING (pet dormindo)
UPDATE produtos SET categoria = 'Pet Sleeping'
WHERE tipo = 'urna'
  AND nome LIKE '%Sleeping%'
  AND categoria IS NULL;

-- 5. CESTINHA
UPDATE produtos SET categoria = 'Cestinha'
WHERE tipo = 'urna'
  AND nome LIKE '%Cestinha%'
  AND categoria IS NULL;

-- 6. CORAÇÃO
UPDATE produtos SET categoria = 'Coracao'
WHERE tipo = 'urna'
  AND (nome LIKE '%Coração%' OR nome LIKE '%Heart%' OR nome LIKE '%Coraçãozinho%')
  AND categoria IS NULL;

-- 7. ARCA/BAÚ
UPDATE produtos SET categoria = 'Arca'
WHERE tipo = 'urna'
  AND (nome LIKE '%Arca%' OR nome LIKE '%Baú%')
  AND categoria IS NULL;

-- 8. TORRE
UPDATE produtos SET categoria = 'Torre'
WHERE tipo = 'urna'
  AND nome LIKE '%Tower%'
  AND categoria IS NULL;

-- 9. CERÂMICA/POTE
UPDATE produtos SET categoria = 'Ceramica'
WHERE tipo = 'urna'
  AND (nome LIKE '%Cerâmica%' OR nome LIKE '%Pote%')
  AND categoria IS NULL;

-- 10. BIOURNA (biodegradável/ecológica)
UPDATE produtos SET categoria = 'Biourna'
WHERE tipo = 'urna'
  AND (nome LIKE '%Biourna%' OR nome LIKE '%Biossolúvel%')
  AND categoria IS NULL;

-- 11. PIETRA
UPDATE produtos SET categoria = 'Pietra'
WHERE tipo = 'urna'
  AND nome LIKE '%Pietra%'
  AND categoria IS NULL;

-- 12. PINE
UPDATE produtos SET categoria = 'Pine'
WHERE tipo = 'urna'
  AND nome LIKE '%Pine%'
  AND categoria IS NULL;

-- 13. PETMEMORY
UPDATE produtos SET categoria = 'PetMemory'
WHERE tipo = 'urna'
  AND nome LIKE '%PetMemory%'
  AND categoria IS NULL;

-- 14. SÃO FRANCISCO
UPDATE produtos SET categoria = 'Sao Francisco'
WHERE tipo = 'urna'
  AND nome LIKE '%São Francisco%'
  AND categoria IS NULL;

-- 15. MÁRMORE/PREMIUM
UPDATE produtos SET categoria = 'Marmore'
WHERE tipo = 'urna'
  AND (nome LIKE '%Mármore%' OR nome LIKE '%Carrara%' OR nome LIKE '%Travertino%' OR nome LIKE '%Granito%')
  AND categoria IS NULL;

-- 16. INOX
UPDATE produtos SET categoria = 'Inox'
WHERE tipo = 'urna'
  AND nome LIKE '%Inox%'
  AND categoria IS NULL;

-- 17. PETBOX
UPDATE produtos SET categoria = 'Petbox'
WHERE tipo = 'urna'
  AND nome LIKE '%Petbox%'
  AND categoria IS NULL;

-- 18. FIGURATIVO (formato de animal)
UPDATE produtos SET categoria = 'Figurativo'
WHERE tipo = 'urna'
  AND (
    nome LIKE 'Cachorrinho %'
    OR nome LIKE 'Gatinho %'
    OR nome LIKE 'Novelo %'
    OR nome LIKE 'Gato Deitado%'
    OR nome LIKE 'Lovecat%'
    OR nome LIKE '%Anjo%'
  )
  AND categoria IS NULL;

-- 19. CASINHA
UPDATE produtos SET categoria = 'Casinha'
WHERE tipo = 'urna'
  AND nome LIKE '%Casinha%'
  AND categoria IS NULL;

-- 20. IMPERIAL
UPDATE produtos SET categoria = 'Imperial'
WHERE tipo = 'urna'
  AND nome LIKE '%Imperial%'
  AND categoria IS NULL;

-- 21. ROMA
UPDATE produtos SET categoria = 'Roma'
WHERE tipo = 'urna'
  AND nome LIKE '%Roma%'
  AND categoria IS NULL;

-- 22. REDONDA
UPDATE produtos SET categoria = 'Redonda'
WHERE tipo = 'urna'
  AND nome LIKE '%Redonda%'
  AND categoria IS NULL;

-- 23. PORTA OBJETOS
UPDATE produtos SET categoria = 'Porta Objetos'
WHERE tipo = 'urna'
  AND nome LIKE '%Porta Objetos%'
  AND categoria IS NULL;

-- 24. AMIGOS DE CORAÇÃO (linha especial com foto)
UPDATE produtos SET categoria = 'Com Foto'
WHERE tipo = 'urna'
  AND nome LIKE '%Amigos de Coração%'
  AND categoria IS NULL;

-- OUTROS (urnas sem categoria identificada)
UPDATE produtos SET categoria = 'Outros'
WHERE tipo = 'urna'
  AND categoria IS NULL
  AND codigo != '0001'; -- Ignorar "Nenhuma Urna"

-- ===========================================
-- CATEGORIZAR ACESSÓRIOS
-- ===========================================

-- Porta-Retrato/Molde
UPDATE produtos SET categoria = 'Porta-Retrato'
WHERE tipo = 'acessorio'
  AND nome LIKE '%Porta-Retrato%'
  AND categoria IS NULL;

-- Pingentes
UPDATE produtos SET categoria = 'Pingente'
WHERE tipo = 'acessorio'
  AND nome LIKE '%Pingente%'
  AND categoria IS NULL;

-- Chaveiros/Cápsulas
UPDATE produtos SET categoria = 'Chaveiro'
WHERE tipo = 'acessorio'
  AND (nome LIKE '%Chaveiro%' OR nome LIKE '%Cápsula%')
  AND categoria IS NULL;

-- Miniaturas
UPDATE produtos SET categoria = 'Miniatura'
WHERE tipo = 'acessorio'
  AND nome LIKE '%Miniatura%'
  AND categoria IS NULL;

-- Elementos para pingentes (patinha, gatinho, etc.)
UPDATE produtos SET categoria = 'Elemento'
WHERE tipo = 'acessorio'
  AND nome LIKE '%p/ Visor%'
  AND categoria IS NULL;

-- Carimbo
UPDATE produtos SET categoria = 'Carimbo'
WHERE tipo = 'acessorio'
  AND nome LIKE '%Carimbo%'
  AND categoria IS NULL;

-- Plaquinha
UPDATE produtos SET categoria = 'Plaquinha'
WHERE tipo = 'acessorio'
  AND nome LIKE '%Plaquinha%'
  AND categoria IS NULL;

-- Diamante (especial)
UPDATE produtos SET categoria = 'Diamante'
WHERE tipo = 'acessorio'
  AND nome LIKE '%Diamante%'
  AND categoria IS NULL;

-- Outros acessórios
UPDATE produtos SET categoria = 'Outros'
WHERE tipo = 'acessorio'
  AND categoria IS NULL
  AND codigo NOT IN ('0002', '0003', '0007', '0008'); -- Ignorar itens especiais

-- ===========================================
-- CATEGORIZAR INCLUSOS
-- ===========================================
UPDATE produtos SET categoria = 'Incluso'
WHERE tipo = 'incluso'
  AND categoria IS NULL;

-- Verificar resultado
-- SELECT tipo, categoria, COUNT(*) as qtd FROM produtos GROUP BY tipo, categoria ORDER BY tipo, categoria;
