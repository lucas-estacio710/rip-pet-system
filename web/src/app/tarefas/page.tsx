'use client'

// ============================================================================
// /tarefas — fila de trabalho do perfil Operacional (mobile-first).
//
// 2 abas:
//  - "Minhas Tarefas" (todo mundo com módulo cb_operacional vê a própria fila,
//    inclusive gerente/concierge que se autoatribuem remoção — ver LayoutWrapper).
//  - "Atribuir" (só gerente/operador/super_admin) — pool de Entrega/Molde/Carimbo/
//    Pelo Extra pendentes na unidade, pra mandar pra um Operacional.
//
// Remoção NÃO passa por pool — nasce quando o campo Responsável da Tratativa resolve
// pra um usuário Operacional (ver TratativaModal.tsx). Aqui só CONCLUI: preenche lacre
// (obrigatório) + anotação, e isso dispara a criação do contrato sozinha
// (criarContratoDeFicha, responsavelEhOperacional=true).
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Truck, PackageCheck, PawPrint, Fingerprint, Scissors, Feather, MapPin, Navigation, FileDown, Check, Loader2, ClipboardList, UserPlus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { useToast } from '@/components/ui/Toast'
import { criarContratoDeFicha, ContratoValidationError } from '@/lib/criar-contrato-de-ficha'
import { gerarContratoPDF, contratoFilename } from '@/lib/contrato-pdf'
import { hojeLocal, inputLocalParaIso } from '@/lib/date-local'

type TarefaTipo = 'remocao' | 'entrega' | 'molde_patinha' | 'carimbo' | 'pelo_extra' | 'pelinho'

const TIPO_INFO: Record<TarefaTipo, { label: string; icon: typeof Truck; cor: string }> = {
  remocao: { label: 'Fazer Remoção', icon: Truck, cor: '#0ea5e9' },
  entrega: { label: 'Realizar Entrega', icon: PackageCheck, cor: '#22c55e' },
  molde_patinha: { label: 'Tirar Molde', icon: PawPrint, cor: '#a855f7' },
  carimbo: { label: 'Tirar Carimbo', icon: Fingerprint, cor: '#f59e0b' },
  pelo_extra: { label: 'Tirar Pelo Extra', icon: Scissors, cor: '#ec4899' },
  pelinho: { label: 'Tirar Pelinho', icon: Feather, cor: '#14b8a6' },
}

type TarefaRow = {
  id: string
  unidade_id: string
  tipo: TarefaTipo
  ficha_id: string | null
  contrato_id: string | null
  contrato_produto_id: string | null
  atribuido_a: string
  status: 'pendente' | 'concluida'
  lacre: string | null
  observacao_atribuicao: string | null
  atribuido_em: string
}

type FichaRemocao = {
  id: string
  nome_completo: string
  cpf: string
  telefone: string
  email: string | null
  cep: string
  estado: string
  cidade: string
  bairro: string
  endereco: string
  numero: string
  complemento: string | null
  outros_tutores: string[] | null
  nome_pet: string
  idade: string | null
  especie: string
  genero: string
  raca: string | null
  cor: string
  peso: string | null
  cremacao: string
  como_conheceu: string[] | null
  outro_especificar: string | null
  observacoes: string | null
  localizacao: string
  localizacao_outra: string | null
  unidade_id: string
  contrato_id: string | null
  processada: boolean | null
  op_dados: Record<string, unknown> | null
}

type ContratoResumo = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  tutor_nome: string
  tutor_telefone: string | null
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  status: string
  numero_lacre: string | null
  unidade_id: string
}

type ContratoProdutoResumo = {
  id: string
  contrato_id: string
  rescaldo_feito: boolean
  produto: { nome: string; rescaldo_tipo: string | null } | null
  contrato: ContratoResumo | null
}

// Mesmas siglas + cores do pipeline mobile (STATUS_FLOW/STATUS_COLORS de /contratos) — selo de
// status ao lado do nome do pet, pro Operacional reconhecer de cara sem precisar ler o status por extenso.
const STATUS_BADGE: Record<string, { short: string; cor: string }> = {
  preventivo: { short: 'PRV', cor: '#f59e0b' },
  ativo: { short: 'ATV', cor: '#ef4444' },
  pinda: { short: 'PIN', cor: '#f97316' },
  retorno: { short: 'ENT', cor: '#06b6d4' },
  pendente: { short: 'PEN', cor: '#a855f7' },
  finalizado: { short: 'FIN', cor: '#94a3b8' },
}

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status]
  if (!info) return null
  return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: info.cor + '22', color: info.cor }}>
      {info.short}
    </span>
  )
}

// Ordem fixa de exibição dos tipos em qualquer agrupamento (pool, em andamento, concluídas).
const ORDEM_TIPOS: TarefaTipo[] = ['entrega', 'remocao', 'molde_patinha', 'carimbo', 'pelo_extra', 'pelinho']

function agruparPorTipo<T extends { tipo: TarefaTipo }>(itens: T[]): Partial<Record<TarefaTipo, T[]>> {
  const acc: Partial<Record<TarefaTipo, T[]>> = {}
  for (const t of itens) {
    if (!acc[t.tipo]) acc[t.tipo] = []
    acc[t.tipo]!.push(t)
  }
  return acc
}

// Bloco dobrável de ETAPA (Pra atribuir / Em andamento / Concluídas) — cabeçalho com contador,
// clique dá toggle. Mesmo padrão chevron+useState já usado em outras telas do projeto
// (não existe um <Accordion> compartilhado).
function EtapaSection({ titulo, emoji, total, aberto, onToggle, children }: {
  titulo: string
  emoji: string
  total: number
  aberto: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--surface-50)]">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--surface-700)]">
          <span>{emoji}</span>{titulo}
          <span className="text-xs font-semibold text-[var(--surface-400)]">({total})</span>
        </span>
        {aberto ? <ChevronUp className="h-4 w-4 text-[var(--surface-400)]" /> : <ChevronDown className="h-4 w-4 text-[var(--surface-400)]" />}
      </button>
      {aberto && <div className="p-3 space-y-3">{children}</div>}
    </div>
  )
}

// Sub-grupo por TIPO de tarefa dentro de uma etapa — só renderiza se tiver item (elimina o
// "(0) Nenhum pendente" que antes aparecia sempre pros 4 tipos do pool).
function TipoGroup({ tipo, count, children }: { tipo: TarefaTipo; count: number; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(true)
  if (count === 0) return null
  const info = TIPO_INFO[tipo]
  const Icon = info.icon
  return (
    <div>
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
        <h4 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: info.cor }}>{info.label}</h4>
        <span className="text-[10px] text-[var(--surface-400)]">({count})</span>
        {aberto ? <ChevronUp className="h-3 w-3 text-[var(--surface-400)] ml-auto" /> : <ChevronDown className="h-3 w-3 text-[var(--surface-400)] ml-auto" />}
      </button>
      {aberto && <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

// Cartão de identificação único — mesma ordem de informação (tipo, selo+lacre+pet, tutor, linha
// extra opcional) em qualquer lugar da página: pool, em andamento, concluídas, minhas tarefas.
// `onClick` = cartão inteiro é o botão (uso em "Minhas Tarefas"); sem `onClick` = linha estática
// com `acao` (botão Atribuir/Reatribuir/Desfazer) à direita.
function TarefaCard({ tipo, statusBadge, lacre, petNome, tutorNome, quantidade, linhaExtra, acao, onClick }: {
  tipo: TarefaTipo
  statusBadge?: string
  lacre?: string | null
  petNome: string
  tutorNome: string
  quantidade?: number
  linhaExtra?: React.ReactNode
  acao?: React.ReactNode
  onClick?: () => void
}) {
  const info = TIPO_INFO[tipo]
  const Icon = info.icon
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide" style={{ color: info.cor }}>
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
          {info.label}
        </p>
        <p className="text-sm font-semibold text-[var(--surface-800)] truncate flex items-center gap-1.5">
          {statusBadge && <StatusBadge status={statusBadge} />}
          {lacre ? `${lacre} — ${petNome}` : petNome}
          {!!quantidade && quantidade > 1 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ background: info.cor }}>×{quantidade}</span>
          )}
        </p>
        <p className="text-xs text-[var(--surface-500)] truncate">{tutorNome}</p>
        {linhaExtra}
      </div>
      {acao}
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl border-2 shadow-sm hover:shadow-md transition-all text-left" style={{ borderColor: info.cor + '55', background: info.cor + '0d' }}>
        {conteudo}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--surface-200)]">
      {conteudo}
    </div>
  )
}

