-- 028: Campos de controle de cinzas e certificado (uso na Supinda/matriz)
-- cinzas_recebidas: só relevante para cremação individual
-- certificado_recebido: relevante para todos

ALTER TABLE contratos ADD COLUMN cinzas_recebidas BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contratos ADD COLUMN certificado_recebido BOOLEAN NOT NULL DEFAULT false;
