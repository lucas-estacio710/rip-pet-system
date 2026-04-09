-- Migration: Adicionar campos criado_por na tabela tarefas + popular tarefa_tipos
-- Data: 2026-04-09

-- Novos campos pra identificar quem criou a tarefa/observação
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS criado_por TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS criado_por_email TEXT;

-- Popular tipos de tarefa (se não existirem)
INSERT INTO tarefa_tipos (nome) VALUES ('Observação da Ficha')
  ON CONFLICT DO NOTHING;
INSERT INTO tarefa_tipos (nome) VALUES ('Observação da Unidade')
  ON CONFLICT DO NOTHING;
INSERT INTO tarefa_tipos (nome) VALUES ('Observação da Matriz')
  ON CONFLICT DO NOTHING;
