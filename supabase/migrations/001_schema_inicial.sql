-- =============================================
-- R.I.P. PET - SCHEMA INICIAL
-- Versão: 0.1 (em construção)
-- =============================================

-- ============ ENUMS ============

-- Status do atendimento (fluxo)
CREATE TYPE status_atendimento AS ENUM (
  'preventivo',    -- 0 - Pet ainda vivo (contrato PV)
  'ativo',         -- 1 - Pet faleceu, está em Santos
  'pinda',         -- 2 - Foi para o crematório
  'retorno',       -- 3 - Cinzas prontas para devolver
  'pendente',      -- 4 - Alguma pendência
  'finalizado'     -- 5 - Processo completo
);

-- Tipo de cremação
CREATE TYPE tipo_cremacao AS ENUM (
  'individual',    -- Cinzas retornam ao tutor
  'coletiva'       -- Sem retorno de cinzas
);

-- Tipo de plano
CREATE TYPE tipo_plano AS ENUM (
  'emergencial',   -- EM - Contratação no momento
  'preventivo'     -- PV - Contratação antecipada
);

-- Espécie do pet
CREATE TYPE especie_pet AS ENUM (
  'canina',
  'felina',
  'exotica'
);

-- Gênero do pet
CREATE TYPE genero_pet AS ENUM (
  'macho',
  'femea'
);

-- ============ TABELAS AUXILIARES ============

-- Funcionários (responsáveis pelo acolhimento)
CREATE TABLE funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clínicas/Veterinários parceiros (indicadores)
CREATE TABLE indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(200) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fontes de conhecimento (como conheceu)
CREATE TABLE fontes_conhecimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ TABELA PRINCIPAL ============

-- Contratos/Atendimentos (antiga Cremações)
CREATE TABLE contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) UNIQUE NOT NULL,  -- Ex: 20230815COLMB

  -- Status e tipo
  status status_atendimento DEFAULT 'ativo',
  tipo_cremacao tipo_cremacao NOT NULL,
  tipo_plano tipo_plano NOT NULL,

  -- Dados do Pet
  pet_nome VARCHAR(100) NOT NULL,
  pet_especie especie_pet NOT NULL,
  pet_raca VARCHAR(100),
  pet_genero genero_pet,
  pet_peso DECIMAL(6,2),
  pet_idade_anos INTEGER,
  pet_cor VARCHAR(100),

  -- Dados do Tutor
  tutor_nome VARCHAR(200) NOT NULL,
  tutor_cpf VARCHAR(14),
  tutor_email VARCHAR(200),
  tutor_telefone VARCHAR(20),
  tutor_telefone2 VARCHAR(20),
  tutor_cidade VARCHAR(100),
  tutor_bairro VARCHAR(100),
  tutor_endereco TEXT,
  tutor_cep VARCHAR(10),

  -- Local e origem
  local_coleta VARCHAR(200),           -- Onde o pet foi coletado
  indicador_id UUID REFERENCES indicadores(id),
  fonte_conhecimento_id UUID REFERENCES fontes_conhecimento(id),
  funcionario_id UUID REFERENCES funcionarios(id),  -- Responsável pelo acolhimento

  -- Datas importantes
  data_contrato DATE,
  data_acolhimento TIMESTAMPTZ,        -- Data e hora que chegou
  data_leva_pinda DATE,                -- Quando foi pra Pinda
  data_cremacao DATE,
  data_retorno DATE,                   -- Quando voltou de Pinda
  data_entrega DATE,                   -- Quando entregou ao tutor

  -- Supinda (lote)
  supinda_id UUID,                     -- FK para supindas (criar depois)

  -- Valores (receita)
  valor_plano DECIMAL(10,2),
  desconto_plano DECIMAL(10,2) DEFAULT 0,
  valor_acessorios DECIMAL(10,2) DEFAULT 0,
  desconto_acessorios DECIMAL(10,2) DEFAULT 0,

  -- Custo da cremação (pago à matriz Pinda)
  -- Padrão: 500 (individual), 300 (coletiva) - mas pode variar
  custo_cremacao DECIMAL(10,2),

  -- Controle de rescaldo movido para tabela separada (contrato_rescaldos)

  -- Lacre
  numero_lacre VARCHAR(20),

  -- Velório
  velorio_deseja BOOLEAN,                    -- NULL = não perguntou, TRUE = quer, FALSE = não quer
  velorio_agendado_para TIMESTAMPTZ,         -- Data/hora agendada (se quer)
  velorio_realizado BOOLEAN DEFAULT false,   -- Já aconteceu?
  -- (mensagens como "Prepara Velório" ficam na tabela contrato_mensagens)

  -- Acompanhamento online da cremação
  acompanhamento_online BOOLEAN DEFAULT false,  -- Quer acompanhar?
  acompanhamento_presencial BOOLEAN DEFAULT false,  -- Vai presencialmente a Pinda?

  -- Tutor é veterinário/segmento pet (desconto)
  tutor_vet_segmento BOOLEAN DEFAULT false,

  -- Observações gerais
  observacoes TEXT,

  -- Metadados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ SUPINDAS (Viagens para Pinda) ============

