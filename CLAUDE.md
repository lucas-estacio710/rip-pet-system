# NOVO CRM RIP PET

## Instruções para o Claude (ler sempre!)

> **IMPORTANTE:** Mantenha a documentação atualizada em background durante o desenvolvimento.
> O chat pode cair a qualquer momento, então a documentação serve como "memória" entre sessões.

### Práticas obrigatórias:

1. **CLAUDE.md** - Atualizar "STATUS DO DESENVOLVIMENTO" quando: página sair de placeholder → funcional, componente criado, feature implementada
2. **CHANGELOG.md** - Registrar mudanças na seção "Unreleased" (`### Added`, `### Changed`, `### Fixed`)
3. **Ao finalizar uma versão** - Mover "Unreleased" para nova versão numerada
4. **Servidor de desenvolvimento**: `cd web && npm run dev` (porta 3000)

---

## 🔴 PROCESSO DE MIGRAÇÃO AS-IS → TO-BE (CRÍTICO!)

| Termo | O que é | Onde está |
|-------|---------|-----------|
| **AS-IS** | Dados legados (Google Sheets) | `Bases_legado/*.csv` |
| **TO-BE** | Schema otimizado Supabase | `supabase/migrations/*.sql` |
| **Scripts de Migração** | Transformam AS-IS → TO-BE | `migracao/migrar_legado.py` |

### Regra de Ouro

> **LEITURA OBRIGATORIA:** Antes de qualquer trabalho com banco, leia `supabase/SCHEMA.md` — é a fonte da verdade do schema atual.
> Se alterar o banco, atualize o SCHEMA.md na mesma resposta.

> **NUNCA criar campos no banco sem antes verificar:**
> 1. Se já existe no `supabase/SCHEMA.md` (schema atual do banco)
> 2. Se existe uma tabela relacionada que já resolve
> 3. Consultar o Supabase via API para confirmar se necessário

### Processo de Reimportação

```bash
# 1. Criar migration SQL → rodar no Supabase SQL Editor
# 2. Atualizar migracao/migrar_legado.py
# 3. Gerar CSVs: python migracao/migrar_legado.py
# 4. Reimportar: python migracao/importar_supabase.py --limpar
```

**⚠️ SEMPRE usar `--limpar`** (sem flag = erro de chave duplicada).

**Ordem de importação** (automática): indicadores → funcionarios → fontes_conhecimento → supindas → produtos → contas → tutores → contratos → pagamentos → contrato_produtos → tarefas

### Supabase API

```bash
SUPABASE_URL=https://eniplfcuwvhovxybyuey.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuaXBsZmN1d3Zob3Z4eWJ5dWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDM1MjIsImV4cCI6MjA3NTQ3OTUyMn0.VFftjEVtd4_Vwa2KnrY0YizC_9xBATpe0z14X-7I6Is

# Listar tabelas
curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_KEY" | grep -oE '"/[a-z_]+":' | tr -d '":/' | sort -u
# Ver colunas (ex: contratos)
curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_KEY" | grep -oE 'rowFilter\.contratos\.[a-z_]+' | sed 's/rowFilter\.contratos\.//' | sort -u
# Buscar registro
curl -s "$SUPABASE_URL/rest/v1/contratos?limit=1" -H "apikey: $SUPABASE_KEY"
```

---

## Schema TO-BE (35 tabelas)

### CRM Operacional

