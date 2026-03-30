# Changelog - R.I.P. Pet CRM

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## Convenções de Versão

- **MAJOR (X.0.0)**: Mudanças incompatíveis / grandes reformulações
- **MINOR (0.X.0)**: Novas funcionalidades (retrocompatíveis)
- **PATCH (0.0.X)**: Correções de bugs e ajustes menores

## Categorias de Mudanças

- **Added**: Novas funcionalidades
- **Changed**: Alterações em funcionalidades existentes
- **Deprecated**: Funcionalidades que serão removidas em breve
- **Removed**: Funcionalidades removidas
- **Fixed**: Correções de bugs
- **Security**: Correções de vulnerabilidades

---

## [Unreleased]

### Added
- **Geracao em Lote de Fichas de Remocao na Supinda** — Gera todas as fichas de remocao de uma supinda de uma vez, salva no Supabase Storage e permite download ZIP ou compartilhamento individual
  - Componente `FichaRemocao` extraido do detalhe do contrato para reuso (`components/fichas/FichaRemocao.tsx`)
  - Utilitario `ficha-generator.ts` com captura DOM→Blob e geracao de filename normalizado
  - `FichasBatchModal` com fluxo: carregar contratos → capturar fichas → upload Storage → galeria com thumbnails → ZIP download
  - Progress bar dual-fase (capturando + enviando), badge de upload confirmado, overlay com acoes individuais
  - Botao "Gerar Fichas (N)" na area expandida de cada supinda
  - Migration `030_storage_fichas.sql`: bucket `fichas` publico + politicas RLS (authenticated CRUD + anon read)
  - Dependencias: `jszip`, `file-saver`, `@types/file-saver`

### Changed
- Ficha de Remocao no detalhe do contrato agora usa componente compartilhado `FichaRemocao` + utilitario `captureElementAsBlob`
- **Modulo de Recepcao de Fichas** (`/fichas`) — Pagina interna para recepcionar fichas enviadas por tutores via WhatsApp e converte-las em contratos
  - Lista de fichas com filtro Pendentes/Processadas/Todas + busca real-time
  - Cards com dados do pet, tutor, telefone WhatsApp, cidade, clinica e tempo relativo
  - Modal de tratativa com resumo da ficha (read-only) + campos do operador (tipo plano, indicador/clinica com autocomplete, responsavel, codigo auto-gerado, lacre, data)
  - Deteccao automatica de tutor existente por CPF (reuso vs criacao)
  - Conversao completa: cria tutor + contrato + mapeia ~20 campos + marca ficha processada
  - Badge amber pulsante na sidebar indicando fichas pendentes
  - Migration 027: campos `processada`, `contrato_id`, `processada_em`, `processada_por` na tabela fichas
  - Novos arquivos: `app/fichas/page.tsx`, `components/fichas/TratativaModal.tsx`, `migrations/027_fichas_processamento.sql`
  - Sidebar atualizada com nav item "Fichas" (ClipboardList icon) + contagem pendentes
- **Email Fallback na Ficha de Entrada** — Quando tutor submete ficha, email é enviado via Resend como notificação (Supabase OK) ou fallback (Supabase falhou). localStorage só é usado se ambos falharem.
  - API route: `api/ficha/email/route.ts` com template HTML formatado (seções Tutor, Pet, Serviço, Extras)
  - Dependência: `resend` SDK
  - Env: `RESEND_API_KEY`
- **Sistema de 4 Temas Selecionáveis** — Configurações → aba "Tema"
  - 4 combinações: Escuro, Claro, Meio-claro (shell claro + conteúdo escuro), Meio-escuro (shell escuro + conteúdo claro)
  - Sidebar sempre escura em todos os temas
  - CSS override engine via `[data-theme]` — remapeia ~50 classes Tailwind hardcoded (slate-*, status badges, hover states)
  - Duas camadas independentes: Shell (`--shell-bg`) e Content (`--surface-*` invertidos)
  - Anti-FOUC: script inline no `<head>` lê localStorage antes do paint
  - Persistência via localStorage (`rippet-theme`)
  - ThemeSelector com mini-previews visuais mostrando sidebar + shell + content
  - Novos arquivos: `lib/theme.ts`, `hooks/useTheme.ts`, `components/configuracoes/ThemeSelector.tsx`
  - DOM markers: `.theme-content` no `<main>`, `.theme-sidebar` nos sidebars/header mobile

