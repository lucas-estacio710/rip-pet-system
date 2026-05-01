/**
 * Field-Level Security — Catálogo Unificado de Permissões
 *
 * Organizado em 3 CATEGORIAS (mesma hierarquia do /admin/visibilidade):
 *
 *   1. TELAS       → Módulos/páginas inteiras (ex: Dashboard, Pipeline, Fichas)
 *   2. OBJETOS     → Seções/áreas dentro de uma tela (ex: Financeiro, Produtos, GC)
 *   3. CAMPOS/BTNS → Campos de dados e botões de ação individuais
 *
 * MODOS DE PERMISSÃO:
 *   - 'toggle' → 2 estados: visível (👁️) ou oculto (🚫). Sem row = visível.
 *                 Usado em: Telas e Objetos Relacionados (ver ou não ver)
 *   - 'full'   → 3 estados: editável (✏️), leitura (👁️), oculto (🚫). Sem row = editável.
 *                 Usado em: Campos e Botões (editar, ver ou esconder)
 *
 * REGRA PARA MANUTENÇÃO (ler antes de alterar!):
 *   - Ao criar nova TELA: adicionar em TELAS (modo sempre 'toggle')
 *   - Ao criar nova SEÇÃO dentro de uma tela: adicionar em OBJETOS (modo default 'toggle')
 *   - Ao criar novo CAMPO ou BOTÃO: adicionar em CAMPOS_BOTOES (modo default 'full')
 *   - O campo `tela` em OBJETOS e CAMPOS_BOTOES indica a qual tela pertencem
 *   - Atualizar SCHEMA.md e CLAUDE.md quando adicionar itens novos
 */

// ============================================
// TIPOS
// ============================================

/** Modo de permissão:
 *  - 'toggle' = 2 estados (visível/oculto) — sem row = visível
 *  - 'full'   = 3 estados (edit/read/hidden) — sem row = edit
 */
export type PermMode = 'toggle' | 'full'

export type ItemDef = {
  key: string       // Identificador único (armazenado em field_permissions.campo)
  label: string     // Nome amigável para a UI admin
  desc?: string     // Tooltip/descrição
  modo?: PermMode   // 'toggle' (default pra telas/objetos) ou 'full' (default pra campos)
}

export type ChildItemDef = ItemDef & {
  tela: string      // Qual tela este item pertence (key de TELAS)
}

export type CatalogCategory = {
  key: string
  label: string
  color: string
  items: ItemDef[] | ChildItemDef[]
}

// ============================================
// 1. TELAS (módulos/páginas)
// ============================================
export const TELAS: ItemDef[] = [
  { key: 'tela_leads', label: 'Leads', desc: 'Funil de leads do site' },
  { key: 'tela_fichas', label: 'Fichas', desc: 'Receber e processar fichas' },
  { key: 'tela_preventivos', label: 'Preventivos', desc: 'Contratos preventivos' },
  { key: 'tela_pipeline', label: 'Pipeline', desc: 'Lista de contratos e status' },
  { key: 'tela_contrato', label: 'Contrato', desc: 'Detalhe do contrato (página /contratos/[id])' },
  { key: 'tela_entregas', label: 'Encaminhamentos', desc: 'Envio e retorno de pets pra Matriz' },
  { key: 'tela_estoque', label: 'Estoque', desc: 'Controle de estoque' },
  { key: 'tela_gc', label: 'GC', desc: 'Gerenciamento de Cremações (Matriz)' },
  { key: 'tela_tutores', label: 'Tutores', desc: 'Cadastro de tutores' },
  { key: 'tela_ads_shield', label: 'RIP Shield', desc: 'Detecção de fraude em cliques Google Ads' },
  { key: 'tela_dashboard', label: 'Dashboard (Admin)', desc: 'Painel interno do super_admin — uso/adoção dos usuários' },
  { key: 'tela_dashboards', label: 'Dashboards', desc: 'Estatísticas dos contratos para os usuários da unidade' },
]

// ============================================
// 2. OBJETOS RELACIONADOS (seções/áreas dentro de telas)
// ============================================
export const OBJETOS: ChildItemDef[] = [
  // Contrato Detalhe
  { key: 'obj_financeiro', tela: 'tela_contrato', label: 'Financeiro', desc: 'Resumo valores, descontos, pagamentos e NFS-e' },
  { key: 'obj_produtos', tela: 'tela_contrato', label: 'Produtos/Acessórios', desc: 'Card de produtos e acessórios vinculados ao contrato' },

  // Fichas
  { key: 'cb_padronizacao_clinicas', tela: 'tela_fichas', label: 'Padronização Clínicas', desc: 'Autocomplete de estabelecimentos no processamento de ficha' },

  // Dashboards (usuários)
  { key: 'obj_dash_operacional', tela: 'tela_dashboards', label: 'Operacional', desc: 'Volume, fluxo, supindas, entregas, rescaldos' },
  { key: 'obj_dash_financeiro', tela: 'tela_dashboards', label: 'Financeiro', desc: 'Receita, custo cremação, ticket médio, pendentes, NFS-e' },
  { key: 'obj_dash_comercial', tela: 'tela_dashboards', label: 'Comercial / Indicadores', desc: 'Ranking clínicas, indicações, conversão de leads' },
  { key: 'obj_dash_marketing', tela: 'tela_dashboards', label: 'Marketing / Ads', desc: 'UTM, leads, conversão, RIP Shield, ROAS' },
]

