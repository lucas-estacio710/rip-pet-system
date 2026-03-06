-- Migration: Corrige os caminhos de imagem_url dos produtos
-- Converte 'Estoque_Images//' e 'Estoque_Images/' para '/estoque/'

-- Atualizar todos os produtos que têm imagem_url com o path antigo
UPDATE produtos
SET imagem_url = REPLACE(REPLACE(imagem_url, 'Estoque_Images//', '/estoque/'), 'Estoque_Images/', '/estoque/')
WHERE imagem_url IS NOT NULL
  AND imagem_url LIKE 'Estoque_Images%';

-- Verificar resultado
-- SELECT codigo, nome, imagem_url FROM produtos WHERE imagem_url IS NOT NULL LIMIT 20;
