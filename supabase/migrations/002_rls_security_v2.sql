-- =============================================
-- R.I.P. PET - RLS COMPLETO (v2)
-- =============================================
-- Habilita RLS em TODAS as tabelas do projeto
-- Política simples: autenticado = acesso total
-- =============================================

-- ============ HABILITAR RLS ============

ALTER TABLE indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE fontes_conhecimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutores ENABLE ROW LEVEL SECURITY;
ALTER TABLE supindas ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrato_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_emprestimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagem_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrato_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefa_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrato_rescaldos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrato_itens_pessoais ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrato_restricoes_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxas_cartao ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- CRM Comercial
ALTER TABLE estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_alteracoes ENABLE ROW LEVEL SECURITY;

-- Chat/IA
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Fichas digitais
ALTER TABLE fichas ENABLE ROW LEVEL SECURITY;

-- ============ LIMPAR POLÍTICAS ANTIGAS (se existirem) ============

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============ POLÍTICAS: autenticado = acesso total ============

-- Indicadores
CREATE POLICY "auth_full_indicadores" ON indicadores
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Funcionários
CREATE POLICY "auth_full_funcionarios" ON funcionarios
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Fontes de conhecimento
CREATE POLICY "auth_full_fontes_conhecimento" ON fontes_conhecimento
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contratos
CREATE POLICY "auth_full_contratos" ON contratos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tutores
CREATE POLICY "auth_full_tutores" ON tutores
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Supindas
CREATE POLICY "auth_full_supindas" ON supindas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Produtos
CREATE POLICY "auth_full_produtos" ON produtos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Estoque entradas
CREATE POLICY "auth_full_estoque_entradas" ON estoque_entradas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contrato produtos
CREATE POLICY "auth_full_contrato_produtos" ON contrato_produtos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Estoque empréstimos
CREATE POLICY "auth_full_estoque_emprestimos" ON estoque_emprestimos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contas
CREATE POLICY "auth_full_contas" ON contas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Pagamentos
CREATE POLICY "auth_full_pagamentos" ON pagamentos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Mensagem templates
CREATE POLICY "auth_full_mensagem_templates" ON mensagem_templates
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contrato mensagens
CREATE POLICY "auth_full_contrato_mensagens" ON contrato_mensagens
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tarefa tipos
CREATE POLICY "auth_full_tarefa_tipos" ON tarefa_tipos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tarefas
CREATE POLICY "auth_full_tarefas" ON tarefas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contrato rescaldos
CREATE POLICY "auth_full_contrato_rescaldos" ON contrato_rescaldos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contrato itens pessoais
CREATE POLICY "auth_full_contrato_itens_pessoais" ON contrato_itens_pessoais
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Rotas entrega
CREATE POLICY "auth_full_rotas_entrega" ON rotas_entrega
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Rota entregas
CREATE POLICY "auth_full_rota_entregas" ON rota_entregas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contrato restrições entrega
CREATE POLICY "auth_full_contrato_restricoes_entrega" ON contrato_restricoes_entrega
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Taxas cartão
CREATE POLICY "auth_full_taxas_cartao" ON taxas_cartao
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Configurações
CREATE POLICY "auth_full_configuracoes" ON configuracoes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ CRM COMERCIAL ============

-- Estabelecimentos
CREATE POLICY "auth_full_estabelecimentos" ON estabelecimentos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Contatos
CREATE POLICY "auth_full_contatos" ON contatos
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Visitas
CREATE POLICY "auth_full_visitas" ON visitas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Indicações
CREATE POLICY "auth_full_indicacoes" ON indicacoes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Unidades
CREATE POLICY "auth_full_unidades" ON unidades
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Perfis
CREATE POLICY "auth_full_perfis" ON perfis
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Histórico de alterações
CREATE POLICY "auth_full_historico_alteracoes" ON historico_alteracoes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ CHAT / IA ============

-- Conversations
CREATE POLICY "auth_full_conversations" ON conversations
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Messages
CREATE POLICY "auth_full_messages" ON messages
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Conversation context
CREATE POLICY "auth_full_conversation_context" ON conversation_context
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Knowledge base
CREATE POLICY "auth_full_knowledge_base" ON knowledge_base
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============ FICHAS ============

-- Fichas de remoção
CREATE POLICY "auth_full_fichas" ON fichas
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