// Item de um pool (Pra atribuir) — cartão de identificação + botão Atribuir, que abre um
// formulário inline (quem vai fazer + pedido específico) embaixo do próprio cartão.
// Exemplo de "pedido específico" por tipo — entrega é sobre onde/quando entregar, os demais
// são sobre o rescaldo em si. Ajuda quem atribui a entender o que cabe nesse campo.
const PLACEHOLDER_PEDIDO: Record<TarefaTipo, string> = {
  entrega: 'Pedido específico (ex: Tutor pediu pra entregar na Rua das Palmeiras, 245 em vez do endereço cadastrado)...',
  remocao: 'Pedido específico...',
  molde_patinha: 'Pedido específico (ex: molde da patinha esquerda)...',
  carimbo: 'Pedido específico (ex: carimbo da patinha direita)...',
  pelo_extra: 'Pedido específico (ex: pelinho do pescoço)...',
  pelinho: 'Pedido específico (ex: 2 vidrinhos de pelinho)...',
}

// Item do pool já agrupado por (tipo, contrato) — itemIds carrega os `contrato_produto_id`
// (ou o `contrato.id` pra entrega) do grupo inteiro; quantidade > 1 vira o badge "×N" no card.
type PoolItemData = { key: string; itemIds: string[]; quantidade: number; petNome: string; tutorNome: string; status: string; lacre: string | null; enderecoResumo?: string }

// Tarefa com pet/tutor/contrato resolvidos (compartilhado entre "Minhas Tarefas", "Em
// andamento" e "Concluídas recentemente" — ver resolverPetTutor).
type TarefaEnriquecida = TarefaRow & {
  petNome: string
  tutorNome: string
  contratoIdResolvido: string | null
  statusContrato?: string
  lacreContrato?: string | null
}
// Grupo de (tipo, contrato) — agrega N linhas físicas de `tarefas_operacionais` que nascem
// de N linhas físicas de `contrato_produtos` (1 linha = 1 item, convenção do projeto) num só
// card "×N". `ids` = tarefas_operacionais.id[] (pra UPDATE/reatribuir/desfazer em lote);
// `contratoProdutoIds` = contrato_produtos.id[] (pra marcar rescaldo_feito em lote). Entrega e
// remoção nunca agrupam de verdade (sempre 1 por contrato/ficha) — mas usam o mesmo tipo pra
// não duplicar toda a lógica de render/conclusão em dois caminhos.
type TarefaGrupo = TarefaEnriquecida & { ids: string[]; contratoProdutoIds: string[]; quantidade: number }

// Agrupa por (tipo, contrato, atribuído, status) — remoção/entrega usam a própria linha como
// chave (nunca agrupam de verdade); os 4 tipos de rescaldo agrupam por contrato, já que N
// linhas de `contrato_produtos` do mesmo tipo pro mesmo contrato viram 1 card "×N". Função pura
// (sem closure sobre estado do componente) — fica em module scope de propósito, pra não disparar
// react-hooks/exhaustive-deps nos `useCallback` que a chamam.
function agruparTarefas(tarefas: TarefaEnriquecida[]): TarefaGrupo[] {
  const grupos: Record<string, TarefaGrupo> = {}
  for (const t of tarefas) {
    const chave = t.tipo === 'remocao' || t.tipo === 'entrega'
      ? `${t.tipo}:${t.id}`
      : `${t.tipo}:${t.contratoIdResolvido}:${t.atribuido_a}:${t.status}`
    const existente = grupos[chave]
    if (!existente) {
      grupos[chave] = { ...t, ids: [t.id], contratoProdutoIds: t.contrato_produto_id ? [t.contrato_produto_id] : [], quantidade: 1 }
    } else {
      existente.ids.push(t.id)
      if (t.contrato_produto_id) existente.contratoProdutoIds.push(t.contrato_produto_id)
      existente.quantidade++
      if (new Date(t.atribuido_em) < new Date(existente.atribuido_em)) existente.atribuido_em = t.atribuido_em
    }
  }
  return Object.values(grupos)
}

