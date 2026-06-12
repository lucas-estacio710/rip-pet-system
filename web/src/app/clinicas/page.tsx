'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Stethoscope, Search, X, MapPin, ChevronLeft, ChevronRight, LayoutGrid, List, ChevronRight as ArrowR, Pencil, Plus, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

// Mapa precisa ser carregado client-side (leaflet usa window/document)
const MapaClinicas = dynamic(() => import('@/components/clinicas/MapaClinicas'), {
  ssr: false,
  loading: () => <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando mapa…</div>,
})

// ============================================
// Tipos
// ============================================
type Estabelecimento = {
  id: string
  nome: string
  tipo: string | null
  cidade: string | null
  bairro: string | null
  endereco: string | null
  estado: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  instagram: string | null
  website: string | null
  observacoes: string | null
  relacionamento: number | null
  unidade_id: string | null
  ultima_visita: string | null
  politica_concorrencia: string | null
  latitude: number | null
  longitude: number | null
  fotos: string[] | null
  veterinarios_fixos: number | null
  qtde_media_obitos_mensal: number | null
  concorrentes_presentes: string[] | null
  // Contadores agregados (calculados client-side)
  countPets?: number
  countIndicacoes?: number
  countContatos?: number
}

// ============================================
// Helpers
// ============================================
const TIPO_LABELS: Record<string, string> = {
  clinica: 'Clínica',
  pet_shop: 'Pet Shop',
  hospital: 'Hospital',
  autonomo: 'Autônomo',
  veterinario: 'Veterinário',
}

const TIPO_CORES: Record<string, { bg: string; text: string }> = {
  clinica:     { bg: 'bg-blue-500/15',   text: 'text-blue-600' },
  pet_shop:    { bg: 'bg-green-500/15',  text: 'text-green-600' },
  hospital:    { bg: 'bg-purple-500/15', text: 'text-purple-600' },
  autonomo:    { bg: 'bg-amber-500/15',  text: 'text-amber-600' },
  veterinario: { bg: 'bg-cyan-500/15',   text: 'text-cyan-600' },
}

function tipoLabel(t: string | null) {
  if (!t) return '—'
  return TIPO_LABELS[t] || t
}

function tipoCor(t: string | null) {
  if (!t) return { bg: 'bg-slate-500/15', text: 'text-slate-600' }
  return TIPO_CORES[t] || { bg: 'bg-slate-500/15', text: 'text-slate-600' }
}

