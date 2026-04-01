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
  { key: 'tela_dashboard', label: 'Dashboard', desc: 'Painel de indicadores' },
  { key: 'tela_leads', label: 'Leads', desc: 'Funil de leads do site' },
  { key: 'tela_fichas', label: 'Fichas', desc: 'Receber e processar fichas' },
  { key: 'tela_preventivos', label: 'Preventivos', desc: 'Contratos preventivos' },
  { key: 'tela_pipeline', label: 'Pipeline', desc: 'Contratos e status' },
  { key: 'tela_entregas', label: 'Encaminhamentos', desc: 'Envio e retorno de pets pra Matriz' },
  { key: 'tela_estoque', label: 'Estoque', desc: 'Controle de estoque' },
  { key: 'tela_tutores', label: 'Tutores', desc: 'Cadastro de tutores' },
  { key: 'tela_gc', label: 'GC', desc: 'Gerenciamento de Cremações (Matriz)' },
  { key: 'tela_ads_shield', label: 'RIP Shield', desc: 'Detecção de fraude em cliques Google Ads' },
]

// ============================================
// 2. OBJETOS RELACIONADOS (seções/áreas dentro de telas)
// ============================================
export const OBJETOS: ChildItemDef[] = [
  // Pipeline / Contrato Detalhe
  { key: 'obj_financeiro', tela: 'tela_pipeline', label: 'Financeiro', desc: 'Área de valores, pagamentos, NFS-e e descontos' },
  { key: 'obj_produtos', tela: 'tela_pipeline', label: 'Produtos/Acessórios', desc: 'Área de produtos e acessórios vinculados ao contrato' },
  { key: 'func_tutores', tela: 'tela_pipeline', label: 'Tutores', desc: 'Link "Ver cadastro" no card do tutor' },
  { key: 'func_gc', tela: 'tela_pipeline', label: 'GC', desc: 'Tracking de cremação dentro do contrato' },

  // Fichas
  { key: 'cb_padronizacao_clinicas', tela: 'tela_fichas', label: 'Padronização Clínicas', desc: 'Autocomplete de estabelecimentos no processamento de ficha' },
]

// ============================================
// 3. CAMPOS E BOTÕES (granular, por tela)
// ============================================
export const CAMPOS_BOTOES: ChildItemDef[] = [
  // --- PIPELINE (lista) ---
  { key: 'btn_novo_contrato', tela: 'tela_pipeline', label: 'Novo Contrato', desc: 'Botão para criar contrato manual' },
  { key: 'btn_protocolo_batch', tela: 'tela_pipeline', label: 'Protocolo em Lote', desc: 'Imprimir protocolos selecionados' },
  { key: 'btn_separar', tela: 'tela_pipeline', label: 'Separar/Montagem', desc: 'Toggle separado e montagem inline' },

  // --- CONTRATO DETALHE (campos financeiros) ---
  { key: 'valor_plano', tela: 'tela_pipeline', label: 'Valor do Plano' },
  { key: 'desconto_plano', tela: 'tela_pipeline', label: 'Desconto do Plano' },
  { key: 'valor_acessorios', tela: 'tela_pipeline', label: 'Valor Acessórios' },
  { key: 'desconto_acessorios', tela: 'tela_pipeline', label: 'Desconto Acessórios' },
  { key: 'custo_cremacao', tela: 'tela_pipeline', label: 'Custo Cremação' },

  // --- CONTRATO DETALHE (campos tutor/pet) ---
  { key: 'tutor_cpf', tela: 'tela_pipeline', label: 'CPF do Tutor' },
  { key: 'tutor_telefone', tela: 'tela_pipeline', label: 'Telefone do Tutor' },
  { key: 'tutor_endereco', tela: 'tela_pipeline', label: 'Endereço do Tutor' },
  { key: 'pet_peso', tela: 'tela_pipeline', label: 'Peso do Pet' },
  { key: 'numero_lacre', tela: 'tela_pipeline', label: 'Número do Lacre' },

  // --- CONTRATO DETALHE (botões de ação) ---
  { key: 'btn_ativar', tela: 'tela_pipeline', label: 'Ativar', desc: 'Ativar contrato preventivo' },
  { key: 'btn_emitir_nfse', tela: 'tela_pipeline', label: 'Emitir NFS-e' },
  { key: 'btn_entrega', tela: 'tela_pipeline', label: 'Marcar Entregue' },
  { key: 'btn_chegamos', tela: 'tela_pipeline', label: 'Chegamos', desc: 'Mensagem de chegada na cremação' },
  { key: 'btn_chegaram', tela: 'tela_pipeline', label: 'Chegaram', desc: 'Mensagem de retorno das cinzas' },
  { key: 'btn_finalizadora', tela: 'tela_pipeline', label: 'Finalizadora', desc: 'Mensagem de finalização + avaliação' },
  { key: 'btn_pet_grato', tela: 'tela_pipeline', label: 'Pet Grato' },
  { key: 'btn_pelinho', tela: 'tela_pipeline', label: 'Pelinho' },
  { key: 'btn_certificado', tela: 'tela_pipeline', label: 'Certificado' },
  { key: 'btn_protocolo', tela: 'tela_pipeline', label: 'Protocolo' },
  { key: 'btn_urna', tela: 'tela_pipeline', label: 'Selecionar Urna' },
  { key: 'btn_rescaldo', tela: 'tela_pipeline', label: 'Rescaldo' },
  { key: 'btn_foto', tela: 'tela_pipeline', label: 'Foto' },
  { key: 'btn_mega_pagamento', tela: 'tela_pipeline', label: 'Mega Pagamento', desc: 'Editor de pagamentos em lote' },
  { key: 'btn_add_produto', tela: 'tela_pipeline', label: 'Adicionar Produto' },
  { key: 'btn_gerar_pdf', tela: 'tela_pipeline', label: 'Gerar PDF' },

  // --- FICHAS ---
  { key: 'btn_pdf_ficha', tela: 'tela_fichas', label: 'Gerar PDF', desc: 'Botão azul de gerar PDF do contrato no card da ficha', modo: 'toggle' },

  // --- SUPINDAS ---
  { key: 'btn_criar_supinda', tela: 'tela_entregas', label: 'Criar Supinda' },
  { key: 'btn_vincular', tela: 'tela_entregas', label: 'Vincular Contratos' },
  { key: 'btn_gerar_fichas', tela: 'tela_entregas', label: 'Gerar Fichas em Lote' },
  { key: 'btn_mudar_status', tela: 'tela_entregas', label: 'Mudar Status', desc: 'Planejada → Em andamento → Retornada' },

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