- **Redesign "Warm Minimalism" — Layout Moderno 2026 (Desktop + Mobile)**
  - **FASE 1: Fundação CSS + Tipografia + Sidebar Responsiva**
    - `globals.css` reescrito: design tokens CSS (--brand-*, --surface-*, --status-*, --shadow-*, --radius-*, --ease-*, --duration-*), keyframes (fadeIn, slideUp, slideDown, slideInLeft, slideInRight, scaleIn, shimmer, bottomSheetUp, overlayIn), utility classes (.animate-*, .stagger-children, .scrollbar-hide), type scale (.text-display/title/subtitle/body/small/caption/mono), button components (.btn-primary/secondary/ghost/danger/icon), card e input base classes
    - `layout.tsx`: fonte Geist substituída por **DM Sans** (display + body) + **JetBrains Mono** (códigos, valores financeiros); viewport migrado para `generateViewport` (Next.js 16)
    - **Sidebar responsiva 3 estados**: Desktop (>=1024px) sidebar fixa 256px com ícones + texto; Tablet (768-1023px) mini sidebar 72px só ícones + tooltip hover; Mobile (<768px) header fixo + hamburger + drawer lateral com backdrop blur
    - Novos componentes: `MobileHeader.tsx` (barra fixa top com hamburger + título da página), `MobileDrawer.tsx` (drawer lateral com backdrop blur + slide-in)
    - Sidebar visual: fundo branco com borda direita, active state com barra lateral brand-500 + fundo brand-50 (em vez de bloco roxo sólido)
    - Novos hooks: `useMediaQuery.ts` (mobile/tablet/desktop), `useSidebarState.ts` (open/close drawer)
  - **FASE 2: Componentes UI Reutilizáveis** (`components/ui/`)
    - `Modal.tsx`: responsivo — centered dialog no desktop, bottom sheet slide-up no mobile, overlay com backdrop-blur, drag handle no mobile, header/body/footer, tamanhos sm/md/lg/xl/full
    - `Toast.tsx` + `hooks/useToast.ts`: notificações bottom-right (desktop) / bottom-center (mobile), variantes success/error/warning/info, auto-dismiss 4s, context provider global
    - `Skeleton.tsx`: primitivos de loading (Skeleton, SkeletonCircle, SkeletonText, SkeletonCard, SkeletonTableRow) com animate-shimmer
    - `EmptyState.tsx`: ícone + título + descrição + ação opcional para "nenhum resultado"
    - `Badge.tsx`: status badges padronizados com variantes semânticas (default, success, error, warning, info, purple) + status do CRM (preventivo, ativo, pinda, retorno, pendente, finalizado)
  - **FASE 3: Redesign Página por Página**
    - `PipelineBar.tsx`: extraído de contratos — desktop strip horizontal com glow, mobile pills scrolláveis
    - `ContratoTags.tsx`: modo dual — `compact` (28x28 squares com emoji, desktop) e `expanded` (pills com emoji + label, mobile)
    - `/dashboard`: KPI cards reais com dados Supabase (6 status cards com contagem, 3 summary cards com total contratos/tutores/produtos), skeleton loading
    - `/tutores`: tabela no desktop + cards empilhados no mobile, skeleton loading, empty state, design tokens aplicados
    - `/estoque`: filtros como pills arredondadas, grid cards com hover lift + image zoom sutil, skeleton loading, empty state
    - `/supindas`: status cards `grid-cols-1 md:grid-cols-3`, header responsivo
    - `/configuracoes`: header atualizado com design tokens
    - `/contratos`: header e busca com design tokens aplicados
  - **FASE 4: Polish**
    - Skeleton loading em dashboard, tutores, estoque
    - Animações de entrada: `animate-fade-in` em todas as páginas, `stagger-children` em listas
    - Card hover: `card-hover` com `translateY(-2px)` + shadow
    - Button press: `active:scale-[0.97]`
    - Empty states em tutores e estoque
    - Surface quente #fafaf8 em vez de gray-50 como background global

