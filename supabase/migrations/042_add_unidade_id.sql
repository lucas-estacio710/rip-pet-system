-- Migration 042: Adicionar unidade_id nas tabelas de dados
-- Backfill todos os registros existentes como Santos

-- ============================================
-- ADICIONAR COLUNA unidade_id
-- ============================================

-- Contratos
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_contratos_unidade ON public.contratos(unidade_id);

-- Fichas
ALTER TABLE public.fichas ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_fichas_unidade ON public.fichas(unidade_id);

-- Supindas
ALTER TABLE public.supindas ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_supindas_unidade ON public.supindas(unidade_id);

-- Tarefas
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_tarefas_unidade ON public.tarefas(unidade_id);

-- Rotas de entrega
ALTER TABLE public.rotas_entrega ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_rotas_entrega_unidade ON public.rotas_entrega(unidade_id);

-- Estoque entradas
ALTER TABLE public.estoque_entradas ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
CREATE INDEX IF NOT EXISTS idx_estoque_entradas_unidade ON public.estoque_entradas(unidade_id);

-- Indicadores
ALTER TABLE public.indicadores ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);

-- Funcionários
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);

-- Leads (já tem unidade_code TEXT, adicionar FK também)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);

-- ============================================
-- BACKFILL: todos os registros existentes → Santos
-- ============================================
DO $$
DECLARE v_santos UUID;
BEGIN
  SELECT id INTO v_santos FROM public.unidades WHERE codigo = 'ST';

  IF v_santos IS NULL THEN
    RAISE EXCEPTION 'Unidade Santos (ST) não encontrada!';
  END IF;

  UPDATE public.contratos SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.fichas SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.supindas SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.tarefas SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.rotas_entrega SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.estoque_entradas SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.indicadores SET unidade_id = v_santos WHERE unidade_id IS NULL;
  UPDATE public.funcionarios SET unidade_id = v_santos WHERE unidade_id IS NULL;

  -- Leads: backfill por unidade_code existente
  UPDATE public.leads SET unidade_id = v_santos WHERE unidade_code = 'ST' AND unidade_id IS NULL;
  UPDATE public.leads SET unidade_id = (SELECT id FROM public.unidades WHERE codigo = 'SP')
    WHERE unidade_code = 'SP' AND unidade_id IS NULL;

  -- Restante sem unidade_code → Santos
  UPDATE public.leads SET unidade_id = v_santos WHERE unidade_id IS NULL;

  RAISE NOTICE 'Backfill concluído para Santos: %', v_santos;
END $$;

-- ============================================
-- TORNAR NOT NULL (sem default — obriga frontend a passar)
-- ============================================
ALTER TABLE public.contratos ALTER COLUMN unidade_id SET NOT NULL;
ALTER TABLE public.fichas ALTER COLUMN unidade_id SET NOT NULL;
-- supindas, tarefas, rotas podem ter registros sem unidade (não forçar por enquanto)
