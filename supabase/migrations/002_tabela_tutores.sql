-- Migration: Criar tabela de tutores separada
-- Data: 2026-01-20
-- Descrição: Normaliza os dados de tutores em tabela própria para reutilização

-- 1. Criar tabela de tutores
CREATE TABLE tutores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(200) NOT NULL,
  cpf VARCHAR(20),  -- Aumentado para comportar formatações variadas
  telefone VARCHAR(20),
  telefone2 VARCHAR(20),
  email VARCHAR(200),
  cep VARCHAR(10),
  endereco VARCHAR(300),
  numero VARCHAR(20),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  estado VARCHAR(2),
  observacoes TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Criar índices para busca
CREATE INDEX idx_tutores_nome ON tutores(nome);
CREATE INDEX idx_tutores_cpf ON tutores(cpf);
CREATE INDEX idx_tutores_telefone ON tutores(telefone);
CREATE INDEX idx_tutores_cidade ON tutores(cidade);

-- 3. Adicionar coluna tutor_id na tabela contratos
ALTER TABLE contratos ADD COLUMN tutor_id UUID REFERENCES tutores(id);

-- 4. Criar índice para o relacionamento
CREATE INDEX idx_contratos_tutor_id ON contratos(tutor_id);

-- 5. Trigger para updated_at
CREATE TRIGGER update_tutores_updated_at
  BEFORE UPDATE ON tutores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Migrar dados existentes: criar tutores a partir dos contratos
-- (Agrupa por telefone para evitar duplicatas)
INSERT INTO tutores (nome, cpf, telefone, telefone2, email, cep, endereco, bairro, cidade)
SELECT DISTINCT ON (tutor_telefone)
  tutor_nome,
  tutor_cpf,
  tutor_telefone,
  tutor_telefone2,
  tutor_email,
  tutor_cep,
  tutor_endereco,
  tutor_bairro,
  tutor_cidade
FROM contratos
WHERE tutor_nome IS NOT NULL
ORDER BY tutor_telefone, created_at DESC;

-- 7. Vincular contratos aos tutores criados
UPDATE contratos c
SET tutor_id = t.id
FROM tutores t
WHERE c.tutor_telefone = t.telefone
  AND c.tutor_telefone IS NOT NULL;

-- 8. Para contratos sem telefone, vincular por nome
UPDATE contratos c
SET tutor_id = t.id
FROM tutores t
WHERE c.tutor_id IS NULL
  AND c.tutor_nome = t.nome
  AND c.tutor_nome IS NOT NULL;

-- NOTA: As colunas tutor_* na tabela contratos serão mantidas temporariamente
-- para backup/compatibilidade. Podem ser removidas futuramente com:
-- ALTER TABLE contratos DROP COLUMN tutor_nome, tutor_cpf, tutor_telefone, etc.

COMMENT ON TABLE tutores IS 'Cadastro de tutores (donos dos pets) - normalizado para reutilização entre contratos';
COMMENT ON COLUMN contratos.tutor_id IS 'Referência ao tutor do contrato (tabela tutores)';