- **Tags compartilhadas Pipeline ↔ Ficha do Tutor**
  - `lib/contrato-tags.ts` — tipos (`ContratoTagData`, `TagState`, `ComputedTag`), 7 funções de computação, `computeAllTags`, `getPagamentoPendente`, `TAG_STATE_STYLES`
  - `components/contratos/ContratoTags.tsx` — componente read-only que renderiza faróis compactos
  - Ficha do tutor (`tutores/[id]`) agora exibe faróis de acompanhamento em cada contrato
  - Query Supabase do tutor expandida para incluir dados de pelinho, certificado, pagamentos, produtos e protocolo
  - Para adicionar nova tag no futuro: criar `compute*()` em `contrato-tags.ts` → aparece nos dois lugares automaticamente

### Changed
- **Rescaldos — Migração de `contrato_rescaldos` para `contrato_produtos`**
  - Migration `025_rescaldo_em_contrato_produtos.sql` — coluna `rescaldo_feito` em `contrato_produtos`
  - Rescaldos agora são produtos normais em `contrato_produtos` (com `rescaldo_tipo` no produto)
  - Tag 🐾 no pipeline derivada de `contrato_produtos` (sem `contrato_rescaldos`)
  - Ghost 🐾❓ aparece em TODOS os status exceto finalizado (antes excluía pendente também)
  - Modal 🐾 reescrito: Seção 1 lista produtos de rescaldo no contrato com toggle feito/pendente; Seção 2 grid de produtos disponíveis com busca
  - Bidirecionalidade automática — adicionar rescaldo pelo modal normal de produtos reflete na tag 🐾
  - Tabela `contrato_rescaldos` não é mais usada (não dropada, apenas abandonada)
  - Removido campo "Outro" (texto livre) do modal de rescaldos

### Added
- **Rescaldos — Modal dinâmico com produtos reais do banco**
  - Migration `024_produtos_rescaldo_tipo.sql` — coluna `rescaldo_tipo` em `produtos`, valor 'itens_pessoais' no enum
  - Modal de rescaldos agora mostra grupos dinâmicos vindos de `produtos` com `rescaldo_tipo` não-null
  - Cada grupo exibe contagem de produtos e lista compacta de nomes
  - Grupos: Molde Patinha (12+ produtos), Carimbo, Pelo Extra, Itens Pessoais
  - "Outro" mantém input de texto livre (hardcoded)
  - Se tipo já existe nos rescaldos do contrato, botão fica desabilitado (cinza)
  - Pelinho continua com fluxo próprio separado (sem flag rescaldo_tipo)

- **Rescaldos — Botão + Alerta no Pipeline e Detalhe**
  - Migration `023_rescaldo_outro.sql` — adiciona valor 'outro' ao enum `tipo_rescaldo`
  - Modal de gerenciamento de rescaldos (adicionar, toggle status, remover) no pipeline e na ficha do contrato
  - Chips clicáveis: Molde Patinha, Carimbo, Pelo Extra, Outro (com texto livre)
  - Tag verde 🐾 no pipeline quando todos os rescaldos estão feitos
  - Tag amber 🐾 com contagem no pipeline quando há rescaldos pendentes
  - Indicador 🐾 na ficha do contrato `[id]` com mesma lógica de cores
  - Pelinho mantém fluxo próprio separado (não aparece nos chips de rescaldo)

