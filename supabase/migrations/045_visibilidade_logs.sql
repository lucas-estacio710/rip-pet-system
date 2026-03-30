-- Migration 045: Log de alterações de visibilidade
-- Registra toda mudança em modulos_ativos das unidades

CREATE TABLE IF NOT EXISTS public.visibilidade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES public.unidades(id),
  unidade_nome TEXT NOT NULL,
  alterado_por UUID REFERENCES auth.users(id),
  alterado_por_email TEXT,
  modulos_antes TEXT[] NOT NULL,
  modulos_depois TEXT[] NOT NULL,
  adicionados TEXT[] DEFAULT '{}',
  removidos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.visibilidade_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_visibilidade_logs" ON public.visibilidade_logs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, INSERT ON public.visibilidade_logs TO authenticated;

CREATE INDEX idx_visibilidade_logs_unidade ON public.visibilidade_logs(unidade_id);
CREATE INDEX idx_visibilidade_logs_created ON public.visibilidade_logs(created_at DESC);