CREATE TABLE supindas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER UNIQUE NOT NULL,      -- Número sequencial do lote
  data DATE NOT NULL,
  responsavel VARCHAR(100),            -- Quem levou
  peso_total DECIMAL(8,2),
  quantidade_pets INTEGER,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar FK de contratos para supindas
ALTER TABLE contratos
ADD CONSTRAINT fk_contrato_supinda
FOREIGN KEY (supinda_id) REFERENCES supindas(id);

-- ============ PRODUTOS / ESTOQUE ============

-- Categorias de produtos
CREATE TYPE tipo_produto AS ENUM (
  'urna',
  'acessorio',
  'incluso'        -- Grátis no plano
);

-- Catálogo de produtos
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) UNIQUE NOT NULL,
  nome VARCHAR(200) NOT NULL,
  tipo tipo_produto NOT NULL,
  custo DECIMAL(10,2) DEFAULT 0,
  preco DECIMAL(10,2) DEFAULT 0,
  estoque_atual INTEGER DEFAULT 0,
  estoque_minimo INTEGER DEFAULT 0,
  imagem_url TEXT,
  precisa_foto BOOLEAN DEFAULT false,  -- Produto exige foto do pet?
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movimentação de estoque (entradas)
CREATE TABLE estoque_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID REFERENCES produtos(id) NOT NULL,
  quantidade INTEGER NOT NULL,
  custo_unitario DECIMAL(10,2),
  remessa VARCHAR(200),               -- Origem (ex: "Pedido InMemorian")
  data_entrada DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Produtos do contrato (saídas vinculadas)
CREATE TABLE contrato_produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  produto_id UUID REFERENCES produtos(id) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  valor DECIMAL(10,2),
  desconto DECIMAL(10,2) DEFAULT 0,
  is_reserva_pv BOOLEAN DEFAULT false, -- Reserva de PV (desconta do virtual, não do físico)
  separado BOOLEAN DEFAULT false,      -- Já separou para entrega?
  foto_recebida BOOLEAN DEFAULT false, -- Foto do pet recebida? (se produto exige)
  foto_url TEXT,                       -- URL da foto enviada pelo tutor
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Direção do empréstimo
CREATE TYPE direcao_emprestimo AS ENUM (
  'emprestamos',      -- Nós emprestamos para outra unidade (subtrai)
  'tomamos_emprestado' -- Tomamos emprestado de outra unidade (soma)
);

-- Empréstimos de produtos (bidirecional)
CREATE TABLE estoque_emprestimos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID REFERENCES produtos(id) NOT NULL,
  quantidade INTEGER NOT NULL,
  direcao direcao_emprestimo NOT NULL,
  unidade VARCHAR(100) NOT NULL,          -- Ex: "Pinda", "SP", etc.
  data_emprestimo DATE DEFAULT CURRENT_DATE,
  data_devolucao DATE,                    -- NULL = ainda ativo
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ FINANCEIRO ============