- **Protocolo de Entrega — Persistência no Banco + Tag Visual**
  - Campo `protocolo_data` (JSONB) na tabela `contratos` para salvar protocolo editado
  - Migration `021_protocolo_data.sql`
  - Função `montarProtocoloData()` em `protocolo-utils.ts` (reutilizável em list e detail)
  - **Tag visual no pipeline**: 📄 verde (protocolo salvo) / 📄 amarelo (não preparado)
  - Clicar na tag abre modal editor com produtos, valores, toggle pagamento
  - Botão **Salvar** persiste no banco; tag muda de amarelo para verde
  - Reabrir tag verde carrega dados salvos do banco
  - **Batch simplificado**: seleciona contratos com protocolo salvo → imprime direto dos dados salvos (sem re-fetch pesado)
  - Alerta se tentar batch com contratos sem protocolo salvo
  - Detalhe do contrato: botão Receipt fica verde se protocolo salvo, com botão Salvar no modal
  - Layout de impressão com grid 2x2 de altura fixa (cada card ocupa exatamente metade da página)

- **Protocolo de Entrega (impressão PDF)**
  - Componente `ProtocoloEntrega` renderiza 1 protocolo com layout fiel ao Excel original
  - Mapa `NOME_RETORNO_MAP` com ~250 nomes abreviados de produtos para o protocolo
  - Lista `PROTOCOLO_EXCLUIR` com produtos ocultos no protocolo (Nenhum Rescaldo, visores porta-pelo, etc.)
  - Cálculo automático de saldo e opções de pagamento (Pix, 1-6x, 7-12x) com descontos
  - **Individual**: botão no detalhe do contrato (retorno/pendente/finalizado) → modal preview → imprimir
  - **Batch**: checkboxes na lista de contratos (retorno/pendente/finalizado) → selecionar múltiplos → barra flutuante → imprimir 4 por página A4
  - Impressão via iframe invisível com `window.print()` (zero dependências extras)
  - Checklist de entrega: Certificado, Pelinho, Urna c/ Cinzas, Recordações
  - Campo de assinatura e data no rodapé

- **Autenticação com Supabase Auth**
  - Middleware (`middleware.ts`) protege TODAS as rotas, redireciona para `/login` se não autenticado
  - Página de login (`/login`) com email + senha, visual clean com gradiente
  - Auth callback route (`/auth/callback`) para troca de código por sessão
  - Layout separado para auth (sem sidebar)
  - `LayoutWrapper` condicional: esconde sidebar nas páginas de login
  - Sidebar agora mostra email do usuário logado + botão "Sair"
  - Usuários são criados manualmente no Supabase Dashboard (sem página de cadastro)

### Security
- **`.gitignore` na raiz do projeto** protegendo:
  - `.env*` (variáveis de ambiente com credenciais Supabase)
  - `.claude/settings.local.json` (settings com credenciais)
  - `migracao/output/` (dados sensíveis de tutores/contratos)
  - `__pycache__/`, `node_modules/`, arquivos de OS/IDE

- **Página `/estoque/[id]`** - Detalhe do produto
  - Header compacto com imagem pequena (24x24), nome, código e tipo
  - Stats horizontais: Preço (editável), Estoque Atual, Estoque Ideal, Total Vendido
  - Histórico de Entradas de estoque (da tabela `estoque_entradas`)
  - Histórico de Saídas/Vendas (da tabela `contrato_produtos` com link para contrato)
  - Background colorido por tipo: roxo (urna), azul (acessório), verde (incluso)
  - Formatação: preço 0 = "Incluso", custo null = "-"
- **Hook `useDebounce`** - `/hooks/useDebounce.ts`
  - Debounce genérico para valores com delay configurável (padrão 300ms)
  - Usado para busca em tempo real
- **Busca em tempo real** (search-as-you-type) em todo o app
  - `/contratos` - Busca automática enquanto digita, sem botão "Buscar"
  - `/tutores` - Busca automática enquanto digita, sem botão "Buscar"
  - `/estoque` - Já tinha filtro local instantâneo
  - Botão X para limpar busca em todos os campos
- **Migração de `estoque_entradas`**
  - Tabela populada com 660 entradas do legado (Entradas_PROD.csv)
  - Campos: produto_id, quantidade, custo_unitario, data_entrada, remessa
