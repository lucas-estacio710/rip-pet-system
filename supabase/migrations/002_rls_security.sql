-- =============================================
-- R.I.P. PET - POLÍTICAS DE SEGURANÇA (RLS)
-- =============================================
-- Este script habilita Row Level Security em todas as tabelas
-- Por enquanto, permite acesso apenas para usuários autenticados
--
-- IMPORTANTE: Execute este SQL no Supabase SQL Editor
-- =============================================

-- ============ HABILITAR RLS EM TODAS AS TABELAS ============

ALTER TABLE indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE fontes_conhecimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
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

-- ============ POLÍTICAS DE ACESSO ============
-- Por agora, vamos permitir acesso total para usuários autenticados
-- Depois podemos refinar com roles específicas (admin, operador, etc.)

-- Indicadores
CREATE POLICY "Usuários autenticados podem ver indicadores" ON indicadores
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar indicadores" ON indicadores
  FOR ALL USING (auth.role() = 'authenticated');

-- Funcionários
CREATE POLICY "Usuários autenticados podem ver funcionarios" ON funcionarios
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar funcionarios" ON funcionarios
  FOR ALL USING (auth.role() = 'authenticated');

-- Fontes de conhecimento
CREATE POLICY "Usuários autenticados podem ver fontes" ON fontes_conhecimento
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar fontes" ON fontes_conhecimento
  FOR ALL USING (auth.role() = 'authenticated');

-- Contratos (tabela principal - mais sensível)
CREATE POLICY "Usuários autenticados podem ver contratos" ON contratos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contratos" ON contratos
  FOR ALL USING (auth.role() = 'authenticated');

-- Supindas
CREATE POLICY "Usuários autenticados podem ver supindas" ON supindas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar supindas" ON supindas
  FOR ALL USING (auth.role() = 'authenticated');

-- Produtos
CREATE POLICY "Usuários autenticados podem ver produtos" ON produtos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar produtos" ON produtos
  FOR ALL USING (auth.role() = 'authenticated');

-- Estoque entradas
CREATE POLICY "Usuários autenticados podem ver estoque_entradas" ON estoque_entradas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar estoque_entradas" ON estoque_entradas
  FOR ALL USING (auth.role() = 'authenticated');

-- Contrato produtos
CREATE POLICY "Usuários autenticados podem ver contrato_produtos" ON contrato_produtos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contrato_produtos" ON contrato_produtos
  FOR ALL USING (auth.role() = 'authenticated');

-- Estoque empréstimos
CREATE POLICY "Usuários autenticados podem ver estoque_emprestimos" ON estoque_emprestimos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar estoque_emprestimos" ON estoque_emprestimos
  FOR ALL USING (auth.role() = 'authenticated');

-- Contas
CREATE POLICY "Usuários autenticados podem ver contas" ON contas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contas" ON contas
  FOR ALL USING (auth.role() = 'authenticated');

-- Pagamentos
CREATE POLICY "Usuários autenticados podem ver pagamentos" ON pagamentos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar pagamentos" ON pagamentos
  FOR ALL USING (auth.role() = 'authenticated');

-- Mensagem templates
CREATE POLICY "Usuários autenticados podem ver mensagem_templates" ON mensagem_templates
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar mensagem_templates" ON mensagem_templates
  FOR ALL USING (auth.role() = 'authenticated');

-- Contrato mensagens
CREATE POLICY "Usuários autenticados podem ver contrato_mensagens" ON contrato_mensagens
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contrato_mensagens" ON contrato_mensagens
  FOR ALL USING (auth.role() = 'authenticated');

-- Tarefa tipos
CREATE POLICY "Usuários autenticados podem ver tarefa_tipos" ON tarefa_tipos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar tarefa_tipos" ON tarefa_tipos
  FOR ALL USING (auth.role() = 'authenticated');

-- Tarefas
CREATE POLICY "Usuários autenticados podem ver tarefas" ON tarefas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar tarefas" ON tarefas
  FOR ALL USING (auth.role() = 'authenticated');

-- Contrato rescaldos
CREATE POLICY "Usuários autenticados podem ver contrato_rescaldos" ON contrato_rescaldos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contrato_rescaldos" ON contrato_rescaldos
  FOR ALL USING (auth.role() = 'authenticated');

-- Contrato itens pessoais
CREATE POLICY "Usuários autenticados podem ver contrato_itens_pessoais" ON contrato_itens_pessoais
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contrato_itens_pessoais" ON contrato_itens_pessoais
  FOR ALL USING (auth.role() = 'authenticated');

-- Rotas entrega
CREATE POLICY "Usuários autenticados podem ver rotas_entrega" ON rotas_entrega
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar rotas_entrega" ON rotas_entrega
  FOR ALL USING (auth.role() = 'authenticated');

-- Rota entregas
CREATE POLICY "Usuários autenticados podem ver rota_entregas" ON rota_entregas
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar rota_entregas" ON rota_entregas
  FOR ALL USING (auth.role() = 'authenticated');

-- Contrato restrições entrega
CREATE POLICY "Usuários autenticados podem ver contrato_restricoes_entrega" ON contrato_restricoes_entrega
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Usuários autenticados podem modificar contrato_restricoes_entrega" ON contrato_restricoes_entrega
  FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- NOTA: Com RLS habilitado, apenas usuários
-- autenticados via Supabase Auth terão acesso.
--
-- Para desenvolvimento, você pode temporariamente
-- usar a service_role key ou desabilitar RLS.
-- =============================================