// ============================================
// Componente
// ============================================
export default function ClinicasPage() {
  const { hasModule, currentUnit } = useUnit()
  const supabase = createClient()

  const [mainTab, setMainTab] = useState<'estabs' | 'visitas' | 'indicacoes' | 'dashboard' | 'mapa'>('estabs')
  const [estabs, setEstabs] = useState<Estabelecimento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<string>('')
  const [cidadeFiltro, setCidadeFiltro] = useState<string>('todas')
  const [statusFiltro, setStatusFiltro] = useState<string>('todos')
  const [viewMode, setViewMode] = useState<'cards' | 'lista'>('cards')

  // Cidades "principais" — pode ser configurável por unidade no futuro
  const CIDADES_PRINCIPAIS = ['Santos', 'São Vicente', 'Praia Grande', 'Guarujá', 'São Paulo']

  const getDias = (data: string | null): number | null => {
    if (!data) return null
    return Math.floor((Date.now() - new Date(data).getTime()) / 86400000)
  }

  async function handleStarClick(id: string, star: number, current: number) {
    const novo = star === current ? 0 : star
    const { error } = await supabase.from('estabelecimentos').update({ relacionamento: novo } as never).eq('id', id)
    if (error) { console.error('Erro relacionamento:', error); return }
    setEstabs(prev => prev.map(e => e.id === id ? { ...e, relacionamento: novo } : e))
  }

  // Carregar lista de estabelecimentos + contadores agregados
  const carregar = useCallback(async () => {
    if (!currentUnit) return
    setLoading(true)

    // 1. Lista de estabelecimentos da unidade
    const { data: estabsData, error: errEstabs } = await supabase
      .from('estabelecimentos')
      .select('id, nome, tipo, cidade, bairro, endereco, estado, telefone, whatsapp, email, instagram, website, observacoes, relacionamento, unidade_id, ultima_visita, politica_concorrencia, latitude, longitude, fotos, veterinarios_fixos, qtde_media_obitos_mensal, concorrentes_presentes')
      .eq('unidade_id', currentUnit.id)
      .order('nome')

    if (errEstabs) {
      console.error('Erro estabelecimentos:', errEstabs)
      setEstabs([])
      setLoading(false)
      return
    }

    const lista = (estabsData || []) as Estabelecimento[]
    const ids = lista.map(e => e.id)

    if (ids.length === 0) {
      setEstabs([])
      setLoading(false)
      return
    }

    // 2. Contadores em paralelo: pets removidos, indicações, contatos
    const [petsRes, indRes, contRes] = await Promise.all([
      supabase
        .from('contratos')
        .select('estabelecimento_id')
        .in('estabelecimento_id', ids),
      supabase
        .from('indicacoes')
        .select('estabelecimento_origem_id')
        .in('estabelecimento_origem_id', ids),
      supabase
        .from('contatos')
        .select('estabelecimento_id')
        .in('estabelecimento_id', ids)
        .eq('ativo', true),
    ])

    const countMap = new Map<string, { pets: number; ind: number; cont: number }>()
    ids.forEach(id => countMap.set(id, { pets: 0, ind: 0, cont: 0 }))

    ;(petsRes.data as { estabelecimento_id: string | null }[] | null || []).forEach(r => {
      if (r.estabelecimento_id && countMap.has(r.estabelecimento_id)) {
        countMap.get(r.estabelecimento_id)!.pets++
      }
    })
    ;(indRes.data as { estabelecimento_origem_id: string | null }[] | null || []).forEach(r => {
      if (r.estabelecimento_origem_id && countMap.has(r.estabelecimento_origem_id)) {
        countMap.get(r.estabelecimento_origem_id)!.ind++
      }
    })
    ;(contRes.data as { estabelecimento_id: string | null }[] | null || []).forEach(r => {
      if (r.estabelecimento_id && countMap.has(r.estabelecimento_id)) {
        countMap.get(r.estabelecimento_id)!.cont++
      }
    })

    const comContadores = lista.map(e => ({
      ...e,
      countPets: countMap.get(e.id)?.pets || 0,
      countIndicacoes: countMap.get(e.id)?.ind || 0,
      countContatos: countMap.get(e.id)?.cont || 0,
    }))

    setEstabs(comContadores)
    setLoading(false)
  }, [supabase, currentUnit])

  useEffect(() => { carregar() }, [carregar])

  // Filtros
  const tiposDisponiveis = useMemo(() => {
    const set = new Set<string>()
    estabs.forEach(e => { if (e.tipo) set.add(e.tipo) })
    return Array.from(set).sort()
  }, [estabs])

  // Métricas pros KPIs
  const metricas = useMemo(() => {
    const total = estabs.length
    const exclusivos = estabs.filter(e => e.politica_concorrencia === 'parceiro_exclusivo_nosso').length
    const semVisita = estabs.filter(e => !e.ultima_visita).length
    const atrasados = estabs.filter(e => {
      if (!e.ultima_visita) return false
      const d = getDias(e.ultima_visita)
      return d != null && d > 30
    }).length
    const semConcorrencia = estabs.filter(e => !e.concorrentes_presentes?.length).length
    const obitosTotais = estabs.reduce((s, e) => s + (e.qtde_media_obitos_mensal || 0), 0)
    return { total, exclusivos, semVisita, atrasados, semConcorrencia, obitosTotais }
  }, [estabs])

  // Contagem por cidade
  const contagemCidades = useMemo(() => {
    const counts: Record<string, number> = {}
    estabs.forEach(e => {
      if (e.cidade) counts[e.cidade] = (counts[e.cidade] || 0) + 1
    })
    return counts
  }, [estabs])

  const outrasCidades = useMemo(() => {
    return Object.keys(contagemCidades)
      .filter(c => !CIDADES_PRINCIPAIS.includes(c))
      .sort((a, b) => contagemCidades[b] - contagemCidades[a])
  }, [contagemCidades])

  // Pipeline de relacionamento (5 estágios)
  const pipeline = useMemo(() => {
    const stages: { id: string; label: string; levels: number[]; cor: string }[] = [
      { id: 'frio',      label: 'Frio',      levels: [0, 1], cor: 'bg-slate-500' },
      { id: 'morno',     label: 'Morno',     levels: [2],    cor: 'bg-amber-500' },
      { id: 'quente',    label: 'Quente',    levels: [3],    cor: 'bg-orange-500' },
      { id: 'parceiro',  label: 'Parceiro',  levels: [4],    cor: 'bg-emerald-500' },
      { id: 'exclusivo', label: 'Exclusivo', levels: [5],    cor: 'bg-violet-500' },
    ]
    return stages.map(s => ({
      ...s,
      count: estabs.filter(e => s.levels.includes(e.relacionamento ?? 0)).length,
    }))
  }, [estabs])

  // Filtros combinados: busca + tipo + cidade + status (relacionamento ou alertas)
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return estabs.filter(e => {
      if (tipoFiltro && e.tipo !== tipoFiltro) return false

      // Cidade
      if (cidadeFiltro !== 'todas') {
        if (cidadeFiltro === 'outras') {
          if (e.cidade && CIDADES_PRINCIPAIS.includes(e.cidade)) return false
        } else if (e.cidade !== cidadeFiltro) {
          return false
        }
      }

      // Status: ou estágio do pipeline OU filtro rápido
      if (statusFiltro !== 'todos') {
        const stage = pipeline.find(s => s.id === statusFiltro)
        if (stage) {
          if (!stage.levels.includes(e.relacionamento ?? 0)) return false
        } else if (statusFiltro === 'oportunidade') {
          const temConcorrente = (e.concorrentes_presentes?.length || 0) > 0
          const exclusivoOutro = e.politica_concorrencia === 'parceiro_exclusivo_outro'
          if (temConcorrente || exclusivoOutro) return false
        } else if (statusFiltro === 'semVisita') {
          if (e.ultima_visita) return false
        } else if (statusFiltro === 'atrasado') {
          const d = getDias(e.ultima_visita)
          if (d == null || d <= 30) return false
        }
      }

      // Busca textual
      if (t) {
        return (
          e.nome?.toLowerCase().includes(t) ||
          e.cidade?.toLowerCase().includes(t) ||
          e.bairro?.toLowerCase().includes(t) ||
          e.endereco?.toLowerCase().includes(t)
        )
      }
      return true
    })
  }, [estabs, busca, tipoFiltro, cidadeFiltro, statusFiltro, pipeline])

  // FLS gate
  if (!hasModule('tela_clinicas')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--surface-500)]">Esta tela não está habilitada para sua unidade.</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-cyan-900/30 items-center justify-center">
            <Stethoscope className="h-5 w-5 text-cyan-500" />
          </div>
          <h1 className="text-title text-[var(--shell-text)]">Clínicas</h1>
        </div>
        <Link
          href="/clinicas/novo"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white inline-flex items-center gap-1 whitespace-nowrap"
        >
          + Nova
        </Link>
      </div>

      {/* Tabs principais */}
      <div className="inline-flex bg-[var(--surface-100)] rounded-lg p-0.5 mb-4 flex-wrap">
        {(['dashboard', 'estabs', 'mapa', 'visitas', 'indicacoes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setMainTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              mainTab === t ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'
            }`}
          >
            {t === 'dashboard' ? 'Dashboard' : t === 'estabs' ? 'Estabelecimentos' : t === 'mapa' ? 'Mapa' : t === 'visitas' ? 'Visitas' : 'Indicações por Mês'}
          </button>
        ))}
      </div>

      {/* Aba: Indicações por Mês */}
      {mainTab === 'indicacoes' && currentUnit && (
        <IndicacoesMesView
          unidadeId={currentUnit.id}
          estabsMap={new Map(estabs.map(e => [e.id, e.nome]))}
          temPadronizacao={!!currentUnit.modulos_ativos?.includes('cb_padronizacao_clinicas')}
        />
      )}

      {/* Aba: Visitas — listagem cross-clínicas */}
      {mainTab === 'visitas' && currentUnit && (
        <VisitasView unidadeId={currentUnit.id} estabsMap={new Map(estabs.map(e => [e.id, e.nome]))} />
      )}

      {/* Aba: Dashboard — KPIs comerciais */}
      {mainTab === 'dashboard' && currentUnit && (
        <DashboardView unidadeId={currentUnit.id} estabs={estabs} />
      )}

      {/* Aba: Mapa — clínicas geolocalizadas */}
      {mainTab === 'mapa' && (
        <MapaClinicas
          clinicas={estabs.map(e => ({
            id: e.id,
            nome: e.nome,
            tipo: e.tipo,
            cidade: e.cidade,
            bairro: e.bairro,
            endereco: e.endereco,
            latitude: e.latitude,
            longitude: e.longitude,
            politica_concorrencia: e.politica_concorrencia,
          }))}
        />
      )}

      {/* Aba: Estabelecimentos (default) — pipeline + KPIs + filtros + cards/lista */}
      {mainTab === 'estabs' && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando...</div>
          ) : (
            <>
              {/* 6 KPIs com gradiente */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Total',         value: metricas.total,           icon: '📊', grad: 'from-blue-500 to-blue-700' },
                  { label: 'Exclusivos',    value: metricas.exclusivos,      icon: '⭐', grad: 'from-violet-500 to-violet-700' },
                  { label: 'Sem visita',    value: metricas.semVisita,       icon: '🆕', grad: 'from-purple-500 to-purple-700', alert: metricas.semVisita > 0 },
                  { label: 'Atrasados',     value: metricas.atrasados,       icon: '⏰', grad: 'from-orange-500 to-orange-700', alert: metricas.atrasados > 0 },
                  { label: 'Sem concorr.',  value: metricas.semConcorrencia, icon: '🎯', grad: 'from-emerald-500 to-emerald-700' },
                  { label: 'Óbitos/mês',    value: metricas.obitosTotais,    icon: '📈', grad: 'from-slate-500 to-slate-700' },
                ].map(kpi => (
                  <div key={kpi.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${kpi.grad} p-3 text-white shadow-sm`}>
                    {kpi.alert && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-pulse" />}
                    <div className="text-xl mb-1">{kpi.icon}</div>
                    <div className="text-xl font-bold leading-tight">{kpi.value}</div>
                    <div className="text-[10px] opacity-90 uppercase tracking-wider">{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Pipeline de Relacionamento */}
              <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wider">Pipeline de Relacionamento</h2>
                  <span className="text-[10px] text-[var(--surface-400)]">{filtrados.length} exibindo</span>
                </div>
                <div className="flex gap-1">
                  {pipeline.map((stage, i) => {
                    const isLast = i === pipeline.length - 1
                    const isFirst = i === 0
                    const clip = isLast
                      ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)'
                      : isFirst
                      ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)'
                      : 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)'
                    const active = statusFiltro === stage.id
                    return (
                      <button
                        key={stage.id}
                        onClick={() => setStatusFiltro(active ? 'todos' : stage.id)}
                        className="flex-1"
                        title={`${stage.label}: ${stage.count}`}
                      >
                        <div
                          className={`h-11 flex items-center justify-center transition-all ${stage.cor} ${
                            active ? 'ring-2 ring-offset-1 ring-[var(--shell-text)]/40' : 'opacity-80 hover:opacity-100'
                          }`}
                          style={{ clipPath: clip }}
                        >
                          <div className="text-white text-center px-1">
                            <div className="text-base font-bold leading-none">{stage.count}</div>
                            <div className="text-[9px] opacity-90 hidden sm:block">{stage.label}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Bloco de filtros */}
              <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] p-3 space-y-3">
                {/* Busca + view mode */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
                    <input
                      type="text"
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Buscar nome, bairro, endereço…"
                      className="w-full pl-8 pr-8 py-1.5 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] focus:outline-none focus:border-cyan-500 text-[var(--shell-text)]"
                    />
                    {busca && (
                      <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--shell-text)]">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <select
                    value={tipoFiltro}
                    onChange={e => setTipoFiltro(e.target.value)}
                    className="px-2 py-1.5 rounded-lg text-xs bg-[var(--surface-50)] border border-[var(--surface-200)] focus:outline-none focus:border-cyan-500 text-[var(--shell-text)]"
                  >
                    <option value="">Todos os tipos</option>
                    {tiposDisponiveis.map(t => <option key={t} value={t}>{tipoLabel(t)}</option>)}
                  </select>
                  <div className="inline-flex bg-[var(--surface-100)] rounded-lg p-0.5">
                    {([['cards', LayoutGrid], ['lista', List]] as const).map(([v, Icon]) => (
                      <button
                        key={v}
                        onClick={() => setViewMode(v)}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          viewMode === v ? 'bg-[var(--surface-0)] text-cyan-600 shadow-sm' : 'text-[var(--surface-400)]'
                        }`}
                        title={v === 'cards' ? 'Grid' : 'Lista'}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chips de cidade */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-[10px] text-[var(--surface-400)] uppercase font-bold shrink-0">Região:</span>
                  {(['todas', ...CIDADES_PRINCIPAIS.filter(c => contagemCidades[c]), ...(outrasCidades.length ? ['outras'] : [])]).map(c => {
                    const active = cidadeFiltro === c
                    const count = c === 'todas' ? estabs.length : c === 'outras' ? outrasCidades.reduce((s, k) => s + contagemCidades[k], 0) : contagemCidades[c]
                    return (
                      <button
                        key={c}
                        onClick={() => setCidadeFiltro(c)}
                        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          active ? 'bg-cyan-600 text-white' : 'bg-[var(--surface-100)] text-[var(--shell-text)] hover:bg-[var(--surface-200)]'
                        }`}
                      >
                        {c === 'todas' ? 'Todas' : c === 'outras' ? `+${outrasCidades.length} outras` : c}
                        {count != null && <span className="ml-1 opacity-70">{count}</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Filtros rápidos */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-[10px] text-[var(--surface-400)] uppercase font-bold shrink-0">Filtro:</span>
                  {[
                    { id: 'todos',        label: 'Todos' },
                    { id: 'oportunidade', label: '🎯 Oportunidade' },
                    { id: 'semVisita',    label: '🆕 Nunca visitado' },
                    { id: 'atrasado',     label: '⏰ Atrasado' },
                  ].map(f => {
                    const active = statusFiltro === f.id
                    return (
                      <button
                        key={f.id}
                        onClick={() => setStatusFiltro(f.id)}
                        className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          active ? 'bg-cyan-600 text-white' : 'bg-[var(--surface-100)] text-[var(--shell-text)] hover:bg-[var(--surface-200)]'
                        }`}
                      >
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Conteúdo: cards ou lista */}
              {filtrados.length === 0 ? (
                <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] py-12 text-center">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-sm text-[var(--surface-500)] mb-1">
                    {estabs.length === 0 ? 'Nenhuma clínica cadastrada nesta unidade.' : 'Nenhum resultado para os filtros atuais.'}
                  </p>
                  {(busca || cidadeFiltro !== 'todas' || statusFiltro !== 'todos' || tipoFiltro) && (
                    <button
                      onClick={() => { setBusca(''); setCidadeFiltro('todas'); setStatusFiltro('todos'); setTipoFiltro('') }}
                      className="text-xs text-cyan-500 hover:underline mt-2 font-medium"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : viewMode === 'lista' ? (
                <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] overflow-hidden divide-y divide-[var(--surface-100)]">
                  {filtrados.map(e => (
                    <EstabRow key={e.id} est={e} getDias={getDias} onStarClick={handleStarClick} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtrados.map(e => (
                    <EstabCard key={e.id} est={e} getDias={getDias} onStarClick={handleStarClick} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// Helper: ícone emoji por tipo
// ============================================
function tipoIcone(t: string | null): string {
  const map: Record<string, string> = {
    clinica: '🏥', hospital: '🏨', pet_shop: '🐾', petshop: '🐾',
    'casa-racao': '🍖', laboratorio: '🔬', autonomo: '👤', veterinario: '🩺', outro: '🏢',
  }
  return t ? (map[t] || '🏢') : '🏢'
}

// ============================================
// Card de Estabelecimento — versão rica com foto, badges, métricas
// ============================================
function EstabCard({ est, getDias, onStarClick }: {
  est: Estabelecimento
  getDias: (d: string | null) => number | null
  onStarClick: (id: string, star: number, current: number) => void
}) {
  const dias = getDias(est.ultima_visita)
  const urgente = dias === null || dias > 30
  const rel = est.relacionamento || 0

  return (
    <Link
      href={`/clinicas/${est.id}`}
      className="group block rounded-2xl overflow-hidden bg-[var(--surface-0)] border border-[var(--surface-200)] hover:border-cyan-500/50 hover:shadow-lg transition-all"
    >
      {/* Capa */}
      <div className="relative h-32 bg-gradient-to-br from-[var(--surface-100)] to-[var(--surface-200)]">
        {est.fotos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={est.fotos[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
            {tipoIcone(est.tipo)}
          </div>
        )}

        {/* Badge tipo + exclusivo */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-start gap-1">
          <span className="px-2 py-0.5 bg-black/50 backdrop-blur-sm text-white text-[10px] rounded-md inline-flex items-center gap-1">
            <span>{tipoIcone(est.tipo)}</span>
            <span className="font-medium">{tipoLabel(est.tipo)}</span>
          </span>
          {est.politica_concorrencia === 'parceiro_exclusivo_nosso' && (
            <span className="px-2 py-0.5 bg-violet-500 text-white text-[10px] rounded-md font-semibold whitespace-nowrap">
              ⭐ Exclusivo
            </span>
          )}
        </div>

        {/* Urgência (canto inf direito) */}
        {urgente && (
          <div className="absolute bottom-2 right-2">
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md text-white shadow ${
              dias === null ? 'bg-purple-500' : dias > 60 ? 'bg-red-500' : 'bg-orange-500'
            }`}>
              {dias === null ? '🆕 Novo' : `⏰ ${dias}d`}
            </span>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-[var(--shell-text)] truncate group-hover:text-cyan-600 transition-colors">
              {est.nome}
            </h3>
            <p className="text-[11px] text-[var(--surface-500)] truncate flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />
              {est.bairro ? `${est.bairro}, ${est.cidade}` : (est.cidade || '—')}
            </p>
          </div>
          {/* Estrelas */}
          <div className="flex gap-0.5 shrink-0" onClick={e => e.preventDefault()}>
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  onStarClick(est.id, s, rel)
                }}
                className={`text-sm transition-transform hover:scale-110 ${
                  s <= rel ? 'text-amber-400' : 'text-[var(--surface-300)]'
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Métricas */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {est.qtde_media_obitos_mensal != null && est.qtde_media_obitos_mensal > 0 && (
            <span className="px-2 py-0.5 bg-slate-500/15 text-slate-600 text-[10px] rounded-md font-medium">
              {est.qtde_media_obitos_mensal} óbitos/mês
            </span>
          )}
          {est.veterinarios_fixos != null && est.veterinarios_fixos > 0 && (
            <span className="px-2 py-0.5 bg-blue-500/15 text-blue-600 text-[10px] rounded-md font-medium">
              {est.veterinarios_fixos} vets
            </span>
          )}
          {(est.concorrentes_presentes?.length || 0) > 0 ? (
            <span className="px-2 py-0.5 bg-red-500/15 text-red-600 text-[10px] rounded-md font-medium">
              {est.concorrentes_presentes!.length} concorr.
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-600 text-[10px] rounded-md font-medium">
              Sem concorrência
            </span>
          )}
          {(est.countIndicacoes || 0) > 0 && (
            <span className="px-2 py-0.5 bg-cyan-500/15 text-cyan-600 text-[10px] rounded-md font-medium">
              {est.countIndicacoes} indic.
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// ============================================
// Row de Estabelecimento — versão compacta lista
// ============================================
function EstabRow({ est, getDias, onStarClick }: {
  est: Estabelecimento
  getDias: (d: string | null) => number | null
  onStarClick: (id: string, star: number, current: number) => void
}) {
  const dias = getDias(est.ultima_visita)
  const rel = est.relacionamento || 0

  return (
    <Link
      href={`/clinicas/${est.id}`}
      className="flex items-center gap-3 p-3 hover:bg-[var(--surface-50)] transition-colors"
    >
      {/* Avatar */}
      <div className="w-11 h-11 rounded-xl bg-[var(--surface-100)] shrink-0 overflow-hidden">
        {est.fotos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={est.fotos[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg opacity-60">
            {tipoIcone(est.tipo)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-sm text-[var(--shell-text)] truncate">{est.nome}</h3>
          {est.politica_concorrencia === 'parceiro_exclusivo_nosso' && (
            <span className="text-violet-500 text-xs">⭐</span>
          )}
        </div>
        <p className="text-[11px] text-[var(--surface-500)] truncate">
          {est.bairro ? `${est.bairro}, ${est.cidade}` : (est.cidade || '—')}
        </p>
      </div>

      {/* Estrelas */}
      <div className="hidden md:flex gap-0.5 shrink-0" onClick={e => e.preventDefault()}>
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              onStarClick(est.id, s, rel)
            }}
            className={`text-sm ${s <= rel ? 'text-amber-400' : 'text-[var(--surface-300)]'}`}
          >
            ★
          </button>
        ))}
      </div>

      {/* Status */}
      <div className="text-right shrink-0 min-w-[60px]">
        {dias === null ? (
          <span className="px-2 py-0.5 bg-purple-500/15 text-purple-600 text-[10px] font-medium rounded-md">🆕 Novo</span>
        ) : dias > 30 ? (
          <span className="px-2 py-0.5 bg-orange-500/15 text-orange-600 text-[10px] font-medium rounded-md">⏰ {dias}d</span>
        ) : (
          <span className="text-[10px] text-[var(--surface-400)]">{dias}d atrás</span>
        )}
      </div>

      <ArrowR className="h-3.5 w-3.5 text-[var(--surface-400)] shrink-0" />
    </Link>
  )
}

// ============================================
// View: Indicações por Mês (lê de contratos.estabelecimento_indicacao_id)
// ============================================
type IndicacaoMes = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  tipo_cremacao: string | null
  data_contrato: string | null
  status: string | null
  estabelecimento_indicacao_id: string | null
  contato_id: string | null
  indicacao_contato: string | null  // fallback texto (quando sem módulo clinicas)
  indicacao_clinica: string | null  // fallback texto
  contato: { nome: string | null } | null
  // Fontes de conhecimento padronizadas pelo operador no processamento
  fonte_conhecimento_ids: string[] | null   // array (versão atual)
  fonte_conhecimento_id: string | null      // single (versão legada, fallback)
  fonte_outro_especificar: string | null    // texto livre quando "Outro"
  // Comissão por indicação (mig 085) — editável inline
  comissao_valor: number | null
  comissao_paga: boolean | null
  // "Como nos conheceu" — vem da ficha original (array JSON + textos auxiliares)
  fichas: Array<{
    como_conheceu: string[] | null
    outro_especificar: string | null
    veterinario_especificar: string | null
  }> | null
}

const MESES_LONGOS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function IndicacoesMesView({ unidadeId, estabsMap, temPadronizacao }: { unidadeId: string; estabsMap: Map<string, string>; temPadronizacao: boolean }) {
  const supabase = createClient()
  const [mesRef, setMesRef] = useState<Date>(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [indicacoes, setIndicacoes] = useState<IndicacaoMes[]>([])
  const [loading, setLoading] = useState(true)
  const [fontesMap, setFontesMap] = useState<Map<string, string>>(new Map())
  const [editando, setEditando] = useState<IndicacaoMes | null>(null)

  // Carrega catálogo de fontes_conhecimento (id → nome) uma vez pra lookup local
  useEffect(() => {
    supabase.from('fontes_conhecimento').select('id, nome').then(({ data }) => {
      if (data) setFontesMap(new Map((data as { id: string; nome: string }[]).map(f => [f.id, f.nome])))
    })
  }, [supabase])

  const ini = useMemo(() => { const d = new Date(mesRef); d.setDate(1); d.setHours(0,0,0,0); return d }, [mesRef])
  const fim = useMemo(() => { const d = new Date(mesRef); d.setMonth(d.getMonth() + 1, 1); d.setHours(0,0,0,0); return d }, [mesRef])

  const carregar = useCallback(async () => {
    setLoading(true)
    // Indicações REAIS vivem em contratos: estabelecimento_indicacao_id = clínica que indicou.
    // Filtra contratos da unidade no mês de referência (data_contrato).
    const iniStr = `${ini.getFullYear()}-${String(ini.getMonth()+1).padStart(2,'0')}-${String(ini.getDate()).padStart(2,'0')}`
    const fimStr = `${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}`
    const { data, error } = await supabase
      .from('contratos')
      .select(`
        id, codigo, pet_nome, tutor_nome, tipo_cremacao,
        data_contrato, status, estabelecimento_indicacao_id, contato_id,
        indicacao_contato, indicacao_clinica,
        fonte_conhecimento_ids, fonte_conhecimento_id, fonte_outro_especificar,
        comissao_valor, comissao_paga,
        contato:contatos(nome),
        fichas(como_conheceu, outro_especificar, veterinario_especificar)
      `)
      .eq('unidade_id', unidadeId)
      .gte('data_contrato', iniStr)
      .lt('data_contrato', fimStr)
      .or('estabelecimento_indicacao_id.not.is.null,indicacao_clinica.not.is.null,indicacao_contato.not.is.null')
      .order('data_contrato', { ascending: false })

    if (error) {
      console.error('Erro indicações mês:', error)
      setIndicacoes([])
    } else {
      setIndicacoes((data || []) as unknown as IndicacaoMes[])
    }
    setLoading(false)
  }, [supabase, unidadeId, ini, fim])

  useEffect(() => { carregar() }, [carregar])

  function irPara(direcao: -1 | 0 | 1) {
    if (direcao === 0) { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setMesRef(d); return }
    const d = new Date(mesRef); d.setMonth(d.getMonth() + direcao); setMesRef(d)
  }

  // Agrupar por clínica de origem.
  // Chave: estabelecimento_indicacao_id (estruturado) OU indicacao_clinica (texto livre fallback).
  // Quando nenhum dos dois, vai pro grupo "Sem clínica de origem".
  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; lista: IndicacaoMes[] }>()
    indicacoes.forEach(i => {
      let key: string
      let nome: string
      if (i.estabelecimento_indicacao_id) {
        key = `estab:${i.estabelecimento_indicacao_id}`
        nome = estabsMap.get(i.estabelecimento_indicacao_id) || `Clínica ${i.estabelecimento_indicacao_id.slice(0,8)}…`
      } else if (i.indicacao_clinica?.trim()) {
        key = `texto:${i.indicacao_clinica.trim().toLowerCase()}`
        nome = i.indicacao_clinica.trim()
      } else {
        key = '__sem__'
        nome = 'Sem clínica de origem (só nome de contato)'
      }
      if (!map.has(key)) map.set(key, { nome, lista: [] })
      map.get(key)!.lista.push(i)
    })
    return Array.from(map.entries()).sort(([keyA, a], [keyB, b]) => {
      if (keyA === '__sem__') return 1
      if (keyB === '__sem__') return -1
      return a.nome.localeCompare(b.nome)
    })
  }, [indicacoes, estabsMap])

  // Totais
  const total = indicacoes.length
  const totalClinicas = grupos.filter(([k]) => k !== '__sem__').length

  const tituloMes = `${MESES_LONGOS[mesRef.getMonth()]} ${mesRef.getFullYear()}`

  return (
    <div>
      {/* Navegação de mês + totais */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => irPara(-1)} className="p-2 rounded-lg hover:bg-[var(--surface-100)] text-[var(--surface-500)]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => irPara(0)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-100)] text-[var(--surface-700)] hover:bg-[var(--surface-200)]">
            Hoje
          </button>
          <button onClick={() => irPara(1)} className="p-2 rounded-lg hover:bg-[var(--surface-100)] text-[var(--surface-500)]">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm font-semibold text-[var(--shell-text)] capitalize">{tituloMes}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-600 font-semibold">{total} indicaç{total === 1 ? 'ão' : 'ões'}</span>
          <span className="px-2 py-1 rounded bg-slate-500/20 text-slate-600 font-semibold">{totalClinicas} clínica{totalClinicas === 1 ? '' : 's'}</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--surface-500)]">Nenhuma indicação em {tituloMes}.</p>
          <p className="text-[10px] text-[var(--surface-400)] mt-2">Considera contratos com clínica de indicação preenchida (estruturada ou texto livre) e data do contrato dentro do mês.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map(([keyEstab, { nome, lista }]) => (
            <div key={keyEstab} className="rounded-xl border border-[var(--surface-200)] overflow-hidden bg-[var(--surface-0)]">
              <div className="flex items-center justify-between px-3 py-2 bg-cyan-500/10 border-b border-[var(--surface-200)]">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-cyan-600" />
                  <span className="text-sm font-semibold text-[var(--shell-text)]">{nome}</span>
                </div>
                <span className="text-[11px] font-semibold text-cyan-600">{lista.length} pet{lista.length === 1 ? '' : 's'}</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-50)] text-[10px] uppercase text-[var(--surface-500)]">
                    <th className="text-left px-3 py-1.5 font-bold">Pet</th>
                    <th className="text-left px-3 py-1.5 font-bold">Tutor</th>
                    <th className="text-left px-3 py-1.5 font-bold">Tipo</th>
                    <th className="text-left px-3 py-1.5 font-bold">Quem indicou</th>
                    <th className="text-left px-3 py-1.5 font-bold">Fonte (padronizada)</th>
                    <th className="text-left px-3 py-1.5 font-bold">Tutor marcou na ficha</th>
                    <th className="text-left px-3 py-1.5 font-bold">Data</th>
                    <th className="text-left px-3 py-1.5 font-bold">Status</th>
                    <th className="text-right px-3 py-1.5 font-bold">Comissão</th>
                    <th className="text-center px-3 py-1.5 font-bold">Pago?</th>
                    {temPadronizacao && <th className="text-center px-3 py-1.5 font-bold">Editar</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(i => (
                    <LinhaIndicacao key={i.id} ind={i} fontesMap={fontesMap} supabase={supabase} podeEditar={temPadronizacao} onEditar={setEditando} />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <EditarIndicacaoModal
          ind={editando}
          unidadeId={unidadeId}
          estabsMap={estabsMap}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); carregar() }}
        />
      )}
    </div>
  )
}

// ============================================
// Modal: editar a indicação de um contrato (clínica + contato) — só unidade com módulo.
// Espelha a lógica da tratativa: autocomplete de estabelecimento e contato, criando
// novos registros no banco se necessário. Atualiza estabelecimento_indicacao_id + contato_id.
// ============================================
function EditarIndicacaoModal({ ind, unidadeId, estabsMap, onClose, onSaved }: {
  ind: IndicacaoMes
  unidadeId: string
  estabsMap: Map<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()

  // Estabelecimento (clínica que indicou)
  const [estabs, setEstabs] = useState<{ id: string; nome: string; cidade: string | null }[]>([])
  const [estabId, setEstabId] = useState<string | null>(ind.estabelecimento_indicacao_id)
  const [estabBusca, setEstabBusca] = useState(
    ind.estabelecimento_indicacao_id ? (estabsMap.get(ind.estabelecimento_indicacao_id) || '') : (ind.indicacao_clinica || '')
  )
  const [estabAberto, setEstabAberto] = useState(false)

  // Contato (pessoa que indicou)
  const [contatos, setContatos] = useState<{ id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }[]>([])
  const [contatoId, setContatoId] = useState<string | null>(ind.contato_id)
  const [contatoBusca, setContatoBusca] = useState(ind.contato?.nome || ind.indicacao_contato || '')
  const [contatoCargo, setContatoCargo] = useState('')
  const [contatoAberto, setContatoAberto] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carrega estabelecimentos da unidade (pro autocomplete + novos criados)
  useEffect(() => {
    supabase.from('estabelecimentos').select('id, nome, cidade').eq('unidade_id', unidadeId).order('nome')
      .then(({ data }) => { if (data) setEstabs(data as { id: string; nome: string; cidade: string | null }[]) })
  }, [supabase, unidadeId])

  // Carrega TODOS os contatos da unidade (não escopa por clínica) — pra poder buscar por nome
  // e ver o estabelecimento vinculado de cada um, igual à ficha.
  useEffect(() => {
    supabase.from('contatos').select('id, nome, cargo, estabelecimento_id').eq('unidade_id', unidadeId).eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setContatos(data as { id: string; nome: string; cargo: string | null; estabelecimento_id: string | null }[]) })
  }, [supabase, unidadeId])

  const estabsFiltrados = useMemo(() => {
    const t = estabBusca.trim().toLowerCase()
    return estabs.filter(e => !t || e.nome.toLowerCase().includes(t)).slice(0, 8)
  }, [estabs, estabBusca])
  // Filtra por nome; com clínica selecionada, prioriza os contatos dessa clínica + sem-clínica no topo.
  const contatosFiltrados = useMemo(() => {
    const t = contatoBusca.trim().toLowerCase()
    let lista = t ? contatos.filter(c => c.nome.toLowerCase().includes(t)) : contatos
    if (estabId) {
      const desse = lista.filter(c => c.estabelecimento_id === estabId)
      const sem = lista.filter(c => !c.estabelecimento_id)
      const outros = lista.filter(c => c.estabelecimento_id && c.estabelecimento_id !== estabId)
      lista = [...desse, ...sem, ...outros]
    }
    return lista.slice(0, 10)
  }, [contatos, contatoBusca, estabId])

  // Resolve o nome do estabelecimento de um contato (pro sub-rótulo). Usa estabs (com cidade) ou o map do pai.
  function nomeEstabDe(estabId: string | null): string | null {
    if (!estabId) return null
    return estabs.find(e => e.id === estabId)?.nome || estabsMap.get(estabId) || null
  }

  // Trocar de clínica NÃO zera o contato (igual ficha) — só re-prioriza a lista.
  function selecionarEstab(id: string | null, nome: string) {
    setEstabId(id); setEstabBusca(nome); setEstabAberto(false)
  }

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      // 1. Resolver estabelecimento — cria se digitou um novo
      let resolvedEstabId = estabId
      if (!resolvedEstabId && estabBusca.trim()) {
        const { data, error } = await supabase
          .from('estabelecimentos')
          .insert({ nome: estabBusca.trim(), tipo: 'clinica', unidade_id: unidadeId } as never)
          .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
        if (error) throw new Error('Erro ao criar clínica: ' + error.message)
        resolvedEstabId = data?.id || null
      }

      // 2. Resolver contato — busca existente, senão cria
      let resolvedContatoId = contatoId
      if (!resolvedContatoId && contatoBusca.trim()) {
        let q = supabase.from('contatos').select('id').ilike('nome', contatoBusca.trim()).limit(1)
        if (resolvedEstabId) q = q.eq('estabelecimento_id', resolvedEstabId)
        const { data: existente } = await q.maybeSingle() as { data: { id: string } | null }
        if (existente) {
          resolvedContatoId = existente.id
        } else {
          const { data, error } = await supabase
            .from('contatos')
            .insert({ nome: contatoBusca.trim(), cargo: contatoCargo || null, estabelecimento_id: resolvedEstabId, unidade_id: unidadeId } as never)
            .select('id').single() as { data: { id: string } | null; error: { message: string } | null }
          if (error) throw new Error('Erro ao criar contato: ' + error.message)
          resolvedContatoId = data?.id || null
        }
      }

      // 3. Atualiza o contrato (FK + espelho texto pra exibição/fallback)
      const { error: errCtr } = await supabase.from('contratos').update({
        estabelecimento_indicacao_id: resolvedEstabId,
        contato_id: resolvedContatoId,
        indicacao_clinica: estabBusca.trim() || null,
        indicacao_contato: contatoBusca.trim() || null,
      } as never).eq('id', ind.id)
      if (errCtr) throw new Error('Erro ao salvar indicação: ' + errCtr.message)

      onSaved()
    } catch (e) {
      console.error(e)
      setErro(e instanceof Error ? e.message : 'Erro ao salvar')
      setSalvando(false)
    }
  }

  const contatoIsNovo = !contatoId && !!contatoBusca.trim() && !contatos.some(c => c.nome.toLowerCase() === contatoBusca.trim().toLowerCase())
  const CARGOS: { v: string; label: string }[] = [
    { v: '', label: 'Sem cargo' },
    { v: 'veterinario', label: 'Veterinário(a)' },
    { v: 'recepcionista', label: 'Recepcionista' },
    { v: 'gerente', label: 'Gerente' },
    { v: 'proprietario', label: 'Proprietário(a)' },
    { v: 'outro', label: 'Outro' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !salvando && onClose()}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md bg-[var(--surface-0)] border border-[var(--surface-200)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)]">
          <h3 className="text-sm font-semibold text-[var(--shell-text)]">Editar indicação · {ind.pet_nome || '—'}</h3>
          <button onClick={onClose} disabled={salvando} className="p-1 rounded hover:bg-[var(--surface-100)] text-[var(--surface-500)]"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Clínica de indicação */}
          <div className="relative">
            <label className="block text-xs font-medium text-[var(--surface-500)] mb-1">Clínica de indicação</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
              <input
                value={estabBusca}
                onChange={e => { setEstabBusca(e.target.value); setEstabId(null); setEstabAberto(true) }}
                onFocus={() => setEstabAberto(true)}
                placeholder="Buscar ou criar clínica..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none focus:border-cyan-500"
              />
            </div>
            {estabAberto && (estabsFiltrados.length > 0 || estabBusca.trim()) && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                {estabsFiltrados.map(e => (
                  <button key={e.id} type="button" onClick={() => selecionarEstab(e.id, e.nome)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] flex items-center justify-between ${estabId === e.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                    <span>{e.nome}</span>{e.cidade && <span className="text-xs text-[var(--surface-400)]">{e.cidade}</span>}
                  </button>
                ))}
                {estabBusca.trim() && !estabs.some(e => e.nome.toLowerCase() === estabBusca.trim().toLowerCase()) && (
                  <button type="button" onClick={() => { setEstabId(null); setEstabAberto(false); setContatoId(null); setContatoBusca('') }}
                    className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-500/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                    <Plus className="h-3.5 w-3.5" />Criar &quot;{estabBusca.trim()}&quot;
                  </button>
                )}
              </div>
            )}
            {estabId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Clínica cadastrada</p>}
            {!estabId && estabBusca.trim() && !estabAberto && <p className="mt-1 text-xs text-amber-500">Nova clínica será criada</p>}
          </div>

          {/* Contato que indicou */}
          <div className="relative">
            <label className="block text-xs font-medium text-[var(--surface-500)] mb-1">Contato que indicou</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--surface-400)]" />
              <input
                value={contatoBusca}
                onChange={e => { setContatoBusca(e.target.value); setContatoId(null); setContatoAberto(true) }}
                onFocus={() => setContatoAberto(true)}
                placeholder="Buscar contato ou digitar um novo..."
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none focus:border-cyan-500"
              />
            </div>
            {contatoAberto && (contatosFiltrados.length > 0 || contatoBusca.trim()) && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--surface-0)] border border-[var(--surface-200)] rounded-lg shadow-lg">
                {contatosFiltrados.map(c => (
                  <button key={c.id} type="button" onClick={() => {
                    setContatoId(c.id); setContatoBusca(c.nome); setContatoAberto(false)
                    // Auto-preenche a clínica do contato se nenhuma estiver selecionada (igual ficha)
                    if (c.estabelecimento_id && !estabId) {
                      const nome = nomeEstabDe(c.estabelecimento_id)
                      if (nome) { setEstabId(c.estabelecimento_id); setEstabBusca(nome) }
                    }
                  }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-50)] flex flex-col ${contatoId === c.id ? 'bg-[var(--surface-50)] font-medium' : 'text-[var(--surface-600)]'}`}>
                    <span>{c.nome}</span>
                    {(() => { const sub = [c.cargo, nomeEstabDe(c.estabelecimento_id)].filter(Boolean).join(' · '); return sub ? <span className="text-[11px] text-[var(--surface-400)]">{sub}</span> : null })()}
                  </button>
                ))}
                {contatoBusca.trim() && !contatos.some(c => c.nome.toLowerCase() === contatoBusca.trim().toLowerCase()) && (
                  <button type="button" onClick={() => setContatoAberto(false)}
                    className="w-full text-left px-3 py-2 text-sm text-amber-500 hover:bg-amber-500/10 flex items-center gap-2 border-t border-[var(--surface-100)]">
                    <Plus className="h-3.5 w-3.5" />Criar &quot;{contatoBusca.trim()}&quot;
                  </button>
                )}
              </div>
            )}
            {contatoId && <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Contato cadastrado</p>}
            {/* Cargo só ao criar contato novo */}
            {contatoIsNovo && (
              <div className="mt-2">
                <label className="block text-[10px] uppercase text-[var(--surface-400)] mb-1">Cargo do novo contato</label>
                <select value={contatoCargo} onChange={e => setContatoCargo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] text-[var(--shell-text)] outline-none">
                  {CARGOS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {erro && <p className="text-xs text-red-500">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--surface-200)]">
          <button onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-lg text-sm text-[var(--surface-500)] hover:bg-[var(--surface-100)] disabled:opacity-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 inline-flex items-center gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// View: Visitas — listagem cross-clínicas com filtros
// ============================================
type VisitaResumo = {
  id: string
  estabelecimento_id: string | null
  data_visita: string | null
  data_proximo_contato: string | null
  duracao_minutos: number | null
  tipo_visita: string | null
  status: string | null
  temperatura_pos_visita: string | null
  contato_realizado: string | null
  cargo_contato: string | null
  objetivo: string | null
  observacoes: string | null
  proximos_passos: string | null
  potencial_negocio: string | null
}

function VisitasView({ unidadeId, estabsMap }: { unidadeId: string; estabsMap: Map<string, string> }) {
  const supabase = createClient()
  const [visitas, setVisitas] = useState<VisitaResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'todas' | '30d' | '90d' | 'futuras'>('30d')
  const [statusFiltro, setStatusFiltro] = useState<string>('')

  const carregar = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('visitas')
      .select('id, estabelecimento_id, data_visita, data_proximo_contato, duracao_minutos, tipo_visita, status, temperatura_pos_visita, contato_realizado, cargo_contato, objetivo, observacoes, proximos_passos, potencial_negocio')
      .eq('unidade_id', unidadeId)
      .order('data_visita', { ascending: false })
      .limit(200)
    if (periodo !== 'todas') {
      const agora = new Date()
      if (periodo === '30d') {
        const dias30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
        q = q.gte('data_visita', dias30.toISOString())
      } else if (periodo === '90d') {
        const dias90 = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000)
        q = q.gte('data_visita', dias90.toISOString())
      } else if (periodo === 'futuras') {
        q = q.gte('data_visita', agora.toISOString()).eq('status', 'agendada')
      }
    }
    if (statusFiltro) q = q.eq('status', statusFiltro)
    const { data, error } = await q
    if (error) {
      console.error('Erro visitas:', error)
      setVisitas([])
    } else {
      setVisitas((data || []) as VisitaResumo[])
    }
    setLoading(false)
  }, [supabase, unidadeId, periodo, statusFiltro])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value as typeof periodo)}
          className="px-2 py-1.5 rounded-lg text-xs bg-[var(--surface-100)] border border-[var(--surface-200)] focus:outline-none focus:border-cyan-500 text-[var(--shell-text)]"
        >
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="futuras">Agendadas futuras</option>
          <option value="todas">Todas</option>
        </select>
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          className="px-2 py-1.5 rounded-lg text-xs bg-[var(--surface-100)] border border-[var(--surface-200)] focus:outline-none focus:border-cyan-500 text-[var(--shell-text)]"
        >
          <option value="">Qualquer status</option>
          <option value="realizada">Realizada</option>
          <option value="agendada">Agendada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <span className="ml-auto px-2 py-1 rounded bg-cyan-500/20 text-cyan-600 text-[11px] font-semibold">
          {visitas.length} visita{visitas.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando…</div>
      ) : visitas.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-[var(--surface-500)]">Nenhuma visita encontrada com esses filtros.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visitas.map(v => {
            const nomeClinica = v.estabelecimento_id ? (estabsMap.get(v.estabelecimento_id) || 'Clínica removida') : '—'
            const corStatus =
              v.status === 'agendada' ? 'bg-blue-500/20 text-blue-600' :
              v.status === 'cancelada' ? 'bg-red-500/20 text-red-600' :
              'bg-green-500/20 text-green-600'
            return (
              <Link
                key={v.id}
                href={v.estabelecimento_id ? `/clinicas/${v.estabelecimento_id}` : '#'}
                className="block p-3 border border-[var(--surface-200)] rounded-lg bg-[var(--surface-0)] hover:bg-[var(--surface-50)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-[var(--shell-text)]">{nomeClinica}</p>
                      {v.status && <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${corStatus}`}>{v.status}</span>}
                      {v.tipo_visita && <span className="text-[10px] text-[var(--surface-500)]">{v.tipo_visita}</span>}
                    </div>
                    <p className="text-xs text-[var(--surface-500)] mt-0.5">
                      {v.data_visita ? new Date(v.data_visita).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      {v.duracao_minutos != null && ` · ${v.duracao_minutos} min`}
                      {v.contato_realizado && ` · com ${v.contato_realizado}`}
                    </p>
                    {v.objetivo && <p className="text-xs text-[var(--surface-600)] mt-1">{v.objetivo}</p>}
                    {v.proximos_passos && <p className="text-xs text-blue-600 mt-1">→ {v.proximos_passos}</p>}
                  </div>
                  {v.temperatura_pos_visita && (
                    <span className="text-lg" title={v.temperatura_pos_visita}>
                      {v.temperatura_pos_visita === 'quente' ? '🔥' : v.temperatura_pos_visita === 'morno' ? '🌤️' : '❄️'}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================
// View: Dashboard Comercial — 6 KPIs + rankings
// ============================================
type DashboardData = {
  totalClinicas: number
  visitas30d: number
  visitas90d: number
  indicacoes30d: number
  petsRemovidos30d: number
  semVisita30dPlus: number
  topClinicas: Array<{ id: string; nome: string; total: number }>
  porPolitica: Record<string, number>
  porTemperatura: Record<string, number>
}

const POLITICA_LABELS: Record<string, string> = {
  aberto_todos: 'Aberto a todos',
  seletivo: 'Seletivo',
  parceiro_exclusivo_nosso: 'Exclusivo conosco',
  parceiro_exclusivo_outro: 'Exclusivo com outro',
  nao_indica: 'Não indica',
}

function DashboardView({ unidadeId, estabs }: { unidadeId: string; estabs: Estabelecimento[] }) {
  const supabase = createClient()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const agora = new Date()
    const dias30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const dias90 = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const data30Str = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [vis30, vis90, ind30, pets30, vis90PorEstab] = await Promise.all([
      supabase.from('visitas').select('id', { count: 'exact', head: true }).eq('unidade_id', unidadeId).gte('data_visita', dias30),
      supabase.from('visitas').select('id', { count: 'exact', head: true }).eq('unidade_id', unidadeId).gte('data_visita', dias90),
      supabase.from('contratos').select('id', { count: 'exact', head: true }).eq('unidade_id', unidadeId).gte('data_contrato', data30Str).not('estabelecimento_indicacao_id', 'is', null),
      supabase.from('contratos').select('id', { count: 'exact', head: true }).eq('unidade_id', unidadeId).gte('data_contrato', data30Str).not('estabelecimento_id', 'is', null),
      supabase.from('contratos').select('estabelecimento_indicacao_id').eq('unidade_id', unidadeId).gte('data_contrato', new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).not('estabelecimento_indicacao_id', 'is', null),
    ])

    // Top 5 clínicas (90 dias)
    const contagem = new Map<string, number>()
    ;((vis90PorEstab.data || []) as { estabelecimento_indicacao_id: string }[]).forEach(r => {
      contagem.set(r.estabelecimento_indicacao_id, (contagem.get(r.estabelecimento_indicacao_id) || 0) + 1)
    })
    const estabMap = new Map(estabs.map(e => [e.id, e.nome]))
    const topClinicas = Array.from(contagem.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, total]) => ({ id, nome: estabMap.get(id) || 'Removida', total }))

    // Sem visita há 30 dias
    const semVisita30dPlus = estabs.filter(e => {
      if (!e.ultima_visita) return true
      return new Date(e.ultima_visita).getTime() < agora.getTime() - 30 * 24 * 60 * 60 * 1000
    }).length

    // Distribuição por política
    const porPolitica: Record<string, number> = {}
    estabs.forEach(e => {
      const k = e.politica_concorrencia || 'sem_politica'
      porPolitica[k] = (porPolitica[k] || 0) + 1
    })

    // Para temperatura precisa de uma query agregada sobre visitas (última visita por estab)
    const { data: tempData } = await supabase
      .from('visitas')
      .select('estabelecimento_id, temperatura_pos_visita, data_visita')
      .eq('unidade_id', unidadeId)
      .gte('data_visita', dias90)
      .not('temperatura_pos_visita', 'is', null)

    const ultTempPorEstab = new Map<string, { temp: string; data: string }>()
    ;((tempData || []) as { estabelecimento_id: string; temperatura_pos_visita: string; data_visita: string }[]).forEach(v => {
      const cur = ultTempPorEstab.get(v.estabelecimento_id)
      if (!cur || v.data_visita > cur.data) ultTempPorEstab.set(v.estabelecimento_id, { temp: v.temperatura_pos_visita, data: v.data_visita })
    })
    const porTemperatura: Record<string, number> = { quente: 0, morno: 0, frio: 0 }
    ultTempPorEstab.forEach(({ temp }) => {
      if (porTemperatura[temp] != null) porTemperatura[temp]++
    })

    setData({
      totalClinicas: estabs.length,
      visitas30d: vis30.count || 0,
      visitas90d: vis90.count || 0,
      indicacoes30d: ind30.count || 0,
      petsRemovidos30d: pets30.count || 0,
      semVisita30dPlus,
      topClinicas,
      porPolitica,
      porTemperatura,
    })
    setLoading(false)
  }, [supabase, unidadeId, estabs])

  useEffect(() => { carregar() }, [carregar])

  if (loading || !data) {
    return <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando dashboard…</div>
  }

  const taxaConversao = data.visitas30d > 0 ? Math.round((data.indicacoes30d / data.visitas30d) * 100) : 0

  return (
    <div className="space-y-4">
      {/* 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Clínicas ativas" value={data.totalClinicas} cor="cyan" />
        <KPI label="Visitas 30d" value={data.visitas30d} sub={`${data.visitas90d} nos 90d`} cor="blue" />
        <KPI label="Indicações 30d" value={data.indicacoes30d} cor="green" />
        <KPI label="Pets removidos 30d" value={data.petsRemovidos30d} cor="orange" />
        <KPI label="Conversão (ind/vis)" value={`${taxaConversao}%`} cor="purple" sub="aproximada" />
        <KPI label="S/ visita há 30d+" value={data.semVisita30dPlus} cor={data.semVisita30dPlus > 5 ? 'red' : 'amber'} alerta={data.semVisita30dPlus > 5} />
      </div>

      {/* Top 5 + distribuições */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Top 5 clínicas */}
        <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] p-4">
          <h3 className="text-sm font-bold text-[var(--shell-text)] mb-3">🏆 Top 5 clínicas (90d)</h3>
          {data.topClinicas.length === 0 ? (
            <p className="text-xs text-[var(--surface-400)]">Sem indicações nos últimos 90 dias.</p>
          ) : (
            <div className="space-y-2">
              {data.topClinicas.map((c, idx) => {
                const max = data.topClinicas[0]?.total || 1
                const pct = (c.total / max) * 100
                return (
                  <Link
                    key={c.id}
                    href={`/clinicas/${c.id}`}
                    className="block group"
                  >
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-medium text-[var(--shell-text)] group-hover:text-cyan-600 truncate">
                        {idx + 1}. {c.nome}
                      </span>
                      <span className="font-bold text-cyan-600">{c.total}</span>
                    </div>
                    <div className="h-2 bg-[var(--surface-100)] rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Distribuição por política */}
        <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] p-4">
          <h3 className="text-sm font-bold text-[var(--shell-text)] mb-3">🎯 Política de concorrência</h3>
          <div className="space-y-2">
            {Object.entries(data.porPolitica).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
              const pct = data.totalClinicas > 0 ? (v / data.totalClinicas) * 100 : 0
              const label = POLITICA_LABELS[k] || 'Sem política definida'
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-[var(--shell-text)]">{label}</span>
                    <span className="font-bold text-[var(--surface-500)]">{v} <span className="text-[10px] font-normal">({Math.round(pct)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-[var(--surface-100)] rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${
                      k === 'parceiro_exclusivo_nosso' ? 'bg-green-500' :
                      k === 'parceiro_exclusivo_outro' ? 'bg-red-500' :
                      k === 'aberto_todos' ? 'bg-blue-500' :
                      k === 'seletivo' ? 'bg-yellow-500' :
                      k === 'nao_indica' ? 'bg-slate-500' :
                      'bg-[var(--surface-300)]'
                    }`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Temperatura */}
      <div className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-0)] p-4">
        <h3 className="text-sm font-bold text-[var(--shell-text)] mb-3">🌡️ Temperatura da carteira (90d)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <div className="text-3xl">🔥</div>
            <div className="text-2xl font-bold text-red-600">{data.porTemperatura.quente || 0}</div>
            <div className="text-[10px] text-[var(--surface-500)] uppercase font-semibold">Quentes</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="text-3xl">🌤️</div>
            <div className="text-2xl font-bold text-yellow-600">{data.porTemperatura.morno || 0}</div>
            <div className="text-[10px] text-[var(--surface-500)] uppercase font-semibold">Mornos</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <div className="text-3xl">❄️</div>
            <div className="text-2xl font-bold text-blue-600">{data.porTemperatura.frio || 0}</div>
            <div className="text-[10px] text-[var(--surface-500)] uppercase font-semibold">Frios</div>
          </div>
        </div>
        <p className="text-[10px] text-[var(--surface-400)] text-center mt-2">
          Considera a temperatura da última visita registrada em cada clínica nos últimos 90 dias.
        </p>
      </div>
    </div>
  )
}