// ============================================
// 3. CAMPOS E BOTÕES (granular, por tela)
// ============================================
export const CAMPOS_BOTOES: ChildItemDef[] = [
  // --- PIPELINE ---
  { key: 'btn_farois', tela: 'tela_pipeline', label: 'Faróis Pipeline', desc: 'Todos os faróis do kanban (pelinho, urna, certificado, foto, pagamento, protocolo, rescaldo)', modo: 'toggle' },
  { key: 'btn_mensagens', tela: 'tela_pipeline', label: 'Mensagens Personalizadas', desc: '3-way: Pipeline ↔ Contrato. Pet Grato, Chegamos, Chegaram, Finalizadora', modo: 'toggle' },
  { key: 'btn_alteracao_fase', tela: 'tela_pipeline', label: 'Botões Alteração Fase', desc: '3-way: Pipeline ↔ Contrato. Ativar, Pinda, Marcar Entregue', modo: 'toggle' },
  { key: 'btn_fluxo_retorno', tela: 'tela_pipeline', label: 'Fluxo Retorno', desc: 'Indicador de complexidade de montagem', modo: 'toggle' },
  { key: 'btn_bypass', tela: 'tela_pipeline', label: 'Bypass (B)', desc: 'Finalizar contrato pulando encaminhamento e GC. Temporário.', modo: 'toggle' },

  // --- CONTRATO DETALHE (3-way: mesma key = mesmo toggle do pipeline) ---
  { key: 'btn_farois', tela: 'tela_contrato', label: 'Faróis Pipeline', desc: '3-way: Pipeline ↔ Contrato', modo: 'toggle' },
  { key: 'btn_mensagens', tela: 'tela_contrato', label: 'Mensagens Personalizadas', desc: '3-way: Pipeline ↔ Contrato', modo: 'toggle' },
  { key: 'btn_alteracao_fase', tela: 'tela_contrato', label: 'Botões Alteração Fase', desc: '3-way: Pipeline ↔ Contrato', modo: 'toggle' },
  { key: 'btn_fluxo_retorno', tela: 'tela_contrato', label: 'Fluxo Retorno', desc: '3-way: Pipeline ↔ Contrato. Complexidade + Protocolo', modo: 'toggle' },
  { key: 'btn_compartilhar', tela: 'tela_contrato', label: 'Compartilhar', desc: 'Botão 🔄 compartilhar remoção/entrega com outra unidade', modo: 'toggle' },

  // --- FICHAS ---
  { key: 'btn_pdf_ficha', tela: 'tela_fichas', label: 'Gerar PDF', desc: 'Botão azul de gerar PDF do contrato no card da ficha', modo: 'toggle' },
  { key: 'btn_iniciar_fluxo', tela: 'tela_fichas', label: 'Iniciar Fluxo', desc: 'Botão para gerar contrato a partir da ficha processada', modo: 'toggle' },

  // --- SUPINDAS (somente leitura — sem campos/botões) ---

  // --- ESTOQUE ---
  { key: 'preco_produto', tela: 'tela_estoque', label: 'Preço do Produto', desc: 'Edição de preço no detalhe' },

  // --- RIP SHIELD ---
  { key: 'btn_exportar_ips', tela: 'tela_ads_shield', label: 'Exportar IPs', desc: 'Gerar arquivo .txt para exclusão no Google Ads' },
  { key: 'btn_whitelist', tela: 'tela_ads_shield', label: 'Marcar como Seguro', desc: 'Adicionar IP à whitelist' },
]

// ============================================
// CATÁLOGO COMPLETO (para UI admin)
// ============================================
export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { key: 'telas', label: 'Telas', color: '#3b82f6', items: TELAS },
  { key: 'objetos', label: 'Objetos Relacionados', color: '#f59e0b', items: OBJETOS },
  { key: 'campos', label: 'Campos e Botões', color: '#8b5cf6', items: CAMPOS_BOTOES },
]

// ============================================
// HELPERS
// ============================================

/** Todas as telas disponíveis (para dropdown) */
export function getTelasList(): ItemDef[] {
  return TELAS
}

/** Objetos de uma tela */
export function getObjetosByTela(telaKey: string): ChildItemDef[] {
  return OBJETOS.filter(o => o.tela === telaKey)
}

/** Campos/botões de uma tela */
export function getCamposByTela(telaKey: string): ChildItemDef[] {
  return CAMPOS_BOTOES.filter(c => c.tela === telaKey)
}

/** Resolve o modo de um item (toggle ou full).
 *  Prioridade: override do banco > item.modo no catálogo > default da categoria
 *  - Telas: toggle por default
 *  - Objetos: toggle por default
 *  - Campos/Botões: full por default
 */
export function getItemMode(item: ItemDef, category: 'telas' | 'objetos' | 'campos', modoOverrides?: Record<string, PermMode>): PermMode {
  if (modoOverrides?.[item.key]) return modoOverrides[item.key]
  if (item.modo) return item.modo
  return category === 'campos' ? 'full' : 'toggle'
}
