-- ============================================
-- 062: Compartilhamento de contratos entre unidades
-- Permite que uma unidade faça remoção e outra entregue
-- ============================================

-- Unidade que faz a remoção/coleta do pet (se diferente da dona do contrato)
ALTER TABLE contratos ADD COLUMN unidade_remocao_id UUID REFERENCES unidades(id);

-- Unidade que entrega as cinzas (se diferente da dona do contrato)
ALTER TABLE contratos ADD COLUMN unidade_entrega_id UUID REFERENCES unidades(id);

-- Indexes para query do pipeline (buscar contratos co-responsáveis)
CREATE INDEX idx_contratos_unidade_remocao ON contratos(unidade_remocao_id) WHERE unidade_remocao_id IS NOT NULL;
CREATE INDEX idx_contratos_unidade_entrega ON contratos(unidade_entrega_id) WHERE unidade_entrega_id IS NOT NULL;