- **Campo `created_at` em `contrato_produtos`**
  - Preenchido com `data_acolhimento` do contrato correspondente
  - Permite ordenar saídas de produtos cronologicamente
- **Campo `qtde_vendida` em produtos**
  - Importado do campo "Consumido" do CSV legado
  - Mostra total histórico de vendas por produto
- **Modal "Quitar Saldo" redesenhado**
  - Plano e Acessório lado a lado com valores
  - Toggle "Desconto pós" para cada tipo (só mostra campo se ativado)
  - Total calculado automaticamente (valores - descontos)
  - "Totalzão" com destaque visual em verde (posicionado antes dos botões)
  - Conta selecionada automaticamente: Pix→Inter, Cartões→Granito, Dinheiro→Dinheiro
- **Sistema de Taxas de Cartão pré-programadas**
  - Tabela `taxas_cartao` com tipos: débito, crédito 1x a 12x
  - Percentuais configuráveis por tipo de cartão
  - Seletor de tipo aparece ao escolher crédito/débito
  - Taxa calculada automaticamente sobre o total
  - Campo ID Transação para número da maquininha
  - Migration: `012_taxas_cartao.sql`
- **Campos de controle financeiro em pagamentos**
  - `valor_liquido_sem_taxa`: valor que o cliente pagou (valor - desconto)
  - `valor_liquido`: valor que entrou na conta (valor - desconto - taxa)
  - `id_transacao`: número gerado pela maquininha
  - Parcelas extraídas automaticamente do tipo de cartão
- **Campo `estoque_infinito`** em produtos
  - Produtos com estoque infinito são serviços/lembretes que não precisam controle de estoque
  - Ex: Nenhuma Urna, Molde de Patinha, Pelo Extra, Protocolo de Retorno
  - Mostram símbolo ∞ em azul ao invés de quantidade
  - Nunca aparecem como "SEM ESTOQUE"
  - Migration: `011_estoque_infinito.sql`
- **Campo `seguradora`** em contratos
  - Armazena qual seguradora solicitou o atendimento (quando conhecimento = Seguradora)
  - Exemplos: Oi Pet, Ossel, Incluir
  - Extração automática do legado via regex no campo `nome_whatsapp`
  - Nome da seguradora aparece embaixo do ícone 🛡️ na lista de contratos
  - Migration: `010_campo_seguradora.sql`
- **Emissão de NFS-e (Nota Fiscal de Serviço Eletrônica)**
  - Integração direta com GISS Online (Prefeitura de Santos)
  - Padrão ABRASF 2.04
  - Assinatura XML com certificado digital A1 (e-CNPJ)
  - Lib completa: `lib/nfse/` (certificado, assinatura, xml-builder, client)
  - API route: `/api/nfse/emitir`
  - Dependências: node-forge, xml-crypto, soap, uuid
  - Migration: `007_nfse_campos.sql` (campos na tabela contratos + tabela configuracoes)
- **Página `/configuracoes`** - Configurações do sistema
  - Upload de certificado digital A1 (.pfx)
  - CNPJ e Inscrição Municipal
  - Senha do certificado
  - Número do próximo RPS
  - Alternância entre ambiente homologação/produção
  - Link "Configurações" adicionado à sidebar
- **Botão "Emitir NF"** na página de detalhe do contrato
  - Card Financeiro agora exibe dados da NFS-e quando emitida
  - Status visual: número da nota, data de emissão
  - Feedback de sucesso/erro ao emitir
- **Indicador de Pelinho (✂️)** - Rescaldo padrão na lista de contratos
  - Campos no banco: `pelinho_quer`, `pelinho_feito`, `pelinho_quantidade`
  - Estados visuais: cinza (não definido), amarelo (pendente), verde (feito), vermelho (não quer)
  - Modal popup para definir: quer pelinho? tirou? quantidade?
  - Migration: `006_pelinho_campos.sql`
