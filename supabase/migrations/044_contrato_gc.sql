-- Migration 044: Tabela de Gerenciamento de Cremações (GC)
-- Tracking das etapas internas na Matriz/Pinda

CREATE TABLE IF NOT EXISTS public.contrato_gc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE UNIQUE,

  -- Etapa atual
  etapa TEXT NOT NULL DEFAULT 'recebido' CHECK (etapa IN (
    'recebido',          -- Pet chegou na matriz
    'contato_tutor',     -- Ligou pro tutor, confirmou acompanhamento
    'agendado',          -- Horário reservado no forno
    'pedidos_especiais', -- Molde, pelo extra, carimbo (antigo rescaldo)
    'cremacao',          -- Em cremação / cremado
    'disponivel'         -- Cinzas + certificado no nicho, pronto pra retornar
  )),

  -- Recebimento
  data_recebimento TIMESTAMPTZ DEFAULT NOW(),
  recebido_por TEXT,
  lacre_conferido BOOLEAN DEFAULT false,

  -- Contato com tutor
  acompanhamento_confirmado TEXT CHECK (acompanhamento_confirmado IN (
    'video_chamada', 'video_gravado', 'presencial', 'nao_deseja', NULL
  )),
  contato_tutor_em TIMESTAMPTZ,
  contato_tutor_obs TEXT,

  -- Agendamento
  forno INTEGER CHECK (forno IN (1, 2, 3, NULL)),
  data_agendamento TIMESTAMPTZ,

  -- Cremação
  data_cremacao TIMESTAMPTZ,
  cremacao_por TEXT,

  -- Pedidos especiais (observações adicionais — rescaldos ficam em contrato_rescaldos)
  pedidos_especiais_obs TEXT,

  -- Disponibilização
  cinzas_prontas BOOLEAN DEFAULT false,
  certificado_pronto BOOLEAN DEFAULT false,
  data_disponivel TIMESTAMPTZ,

  -- Observações da unidade (destaque — post-it que Pinda não pode ignorar)
  observacoes_unidade TEXT,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contrato_gc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_contrato_gc" ON public.contrato_gc
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_gc TO authenticated;

CREATE INDEX idx_contrato_gc_contrato ON public.contrato_gc(contrato_id);
CREATE INDEX idx_contrato_gc_etapa ON public.contrato_gc(etapa);