| Tabela | Col | Campos-chave |
|--------|-----|--------------|
| `contratos` | 72 | id, codigo, status, tipo_cremacao, pet_*, tutor_*, pelinho_*, nfse_*, seguradora, estabelecimento_id, protocolo_data |
| `tutores` | 17 | id, nome, cpf, telefone, email, endereco, bairro, cidade, estado, cep |
| `produtos` | 16 | id, codigo, nome, tipo (urna/acessorio/incluso), preco, estoque_atual, estoque_infinito |
| `contrato_produtos` | 13 | contrato_id, produto_id, separado, valor, is_reserva_pv, rescaldo_feito |
| `pagamentos` | 18 | contrato_id, tipo, valor, desconto, taxa, valor_liquido_sem_taxa, valor_liquido, metodo, id_transacao, parcelas, bandeira, is_seguradora |
| `taxas_cartao` | 8 | tipo, nome, percentual, ordem |
| `supindas` | 10 | numero, data, responsavel, peso_total, quantidade_pets, status |
| `contrato_rescaldos` | 8 | contrato_id, tipo, status, quantidade |
| `contrato_itens_pessoais` | 7 | contrato_id, descricao, destino |
| `contrato_restricoes_entrega` | 9 | contrato_id, dias_bloqueados[], periodos_bloqueados[], endereco_alternativo |
| `contrato_mensagens` | 9 | contrato_id, tipo, template_id, conteudo_enviado, enviada_via |
| `rotas_entrega` | 9 | numero, data_prevista, periodo, responsavel, status |
| `rota_entregas` | 8 | rota_id, contrato_id, ordem, entregue |
| `tarefas` | 8 | contrato_id, tipo_id, descricao, importante, resolvido |
| `estoque_entradas` | 8 | produto_id, quantidade, custo_unitario, remessa, data_entrada |
| `estoque_emprestimos` | 10 | produto_id, direcao, unidade, quantidade, data_emprestimo |

### Auxiliares

`indicadores`(5), `funcionarios`(5), `fontes_conhecimento`(3), `contas`(4), `tarefa_tipos`(3), `mensagem_templates`(8), `configuracoes`(6)

### CRM Comercial

| Tabela | Col | Campos-chave |
|--------|-----|--------------|
| `estabelecimentos` | 34 | nome, tipo, endereco, relacionamento, concorrentes_presentes[], estrategia |
| `contatos` | 17 | nome, estabelecimento_id, cargo, telefone, whatsapp |
| `visitas` | 20 | estabelecimento_id, data_visita, tipo_visita, temperatura_pos_visita |
| `indicacoes` | 18 | estabelecimento_origem_id, nome_indicado, status |
| `unidades` | 6 | nome, cidade, estado |
| `perfis` | 8 | nome_completo, email, cargo, unidade_id |
| `historico_alteracoes` | 12 | entidade, campo, valor_anterior, valor_novo |

### Chat/IA

`conversations`(6), `messages`(7), `conversation_context`(8), `knowledge_base`(5)

### Outros

`fichas`(32) - Ficha de remoção digital

### Views e RPCs

`vw_estatisticas_estabelecimentos` (View), `format_valor_historico()`, `get_campo_label()`, `get_my_profile()` (RPCs)

### ENUMs

| ENUM | Valores |
|------|---------|
| `status_atendimento` | preventivo, ativo, pinda, retorno, pendente, finalizado |
| `tipo_cremacao` | individual, coletiva |
| `tipo_plano` | emergencial, preventivo |
| `especie_pet` | canina, felina, exotica |
| `genero_pet` | macho, femea |
| `tipo_produto` | urna, acessorio, incluso |
| `metodo_pagamento` | pix, dinheiro, credito, debito |
| `destino_item_pessoal` | doar, descartar, retornar, cremar_junto |
| `tipo_rescaldo` | molde_patinha, pelinho, pelo_extra, carimbo |
| `status_rescaldo` | nao_pediu, pendente, feito |
| `direcao_emprestimo` | emprestamos, tomamos_emprestado |
| `periodo_dia` | manha, tarde, dia_todo |
| `status_rota` | planejada, em_andamento, concluida, cancelada |
| `status_supinda` | planejada, em_andamento, retornada |

### Conceitos Importantes

**1 Linha = 1 Produto Físico:** Na `contrato_produtos`, cada linha = 1 unidade física. 2 pelinhos = 2 linhas (sem campo quantidade). COUNT de linhas, não SUM.

**Campos Desnormalizados (cache):**
- ~~`urna_codigo`~~ REMOVIDO (migration 022) — urna agora via `contrato_produtos` (tipo='urna')
- `pelinho_quer/feito/quantidade` em contratos → indicador de rescaldo padrão
- `tutor_nome/telefone` em contratos → fallback legado (será removido)