- **Tabela `tutores`** - Normalização dos dados de tutores
  - Tutores agora são entidades separadas, reutilizáveis entre contratos
  - Campos: nome, cpf, telefone, telefone2, email, endereço completo
  - Deduplicação por telefone (ou nome+cidade quando sem telefone)
  - Migration: `002_tabela_tutores.sql`
- **Página `/tutores`** - Lista de tutores cadastrados
  - Busca por nome, telefone, CPF, email ou cidade
  - Paginação com 30 itens por página
  - Link direto para WhatsApp
  - Tabela com informações resumidas
- **Página `/tutores/[id]`** - Detalhe do tutor
  - Informações completas de contato
  - Endereço com links para Waze e Google Maps
  - Histórico de todos os contratos do tutor
  - Indicadores visuais de status por contrato
- Link "Tutores" adicionado à sidebar

### Changed
- **Indicador de Urna (⚱️)** - Cores e ícones atualizados
  - Amarelo + ❓ = não escolheu urna ainda
  - Verde + ✅ = urna definida
  - Vermelho + ❌ = não quer urna (código 0001)
- **Página `/contratos` unificada com Flow Visual**
  - Pipeline de status no topo: Preventivo → Ativo → Pinda → Retorno → Pendente → Finalizado
  - Cada etapa mostra contador de contratos
  - Clique na etapa filtra a lista abaixo
  - Clique novamente para remover filtro
  - Cores e ícones distintos por status
  - Substitui as páginas separadas `/ativos`, `/preventivos`, `/pinda`, `/retorno`
- **Sidebar simplificada**
  - Removidos links separados de status (Ativos, Preventivos, Pinda, Retorno)
  - Mantidos: Dashboard, Contratos, Supindas, Estoque, Tutores
- **Queries com JOIN** - Contratos agora buscam dados do tutor via relacionamento
  - `/contratos/[id]` - Usa `tutor:tutores(*)` para carregar dados do tutor
  - `/contratos` - Inclui dados do tutor no JOIN
  - Fallback automático para campos legados (`tutor_nome`, `tutor_telefone`, etc.)
- **Card do Tutor** na página de contrato
  - Agora exibe link "Ver cadastro" quando tutor está vinculado
  - Usa dados da tabela `tutores` com fallback para campos legados

### Deprecated
- **Campos legados de tutor na tabela `contratos`**
  - `tutor_nome`, `tutor_cpf`, `tutor_telefone`, etc.
  - Serão removidos em versão futura (ver `003_remover_campos_legados_tutores.sql`)
  - Sistema usa fallback automático enquanto campos existirem
- Página `/estoque` funcional com integração Supabase
  - Grid visual com fotos dos produtos
  - Modo de visualização grid/lista
  - Busca por nome ou código
  - Filtros por categoria (Urnas, Acessórios, Inclusos)
  - Indicadores de estoque: OK (verde), Baixo (amarelo), Crítico (vermelho)
  - Exibição de preço e quantidade disponível
  - Imagens locais dos produtos (pasta public/estoque)
- Modal de seleção de urna na página de contrato
  - Grid visual com fotos das urnas disponíveis
  - Busca por nome ou código
  - Indicação de produtos sem estoque
  - Seleção visual com confirmação
- Indicador de urna (⚱️) na página de detalhe do contrato
- Botões de navegação Waze e Google Maps na página de contrato

### Fixed
- Filtro de produtos inativos (catalogo=n) removidos da listagem

### Changed
- Card "Urna & Lacre" simplificado para apenas "Lacre" na página de detalhe do contrato
- Badges reorganizados em coluna: Código → EM/PV → IND/COL → Status
- Logo R.I.P. Pet substituída na sidebar (imagem ao invés de ícone)
- Cores dos badges: EM=vermelho, PV=amarelo, IND=verde, COL=roxo, Ativo=vermelho
- Removido CPF da exibição na página de contrato

---

## [0.2.0] - 2026-01-20

### Added

