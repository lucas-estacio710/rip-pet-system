-- Migration: Adiciona campos do pelinho diretamente no contrato
-- O pelinho é um caso especial: padrão fazer (surpresa), só não faz se tutor recusar
-- Por ser obrigatório definir em todo atendimento, fica mais simples no contrato

-- pelinho_quer: null = não definido, true = quer (padrão), false = não quer
-- pelinho_feito: se já foi coletado
-- pelinho_quantidade: quantas garrafinhas (default 1)

-- NOTA: A migração dos dados é feita pelo script Python (migrar_legado.py)
-- Este SQL apenas cria os campos para o banco aceitar o CSV

ALTER TABLE contratos
ADD COLUMN IF NOT EXISTS pelinho_quer BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pelinho_feito BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pelinho_quantidade INTEGER DEFAULT 1;

-- Comentários para documentação
COMMENT ON COLUMN contratos.pelinho_quer IS 'Quer pelinho na garrafinha? null=não definido, true=sim (padrão), false=não';
COMMENT ON COLUMN contratos.pelinho_feito IS 'Pelinho já foi coletado?';
COMMENT ON COLUMN contratos.pelinho_quantidade IS 'Quantidade de garrafinhas (default 1)';