### Migrations

| Arquivo | Status | O que faz |
|---------|--------|-----------|
| `001_schema_inicial.sql` | ✅ | Schema completo |
| `002_tabela_tutores.sql` | ✅ | Tutores normalizada |
| `002_rls_security_v2.sql` | ✅ | RLS 24 tabelas + estabelecimentos |
| `003_remover_campos_legados_tutores.sql` | ⏳ Futura | Remove campos legados tutor |
| `004_marco_schema_urna_codigo.sql` | ✅ | Marco schema + urna_codigo |
| `005_add_updated_at.sql` | ✅ | Trigger updated_at |
| `006_pelinho_campos.sql` | ✅ | Campos pelinho |
| `007_nfse_campos.sql` | ✅ | Campos NFS-e + tabela configuracoes |
| `010_campo_seguradora.sql` | ✅ | Campo seguradora |
| `011_estoque_infinito.sql` | ✅ | estoque_infinito |
| `012_taxas_cartao.sql` | ✅ | Taxas, valor_liquido_sem_taxa, id_transacao |
| `020_status_supinda.sql` | ✅ | Status supindas |
| `021_protocolo_data.sql` | ⏳ | protocolo_data JSONB |
| `022_remover_urna_codigo.sql` | ⏳ | Remove urna_codigo (usa contrato_produtos) |
| `023_rescaldo_outro.sql` | ⏳ | ADD VALUE 'outro' ao enum tipo_rescaldo |
| `024_produtos_rescaldo_tipo.sql` | ⏳ | Flag rescaldo_tipo em produtos + 'itens_pessoais' no enum |
| `025_rescaldo_em_contrato_produtos.sql` | ⏳ | rescaldo_feito em contrato_produtos, migra dados de contrato_rescaldos |
| `027_fichas_processamento.sql` | ⏳ | processada, contrato_id, processada_em, processada_por + index parcial |
| `030_storage_fichas.sql` | ⏳ | Bucket `fichas` + RLS policies (authenticated CRUD + anon read) |
| `050_field_permissions.sql` | ✅ | FLS: tabela field_permissions + RLS + index |

> Tabelas CRM Comercial, Chat/IA e fichas foram criadas direto no Supabase.

### Anti-Patterns

- **NÃO** criar campos de urna (tamanho, cor) → dados em `produtos.nome`, usar JOIN
- **NÃO** duplicar dados de tutores → usar `tutor_id` + JOIN
- **NÃO** criar campo calculado → usar VIEW ou query
- **NÃO** adicionar campo sem verificar schema existente

### Checklist Alteração de Schema

1. Consultar Supabase via API
2. Verificar se tabela relacionada já resolve
3. Avaliar se JOIN resolve vs campo novo
4. Atualizar CLAUDE.md
5. Criar/atualizar script de migração

---

## 🔒 Field-Level Security (FLS)

Sistema de permissões granulares por unidade + role, estilo Salesforce. Tabela `field_permissions` no banco.

### Hierarquia (3 níveis)

| Nível | O que controla | Exemplo |
|-------|----------------|---------|
| **Tela** | Módulo/página inteira | `tela_pipeline`, `tela_fichas`, `tela_dashboard` |
| **Objeto Relacionado** | Seção/área dentro de uma tela | `obj_financeiro`, `obj_produtos`, `obj_gc` |
| **Campo/Botão** | Campo de dados ou botão de ação | `valor_plano`, `btn_emitir_nfse`, `btn_ativar` |

### 3 estados de permissão

- `edit` → pode ver e editar (DEFAULT — sem row no banco)
- `read` → pode ver mas não editar
- `hidden` → totalmente oculto

### Regras

- **super_admin** → sempre `edit` em tudo (hardcoded, NUNCA salvar no banco)
- **Default permissivo** → sem row no banco = `edit`
- **Apenas exceções** são armazenadas (rows com `read` ou `hidden`)
- `tela` = hidden para todos os roles é equivalente a "módulo desligado"

### Catálogo de Itens

**Arquivo**: `web/src/lib/field-catalog.ts` — fonte da verdade de todos os itens controláveis