function PoolItem({ tipo, item, operacionais, cargaPorPessoa, atribuindoId, setAtribuindoId, operacionalEscolhido, setOperacionalEscolhido, observacaoTexto, setObservacaoTexto, salvando, onAtribuir }: {
  tipo: TarefaTipo
  item: PoolItemData
  operacionais: { user_id: string; nome: string | null; role: string }[]
  cargaPorPessoa: Record<string, number>
  atribuindoId: string | null
  setAtribuindoId: (id: string | null) => void
  operacionalEscolhido: Record<string, string>
  setOperacionalEscolhido: (fn: (prev: Record<string, string>) => Record<string, string>) => void
  observacaoTexto: Record<string, string>
  setObservacaoTexto: (fn: (prev: Record<string, string>) => Record<string, string>) => void
  salvando: boolean
  onAtribuir: (item: PoolItemData) => void
}) {
  const cor = TIPO_INFO[tipo].cor
  return (
    <div>
      <TarefaCard
        tipo={tipo}
        statusBadge={item.status}
        lacre={item.lacre}
        petNome={item.petNome}
        tutorNome={item.tutorNome}
        quantidade={item.quantidade}
        linhaExtra={item.enderecoResumo ? <p className="text-xs text-[var(--surface-500)] line-clamp-2 mt-0.5">📍 {item.enderecoResumo}</p> : undefined}
        acao={
          <button
            onClick={() => setAtribuindoId(atribuindoId === item.key ? null : item.key)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
            style={{ background: cor }}
          >
            <UserPlus className="h-3.5 w-3.5" />Atribuir
          </button>
        }
      />
      {atribuindoId === item.key && (
        <div className="mt-1.5 ml-1 space-y-1.5">
          <select
            value={operacionalEscolhido[item.key] || ''}
            onChange={e => setOperacionalEscolhido(prev => ({ ...prev, [item.key]: e.target.value }))}
            className="input text-sm w-full"
          >
            <option value="">Escolher quem vai fazer...</option>
            {operacionais.map(o => (
              <option key={o.user_id} value={o.user_id}>
                {o.nome || 'Sem nome'} ({o.role === 'operacional' ? 'Operacional' : o.role === 'gerente' ? 'Gerente' : o.role === 'super_admin' ? 'Admin' : 'Concierge'}) — {cargaPorPessoa[o.user_id] || 0} pendente{(cargaPorPessoa[o.user_id] || 0) === 1 ? '' : 's'}
              </option>
            ))}
          </select>
          <textarea
            value={observacaoTexto[item.key] || ''}
            onChange={e => setObservacaoTexto(prev => ({ ...prev, [item.key]: e.target.value }))}
            rows={2}
            placeholder={PLACEHOLDER_PEDIDO[tipo]}
            className="input text-sm w-full resize-none"
          />
          <button
            onClick={() => onAtribuir(item)}
            disabled={salvando || !operacionalEscolhido[item.key]}
            className="w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: cor }}
          >
            Atribuir
          </button>
        </div>
      )}
    </div>
  )
}

// Seletor "Agora" (preenche sozinho, na hora de concluir) vs "Outra" (Operacional escolhe —
// registrando depois do fato, ex: só lembrou de mexer no celular horas depois).
function AgoraOutraToggle({ modo, setModo }: { modo: 'agora' | 'outra'; setModo: (m: 'agora' | 'outra') => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--surface-200)] overflow-hidden text-xs font-semibold">
      <button type="button" onClick={() => setModo('agora')} className={`flex-1 py-1.5 transition-colors ${modo === 'agora' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
        Agora
      </button>
      <button type="button" onClick={() => setModo('outra')} className={`flex-1 py-1.5 transition-colors ${modo === 'outra' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
        Outra
      </button>
    </div>
  )
}

export default function TarefasPage() {
  const supabase = createClient()
  const { currentUnit, currentRole, isSuperAdmin, userName, allUnidades, impersonating, impersonatedUserId } = useUnit()
  const { toast } = useToast()

  const podeAtribuir = isSuperAdmin || currentRole === 'gerente' || currentRole === 'operador'
  const temModulo = !!currentUnit?.modulos_ativos?.includes('cb_operacional')

  const [aba, setAba] = useState<'minhas' | 'atribuir'>('minhas')
  // auth.uid() real (super_admin, se estiver impersonando) — impersonar não troca sessão de
  // verdade, então "Minhas Tarefas" precisa do id de quem está sendo impersonado, não do
  // logado. Achado em produção (25/08/2026): impersonar a Kélvia mostrava a fila vazia mesmo
  // com 2 tarefas atribuídas a ela de verdade.
  const [realUserId, setRealUserId] = useState<string | null>(null)
  const userId = impersonating && impersonatedUserId ? impersonatedUserId : realUserId
  // Etapas dobráveis da aba Atribuir — "Concluídas" começa fechada (é só auditoria/desfazer).
  const [etapaAberta, setEtapaAberta] = useState({ pra_atribuir: true, andamento: true, concluidas: false })
  const toggleEtapa = (k: keyof typeof etapaAberta) => setEtapaAberta(prev => ({ ...prev, [k]: !prev[k] }))

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setRealUserId(data.user?.id || null))
  }, [supabase])

  // ── Minhas Tarefas ──────────────────────────────────────────────────────
  const [minhasTarefas, setMinhasTarefas] = useState<TarefaGrupo[]>([])
  const [fichasPorId, setFichasPorId] = useState<Record<string, FichaRemocao>>({})
  const [contratosPorId, setContratosPorId] = useState<Record<string, ContratoResumo>>({})
  const [produtosPorId, setProdutosPorId] = useState<Record<string, ContratoProdutoResumo>>({})
  const [loadingMinhas, setLoadingMinhas] = useState(true)
  const [tarefaAberta, setTarefaAberta] = useState<TarefaGrupo | null>(null)

  // ── Resolve pet/tutor/contrato de um lote de tarefas_operacionais (compartilhado entre
  // "Minhas Tarefas", "Em andamento" e "Concluídas recentemente") ─────────────────────
  const resolverPetTutor = useCallback(async (tarefas: TarefaRow[]): Promise<TarefaEnriquecida[]> => {
    const contratoIds = tarefas.filter(t => t.contrato_id).map(t => t.contrato_id!) as string[]
    const produtoIds = tarefas.filter(t => t.contrato_produto_id).map(t => t.contrato_produto_id!) as string[]
    const fichaIds = tarefas.filter(t => t.ficha_id).map(t => t.ficha_id!) as string[]

    const [{ data: contratos }, { data: produtos }, { data: fichas }] = await Promise.all([
      contratoIds.length > 0 ? supabase.from('contratos').select('id, pet_nome, tutor_nome, status, numero_lacre').in('id', contratoIds) : Promise.resolve({ data: [] }),
      produtoIds.length > 0 ? supabase.from('contrato_produtos').select('id, contrato_id, contrato:contratos(pet_nome, tutor_nome, status, numero_lacre)').in('id', produtoIds) : Promise.resolve({ data: [] }),
      fichaIds.length > 0 ? supabase.from('fichas').select('id, nome_pet, nome_completo').in('id', fichaIds) : Promise.resolve({ data: [] }),
    ])
    const contratoMap: Record<string, { pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null }> = {}
    for (const c of (contratos || []) as { id: string; pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null }[]) contratoMap[c.id] = c
    const produtoMap: Record<string, { contrato_id: string; contrato: { pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null } | null }> = {}
    for (const p of (produtos || []) as unknown as { id: string; contrato_id: string; contrato: { pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null } | null }[]) produtoMap[p.id] = p
    const fichaMap: Record<string, { nome_pet: string; nome_completo: string }> = {}
    for (const f of (fichas || []) as { id: string; nome_pet: string; nome_completo: string }[]) fichaMap[f.id] = f

    return tarefas.map(t => {
      const c = t.contrato_id ? contratoMap[t.contrato_id] : null
      const p = t.contrato_produto_id ? produtoMap[t.contrato_produto_id] : null
      const f = t.ficha_id ? fichaMap[t.ficha_id] : null
      return {
        ...t,
        petNome: c?.pet_nome || p?.contrato?.pet_nome || f?.nome_pet || '—',
        tutorNome: c?.tutor_nome || p?.contrato?.tutor_nome || f?.nome_completo || '—',
        contratoIdResolvido: t.contrato_id || p?.contrato_id || null,
        statusContrato: c?.status || p?.contrato?.status,
        lacreContrato: c?.numero_lacre || p?.contrato?.numero_lacre,
      }
    })
  }, [supabase])

  const carregarMinhas = useCallback(async () => {
    if (!userId) return
    setLoadingMinhas(true)
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em')
      .eq('atribuido_a', userId)
      .eq('status', 'pendente')
      .order('atribuido_em', { ascending: true })

    const tarefas = (data || []) as TarefaRow[]
    setMinhasTarefas(agruparTarefas(await resolverPetTutor(tarefas)))

    const fichaIds = tarefas.filter(t => t.tipo === 'remocao' && t.ficha_id).map(t => t.ficha_id!) as string[]
    const contratoIds = tarefas.filter(t => t.tipo === 'entrega' && t.contrato_id).map(t => t.contrato_id!) as string[]
    const produtoIds = tarefas.filter(t => t.contrato_produto_id).map(t => t.contrato_produto_id!) as string[]

    if (fichaIds.length > 0) {
      const { data: fichas } = await supabase
        .from('fichas')
        .select('id, nome_completo, cpf, telefone, email, cep, estado, cidade, bairro, endereco, numero, complemento, outros_tutores, nome_pet, idade, especie, genero, raca, cor, peso, cremacao, como_conheceu, outro_especificar, observacoes, localizacao, localizacao_outra, unidade_id, contrato_id, processada, op_dados')
        .in('id', fichaIds)
      const map: Record<string, FichaRemocao> = {}
      for (const f of (fichas || []) as FichaRemocao[]) map[f.id] = f
      setFichasPorId(map)
    }
    if (contratoIds.length > 0) {
      const { data: contratos } = await supabase
        .from('contratos')
        .select('id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, tutor_nome, tutor_telefone, tutor_endereco, tutor_bairro, tutor_cidade, status, numero_lacre, unidade_id')
        .in('id', contratoIds)
      const map: Record<string, ContratoResumo> = {}
      for (const c of (contratos || []) as ContratoResumo[]) map[c.id] = c
      setContratosPorId(map)
    }
    if (produtoIds.length > 0) {
      const { data: produtos } = await supabase
        .from('contrato_produtos')
        .select('id, contrato_id, rescaldo_feito, produto:produtos(nome, rescaldo_tipo), contrato:contratos(id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, tutor_nome, tutor_telefone, tutor_endereco, tutor_bairro, tutor_cidade, unidade_id, status, numero_lacre)')
        .in('id', produtoIds)
      const map: Record<string, ContratoProdutoResumo> = {}
      for (const p of (produtos || []) as unknown as ContratoProdutoResumo[]) map[p.id] = p
      setProdutosPorId(map)
    }
    setLoadingMinhas(false)
  }, [supabase, userId, resolverPetTutor])

  useEffect(() => { if (aba === 'minhas') carregarMinhas() }, [aba, carregarMinhas])

  // ── Concluir tarefa simples (entrega/molde/carimbo/pelo_extra) ──────────
  const [concluindoSimples, setConcluindoSimples] = useState(false)
  const [anotacaoSimples, setAnotacaoSimples] = useState('')
  const [leuObservacao, setLeuObservacao] = useState(false)
  // Data de entrega: "agora" (hoje) ou "outra" (registrando depois) — só entrega usa (é `date`, sem hora).
  const [modoDataEntrega, setModoDataEntrega] = useState<'agora' | 'outra'>('agora')
  const [dataEntregaManual, setDataEntregaManual] = useState('')

  async function concluirTarefaSimples(tarefa: TarefaGrupo) {
    if (tarefa.tipo === 'entrega' && modoDataEntrega === 'outra' && !dataEntregaManual) {
      toast('Informe a data da entrega', 'error')
      return
    }
    setConcluindoSimples(true)
    try {
      let contratoId = tarefa.contrato_id
      if (tarefa.tipo === 'entrega' && tarefa.contrato_id) {
        const dataEntregaFinal = modoDataEntrega === 'agora' ? hojeLocal() : dataEntregaManual
        const { error } = await supabase.from('contratos').update({
          status: 'finalizado',
          data_entrega: dataEntregaFinal,
        } as never).eq('id', tarefa.contrato_id)
        if (error) throw new Error(error.message)
      } else if (tarefa.contratoProdutoIds.length > 0) {
        const { error } = await supabase.from('contrato_produtos').update({ rescaldo_feito: true } as never).in('id', tarefa.contratoProdutoIds)
        if (error) throw new Error(error.message)
        contratoId = tarefa.contratoIdResolvido
      }

      const rotulo = tarefa.quantidade > 1 ? `${TIPO_INFO[tarefa.tipo].label} (×${tarefa.quantidade})` : TIPO_INFO[tarefa.tipo].label

      if (contratoId) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        const partes = [`${rotulo} concluído por ${userName || 'Operacional'}.`]
        if (tarefa.tipo === 'entrega' && modoDataEntrega === 'outra') partes.push(`Data de entrega registrada retroativa: ${new Date(dataEntregaManual + 'T00:00:00').toLocaleDateString('pt-BR')}.`)
        if (tarefa.observacao_atribuicao) partes.push(`Pedido específico confirmado: "${tarefa.observacao_atribuicao}".`)
        if (anotacaoSimples.trim()) partes.push(`Nota: ${anotacaoSimples.trim()}`)
        await supabase.from('tarefas').insert({
          contrato_id: contratoId,
          descricao: partes.join(' '),
          tipo_id: tipoTarefa?.id || null,
          importante: true,
          criado_por: userName || 'Operacional',
        } as never)
      }

      await supabase.from('tarefas_operacionais').update({
        status: 'concluida',
        concluido_em: new Date().toISOString(),
        anotacao_conclusao: anotacaoSimples.trim() || null,
      } as never).in('id', tarefa.ids)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'conclusao',
        campo_label: 'Tarefa concluída',
        valor_novo: `${rotulo} concluída por ${userName || 'Operacional'}`,
        tipo: 'conclusao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: anotacaoSimples.trim() || null,
      } as never)

      toast('Tarefa concluída!', 'success')
      setTarefaAberta(null)
      setAnotacaoSimples('')
      setLeuObservacao(false)
      setModoDataEntrega('agora')
      setDataEntregaManual('')
      await carregarMinhas()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao concluir', 'error')
    } finally {
      setConcluindoSimples(false)
    }
  }

  // ── Concluir tarefa de remoção (dispara criação do contrato) ────────────
  const [lacreRemocao, setLacreRemocao] = useState('')
  const [anotacaoRemocao, setAnotacaoRemocao] = useState('')
  const [concluindoRemocao, setConcluindoRemocao] = useState(false)
  const [erroRemocao, setErroRemocao] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  // Data/hora do acolhimento: "agora" ou "outra" (datetime-local — precisa de hora, é timestamptz).
  const [modoDataRemocao, setModoDataRemocao] = useState<'agora' | 'outra'>('agora')
  const [dataHoraRemocaoManual, setDataHoraRemocaoManual] = useState('')

  function unidadeDaFicha(ficha: FichaRemocao) {
    return allUnidades.find(u => u.id === ficha.unidade_id)
  }

  async function gerarPdfDaFicha(ficha: FichaRemocao) {
    setGerandoPdf(true)
    try {
      const op = (ficha.op_dados || {}) as Record<string, unknown>
      const unidade = unidadeDaFicha(ficha)
      const nomeUnidade = unidade ? `${unidade.cidade} - ${unidade.estado}` : 'Santos - SP'
      const temPadronizacaoClinicas = !!unidade?.modulos_ativos?.includes('cb_padronizacao_clinicas')
      const opLocalColeta = op.localColeta as string | null
      const localPdf = op.semLocal ? '' : opLocalColeta === 'clinica' ? ((temPadronizacaoClinicas ? (op.estabNome as string) : (op.clinicaTextoLivre as string)) || ficha.localizacao)
        : opLocalColeta === 'outro' ? ((op.enderecoOutro as string) || ficha.localizacao_outra || '')
        : opLocalColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
        : opLocalColeta === 'unidade' ? 'Unidade RIP PET'
        : ficha.localizacao

      const blob = await gerarContratoPDF({
        codigo: String(op.codigo || ''),
        lacre: lacreRemocao.trim() || null,
        tutorNome: ficha.nome_completo || '',
        tutorTelefone: ficha.telefone || '',
        tutorCpf: ficha.cpf || '',
        tutorEmail: ficha.email,
        tutorEndereco: ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}` : null,
        tutorEstado: ficha.estado,
        tutorCidade: ficha.cidade,
        tutorBairro: ficha.bairro,
        tutorCep: ficha.cep,
        petNome: ficha.nome_pet || '',
        petEspecie: ficha.especie,
        petRaca: ficha.raca,
        petIdade: ficha.idade ? parseInt(ficha.idade) || null : null,
        petCor: ficha.cor,
        petGenero: ficha.genero,
        petPeso: ficha.peso ? parseFloat(ficha.peso) || null : null,
        localColeta: localPdf,
        tipoCremacao: ficha.cremacao?.toLowerCase() as 'individual' | 'coletiva',
        valorPlano: (() => {
          const vp = op.valorPlano ? parseFloat(String(op.valorPlano)) : null
          if (!vp) return null
          const dp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
          const dt = (op.descontoTipo as string) || 'valor'
          const dr = dt === 'percentual' ? (vp * dp) / 100 : dp
          return Math.max(vp - dr, 0)
        })(),
        metodoPagamento: null,
        parcelas: null,
        velorioDeseja: null,
        acompanhamentoOnline: false,
        acompanhamentoPresencial: false,
        dataAcolhimento: op.semDataHora ? null : (op.dataHoraAcolhimento as string) || null,
        tipoPlano: 'emergencial',
        dataContrato: (op.dataContrato as string) || null,
        descricaoContrato: (op.detalhamentoPlano as string) || null,
      }, nomeUnidade)

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = contratoFilename(String(op.codigo || 'CONTRATO'), ficha.nome_pet || 'PET')
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      toast('Erro ao gerar PDF', 'error')
    } finally {
      setGerandoPdf(false)
    }
  }

  async function concluirRemocao(tarefa: TarefaGrupo, ficha: FichaRemocao) {
    if (!lacreRemocao.trim()) { setErroRemocao('Informe o lacre'); return }
    if (modoDataRemocao === 'outra' && !dataHoraRemocaoManual) { setErroRemocao('Informe a data/hora da remoção'); return }
    setConcluindoRemocao(true)
    setErroRemocao(null)
    try {
      const dataHoraFinal = modoDataRemocao === 'agora' ? new Date().toISOString() : inputLocalParaIso(dataHoraRemocaoManual)
      const opAtual = (ficha.op_dados || {}) as Record<string, unknown>
      const opAtualizado = {
        ...opAtual,
        lacre: lacreRemocao.trim(),
        semLacre: false,
        dataHoraAcolhimento: dataHoraFinal,
        semDataHora: false,
      }
      const { error: errUpdate } = await supabase.from('fichas').update({ op_dados: opAtualizado } as never).eq('id', ficha.id)
      if (errUpdate) throw new Error(errUpdate.message)

      const unidade = unidadeDaFicha(ficha)
      const { contratoId } = await criarContratoDeFicha(
        supabase,
        { ...ficha, op_dados: opAtualizado },
        {
          codigo: unidade?.codigo || '',
          endereco: unidade?.endereco || null,
          cidade: unidade?.cidade || null,
          modulos_ativos: unidade?.modulos_ativos || [],
        },
        userName || 'Operacional',
        true // responsavelEhOperacional — lacre já validado acima, obrigatório sem escape
      )

      {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        const partes = [`Remoção concluída por ${userName || 'Operacional'} — lacre ${lacreRemocao.trim()}.`]
        if (modoDataRemocao === 'outra') partes.push(`Data/hora do acolhimento registrada retroativa: ${new Date(dataHoraFinal!).toLocaleString('pt-BR')}.`)
        if (tarefa.observacao_atribuicao) partes.push(`Pedido específico confirmado: "${tarefa.observacao_atribuicao}".`)
        if (anotacaoRemocao.trim()) partes.push(`Nota: ${anotacaoRemocao.trim()}`)
        await supabase.from('tarefas').insert({
          contrato_id: contratoId,
          descricao: partes.join(' '),
          tipo_id: tipoTarefa?.id || null,
          importante: true,
          criado_por: userName || 'Operacional',
        } as never)
      }

      await supabase.from('tarefas_operacionais').update({
        status: 'concluida',
        concluido_em: new Date().toISOString(),
        lacre: lacreRemocao.trim(),
        anotacao_conclusao: anotacaoRemocao.trim() || null,
      } as never).eq('id', tarefa.id)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: ficha.nome_pet || '—',
        campo: 'conclusao',
        campo_label: 'Remoção concluída',
        valor_novo: `Remoção concluída por ${userName || 'Operacional'} — lacre ${lacreRemocao.trim()} — contrato criado`,
        tipo: 'conclusao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: anotacaoRemocao.trim() || null,
      } as never)

      toast('Remoção confirmada — contrato criado!', 'success')
      setTarefaAberta(null)
      setLacreRemocao('')
      setAnotacaoRemocao('')
      setModoDataRemocao('agora')
      setDataHoraRemocaoManual('')
      await carregarMinhas()
    } catch (err) {
      const msg = err instanceof ContratoValidationError ? err.message : (err instanceof Error ? err.message : 'Erro desconhecido')
      setErroRemocao(msg)
      toast(msg, 'error')
    } finally {
      setConcluindoRemocao(false)
    }
  }

  // ── Aba Atribuir (pool) ──────────────────────────────────────────────────
  const [poolEntrega, setPoolEntrega] = useState<ContratoResumo[]>([])
  const [poolRescaldo, setPoolRescaldo] = useState<ContratoProdutoResumo[]>([])
  const [operacionais, setOperacionais] = useState<{ user_id: string; nome: string | null; role: string }[]>([])
  const [loadingPool, setLoadingPool] = useState(false)
  const [atribuindoId, setAtribuindoId] = useState<string | null>(null)
  const [operacionalEscolhido, setOperacionalEscolhido] = useState<Record<string, string>>({})
  const [observacaoAtribuicao, setObservacaoAtribuicao] = useState<Record<string, string>>({})
  const [salvandoAtribuicao, setSalvandoAtribuicao] = useState(false)

  // ── Em andamento (já atribuídas, ainda pendentes) — visibilidade de carga + reatribuir ──
  const [emAndamento, setEmAndamento] = useState<TarefaGrupo[]>([])
  const [loadingEmAndamento, setLoadingEmAndamento] = useState(false)
  const [reatribuindoId, setReatribuindoId] = useState<string | null>(null)
  const [novoOperacional, setNovoOperacional] = useState<Record<string, string>>({})
  const [salvandoReatribuicao, setSalvandoReatribuicao] = useState(false)

  const carregarEmAndamento = useCallback(async () => {
    if (!currentUnit || !podeAtribuir) return
    setLoadingEmAndamento(true)
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'pendente')
      .order('atribuido_em', { ascending: true }) as { data: TarefaRow[] | null }

    setEmAndamento(agruparTarefas(await resolverPetTutor(data || [])))
    setLoadingEmAndamento(false)
  }, [supabase, currentUnit, podeAtribuir, resolverPetTutor])

  // Carga atual por pessoa (soma de itens físicos pendentes, não de cards agrupados) — pra não
  // empilhar tudo num só.
  const cargaPorPessoa = emAndamento.reduce((acc, t) => {
    acc[t.atribuido_a] = (acc[t.atribuido_a] || 0) + t.quantidade
    return acc
  }, {} as Record<string, number>)

  async function notificarAtribuicao(userId: string, tipoLabel: string, petNome: string, quantidade?: number) {
    try {
      const label = quantidade && quantidade > 1 ? `${tipoLabel} (×${quantidade})` : tipoLabel
      await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: '📋 Nova tarefa pra você', body: `${label} — ${petNome}`, url: '/tarefas' }),
      })
    } catch { /* push é best-effort — não trava o fluxo se falhar */ }
  }

  async function reatribuir(tarefa: TarefaGrupo) {
    const novoId = novoOperacional[tarefa.id]
    if (!novoId || novoId === tarefa.atribuido_a) return
    setSalvandoReatribuicao(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const nomeAntigo = operacionais.find(o => o.user_id === tarefa.atribuido_a)?.nome || 'alguém'
      const nomeNovoBase = operacionais.find(o => o.user_id === novoId)?.nome || 'alguém'
      const nomeNovo = tarefa.quantidade > 1 ? `${nomeNovoBase} (×${tarefa.quantidade})` : nomeNovoBase

      const { error } = await supabase.from('tarefas_operacionais').update({
        atribuido_a: novoId,
        atribuido_por: user?.id || null,
        atribuido_em: new Date().toISOString(),
      } as never).in('id', tarefa.ids)
      if (error) throw new Error(error.message)

      // Remoção: mantém o "Responsável" da ficha (op_dados) em sincronia com quem
      // realmente vai fazer o trabalho — senão a Tratativa mostra um nome errado.
      // Direto por user_id (contratos.responsavel_user_id, mig 123) — não passa mais por
      // funcionarios pra isso.
      if (tarefa.tipo === 'remocao' && tarefa.ficha_id) {
        const { data: fichaAtual } = await supabase.from('fichas').select('op_dados').eq('id', tarefa.ficha_id).maybeSingle() as { data: { op_dados: Record<string, unknown> | null } | null }
        await supabase.from('fichas').update({
          op_dados: { ...(fichaAtual?.op_dados || {}), responsavelUserId: novoId, funcionarioId: null },
        } as never).eq('id', tarefa.ficha_id)
      }

      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'reatribuicao',
        campo_label: 'Tarefa reatribuída',
        valor_anterior: nomeAntigo,
        valor_novo: nomeNovo,
        tipo: 'reatribuicao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
      } as never)

      if (tarefa.contratoIdResolvido) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: tarefa.contratoIdResolvido,
          descricao: `${userName || 'Alguém'} reatribuiu ${TIPO_INFO[tarefa.tipo].label} — tirou de ${nomeAntigo}, passou pra ${nomeNovo}.`,
          tipo_id: tipoTarefa?.id || null,
          importante: false,
          criado_por: userName || 'Sistema',
        } as never)
      }

      await notificarAtribuicao(novoId, TIPO_INFO[tarefa.tipo].label, tarefa.petNome, tarefa.quantidade)

      toast('Reatribuído!', 'success')
      setReatribuindoId(null)
      await Promise.all([carregarEmAndamento(), carregarMinhas()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao reatribuir', 'error')
    } finally {
      setSalvandoReatribuicao(false)
    }
  }

  // ── Concluídas recentemente (pra desfazer misclick) ──────────────────────
  type TarefaConcluida = TarefaGrupo
  const [concluidasRecentes, setConcluidasRecentes] = useState<TarefaConcluida[]>([])
  const [loadingConcluidas, setLoadingConcluidas] = useState(false)
  const [desfazendoId, setDesfazendoId] = useState<string | null>(null)

  const carregarConcluidasRecentes = useCallback(async () => {
    if (!currentUnit || !podeAtribuir) return
    setLoadingConcluidas(true)
    const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em, concluido_em')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'concluida')
      .gte('concluido_em', desde)
      .order('concluido_em', { ascending: false }) as { data: TarefaRow[] | null }

    setConcluidasRecentes(agruparTarefas(await resolverPetTutor(data || [])))
    setLoadingConcluidas(false)
  }, [supabase, currentUnit, podeAtribuir, resolverPetTutor])

  useEffect(() => { if (aba === 'atribuir') { carregarEmAndamento(); carregarConcluidasRecentes() } }, [aba, carregarEmAndamento, carregarConcluidasRecentes])

  async function desfazerConclusao(tarefa: TarefaConcluida) {
    if (tarefa.tipo === 'remocao') return
    const rotulo = tarefa.quantidade > 1 ? `${TIPO_INFO[tarefa.tipo].label} (×${tarefa.quantidade})` : TIPO_INFO[tarefa.tipo].label
    if (!confirm(`Desfazer a conclusão de "${rotulo}" — ${tarefa.petNome}?`)) return
    setDesfazendoId(tarefa.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (tarefa.tipo === 'entrega' && tarefa.contrato_id) {
        const { error } = await supabase.from('contratos').update({ status: 'retorno', data_entrega: null } as never).eq('id', tarefa.contrato_id)
        if (error) throw new Error(error.message)
      } else if (tarefa.contratoProdutoIds.length > 0) {
        const { error } = await supabase.from('contrato_produtos').update({ rescaldo_feito: false } as never).in('id', tarefa.contratoProdutoIds)
        if (error) throw new Error(error.message)
      }

      await supabase.from('tarefas_operacionais').update({
        status: 'pendente',
        concluido_em: null,
        anotacao_conclusao: null,
      } as never).in('id', tarefa.ids)

      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'conclusao',
        campo_label: 'Tarefa desfeita',
        valor_anterior: 'Concluída',
        valor_novo: 'Pendente (desfeita)',
        tipo: 'desfazer',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: `${rotulo} de ${tarefa.petNome} desfeita — voltou pro pool`,
      } as never)

      if (tarefa.contratoIdResolvido) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: tarefa.contratoIdResolvido,
          descricao: `${userName || 'Alguém'} desfez a conclusão de ${TIPO_INFO[tarefa.tipo].label} — voltou pro pool.`,
          tipo_id: tipoTarefa?.id || null,
          importante: true,
          criado_por: userName || 'Sistema',
        } as never)
      }

      toast('Desfeito — tarefa voltou pro pool', 'success')
      await Promise.all([carregarConcluidasRecentes(), carregarPool()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao desfazer', 'error')
    } finally {
      setDesfazendoId(null)
    }
  }

  const carregarPool = useCallback(async () => {
    if (!currentUnit || !podeAtribuir) return
    setLoadingPool(true)

    const { data: pendentesEntrega } = await supabase.from('tarefas_operacionais').select('contrato_id').eq('unidade_id', currentUnit.id).eq('tipo', 'entrega').eq('status', 'pendente')
    const idsEntregaOcupados = (pendentesEntrega || []).map((r: { contrato_id: string | null }) => r.contrato_id).filter(Boolean)

    let qEntrega = supabase.from('contratos').select('id, codigo, pet_nome, tutor_nome, tutor_telefone, tutor_endereco, tutor_bairro, tutor_cidade, status, numero_lacre, unidade_id')
      .eq('unidade_id', currentUnit.id).in('status', ['retorno', 'pendente'])
      .order('updated_at', { ascending: true }) // mais antigo (desde que entrou em retorno/pendente) primeiro
    if (idsEntregaOcupados.length > 0) qEntrega = qEntrega.not('id', 'in', `(${idsEntregaOcupados.join(',')})`)
    const { data: contratosEntrega } = await qEntrega
    setPoolEntrega((contratosEntrega || []) as ContratoResumo[])

    const { data: pendentesRescaldo } = await supabase.from('tarefas_operacionais').select('contrato_produto_id').eq('unidade_id', currentUnit.id).in('tipo', ['molde_patinha', 'carimbo', 'pelo_extra', 'pelinho']).eq('status', 'pendente')
    const idsRescaldoOcupados = (pendentesRescaldo || []).map((r: { contrato_produto_id: string | null }) => r.contrato_produto_id).filter(Boolean)

    let qRescaldo = supabase.from('contrato_produtos')
      .select('id, contrato_id, rescaldo_feito, produto:produtos!inner(nome, rescaldo_tipo), contrato:contratos!inner(id, codigo, pet_nome, tutor_nome, unidade_id, status, numero_lacre)')
      .eq('rescaldo_feito', false)
      .in('produto.rescaldo_tipo', ['molde_patinha', 'carimbo', 'pelo_extra', 'pelinho'])
      .eq('contrato.unidade_id', currentUnit.id)
      .in('contrato.status', ['ativo', 'pinda', 'retorno', 'pendente'])
      .order('created_at', { ascending: true }) // mais antigo primeiro, igual às outras seções
    if (idsRescaldoOcupados.length > 0) qRescaldo = qRescaldo.not('id', 'in', `(${idsRescaldoOcupados.join(',')})`)
    const { data: produtosRescaldo } = await qRescaldo
    setPoolRescaldo((produtosRescaldo || []) as unknown as ContratoProdutoResumo[])

    // Quem pode receber tarefa: Operacional de verdade OU gerente/concierge (tem unidade sem
    // motorista dedicado — aí o próprio gerente/concierge se atribui e resolve).
    const { data: perfisAtribuiveis } = await supabase.rpc('listar_atribuiveis_operacional' as never, { p_unidade_id: currentUnit.id } as never)
    setOperacionais((perfisAtribuiveis || []) as { user_id: string; nome: string | null; role: string }[])

    setLoadingPool(false)
  }, [supabase, currentUnit, podeAtribuir])

  useEffect(() => { if (aba === 'atribuir') carregarPool() }, [aba, carregarPool])

  async function atribuir(tipo: TarefaTipo, origem: { contratoId?: string; contratoProdutoIds?: string[]; unidadeId: string }, itemKey: string) {
    const operacionalId = operacionalEscolhido[itemKey]
    if (!operacionalId) return
    const observacao = (observacaoAtribuicao[itemKey] || '').trim()
    setSalvandoAtribuicao(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const quantidade = origem.contratoProdutoIds?.length || 1
      const linhasBase = {
        unidade_id: origem.unidadeId,
        tipo,
        atribuido_a: operacionalId,
        atribuido_por: user?.id || null,
        observacao_atribuicao: observacao || null,
      }
      const rows = origem.contratoProdutoIds && origem.contratoProdutoIds.length > 0
        ? origem.contratoProdutoIds.map(cpId => ({ ...linhasBase, contrato_id: null, contrato_produto_id: cpId }))
        : [{ ...linhasBase, contrato_id: origem.contratoId || null, contrato_produto_id: null }]
      const { data: novasTarefas, error } = await supabase.from('tarefas_operacionais').insert(rows as never).select('id')
      if (error) throw new Error(error.message)

      const petNome = origem.contratoId
        ? poolEntrega.find(c => c.id === origem.contratoId)?.pet_nome
        : poolRescaldo.find(p => origem.contratoProdutoIds?.includes(p.id))?.contrato?.pet_nome
      const atribuidoNome = operacionais.find(o => o.user_id === operacionalId)?.nome
      const rotulo = quantidade > 1 ? `${TIPO_INFO[tipo].label} (×${quantidade})` : TIPO_INFO[tipo].label
      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: (novasTarefas as { id: string }[] | null)?.[0]?.id || null,
        entidade_nome: petNome || TIPO_INFO[tipo].label,
        campo: 'atribuicao',
        campo_label: 'Tarefa atribuída',
        valor_novo: `${rotulo} → ${atribuidoNome || 'Operacional'}`,
        tipo: 'atribuicao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: observacao || null,
      } as never)

      // Fica registrado nas Observações do contrato também — é onde gerente/concierge já olham todo dia.
      const contratoIdParaObs = origem.contratoId || poolRescaldo.find(p => origem.contratoProdutoIds?.includes(p.id))?.contrato_id
      if (contratoIdParaObs) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: contratoIdParaObs,
          descricao: `${userName || 'Alguém'} atribuiu para ${atribuidoNome || 'Operacional'} fazer ${rotulo}${observacao ? ` — pedido específico: "${observacao}"` : '.'}`,
          tipo_id: tipoTarefa?.id || null,
          importante: !!observacao,
          criado_por: userName || 'Sistema',
        } as never)
      }

      await notificarAtribuicao(operacionalId, TIPO_INFO[tipo].label, petNome || 'um pet', quantidade)

      toast('Tarefa atribuída!', 'success')
      setAtribuindoId(null)
      setObservacaoAtribuicao(prev => { const n = { ...prev }; delete n[itemKey]; return n })
      await Promise.all([carregarPool(), carregarEmAndamento(), carregarMinhas()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao atribuir', 'error')
    } finally {
      setSalvandoAtribuicao(false)
    }
  }

  // Agrupa linhas físicas de contrato_produtos por contrato — N itens do mesmo tipo pro mesmo
  // contrato viram 1 PoolItemData com quantidade > 1 (badge "×N").
  function agruparPool(rows: ContratoProdutoResumo[]): PoolItemData[] {
    const grupos: Record<string, PoolItemData> = {}
    for (const p of rows) {
      const existente = grupos[p.contrato_id]
      if (!existente) {
        grupos[p.contrato_id] = {
          key: p.contrato_id, itemIds: [p.id], quantidade: 1,
          petNome: p.contrato?.pet_nome || '—', tutorNome: p.contrato?.tutor_nome || '',
          status: p.contrato?.status || '', lacre: p.contrato?.numero_lacre || null,
        }
      } else {
        existente.itemIds.push(p.id)
        existente.quantidade++
      }
    }
    return Object.values(grupos)
  }

  // Agrupamentos por TIPO — mesma fonte de dados de sempre (poolEntrega/poolRescaldo/
  // emAndamento/concluidasRecentes), só reorganizados pra render em etapa → tipo.
  const poolItensPorTipo: Record<TarefaTipo, PoolItemData[]> = {
    entrega: poolEntrega.map(c => ({
      key: c.id, itemIds: [c.id], quantidade: 1, petNome: c.pet_nome, tutorNome: c.tutor_nome, status: c.status, lacre: c.numero_lacre,
      enderecoResumo: [c.tutor_endereco, c.tutor_bairro, c.tutor_cidade].filter(Boolean).join(' - ') || undefined,
    })),
    remocao: [],
    molde_patinha: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'molde_patinha')),
    carimbo: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'carimbo')),
    pelo_extra: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'pelo_extra')),
    pelinho: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'pelinho')),
  }
  const totalPraAtribuir = poolEntrega.length + poolRescaldo.length
  const andamentoPorTipo = agruparPorTipo(emAndamento)
  const concluidasPorTipo = agruparPorTipo(concluidasRecentes)

  // ============================================
  // Render
  // ============================================
  if (!temModulo && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4 text-center">
        <p className="text-[var(--surface-400)]">Módulo Operacional não está ativo nessa unidade.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[var(--brand-500)]" />
        <h1 className="text-lg font-bold text-[var(--surface-800)]">Tarefas</h1>
      </div>

      {podeAtribuir && (
        <div className="flex rounded-xl border border-[var(--surface-200)] overflow-hidden">
          <button onClick={() => setAba('minhas')} className={`flex-1 py-2 text-sm font-semibold transition-colors ${aba === 'minhas' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
            Minhas Tarefas
          </button>
          <button onClick={() => setAba('atribuir')} className={`flex-1 py-2 text-sm font-semibold transition-colors ${aba === 'atribuir' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
            Atribuir
          </button>
        </div>
      )}

      {aba === 'minhas' && (
        <div className="space-y-2">
          {loadingMinhas ? (
            <div className="text-center py-8 text-sm text-[var(--surface-400)]">Carregando...</div>
          ) : minhasTarefas.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--surface-400)]">Nenhuma tarefa pendente 🎉</div>
          ) : (
            minhasTarefas.map(t => {
              const ficha = t.ficha_id ? fichasPorId[t.ficha_id] : null
              const petNome = ficha?.nome_pet || t.petNome
              const tutorNome = ficha?.nome_completo || t.tutorNome
              return (
                <TarefaCard
                  key={t.id}
                  tipo={t.tipo}
                  statusBadge={t.statusContrato}
                  lacre={t.lacreContrato}
                  petNome={petNome}
                  tutorNome={tutorNome}
                  quantidade={t.quantidade}
                  acao={t.observacao_atribuicao ? <span className="text-base shrink-0" title="Tem pedido específico">📝</span> : undefined}
                  onClick={() => { setTarefaAberta(t); setLacreRemocao(''); setAnotacaoRemocao(''); setAnotacaoSimples(''); setErroRemocao(null); setLeuObservacao(false); setModoDataEntrega('agora'); setDataEntregaManual(''); setModoDataRemocao('agora'); setDataHoraRemocaoManual('') }}
                />
              )
            })
          )}
        </div>
      )}

      {aba === 'atribuir' && podeAtribuir && (
        <div className="space-y-3">
          <EtapaSection titulo="Pra atribuir" emoji="📥" total={totalPraAtribuir} aberto={etapaAberta.pra_atribuir} onToggle={() => toggleEtapa('pra_atribuir')}>
            {loadingPool ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : operacionais.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nenhum usuário ativo pra atribuir nessa unidade.</p>
            ) : totalPraAtribuir === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada pra atribuir agora 🎉</p>
            ) : (
              ORDEM_TIPOS.map(tipo => (
                <TipoGroup key={tipo} tipo={tipo} count={poolItensPorTipo[tipo].length}>
                  {poolItensPorTipo[tipo].map(item => (
                    <PoolItem
                      key={item.key}
                      tipo={tipo}
                      item={item}
                      operacionais={operacionais}
                      cargaPorPessoa={cargaPorPessoa}
                      atribuindoId={atribuindoId}
                      setAtribuindoId={setAtribuindoId}
                      operacionalEscolhido={operacionalEscolhido}
                      setOperacionalEscolhido={setOperacionalEscolhido}
                      observacaoTexto={observacaoAtribuicao}
                      setObservacaoTexto={setObservacaoAtribuicao}
                      salvando={salvandoAtribuicao}
                      onAtribuir={poolItem => atribuir(tipo, tipo === 'entrega' ? { contratoId: poolItem.key, unidadeId: currentUnit!.id } : { contratoProdutoIds: poolItem.itemIds, unidadeId: currentUnit!.id }, poolItem.key)}
                    />
                  ))}
                </TipoGroup>
              ))
            )}
          </EtapaSection>

          <EtapaSection titulo="Em andamento" emoji="🔄" total={emAndamento.length} aberto={etapaAberta.andamento} onToggle={() => toggleEtapa('andamento')}>
            {loadingEmAndamento ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : emAndamento.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada em andamento.</p>
            ) : (
              ORDEM_TIPOS.map(tipo => (
                <TipoGroup key={tipo} tipo={tipo} count={(andamentoPorTipo[tipo] || []).length}>
                  {(andamentoPorTipo[tipo] || []).map(t => {
                    const horasParado = (Date.now() - new Date(t.atribuido_em).getTime()) / (1000 * 60 * 60)
                    const corIdade = horasParado > 48 ? 'text-red-500' : horasParado > 24 ? 'text-amber-500' : 'text-[var(--surface-400)]'
                    const nomeAtual = operacionais.find(o => o.user_id === t.atribuido_a)?.nome || '—'
                    return (
                      <div key={t.id}>
                        <TarefaCard
                          tipo={t.tipo}
                          lacre={t.lacre}
                          petNome={t.petNome}
                          tutorNome={t.tutorNome}
                          quantidade={t.quantidade}
                          linhaExtra={<p className="text-xs text-[var(--surface-500)] truncate mt-0.5">Com {nomeAtual} · <span className={corIdade}>{horasParado < 1 ? 'agora' : `${Math.floor(horasParado)}h`}</span></p>}
                          acao={
                            <button
                              onClick={() => setReatribuindoId(reatribuindoId === t.id ? null : t.id)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 bg-slate-500"
                            >
                              Reatribuir
                            </button>
                          }
                        />
                        {reatribuindoId === t.id && (
                          <div className="mt-1.5 ml-1 flex gap-1.5">
                            <select
                              value={novoOperacional[t.id] || ''}
                              onChange={e => setNovoOperacional(prev => ({ ...prev, [t.id]: e.target.value }))}
                              className="input text-sm flex-1"
                            >
                              <option value="">Passar pra quem...</option>
                              {operacionais.filter(o => o.user_id !== t.atribuido_a).map(o => (
                                <option key={o.user_id} value={o.user_id}>
                                  {o.nome || 'Sem nome'} ({o.role === 'operacional' ? 'Operacional' : o.role === 'gerente' ? 'Gerente' : o.role === 'super_admin' ? 'Admin' : 'Concierge'}) — {cargaPorPessoa[o.user_id] || 0} pendente{(cargaPorPessoa[o.user_id] || 0) === 1 ? '' : 's'}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => reatribuir(t)}
                              disabled={salvandoReatribuicao || !novoOperacional[t.id]}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 bg-slate-500"
                            >
                              OK
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </TipoGroup>
              ))
            )}
          </EtapaSection>

          <EtapaSection titulo="Concluídas nas últimas 48h" emoji="✅" total={concluidasRecentes.length} aberto={etapaAberta.concluidas} onToggle={() => toggleEtapa('concluidas')}>
            {loadingConcluidas ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : concluidasRecentes.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada concluído ainda.</p>
            ) : (
              ORDEM_TIPOS.map(tipo => (
                <TipoGroup key={tipo} tipo={tipo} count={(concluidasPorTipo[tipo] || []).length}>
                  {(concluidasPorTipo[tipo] || []).map(t => (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      lacre={t.lacre}
                      petNome={t.petNome}
                      tutorNome={t.tutorNome}
                      quantidade={t.quantidade}
                      acao={t.tipo === 'remocao' ? (
                        <span className="text-[10px] text-[var(--surface-400)] text-right shrink-0 max-w-[90px]">Desfaz em /admin/tratamento-erros</span>
                      ) : (
                        <button
                          onClick={() => desfazerConclusao(t)}
                          disabled={desfazendoId === t.id}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 bg-red-600 disabled:opacity-50"
                        >
                          {desfazendoId === t.id ? '...' : 'Desfazer'}
                        </button>
                      )}
                    />
                  ))}
                </TipoGroup>
              ))
            )}
          </EtapaSection>
        </div>
      )}

      {/* Detalhe / conclusão de tarefa */}
      {tarefaAberta && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => !concluindoRemocao && !concluindoSimples && setTarefaAberta(null)}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-4 bg-[var(--surface-0)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--surface-800)] flex items-center gap-2">
                {(() => { const Icon = TIPO_INFO[tarefaAberta.tipo].icon; return <Icon className="h-5 w-5" style={{ color: TIPO_INFO[tarefaAberta.tipo].cor }} /> })()}
                {TIPO_INFO[tarefaAberta.tipo].label}
                {tarefaAberta.quantidade > 1 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: TIPO_INFO[tarefaAberta.tipo].cor }}>×{tarefaAberta.quantidade}</span>
                )}
              </h2>
              <button onClick={() => setTarefaAberta(null)} disabled={concluindoRemocao || concluindoSimples} className="p-1 rounded-lg hover:bg-[var(--surface-100)]">
                <X className="h-5 w-5 text-[var(--surface-400)]" />
              </button>
            </div>

            {tarefaAberta.observacao_atribuicao && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-500 mb-0.5">⚠️ Pedido específico de quem atribuiu</p>
                <p className="text-sm text-[var(--surface-700)] mb-2">{tarefaAberta.observacao_atribuicao}</p>
                {tarefaAberta.tipo !== 'remocao' && (
                  <label className="flex items-center gap-2 text-sm text-[var(--surface-700)] cursor-pointer">
                    <input type="checkbox" checked={leuObservacao} onChange={e => setLeuObservacao(e.target.checked)} className="w-4 h-4" />
                    Li e vou seguir esse pedido
                  </label>
                )}
              </div>
            )}

            {tarefaAberta.tipo === 'remocao' && tarefaAberta.ficha_id && fichasPorId[tarefaAberta.ficha_id] && (() => {
              const ficha = fichasPorId[tarefaAberta.ficha_id!]
              const op = (ficha.op_dados || {}) as Record<string, unknown>
              const enderecoCompleto = `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''} - ${ficha.bairro}, ${ficha.cidade}/${ficha.estado}`
              const petDetalhe = [ficha.especie, ficha.raca, ficha.cor].filter(Boolean).join(' · ')
              const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(enderecoCompleto)}&navigate=yes`
              const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoCompleto)}`
              return (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Pet:</strong> {ficha.nome_pet?.toUpperCase()}</p>
                    {petDetalhe && <p className="text-xs text-[var(--surface-500)]">{petDetalhe}</p>}
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Tutor:</strong> {ficha.nome_completo}</p>
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Contato:</strong> {(op.telefone1Nome as string) || ficha.nome_completo}</p>
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Endereço:</strong> {enderecoCompleto}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold">
                      <MapPin className="h-4 w-4" />Waze
                    </a>
                    <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
                      <Navigation className="h-4 w-4" />Google Maps
                    </a>
                  </div>

                  <button onClick={() => gerarPdfDaFicha(ficha)} disabled={gerandoPdf} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[var(--surface-200)] text-sm font-semibold text-[var(--surface-600)] disabled:opacity-50">
                    {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    Gerar PDF do Contrato
                  </button>

                  <div>
                    <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Data/Hora do Acolhimento</label>
                    <AgoraOutraToggle modo={modoDataRemocao} setModo={setModoDataRemocao} />
                    {modoDataRemocao === 'outra' && (
                      <input type="datetime-local" step="1800" value={dataHoraRemocaoManual} onChange={e => setDataHoraRemocaoManual(e.target.value)} className="input w-full mt-1.5" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Número do Lacre <span className="text-red-400">*</span></label>
                    <input type="text" value={lacreRemocao} onChange={e => setLacreRemocao(e.target.value)} placeholder="Número do lacre" className="input w-full" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Anotação (opcional)</label>
                    <textarea value={anotacaoRemocao} onChange={e => setAnotacaoRemocao(e.target.value)} rows={2} placeholder="Alguma observação sobre a remoção..." className="input w-full resize-none" />
                  </div>
                  {erroRemocao && <p className="text-xs text-red-400">{erroRemocao}</p>}

                  <button
                    onClick={() => concluirRemocao(tarefaAberta, ficha)}
                    disabled={concluindoRemocao || !lacreRemocao.trim() || (modoDataRemocao === 'outra' && !dataHoraRemocaoManual)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
                  >
                    {concluindoRemocao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Concluir Remoção
                  </button>
                </div>
              )
            })()}

            {tarefaAberta.tipo !== 'remocao' && (
              <div className="space-y-3">
                {(() => {
                  const contratoEntrega = tarefaAberta.contrato_id ? contratosPorId[tarefaAberta.contrato_id] : null
                  const produto = tarefaAberta.contrato_produto_id ? produtosPorId[tarefaAberta.contrato_produto_id] : null
                  const c = contratoEntrega || produto?.contrato
                  const petNome = c?.pet_nome || '—'
                  const tutorNome = c?.tutor_nome || '—'
                  const status = c?.status
                  const lacre = c?.numero_lacre
                  const petDetalhe = [c?.pet_especie, c?.pet_raca, c?.pet_cor].filter(Boolean).join(' · ')
                  const enderecoCompleto = [c?.tutor_endereco, c?.tutor_bairro, c?.tutor_cidade].filter(Boolean).join(' - ')
                  const wazeUrl = enderecoCompleto ? `https://waze.com/ul?q=${encodeURIComponent(enderecoCompleto)}&navigate=yes` : null
                  const gmapsUrl = enderecoCompleto ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoCompleto)}` : null
                  return (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
                        <p className="text-sm flex items-center gap-1.5">
                          <strong className="text-[var(--surface-700)]">Pet:</strong>
                          {status && <StatusBadge status={status} />}
                          {lacre ? `${lacre} — ${petNome}` : petNome}
                        </p>
                        {petDetalhe && <p className="text-xs text-[var(--surface-500)] pl-[calc(2.5rem+0.375rem)]">{petDetalhe}</p>}
                        <p className="text-sm"><strong className="text-[var(--surface-700)]">Tutor:</strong> {tutorNome}</p>
                        {tarefaAberta.tipo === 'entrega' && enderecoCompleto && (
                          <p className="text-sm"><strong className="text-[var(--surface-700)]">Endereço:</strong> {enderecoCompleto}</p>
                        )}
                      </div>
                      {tarefaAberta.tipo === 'entrega' && (wazeUrl || gmapsUrl) && (
                        <div className="grid grid-cols-2 gap-2">
                          {wazeUrl && (
                            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold">
                              <MapPin className="h-4 w-4" />Waze
                            </a>
                          )}
                          {gmapsUrl && (
                            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
                              <Navigation className="h-4 w-4" />Google Maps
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
                {tarefaAberta.tipo === 'entrega' && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Data da Entrega</label>
                    <AgoraOutraToggle modo={modoDataEntrega} setModo={setModoDataEntrega} />
                    {modoDataEntrega === 'outra' && (
                      <input type="date" value={dataEntregaManual} onChange={e => setDataEntregaManual(e.target.value)} className="input w-full mt-1.5" />
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Anotação (opcional)</label>
                  <textarea value={anotacaoSimples} onChange={e => setAnotacaoSimples(e.target.value)} rows={2} placeholder="Alguma observação..." className="input w-full resize-none" autoFocus />
                </div>
                <button
                  onClick={() => concluirTarefaSimples(tarefaAberta)}
                  disabled={concluindoSimples || (!!tarefaAberta.observacao_atribuicao && !leuObservacao) || (tarefaAberta.tipo === 'entrega' && modoDataEntrega === 'outra' && !dataEntregaManual)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
                >
                  {concluindoSimples ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Concluir
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