**Frontend:**
- Página `/ativos` funcional com integração Supabase
  - Lista de contratos com status "ativo"
  - Filtros por urna, pagamento e supinda
  - Busca por pet, tutor, código ou telefone
  - Indicadores visuais (espécie, peso, local, dias)
  - Link direto para WhatsApp do tutor
  - Exibição de próximas supindas
- Página `/contratos` funcional
  - Lista paginada (30 por página)
  - Busca por código, pet, tutor ou lacre
  - Filtro por status
  - Cards com indicadores visuais
- Página `/contratos/[id]` com detalhe completo
  - Hero card com info do pet
  - Card do tutor com contato e endereço
  - Timeline de datas do processo
  - Info de urna e lacre
  - Resumo financeiro
  - Observações
- Ícones dinâmicos para pets (espécie + porte)
- Cores diferenciadas para Individual vs Coletiva

**Infraestrutura:**
- Supabase client configurado (browser + server)
- Types do banco de dados (parcial)

### Changed
- Layout com sidebar fixa e área de conteúdo com scroll
- Páginas placeholder atualizadas com estrutura básica

---

## [0.1.0] - 2026-01-18

### Added

**Backend/Schema:**
- Schema completo do banco PostgreSQL (`001_schema_inicial.sql`)
- ENUMs: status_atendimento, tipo_cremacao, tipo_plano, especie_pet, etc.
- Tabela `contratos` com todos os campos mapeados do legado
- Tabela `supindas` para viagens ao crematório
- Tabela `produtos` para catálogo de urnas/acessórios
- Tabela `pagamentos` para controle financeiro
- Tabelas auxiliares: funcionarios, indicadores, fontes_conhecimento, contas
- Tabela `contrato_rescaldos` (molde, pelo, carimbo)
- Tabela `contrato_itens_pessoais` (destino dos itens do pet)
- Tabela `rotas_entrega` e `rota_entregas` para sistema de entregas
- Tabela `contrato_restricoes_entrega` para restrições de horário
- Tabelas de mensagens: `mensagem_templates`, `contrato_mensagens`
- Tabela `tarefas` e `tarefa_tipos`
- Tabela `estoque_entradas` e `estoque_emprestimos`
- Índices para performance
- Triggers para atualização automática de `updated_at`

**Scripts de Migração:**
- `migrar_legado.py` - Converte CSVs do Google Sheets para formato Supabase
- `importar_supabase.py` - Upload automático via API
- `fix_schema.sql` - Correções pontuais
- CSVs gerados em `migracao/output/`
- Documentação completa da migração (`migracao/README.md`)

**Frontend (estrutura):**
- Projeto Next.js 16 inicializado
- Tailwind CSS v4 configurado
- Sidebar com navegação
- Páginas placeholder para todas as views
- Supabase SSR configurado

**Documentação:**
- `claude.md` com especificação completa do sistema
- Glossário de termos do negócio
- Design de todas as views planejadas
- Mapeamento de tabelas legado → novo

---

## [0.0.1] - 2026-01-17

### Added
- Projeto iniciado
- Análise do sistema legado (Google Sheets + AppSheets)
- Decisão de stack: Next.js + Supabase
- Primeiros rascunhos de requisitos

---

## Roadmap

### v0.3.0 (Próxima)
- [ ] Dashboard com dados reais do Supabase
- [ ] View Preventivos funcional
- [ ] View Pinda funcional
- [ ] View Retorno funcional

### v0.4.0
- [ ] View Supindas com CRUD completo
- [ ] View Estoque com catálogo visual
- [ ] Edição de contratos

### v0.5.0
- [ ] Cadastro de novos contratos
- [ ] Sistema de mensagens/WhatsApp
- [ ] Ficha de Remoção (gerar imagem)

### v1.0.0
- [ ] Sistema de rotas de entrega com mapa
- [ ] Autenticação (login)
- [ ] Testes e estabilização
- [ ] Deploy em produção

---

## Links

- **Repositório:** (a definir)
- **Produção:** (a definir)
- **Staging:** (a definir)
- **Supabase Dashboard:** (link do projeto)