-- Métodos de pagamento
CREATE TYPE metodo_pagamento AS ENUM (
  'pix',
  'dinheiro',
  'credito',
  'debito'
);

-- Contas (destino do dinheiro)
CREATE TABLE contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL,          -- Ex: Inter, Granito, Dinheiro
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamentos recebidos
CREATE TABLE pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  tipo VARCHAR(20) NOT NULL,           -- 'plano' ou 'catalogo'
  metodo metodo_pagamento NOT NULL,
  conta_id UUID REFERENCES contas(id),
  valor DECIMAL(10,2) NOT NULL,
  desconto DECIMAL(10,2) DEFAULT 0,
  taxa DECIMAL(10,2) DEFAULT 0,
  valor_liquido DECIMAL(10,2),
  parcelas INTEGER DEFAULT 1,
  is_seguradora BOOLEAN DEFAULT false, -- Pagamento via seguradora (demora mais)
  data_pagamento DATE DEFAULT CURRENT_DATE,
  mes_competencia VARCHAR(7),          -- Ex: 2024/01
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ MENSAGENS DO PROCESSO ============

-- Templates de mensagens
CREATE TABLE mensagem_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,  -- 'finaliza_preventivo', 'chegamos', 'pet_grato', etc.
  nome VARCHAR(100) NOT NULL,
  conteudo TEXT NOT NULL,              -- Texto com variáveis: {pet_nome}, {tutor_nome}, etc.
  dias_apos_evento INTEGER,            -- Para lembretes automáticos (ex: 2 = 2 dias após morte)
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Controle de mensagens enviadas ao tutor
CREATE TABLE contrato_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  template_id UUID REFERENCES mensagem_templates(id),
  tipo VARCHAR(50) NOT NULL,           -- 'finaliza_preventivo', 'chegamos', 'pet_grato', etc.
  conteudo_enviado TEXT,               -- Texto real enviado (com variáveis substituídas)
  enviada_em TIMESTAMPTZ DEFAULT NOW(),
  enviada_via VARCHAR(20),             -- 'whatsapp', 'manual', etc.
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contrato_mensagens_contrato ON contrato_mensagens(contrato_id);
CREATE INDEX idx_contrato_mensagens_tipo ON contrato_mensagens(tipo);

-- ============ TAREFAS/OBSERVAÇÕES ============

-- Tipos de tarefa
CREATE TABLE tarefa_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tarefas por contrato
CREATE TABLE tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  tipo_id UUID REFERENCES tarefa_tipos(id),
  descricao TEXT,
  resolvido BOOLEAN DEFAULT false,
  importante BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ RESCALDO (itens pré-cremação) ============

-- Tipos de rescaldo
CREATE TYPE tipo_rescaldo AS ENUM (
  'molde_patinha',
  'pelinho',        -- Garrafinha (padrão = fazer, surpresa)
  'pelo_extra',     -- Para pingentes, chumaço (só se pedir)
  'carimbo'
);

-- Status do rescaldo
CREATE TYPE status_rescaldo AS ENUM (
  'nao_pediu',
  'pendente',
  'feito'
);

-- Rescaldos do contrato
CREATE TABLE contrato_rescaldos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  tipo tipo_rescaldo NOT NULL,
  quantidade INTEGER DEFAULT 1,
  status status_rescaldo DEFAULT 'pendente',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contrato_id, tipo)  -- Um tipo por contrato
);

-- ============ ITENS PESSOAIS DO PET ============

-- Destino dos itens pessoais
CREATE TYPE destino_item_pessoal AS ENUM (
  'doar',
  'descartar',
  'retornar',
  'cremar_junto'
);

-- Itens que vieram com o pet
CREATE TABLE contrato_itens_pessoais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  descricao VARCHAR(200) NOT NULL,    -- Ex: "Coberta azul", "Ursinho", "Coleira vermelha"
  destino destino_item_pessoal,
  resolvido BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ ROTAS DE ENTREGA ============

