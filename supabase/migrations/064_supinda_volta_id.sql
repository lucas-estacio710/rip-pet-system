-- ============================================
-- 064: Campo supinda_volta_id em contratos
-- O supinda_id é da IDA (corpo indo pra Pinda) e nunca muda.
-- O supinda_volta_id registra qual supinda trouxe as cinzas/certificado de volta.
-- ============================================

ALTER TABLE contratos ADD COLUMN supinda_volta_id UUID REFERENCES supindas(id);

CREATE INDEX idx_contratos_supinda_volta ON contratos(supinda_volta_id) WHERE supinda_volta_id IS NOT NULL;
