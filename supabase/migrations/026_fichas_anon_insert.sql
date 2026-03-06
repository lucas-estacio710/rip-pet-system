-- Migration 026: Permitir INSERT anon na tabela fichas
-- Necessário para a ficha pública (tutor preenche sem login)

-- Policy para permitir INSERT por usuários anônimos (ficha pública via link WhatsApp)
CREATE POLICY "anon_insert_fichas" ON fichas
  FOR INSERT
  WITH CHECK (true);

-- Anon NÃO pode ler, atualizar ou deletar fichas
-- Somente authenticated tem acesso completo (já coberto por auth_full_fichas)

-- Adicionar coluna idade (faltava na tabela original)
ALTER TABLE fichas ADD COLUMN IF NOT EXISTS idade text;
