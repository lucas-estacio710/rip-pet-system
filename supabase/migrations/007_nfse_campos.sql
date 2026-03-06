-- Migration: Adiciona campos para NFS-e e tabela de configurações
-- Para integração com GISS Online (Santos/SP)

-- Campos de NFS-e no contrato
ALTER TABLE contratos
ADD COLUMN IF NOT EXISTS nfse_numero VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS nfse_codigo_verificacao VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS nfse_data TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS nfse_status VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS nfse_link_pdf TEXT DEFAULT NULL;

-- Comentários
COMMENT ON COLUMN contratos.nfse_numero IS 'Número da NFS-e emitida';
COMMENT ON COLUMN contratos.nfse_codigo_verificacao IS 'Código de verificação da NFS-e';
COMMENT ON COLUMN contratos.nfse_data IS 'Data/hora de emissão da NFS-e';
COMMENT ON COLUMN contratos.nfse_status IS 'Status: emitida, cancelada, erro';
COMMENT ON COLUMN contratos.nfse_link_pdf IS 'Link para download do PDF da NFS-e';

-- Tabela de configurações gerais do sistema
CREATE TABLE IF NOT EXISTS configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave VARCHAR(100) UNIQUE NOT NULL,
  valor JSONB NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER set_updated_at_configuracoes
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Índice
CREATE INDEX IF NOT EXISTS idx_configuracoes_chave ON configuracoes(chave);

-- Inserir configuração inicial de NFS-e (vazia, será preenchida pelo usuário)
INSERT INTO configuracoes (chave, valor, descricao)
VALUES (
  'nfse',
  '{
    "cnpj": "",
    "inscricaoMunicipal": "",
    "certificadoBase64": "",
    "senhaCertificado": "",
    "proximoRps": 1,
    "ambiente": "homologacao"
  }'::jsonb,
  'Configurações para emissão de NFS-e via GISS Online'
)
ON CONFLICT (chave) DO NOTHING;

-- Comentário na tabela
COMMENT ON TABLE configuracoes IS 'Configurações gerais do sistema (NFS-e, WhatsApp, etc)';