function KPI({ label, value, sub, cor, alerta }: { label: string; value: number | string; sub?: string; cor: string; alerta?: boolean }) {
  const corMap: Record<string, string> = {
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
  }
  const corText: Record<string, string> = {
    cyan: 'text-cyan-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  }
  return (
    <div className={`p-3 rounded-xl border ${corMap[cor] || corMap.cyan}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase font-bold text-[var(--surface-500)]">{label}</p>
        {alerta && <span className="text-xs">⚠️</span>}
      </div>
      <p className={`text-2xl font-bold ${corText[cor] || corText.cyan} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--surface-400)]">{sub}</p>}
    </div>
  )
}

// ============================================
// Linha da tabela de indicações — edição inline de comissão_valor e comissão_paga
// ============================================
function LinhaIndicacao({ ind, fontesMap, supabase, podeEditar, onEditar }: {
  ind: IndicacaoMes
  fontesMap: Map<string, string>
  supabase: ReturnType<typeof createClient>
  podeEditar: boolean
  onEditar: (ind: IndicacaoMes) => void
}) {
  const [valor, setValor] = useState<string>(ind.comissao_valor != null ? String(ind.comissao_valor) : '')
  const [paga, setPaga] = useState<boolean>(!!ind.comissao_paga)
  const [salvando, setSalvando] = useState(false)

  const quemIndicou = ind.contato?.nome || ind.indicacao_contato || '—'
  const tipo = ind.tipo_cremacao === 'individual' ? 'IND' : ind.tipo_cremacao === 'coletiva' ? 'COL' : ''
  const ficha = ind.fichas?.[0]
  const comoConheceu = (() => {
    if (!ficha) return null
    const partes: string[] = []
    if (ficha.como_conheceu && ficha.como_conheceu.length > 0) partes.push(ficha.como_conheceu.join(', '))
    if (ficha.veterinario_especificar) partes.push(`Vet: ${ficha.veterinario_especificar}`)
    if (ficha.outro_especificar) partes.push(`Outro: ${ficha.outro_especificar}`)
    return partes.length > 0 ? partes.join(' · ') : null
  })()
  const fontePadronizada = (() => {
    const ids = (ind.fonte_conhecimento_ids && ind.fonte_conhecimento_ids.length > 0)
      ? ind.fonte_conhecimento_ids
      : (ind.fonte_conhecimento_id ? [ind.fonte_conhecimento_id] : [])
    const nomes = ids.map(id => fontesMap.get(id)).filter(Boolean) as string[]
    const partes: string[] = []
    if (nomes.length > 0) partes.push(nomes.join(', '))
    if (ind.fonte_outro_especificar) partes.push(`Outro: ${ind.fonte_outro_especificar}`)
    return partes.length > 0 ? partes.join(' · ') : null
  })()

  async function salvarValor() {
    const limpo = valor.replace(',', '.').trim()
    const num = limpo === '' ? null : parseFloat(limpo)
    if (limpo !== '' && (num === null || isNaN(num))) {
      // input inválido — restaura ao último salvo
      setValor(ind.comissao_valor != null ? String(ind.comissao_valor) : '')
      return
    }
    if (num === ind.comissao_valor) return
    setSalvando(true)
    const { error } = await supabase.from('contratos').update({ comissao_valor: num } as never).eq('id', ind.id)
    if (error) {
      console.error('Erro ao salvar comissao_valor:', error)
      alert('Erro ao salvar o valor da comissão.')
    } else {
      ind.comissao_valor = num
    }
    setSalvando(false)
  }

  async function togglePaga() {
    const novo = !paga
    setPaga(novo)
    setSalvando(true)
    const { error } = await supabase.from('contratos').update({ comissao_paga: novo } as never).eq('id', ind.id)
    if (error) {
      console.error('Erro ao salvar comissao_paga:', error)
      setPaga(!novo)
      alert('Erro ao atualizar status do pagamento.')
    } else {
      ind.comissao_paga = novo
    }
    setSalvando(false)
  }

  return (
    <tr className={`border-t border-[var(--surface-100)] hover:bg-[var(--surface-50)] ${paga ? 'bg-green-500/5' : ''}`}>
      <td className="px-3 py-1.5 font-medium text-[var(--shell-text)]">{ind.pet_nome || '—'}</td>
      <td className="px-3 py-1.5 text-[var(--surface-600)]">{ind.tutor_nome || '—'}</td>
      <td className="px-3 py-1.5">
        {tipo && (
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${tipo === 'IND' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-purple-500/20 text-purple-600'}`}>
            {tipo}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-[var(--surface-600)]">{quemIndicou}</td>
      <td className="px-3 py-1.5 text-[var(--surface-500)]" title={fontePadronizada || ''}>{fontePadronizada || '—'}</td>
      <td className="px-3 py-1.5 text-[var(--surface-500)]" title={comoConheceu || ''}>{comoConheceu || '—'}</td>
      <td className="px-3 py-1.5 text-[var(--surface-500)]">
        {ind.data_contrato ? new Date(ind.data_contrato + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
      </td>
      <td className="px-3 py-1.5">
        {ind.status && <StatusBadge status={ind.status} />}
      </td>
      {/* Comissão (input inline) */}
      <td className="px-2 py-1">
        <div className="flex items-center justify-end gap-1">
          <span className="text-[10px] text-[var(--surface-400)]">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={salvarValor}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="0,00"
            disabled={salvando}
            className="w-16 px-1.5 py-0.5 text-xs text-right text-mono rounded border border-[var(--surface-200)] bg-[var(--surface-0)] focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
        </div>
      </td>
      {/* Pago? (toggle) */}
      <td className="px-2 py-1 text-center">
        <button
          type="button"
          onClick={togglePaga}
          disabled={salvando}
          title={paga ? 'Pago — clique pra reverter' : 'Marcar como pago'}
          className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors disabled:opacity-50 ${
            paga
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-[var(--surface-100)] border border-[var(--surface-300)] text-[var(--surface-400)] hover:bg-[var(--surface-200)]'
          }`}
        >
          {paga ? '✓' : ''}
        </button>
      </td>
      {/* Editar indicação (só unidade com módulo) */}
      {podeEditar && (
        <td className="px-2 py-1 text-center">
          <button
            type="button"
            onClick={() => onEditar(ind)}
            title="Editar clínica/contato da indicação"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--surface-400)] hover:bg-[var(--surface-200)] hover:text-cyan-600 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cores: Record<string, string> = {
    preventivo: 'bg-yellow-500/20 text-yellow-600',
    ativo: 'bg-red-500/20 text-red-600',
    pinda: 'bg-orange-500/20 text-orange-600',
    retorno: 'bg-purple-500/20 text-purple-600',
    pendente: 'bg-amber-500/20 text-amber-600',
    finalizado: 'bg-slate-500/20 text-slate-600',
  }
  const cls = cores[status] || 'bg-slate-500/20 text-slate-600'
  return <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cls}`}>{status}</span>
}
