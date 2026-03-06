-- Migration: Converter varchar para text (recomendação Supabase/Postgres)
-- Data: 2026-01-22

-- id_transacao: varchar(50) -> text
ALTER TABLE pagamentos ALTER COLUMN id_transacao TYPE text;

-- bandeira: varchar(20) -> text
ALTER TABLE pagamentos ALTER COLUMN bandeira TYPE text;
