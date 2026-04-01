-- ============================================
-- 050: Field-Level Security (FLS)
-- Permissões granulares por campo/botão por unidade + role
-- ============================================

-- Tabela de permissões por campo
-- Apenas exceções são armazenadas (default = 'edit')
-- super_admin NUNCA aparece aqui (hardcoded full access no frontend)
CREATE TABLE field_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tela VARCHAR(50) NOT NULL,        -- ex: 'pipeline', 'contrato_detalhe', 'fichas'
  campo VARCHAR(80) NOT NULL,       -- ex: 'btn_novo_contrato', 'valor_plano', 'sec_financeiro'
  role VARCHAR(20) NOT NULL CHECK (role IN ('gerente', 'operador')),
  permissao VARCHAR(10) NOT NULL CHECK (permissao IN ('edit', 'read', 'hidden')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unidade_id, tela, campo, role)
);

-- Index para query principal: carregar permissões da unidade+role do usuário logado
CREATE INDEX idx_fp_unidade_role ON field_permissions(unidade_id, role);

-- Trigger updated_at
CREATE TRIGGER trg_field_permissions_updated
  BEFORE UPDATE ON field_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE field_permissions ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler (precisa saber suas permissões)
CREATE POLICY "fp_select" ON field_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas super_admin pode modificar
CREATE POLICY "fp_modify" ON field_permissions
  FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY "fp_update" ON field_permissions
  FOR UPDATE USING (public.is_super_admin());

CREATE POLICY "fp_delete" ON field_permissions
  FOR DELETE USING (public.is_super_admin());
