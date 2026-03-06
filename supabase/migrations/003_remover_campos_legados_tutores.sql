-- Migration: Remover campos legados de tutor na tabela contratos
-- Data: 2026-01-20
-- ATENÇÃO: Esta migration só deve ser executada após confirmar que:
--   1. Todos os contratos têm tutor_id preenchido
--   2. A aplicação foi atualizada para usar apenas tutor_id
--   3. Um backup completo foi realizado
--
-- Para verificar se é seguro executar:
--   SELECT COUNT(*) FROM contratos WHERE tutor_id IS NULL AND tutor_nome IS NOT NULL;
--   (Deve retornar 0)

-- DESCOMENTADO QUANDO FOR EXECUTAR:

-- 1. Remover colunas legadas de tutor
-- ALTER TABLE contratos
--   DROP COLUMN IF EXISTS tutor_nome,
--   DROP COLUMN IF EXISTS tutor_cpf,
--   DROP COLUMN IF EXISTS tutor_telefone,
--   DROP COLUMN IF EXISTS tutor_telefone2,
--   DROP COLUMN IF EXISTS tutor_email,
--   DROP COLUMN IF EXISTS tutor_cep,
--   DROP COLUMN IF EXISTS tutor_endereco,
--   DROP COLUMN IF EXISTS tutor_numero,
--   DROP COLUMN IF EXISTS tutor_complemento,
--   DROP COLUMN IF EXISTS tutor_bairro,
--   DROP COLUMN IF EXISTS tutor_cidade,
--   DROP COLUMN IF EXISTS tutor_estado;

-- 2. Tornar tutor_id obrigatório (opcional, caso queira forçar o vínculo)
-- ALTER TABLE contratos ALTER COLUMN tutor_id SET NOT NULL;

-- 3. Atualizar comentário da tabela
-- COMMENT ON TABLE contratos IS 'Contratos de cremação - tutor_id é obrigatório e referencia a tabela tutores';

-- NOTA: Manter este arquivo como referência para quando a migração for segura de executar.