**3 arrays exportados:**
- `TELAS` → lista de telas/módulos
- `OBJETOS` → seções dentro de telas (cada item tem `tela: string` indicando a qual tela pertence)
- `CAMPOS_BOTOES` → campos e botões individuais (cada item tem `tela: string`)

### ⚠️ REGRA OBRIGATÓRIA PARA MANUTENÇÃO

> **Ao criar nova tela, nova seção, novo campo ou novo botão**, DEVE atualizar:
> 1. `web/src/lib/field-catalog.ts` — adicionar o item no array correto (TELAS, OBJETOS ou CAMPOS_BOTOES)
> 2. `supabase/SCHEMA.md` — documentar na seção field_permissions
> 3. No componente, usar o hook: `const { canEdit, isVisible } = useFieldPermission()`
> 4. Aplicar: `isVisible(tela, key)` para visibilidade, `canEdit(tela, key)` para edição

### Arquivos do FLS

| Arquivo | Função |
|---------|--------|
| `supabase/migrations/050_field_permissions.sql` | Schema da tabela |
| `web/src/lib/field-catalog.ts` | Catálogo de itens (3 categorias) |
| `web/src/hooks/useFieldPermission.ts` | Hook React (cache + query) |
| `web/src/app/admin/visibilidade/page.tsx` | UI admin de configuração |

### Padrão de uso nos componentes

```tsx
const { canEdit, isVisible } = useFieldPermission()
const T = 'tela_pipeline' // key da tela

// Objeto: seção inteira
{isVisible(T, 'obj_financeiro') && ( <SecaoFinanceira /> )}

// Botão
{isVisible(T, 'btn_emitir_nfse') && (
  <button disabled={!canEdit(T, 'btn_emitir_nfse')}>Emitir NF</button>
)}

// Campo
{isVisible(T, 'valor_plano') && (
  canEdit(T, 'valor_plano')
    ? <input value={valor} onChange={...} />
    : <span>{formatarValor(valor)}</span>
)}
```

---

## Sobre o Projeto

- **Início:** 17/01/2026 | Migração de Google Sheets + AppSheets → web moderna
- **Stack:** Next.js + Supabase (PostgreSQL, Auth, Realtime, Storage) + Tailwind CSS v4 + Lucide Icons
- **Deploy:** Vercel | **WhatsApp API:** A definir

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **Pinda** | Pindamonhangaba - cidade do crematório |
| **Supinda** | Viagem para Pinda |
| **EM** | Emergencial - contratação no falecimento |
| **PV** | Preventivo - contratação antecipada (pet vivo) |
| **Individual** | Cremação exclusiva, cinzas retornam |
| **Coletiva** | Cremação conjunta, sem retorno de cinzas |
| **Rescaldo** | Itens feitos ANTES da cremação (molde patinha, pelo, carimbo) |
| **InMemorian** | Fornecedor de urnas e acessórios |

### Status do Atendimento (fluxo)

0-Preventivo → 1-Ativo (pet faleceu) → 2-Pinda (crematório) → 3-Retorno (cinzas prontas) → 4-Pendente (pendências) → 5-Finalizado

### Outros termos

- **Leva Pinda**: Nº do lote/viagem (numérico = real, "p1,p2..." = virtual PV legado)
- **Colab Indic.**: Clínica que indicou (tabela `indicadores`)
- **Local**: Onde pet é coletado (Residência, clínica, ou Unidade Canal 6)
- **Conhecimento**: Fonte de aquisição (Google, Instagram, Parente/Amigo, Clínica, Ponto, Cliente, Seguradora)
- **CC**: Conta destino - Inter (banco), Granito (maquininha), Dinheiro
- **Tipo entrada financeira**: "Planos" (cremação) vs "Catálogo" (produtos) - separados para métricas

---

## STATUS DO DESENVOLVIMENTO

**Versão:** 0.3.0 | **Atualizado:** 14/02/2026

### Backend ✅

35 tabelas + 1 view + 3 RPCs + 14 ENUMs. RLS aplicado em todas. Trigger updated_at. Scripts de migração prontos (`migracao/`).

