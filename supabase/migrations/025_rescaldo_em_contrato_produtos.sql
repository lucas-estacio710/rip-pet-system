-- Migration 025: Rescaldo via contrato_produtos (eliminar contrato_rescaldos)
-- Adiciona campo rescaldo_feito em contrato_produtos para rastrear status do procedimento
-- A tabela contrato_rescaldos não é dropada, apenas deixa de ser usada

ALTER TABLE contrato_produtos ADD COLUMN IF NOT EXISTS rescaldo_feito BOOLEAN DEFAULT false;

-- 1) Migrar dados existentes de contrato_rescaldos → marcar como feito nos contrato_produtos correspondentes
UPDATE contrato_produtos cp
SET rescaldo_feito = true
FROM contrato_rescaldos cr
JOIN produtos p ON p.rescaldo_tipo = cr.tipo
WHERE cp.contrato_id = cr.contrato_id
  AND cp.produto_id = p.id
  AND cr.status = 'feito';

-- 2) Contratos em pinda/retorno/pendente/finalizado já passaram pela fase de rescaldo
--    Marcar todos os produtos de rescaldo desses contratos como feitos
UPDATE contrato_produtos cp
SET rescaldo_feito = true
FROM contratos c
JOIN produtos p ON p.id = cp.produto_id
WHERE cp.contrato_id = c.id
  AND c.status IN ('pinda', 'retorno', 'pendente', 'finalizado')
  AND p.rescaldo_tipo IS NOT NULL
  AND cp.rescaldo_feito = false;
