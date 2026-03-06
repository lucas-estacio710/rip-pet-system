-- Migration 031: Tabela de leads capturados via popup da LP
-- Permite INSERT anônimo (popup sem login) + acesso total pra authenticated (CRM)

CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cidade TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'telefone')),
  telefone_destino TEXT,
  gclid TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  pagina_origem TEXT,
  dispositivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  convertido BOOLEAN DEFAULT FALSE,
  contrato_id UUID,
  convertido_em TIMESTAMPTZ,
  convertido_por UUID,
  notas TEXT
);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Popup da LP insere sem login
CREATE POLICY "anon_insert_leads" ON leads
  FOR INSERT WITH CHECK (true);

-- CRM (logado) tem acesso total
CREATE POLICY "auth_full_leads" ON leads
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Grants (necessário pra anon inserir via LP e authenticated gerenciar no CRM)
GRANT INSERT ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

-- Indexes
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_convertido ON leads(convertido) WHERE convertido = FALSE;
CREATE INDEX idx_leads_gclid ON leads(gclid) WHERE gclid IS NOT NULL;