### Design System ✅ (Warm Minimalism)

- **Fontes:** DM Sans (display + body) + JetBrains Mono (códigos, valores)
- **Sidebar:** 3 estados responsivos — full (desktop >=1024px), mini (tablet 768-1023px), drawer (mobile <768px)
- **Componentes UI:** Modal (dialog/bottom-sheet), Toast, Skeleton, EmptyState, Badge
- **Tokens CSS:** --brand-*, --surface-* (quentes), --status-*, --shadow-*, --radius-*, --ease-*, --duration-*
- **Hooks:** useMediaQuery, useSidebarState, useToast, useTheme
- **Temas:** 4 modos selecionáveis (Escuro, Claro, Meio-claro, Meio-escuro) via `[data-theme]` + CSS overrides. Shell (--shell-bg) e Content (--surface-* invertidos) independentes. Sidebar sempre escura. Anti-FOUC via script inline.

### Frontend

| Página | Status | Funcionalidades |
|--------|--------|-----------------|
| `/` | ✅ | Redirect → /dashboard |
| `/dashboard` | ✅ | KPIs reais, filtro período (7d/30d/90d/12m/all), 11 gráficos interativos (Recharts): evolução mensal, IND vs COL, EM vs PV, espécies, seguradora, top clínicas, pagamentos, cidades, fontes, peso, receita por tipo. Drill-down, expand fullscreen, tooltips, trends vs período anterior. Mobile responsivo. |
| `/fichas` | ✅ | Lista fichas entrada, filtro pendentes/processadas, busca, modal tratativa, conversao ficha→contrato |
| `/contratos` | ✅ | Flow visual unificado, pipeline status, busca real-time, indicador urna |
| `/contratos/[id]` | ✅ | Detalhe completo, modal urna, modal "Quitar Saldo" com taxas auto |
| `/supindas` | ✅ | Dashboard cards, CRUD, fluxo planejada→em_andamento→retornada, vincular contratos, geração em lote de fichas de remoção (Storage + ZIP) |
| `/estoque` | ✅ | Grid visual, filtros categoria, busca real-time |
| `/estoque/[id]` | ✅ | Detalhe produto, preço editável, histórico entradas/saídas |
| `/tutores` | ✅ | Lista, busca real-time, paginação, link WhatsApp |
| `/tutores/[id]` | ✅ | Detalhe tutor, histórico contratos |
| `/login` | ✅ | Email + senha (Supabase Auth) |
| `/configuracoes` | ✅ | NFS-e, Nome Retorno, Tema (4 modos selecionáveis) |

**Removidas:** `/ativos`, `/preventivos`, `/pinda`, `/retorno` → filtros no flow de `/contratos`

### Infraestrutura

- Supabase Client: `lib/supabase/client.ts` (browser) + `server.ts` (server)
- Types: `types/database.ts` (parcial)
- Middleware Auth: `middleware.ts` + `app/auth/callback/route.ts`
- Lib NFS-e: `lib/nfse/` (certificado, assinatura, xml-builder, client SOAP)
- API NFS-e: `app/api/nfse/emitir/route.ts`
- API Ficha Email: `app/api/ficha/email/route.ts` (Resend - notificação + fallback)
- Componentes: Sidebar, LayoutWrapper, ContratoTags, useDebounce hook
- Lib: `contrato-tags.ts` (computação compartilhada de tags pipeline ↔ tutor)

### O que falta

**Alta:** Dashboard integrado, View Preventivos (Acionar PV), View Pinda, View Retorno (sub-estados + rotas)

**Média:** WhatsApp/mensagens, Ficha de Remoção (gerar imagem), Rotas de entrega com mapa, Edição de contratos, Cadastro novos contratos

**Baixa:** Geocoding CEPs, Relatórios exportáveis, PWA/mobile

---

## DESIGN DO NOVO SISTEMA

### VIEW: Gestão de Ativos

