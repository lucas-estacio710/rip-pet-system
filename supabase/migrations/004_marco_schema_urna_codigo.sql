-- =============================================
-- R.I.P. PET CRM - MARCO DO PROJETO
-- Migration: 004_marco_schema_urna_codigo.sql
-- Data: 2026-01-21
-- =============================================
--
-- Este arquivo documenta o estado atual do banco de dados Supabase
-- e adiciona o campo urna_codigo na tabela contratos.
--
-- OBJETIVO: Servir como referência para futuros chats/desenvolvimentos
-- sobre quais campos existem em cada tabela.
--
-- =============================================

-- ============================================
-- TABELAS EXISTENTES NO SUPABASE (21/01/2026)
-- ============================================

-- ============ CONTRATOS (tabela principal) ============
-- 49 colunas
/*
  id                        UUID PRIMARY KEY
  codigo                    VARCHAR(20) UNIQUE NOT NULL  -- Ex: 20230815COLMB
  status                    status_atendimento           -- preventivo/ativo/pinda/retorno/pendente/finalizado
  tipo_cremacao             tipo_cremacao                -- individual/coletiva
  tipo_plano                tipo_plano                   -- emergencial/preventivo

  -- Dados do Pet
  pet_nome                  VARCHAR(100) NOT NULL
  pet_especie               especie_pet                  -- canina/felina/exotica
  pet_raca                  VARCHAR(100)
  pet_genero                genero_pet                   -- macho/femea
  pet_peso                  DECIMAL(6,2)
  pet_idade_anos            INTEGER
  pet_cor                   VARCHAR(100)

  -- Dados do Tutor (campos legados - usar tutor_id quando possível)
  tutor_id                  UUID REFERENCES tutores(id)  -- FK para tabela normalizada
  tutor_nome                VARCHAR(200) NOT NULL        -- legado, manter por compatibilidade
  tutor_cpf                 VARCHAR(14)
  tutor_email               VARCHAR(200)
  tutor_telefone            VARCHAR(20)
  tutor_cidade              VARCHAR(100)
  tutor_bairro              VARCHAR(100)
  tutor_endereco            TEXT
  tutor_cep                 VARCHAR(10)
  tutor_vet_segmento        BOOLEAN DEFAULT false        -- tutor é vet/segmento pet (desconto)

  -- Relacionamentos
  indicador_id              UUID REFERENCES indicadores(id)
  fonte_conhecimento_id     UUID REFERENCES fontes_conhecimento(id)
  funcionario_id            UUID REFERENCES funcionarios(id)
  supinda_id                UUID REFERENCES supindas(id)

  -- Local e datas
  local_coleta              VARCHAR(200)                 -- Residência/Unidade/Clínica
  data_contrato             DATE
  data_acolhimento          TIMESTAMPTZ                  -- quando chegou
  data_leva_pinda           DATE                         -- quando foi pra Pinda
  data_cremacao             DATE
  data_retorno              DATE                         -- quando voltou de Pinda
  data_entrega              DATE                         -- quando entregou ao tutor

  -- Valores
  valor_plano               DECIMAL(10,2)
  desconto_plano            DECIMAL(10,2) DEFAULT 0
  valor_acessorios          DECIMAL(10,2) DEFAULT 0
  desconto_acessorios       DECIMAL(10,2) DEFAULT 0
  custo_cremacao            DECIMAL(10,2)                -- custo pago à matriz

  -- Velório e acompanhamento
  velorio_deseja            BOOLEAN
  velorio_agendado_para     TIMESTAMPTZ
  velorio_realizado         BOOLEAN DEFAULT false
  acompanhamento_online     BOOLEAN DEFAULT false
  acompanhamento_presencial BOOLEAN DEFAULT false

  -- Outros
  numero_lacre              VARCHAR(20)
  observacoes               TEXT
  latitude                  DECIMAL(10,8)
  longitude                 DECIMAL(11,8)

  -- Metadados
  created_at                TIMESTAMPTZ DEFAULT NOW()
  updated_at                TIMESTAMPTZ DEFAULT NOW()
*/

-- ============ TUTORES (normalizado) ============
-- 16 colunas
/*
  id                        UUID PRIMARY KEY
  nome                      VARCHAR(200) NOT NULL
  cpf                       VARCHAR(14)
  telefone                  VARCHAR(20)
  email                     VARCHAR(200)
  cep                       VARCHAR(10)
  endereco                  VARCHAR(300)
  numero                    VARCHAR(20)
  complemento               VARCHAR(100)
  bairro                    VARCHAR(100)
  cidade                    VARCHAR(100)
  estado                    VARCHAR(2)
  observacoes               TEXT
  ativo                     BOOLEAN DEFAULT true
  created_at                TIMESTAMPTZ DEFAULT NOW()
  updated_at                TIMESTAMPTZ DEFAULT NOW()
*/

-- ============ PRODUTOS (catálogo) ============
-- 13 colunas
/*
  id                        UUID PRIMARY KEY
  codigo                    VARCHAR(20) UNIQUE NOT NULL  -- Ex: 0001, URN001
  nome                      VARCHAR(200) NOT NULL
  tipo                      tipo_produto NOT NULL        -- urna/acessorio/incluso
  custo                     DECIMAL(10,2) DEFAULT 0
  preco                     DECIMAL(10,2) DEFAULT 0
  estoque_atual             INTEGER DEFAULT 0
  estoque_minimo            INTEGER DEFAULT 0
  imagem_url                TEXT
  precisa_foto              BOOLEAN DEFAULT false        -- produto exige foto do pet?
  ativo                     BOOLEAN DEFAULT true
  created_at                TIMESTAMPTZ DEFAULT NOW()
  updated_at                TIMESTAMPTZ DEFAULT NOW()
*/

