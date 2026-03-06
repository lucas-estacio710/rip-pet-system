-- Migration 021: Campo protocolo_data no contrato
-- Armazena o protocolo de entrega editado em formato JSONB
-- NULL = protocolo não preparado, {...} = protocolo salvo

ALTER TABLE contratos ADD COLUMN protocolo_data JSONB DEFAULT NULL;

COMMENT ON COLUMN contratos.protocolo_data IS 'Dados do protocolo de entrega editado (JSONB). NULL = não preparado.';