Lista com indicadores visuais por contrato ativo:
- Rescaldo: 🐾 Molde, ✂️ Pelinho (padrão fazer), ✂️ Pelo extra, 📄 Carimbo → status ❌/🕐/✅
- ⚱️ Urna, 🎀 Acessórios → ❌/✅
- 💰 Pgto Plano, 🛒 Pgto Acess. → ❌/🕐/✅/⏳*(seguradora)
- 🕯️ Velório → ❌/🕐/📅/✅
- 📦 Itens pessoais com destinos (doar/descartar/retornar/cremar_junto)
- 📷 Foto pendente (produtos com `precisa_foto`)
- Filtros: rescaldo pendente, sem urna, pgto pendente, velório hoje, pronto pra Supinda

**Mensagens/Ações:** Finaliza Preventivo, Chegamos, Pet Grato (1-3d após morte), Prepara Velório, Cinzas Chegaram, Finalizadora (avaliação Google)

**Ficha de Remoção:** Gerar PNG com dados do contrato (lacre, cremação, pet, tutor, clínica). Nome: `{codigo}_{pet_nome}.png`

### VIEW: Preventivos (PV)

Lista de pets vivos com contrato. Pgto integral no ato. Ação "Acionar PV" → status Preventivo→Ativo.
Estoque: REAL (físico) vs VIRTUAL (Real - PVs reservados - Empréstimos).

### VIEW: Pinda

Lista simples: pets no crematório. Colunas: Pet/Tutor, Nº Supinda, Data. Quando Supinda volta → status Pinda→Retorno.

### VIEW: Retorno

Sub-estados: 📸 Pendências → ✅ Pronto → 🚚 Em rota → ✔️ Entregue → ⭐ Finalizadora → Finalizado

**Mensagem "Chegaram"** (template inteligente): IND vs COL, Entrega vs Retirada vs Digital, pendências (foto, modelo, cor, urninha). Ref: `chegamos e chegaram.html`

**Restrições de Entrega:** Dias/períodos bloqueados, observação livre, endereço alternativo.

**Rotas de Entrega:** R1, R2... sequenciais. Fluxo: filtrar prontos sem restrição → agrupar por CEP → criar rota → visualizar mapa → executar → marcar entregue. Tecnologia: ViaCEP + Leaflet/Google Maps + nearest neighbor.

### VIEW: Supindas ✅ (implementada)

1x/semana (80% domingo). CRUD: número, data, responsável, peso, qtd pets. Associar contratos (Ativo→Pinda). Ação "Retornou" (Pinda→Retorno).

### VIEW: Dashboard

Filtros: Período, Tipo (EM/PV), Cremação (IND/COL).
- **Volume:** Santos (contratos) vs Pinda (cremações). Saldo PV = vendidos - acionados.
- **Financeiro:** Receita, Custo cremação (padrão R$500 IND / R$300 COL), Resultado bruto, Pendentes, Ticket médio.
- **Indicadores:** Ranking clínicas.
- **Remoções:** Por cidade, por período (manhã/tarde/noite/madrugada).
- **Gráficos:** IND vs COL, EM vs PV, evolução mensal.

### VIEW: Estoque ✅ (implementada)

Grid com fotos, filtros por categoria (Urna/Acessório/Incluso). Colunas: Real, Reservado PV, Emprestado, Virtual. Alerta estoque_minimo. Entradas (origem, qtd, custo). Empréstimos bidirecionais.

---

## NFS-e (GISS Online) ✅

Integração direta: ABRASF 2.04, SOAP 1.0, XMLDSig com certificado A1 (e-CNPJ).

| Ambiente | URL |
|----------|-----|
| Homologação | `https://v2-ws-homologacao.giss.com.br/service-ws/nf/nfse-ws?wsdl` |
| Produção | `https://ws-santos.giss.com.br/service-ws/nf/nfse-ws?wsdl` |

**Fiscal Santos/SP:** Município 3548500, ISS 5%, Serviço 25.01, Tributação 250100199.

**Campos contratos:** `nfse_numero`, `nfse_codigo_verificacao`, `nfse_data`, `nfse_status`, `nfse_link_pdf`

**Dependências:** node-forge, xml-crypto, soap, uuid