-- ============ CONTRATO_PRODUTOS (produtos vinculados) ============
-- 11 colunas
/*
  id                        UUID PRIMARY KEY
  contrato_id               UUID REFERENCES contratos(id) NOT NULL
  produto_id                UUID REFERENCES produtos(id) NOT NULL
  quantidade                INTEGER DEFAULT 1
  valor                     DECIMAL(10,2)
  desconto                  DECIMAL(10,2) DEFAULT 0
  is_reserva_pv             BOOLEAN DEFAULT false        -- reserva de preventivo
  separado                  BOOLEAN DEFAULT false        -- já separou para entrega?
  foto_recebida             BOOLEAN DEFAULT false
  foto_url                  TEXT
  created_at                TIMESTAMPTZ DEFAULT NOW()
*/

-- ============ PAGAMENTOS ============
-- 14 colunas
/*
  id                        UUID PRIMARY KEY
  contrato_id               UUID REFERENCES contratos(id) NOT NULL
  tipo                      VARCHAR(20) NOT NULL         -- 'plano' ou 'catalogo'
  metodo                    metodo_pagamento NOT NULL    -- pix/dinheiro/credito/debito
  conta_id                  UUID REFERENCES contas(id)
  valor                     DECIMAL(10,2) NOT NULL
  desconto                  DECIMAL(10,2) DEFAULT 0
  taxa                      DECIMAL(10,2) DEFAULT 0
  valor_liquido             DECIMAL(10,2)
  parcelas                  INTEGER DEFAULT 1
  is_seguradora             BOOLEAN DEFAULT false
  data_pagamento            DATE DEFAULT CURRENT_DATE
  mes_competencia           VARCHAR(7)                   -- Ex: 2024/01
  created_at                TIMESTAMPTZ DEFAULT NOW()
*/

-- ============ SUPINDAS (viagens para Pinda) ============
-- 9 colunas
/*
  id                        UUID PRIMARY KEY
  numero                    INTEGER UNIQUE NOT NULL      -- sequencial: 1, 2, 3...
  data                      DATE NOT NULL
  responsavel               VARCHAR(100)
  peso_total                DECIMAL(8,2)
  quantidade_pets           INTEGER
  observacoes               TEXT
  created_at                TIMESTAMPTZ DEFAULT NOW()
  updated_at                TIMESTAMPTZ DEFAULT NOW()
*/

-- ============ TABELAS AUXILIARES ============

-- FUNCIONARIOS (5 colunas)
-- id, nome, ativo, created_at, updated_at

-- INDICADORES (5 colunas) - clínicas parceiras
-- id, nome, ativo, created_at, updated_at

-- FONTES_CONHECIMENTO (3 colunas)
-- id, nome, created_at

-- CONTAS (4 colunas) - destino do dinheiro
-- id, nome, ativo, created_at

-- TAREFAS (8 colunas)
-- id, contrato_id, tipo_id, descricao, resolvido, importante, created_at, updated_at

-- TAREFA_TIPOS (3 colunas)
-- id, nome, created_at

-- ============ TABELAS DE DETALHES DO CONTRATO ============

-- CONTRATO_RESCALDOS - molde, pelo, carimbo
-- CONTRATO_ITENS_PESSOAIS - coberta, ursinho, etc
-- CONTRATO_MENSAGENS - histórico de mensagens enviadas
-- CONTRATO_RESTRICOES_ENTREGA - dias/horários bloqueados

-- ============ TABELAS DE ESTOQUE ============

-- ESTOQUE_ENTRADAS - entradas de produtos
-- ESTOQUE_EMPRESTIMOS - empréstimos entre unidades

-- ============ TABELAS DE ROTAS ============

-- ROTAS_ENTREGA - rotas R1, R2, R3...
-- ROTA_ENTREGAS - contratos de cada rota

-- MENSAGEM_TEMPLATES - templates de mensagens WhatsApp


-- =============================================
-- ALTERAÇÃO: Adicionar urna_codigo
-- =============================================
--
-- JUSTIFICATIVA:
-- A urna do contrato já pode ser obtida via JOIN:
--   contratos → contrato_produtos → produtos WHERE tipo='urna'
--
-- Porém, para exibir o indicador ⚱️ na listagem de contratos
-- sem precisar de JOIN em toda query, adicionamos urna_codigo
-- como campo desnormalizado (cache).
--
-- VALORES ESPECIAIS:
--   '0001' = Tutor não quer urna (espalhar cinzas, só saquinho, etc)
--   NULL   = Urna ainda não definida
--   outros = Código do produto urna selecionado
--
-- =============================================

-- 1. Adicionar coluna (se não existir)
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS urna_codigo VARCHAR(20);

-- 2. Criar índice para busca
CREATE INDEX IF NOT EXISTS idx_contratos_urna_codigo ON contratos(urna_codigo);

-- 3. Popular a partir de contrato_produtos existentes
-- Busca produtos do tipo 'urna' já vinculados aos contratos
UPDATE contratos c
SET urna_codigo = p.codigo
FROM contrato_produtos cp
JOIN produtos p ON cp.produto_id = p.id
WHERE cp.contrato_id = c.id
  AND p.tipo = 'urna'
  AND c.urna_codigo IS NULL;

-- 4. Comentário
COMMENT ON COLUMN contratos.urna_codigo IS 'Código da urna selecionada (cache de produtos.codigo onde tipo=urna). NULL=não definida, 0001=não quer urna';

-- =============================================
-- FIM DA MIGRATION 004
-- =============================================
