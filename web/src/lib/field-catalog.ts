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
  { key: 'tela_agenda', label: 'Agenda', desc: 'Calendário de agendamentos de cremações com tutores' },
  { key: 'tela_clinicas', label: 'Clínicas', desc: 'Estabelecimentos parceiros: pets removidos, indicações e contatos' },
  { key: 'tela_tutores', label: 'Tutores', desc: 'Cadastro de tutores' },
  { key: 'tela_ads_shield', label: 'RIP Shield', desc: 'Detecção de fraude em cliques Google Ads' },
  { key: 'tela_dashboard', label: 'Dashboard (Admin)', desc: 'Painel interno do super_admin — uso/adoção dos usuários' },
  { key: 'tela_dashboards', label: 'Dashboards', desc: 'Estatísticas dos contratos para os usuários da unidade' },
  { key: 'tela_financeiro', label: 'Financeiro', desc: 'Módulo financeiro em 3 abas: Lançamentos, Repasse e DRE (migs 103–111). Conta contábil, opex/capex e as duas datas são derivados — não aparecem na tela. Vendido por unidade: hoje ST, SJ, CP, PI e Matriz (mig 112)' },
  { key: 'tela_tarefas', label: 'Tarefas', desc: 'Fila de trabalho do perfil Operacional (remoção, entrega, molde, carimbo, pelo extra) — módulo pago cb_operacional (migs 113-114). Perfil Operacional sempre vê (gate em código, não FLS); pra gerente/concierge, controla se a aba "Atribuir" aparece na sidebar.' },
  { key: 'nav_bottom', label: 'Barra inferior (mobile)', desc: 'Atalhos no rodapé em telas <768px: Fichas, Pipeline, Encaminhamentos, Estoque, Painéis. Oculto = barra some (sidebar/drawer continuam). Cada atalho ainda respeita a visibilidade da própria tela.' },
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

  // Pipeline — comportamentos opcionais por unidade
  { key: 'cb_cremacao_local', tela: 'tela_pipeline', label: 'Cremação Local (sem encaminhamento)', desc: 'Unidade co-localizada com o crematório (ex: PI). Contratos nascem direto em status=pinda; GC criado automático; auto-retorno quando GC vira disponível. Sem supinda. Ver FLOW.md §7.1.' },

  // Tarefas — módulo pago (não vendido de graça, decisão 18/08/2026)
  { key: 'cb_operacional', tela: 'tela_tarefas', label: 'Operacional/Motorista (pago)', desc: 'Libera promover funcionário a usuário Operacional (/admin/funcionarios), o campo Responsável da Tratativa mostrar Operacionais como opção, e a aba "Atribuir" da tela Tarefas. Sem o módulo, trava tudo — unidade continua 100% no fluxo manual de hoje.' },

  // Dashboards (usuários)
  { key: 'obj_dash_evolucao', tela: 'tela_dashboards', label: 'Evolução', desc: 'Série mensal de volume e receita — tendência ao longo do tempo' },
  { key: 'obj_dash_operacional', tela: 'tela_dashboards', label: 'Operacional', desc: 'Volume, fluxo, supindas, entregas, rescaldos' },
  { key: 'obj_dash_financeiro', tela: 'tela_dashboards', label: 'Financeiro', desc: 'Receita, custo cremação, ticket médio, pendentes, NFS-e' },
  { key: 'obj_dash_comercial', tela: 'tela_dashboards', label: 'Comercial / Indicadores', desc: 'Ranking clínicas, indicações, conversão de leads' },
  { key: 'obj_dash_marketing', tela: 'tela_dashboards', label: 'Marketing / Ads', desc: 'UTM, leads, conversão, RIP Shield, ROAS' },
  { key: 'obj_fin_lancamentos', tela: 'tela_financeiro', label: 'Lançamentos', desc: 'Aba de lançar despesa: categoria + valor + como pagou + comprovante' },
  { key: 'obj_fin_repasse', tela: 'tela_financeiro', label: 'Repasse', desc: 'Aba da "planilha do dia 20": os pets acolhidos no mês que a Matriz cobra da unidade' },
  { key: 'obj_fin_dre', tela: 'tela_financeiro', label: 'DRE', desc: 'Aba do resultado do mês: receita, custo, despesas e investimentos (mig 111)' },
  { key: 'obj_fin_contas', tela: 'tela_financeiro', label: 'Contas', desc: 'Aba de cadastro das contas de onde o dinheiro sai/entra (Inter, Granito, Dinheiro). Escopo por unidade' },
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
  { key: 'btn_ordenar_cep', tela: 'tela_pipeline', label: 'Ordenar por CEP (proximidade)', desc: 'Toggle 📏 CEP na barra de ordenação: ordena por |CEP do contrato − CEP da unidade| (mais perto primeiro). Exige unidades.cep preenchido (mig 102). Piloto Santos — hidden nas demais unidades via seed da mig 102.', modo: 'toggle' },
  { key: 'btn_bypass', tela: 'tela_pipeline', label: 'Bypass (B)', desc: 'Finalizar contrato pulando encaminhamento e GC. Temporário.', modo: 'toggle' },

  // --- PREVENTIVOS ---
  { key: 'btn_farol_pagamento', tela: 'tela_preventivos', label: 'Farol de Pagamento', desc: 'Indicador Pago/Parcial/A pagar no card de preventivo', modo: 'toggle' },

  // --- CONTRATO DETALHE (3-way: mesma key = mesmo toggle do pipeline) ---
  { key: 'btn_farois', tela: 'tela_contrato', label: 'Faróis Pipeline', desc: '3-way: Pipeline ↔ Contrato', modo: 'toggle' },
  { key: 'btn_mensagens', tela: 'tela_contrato', label: 'Mensagens Personalizadas', desc: '3-way: Pipeline ↔ Contrato', modo: 'toggle' },
  { key: 'btn_alteracao_fase', tela: 'tela_contrato', label: 'Botões Alteração Fase', desc: '3-way: Pipeline ↔ Contrato', modo: 'toggle' },
  { key: 'btn_fluxo_retorno', tela: 'tela_contrato', label: 'Fluxo Retorno', desc: '3-way: Pipeline ↔ Contrato. Complexidade + Protocolo', modo: 'toggle' },
  { key: 'btn_compartilhar', tela: 'tela_contrato', label: 'Compartilhar', desc: 'Botão 🔄 compartilhar remoção/entrega com outra unidade', modo: 'toggle' },
  { key: 'valor_plano', tela: 'tela_contrato', label: 'Valor do Plano', desc: 'Edição inline (lápis) do valor_plano no card Financeiro' },
  { key: 'pagamento_completo', tela: 'tela_contrato', label: 'Pagamento Completo', desc: 'Detalhes avançados no modal de pagamento: bandeira do cartão + nº de identificação da transação (maquininha). Oculto = modo Pagamento Simples (só método e valor).', modo: 'toggle' },
  { key: 'btn_emitir_nfse', tela: 'tela_contrato', label: 'Emitir NF', desc: 'Botão de emissão de NFS-e (GISS) no card Financeiro' },
  { key: 'btn_mega_pagamento', tela: 'tela_contrato', label: 'Novo Pagamento / Pagamento de Saldo', desc: 'Botões de lançamento de pagamento (novo ou quitar saldo) no card Financeiro' },
  { key: 'btn_recontratacao', tela: 'tela_contrato', label: 'Enviar Nova Contratação', desc: 'Gera link pré-preenchido pro tutor recontratar (novo pet). Premium — vendável por unidade.', modo: 'toggle' },
  { key: 'btn_alterar_dados_enviados', tela: 'tela_contrato', label: 'Alterar Dados Enviados (crítico)', desc: 'Botão crítico no Hero — abre modal de edição de dados que o tutor enviou (tutor/pet/serviço). Registra em histórico. Gate em código: só gerente/super_admin.', modo: 'toggle' },

  // --- TUTORES ---
  { key: 'btn_recontratacao', tela: 'tela_tutores', label: 'Enviar Nova Contratação', desc: 'Gera link pré-preenchido pro tutor recontratar (novo pet). Premium — vendável por unidade.', modo: 'toggle' },
  { key: 'btn_editar_tutor', tela: 'tela_tutores', label: 'Editar Tutor', desc: 'Botão "Editar" na página do tutor — abre modal de contato + endereço. Salva no cadastro e propaga o snapshot pros contratos não-finalizados do tutor.', modo: 'toggle' },

  // --- FICHAS ---
  { key: 'btn_pdf_ficha', tela: 'tela_fichas', label: 'Gerar PDF', desc: 'Botão azul de gerar PDF do contrato no card da ficha', modo: 'toggle' },
  { key: 'btn_iniciar_fluxo', tela: 'tela_fichas', label: 'Iniciar Fluxo', desc: 'Botão para gerar contrato a partir da ficha processada', modo: 'toggle' },
  { key: 'btn_disclaimer_zap', tela: 'tela_fichas', label: 'Disclaimer de Desistência (WhatsApp)', desc: 'Anexa o aviso de desistência (50% do plano) na mensagem enviada pelo botão verde de WhatsApp no card da ficha (EM). Oculto = manda sem o aviso. Sem efeito no botão "Copiar informações" (sempre com aviso) nem no PV (nunca tem).', modo: 'toggle' },
  { key: 'sel_valor_plano_arvore', tela: 'tela_fichas', label: 'Árvore de Valores Rápidos', desc: 'Na Tratativa, troca a grade fixa de 7 valores por um seletor plano → forma de pagamento (Pix/Dinheiro, 6x, 12x) → ajuste ±100, que preenche "Valor do Plano" (ainda editável na mão). Preços chumbados no código por enquanto — fase futura conecta em /admin/planos. Oculto = mantém a grade antiga.', modo: 'toggle' },

  // --- SUPINDAS (somente leitura — sem campos/botões) ---

  // --- ESTOQUE ---
  { key: 'preco_produto', tela: 'tela_estoque', label: 'Preço do Produto', desc: 'Edição de preço no detalhe' },

  // --- RIP SHIELD ---
  { key: 'btn_exportar_ips', tela: 'tela_ads_shield', label: 'Exportar IPs', desc: 'Gerar arquivo .txt para exclusão no Google Ads' },
  { key: 'btn_whitelist', tela: 'tela_ads_shield', label: 'Marcar como Seguro', desc: 'Adicionar IP à whitelist' },

  // --- FINANCEIRO ---
  // 'read' aqui = a unidade CONSULTA a própria cobrança, mas não mexe: deflator,
  // acertos, ajuste em lote, fechar e marcar pago somem. Cobrar é ato da Matriz.
  // Sem row = edit, então a Matriz não precisa de configuração nenhuma.
  { key: 'btn_contas_editar', tela: 'tela_financeiro', label: 'Editar contas', desc: 'Criar, renomear, desativar e excluir conta. Em leitura, a aba só lista' },
  { key: 'btn_repasse_editar', tela: 'tela_financeiro', label: 'Editar repasse', desc: 'Aplicar deflator, lançar acertos, fechar o repasse e marcar enviado/pago. Só a Matriz — as unidades ficam em leitura (mig 112)' },
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