**Config em `configuracoes`:** cnpj, inscricaoMunicipal, certificadoBase64, senhaCertificado, proximoRps, ambiente

**Fluxo emissão:** `/contratos/[id]` → "Emitir NF" → monta RPS → assina XML → envia GISS → salva no contrato → incrementa RPS.

---

## Estrutura do Projeto

```
NOVO_CRM_RIP_PET/
├── CLAUDE.md, CHANGELOG.md
├── chegamos e chegaram.html        # Templates mensagens (ref)
├── Bases_legado/                   # CSVs do Google Sheets
├── migracao/                       # migrar_legado.py, importar_supabase.py, output/
├── supabase/migrations/            # SQL migrations
└── web/src/
    ├── middleware.ts                # Auth protection
    ├── app/
    │   ├── layout.tsx              # DM Sans + JetBrains Mono fonts
    │   ├── globals.css             # Design tokens, keyframes, utilities
    │   ├── page.tsx (→/dashboard)
    │   ├── login/page.tsx          # Login
    │   ├── auth/callback/route.ts  # Auth callback
    │   ├── dashboard/page.tsx      # ✅ KPIs reais Supabase
    │   ├── fichas/page.tsx         # ✅ Lista fichas + modal tratativa→contrato
    │   ├── contratos/page.tsx      # ✅ Flow visual
    │   ├── contratos/[id]/page.tsx # ✅ Detalhe
    │   ├── tutores/page.tsx        # ✅ Lista responsiva (table+cards)
    │   ├── tutores/[id]/page.tsx   # ✅ Detalhe
    │   ├── supindas/page.tsx       # ✅ Dashboard+CRUD responsivo
    │   ├── estoque/page.tsx        # ✅ Grid visual + hover effects
    │   ├── estoque/[id]/page.tsx   # ✅ Detalhe
    │   ├── configuracoes/page.tsx  # ✅ NFS-e config
    │   └── api/nfse/emitir/route.ts
    ├── components/
    │   ├── contratos/
    │   │   ├── ContratoTags.tsx     # Faróis dual mode (compact/expanded)
    │   │   └── PipelineBar.tsx      # Pipeline extraído (desktop strip + mobile pills)
    │   ├── fichas/
    │   │   ├── FichaRemocao.tsx      # Ficha de remoção reutilizável (forwardRef)
    │   │   └── TratativaModal.tsx   # Modal processar ficha → criar contrato
    │   ├── supindas/
    │   │   └── FichasBatchModal.tsx  # Geração em lote de fichas + upload Storage + ZIP
    │   ├── layout/
    │   │   ├── Sidebar.tsx          # 3 estados: full/mini/drawer
    │   │   ├── LayoutWrapper.tsx    # Coordena sidebar + margins + ToastProvider
    │   │   ├── MobileHeader.tsx     # Header fixo mobile com hamburger
    │   │   └── MobileDrawer.tsx     # Drawer lateral com backdrop blur
    │   └── ui/
    │       ├── Modal.tsx            # Dialog desktop / Bottom sheet mobile
    │       ├── Toast.tsx            # Notificações com useToast hook
    │       ├── Skeleton.tsx         # Loading primitives (rect/circle/text/card/row)
    │       ├── EmptyState.tsx       # Nenhum resultado
    │       └── Badge.tsx            # Status badges semânticos
    ├── hooks/
    │   ├── useDebounce.ts
    │   ├── useMediaQuery.ts         # mobile/tablet/desktop
    │   ├── useSidebarState.ts       # Drawer open/close
    │   ├── useTheme.ts              # Theme state + localStorage
    │   └── useToast.ts              # Re-export conveniência
    ├── lib/theme.ts                # Theme constants, types, storage helpers
    ├── lib/ficha-generator.ts      # Captura DOM→Blob + filename normalizado
    ├── lib/contrato-tags.ts        # Computação compartilhada de tags (puro TS)
    ├── lib/supabase/               # client.ts, server.ts
    ├── lib/nfse/                   # certificado, assinatura, xml-builder, client
    └── types/database.ts
```