-- Status da rota
CREATE TYPE status_rota AS ENUM (
  'planejada',
  'em_andamento',
  'concluida',
  'cancelada'
);

-- Período do dia
CREATE TYPE periodo_dia AS ENUM (
  'manha',
  'tarde',
  'dia_todo'
);

-- Rotas de entrega (R1, R2, R3...)
CREATE TABLE rotas_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER UNIQUE NOT NULL,          -- R1, R2, R3...
  data_prevista DATE NOT NULL,
  periodo periodo_dia DEFAULT 'dia_todo',
  responsavel VARCHAR(100),
  status status_rota DEFAULT 'planejada',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entregas da rota (contratos incluídos)
CREATE TABLE rota_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id UUID REFERENCES rotas_entrega(id) NOT NULL,
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  ordem INTEGER,                           -- Sequência na rota
  entregue BOOLEAN DEFAULT false,
  data_entrega TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rota_id, contrato_id)
);

-- ============ RESTRIÇÕES DE ENTREGA ============

-- Dias da semana
CREATE TYPE dia_semana AS ENUM (
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado'
);

-- Restrições de entrega por contrato
CREATE TABLE contrato_restricoes_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id) NOT NULL,
  dias_bloqueados dia_semana[],            -- Array de dias que NÃO pode
  periodos_bloqueados periodo_dia[],       -- Array de períodos que NÃO pode
  data_minima DATE,                        -- Só pode entregar a partir de...
  endereco_alternativo TEXT,               -- Endereço diferente do cadastro
  observacoes TEXT,                        -- "Ligar antes", etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contrato_id)                      -- Uma restrição por contrato
);

-- Coordenadas do contrato (para mapa/rotas)
-- Preenchido via geocoding do CEP
ALTER TABLE contratos ADD COLUMN latitude DECIMAL(10,8);
ALTER TABLE contratos ADD COLUMN longitude DECIMAL(11,8);

-- ============ ÍNDICES ============

CREATE INDEX idx_contratos_status ON contratos(status);
CREATE INDEX idx_contratos_data_acolhimento ON contratos(data_acolhimento);
CREATE INDEX idx_contratos_supinda ON contratos(supinda_id);
CREATE INDEX idx_pagamentos_contrato ON pagamentos(contrato_id);
CREATE INDEX idx_tarefas_contrato ON tarefas(contrato_id);
CREATE INDEX idx_tarefas_resolvido ON tarefas(resolvido);
CREATE INDEX idx_contrato_produtos_contrato ON contrato_produtos(contrato_id);
CREATE INDEX idx_contrato_rescaldos_contrato ON contrato_rescaldos(contrato_id);
CREATE INDEX idx_contrato_itens_pessoais_contrato ON contrato_itens_pessoais(contrato_id);
CREATE INDEX idx_rotas_entrega_data ON rotas_entrega(data_prevista);
CREATE INDEX idx_rotas_entrega_status ON rotas_entrega(status);
CREATE INDEX idx_rota_entregas_rota ON rota_entregas(rota_id);
CREATE INDEX idx_rota_entregas_contrato ON rota_entregas(contrato_id);
CREATE INDEX idx_contrato_restricoes_entrega_contrato ON contrato_restricoes_entrega(contrato_id);

-- ============ TRIGGERS PARA UPDATED_AT ============

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_contratos_updated_at
  BEFORE UPDATE ON contratos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_supindas_updated_at
  BEFORE UPDATE ON supindas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_produtos_updated_at
  BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_tarefas_updated_at
  BEFORE UPDATE ON tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_contrato_rescaldos_updated_at
  BEFORE UPDATE ON contrato_rescaldos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_contrato_itens_pessoais_updated_at
  BEFORE UPDATE ON contrato_itens_pessoais
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_rotas_entrega_updated_at
  BEFORE UPDATE ON rotas_entrega
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_contrato_restricoes_entrega_updated_at
  BEFORE UPDATE ON contrato_restricoes_entrega
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
