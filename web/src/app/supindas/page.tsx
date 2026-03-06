'use client'

import { useEffect, useState } from 'react'
import { Route, Plus, ChevronDown, ChevronUp, Truck, CheckCircle2, Clock, X, FileImage } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import FichasBatchModal from '@/components/supindas/FichasBatchModal'

type Contrato = {
  id: string
  codigo: string
  pet_nome: string
  pet_peso: number | null
  tutor_nome: string
  status: string
  tipo_cremacao: 'individual' | 'coletiva'
  cinzas_recebidas: boolean
  certificado_recebido: boolean
}

type SupindaItem = {
  id: string
  descricao: string
  tipo: 'levar' | 'retornar'
  feito: boolean
}

type Supinda = {
  id: string
  numero: number
  data: string
  responsavel: string | null
  status: 'planejada' | 'em_andamento' | 'retornada' | null
  quantidade_pets: number | null
  peso_total: number | null
  observacoes: string | null
  contratos?: Contrato[]
  itens?: SupindaItem[]
}

type StatusCount = {
  planejada: number
  em_andamento: number
  retornada: number
}

const STATUS_CONFIG = {
  planejada: { label: 'Planejadas', icon: Clock, color: 'amber', bgClass: 'bg-amber-500', textClass: 'text-amber-400', bgLightClass: 'bg-amber-900/30' },
  em_andamento: { label: 'Em Andamento', icon: Truck, color: 'blue', bgClass: 'bg-blue-500', textClass: 'text-blue-400', bgLightClass: 'bg-blue-900/30' },
  retornada: { label: 'Retornadas', icon: CheckCircle2, color: 'green', bgClass: 'bg-green-500', textClass: 'text-green-400', bgLightClass: 'bg-green-900/30' },
}

export default function SupindasPage() {
  const [supindas, setSupindas] = useState<Supinda[]>([])
  const [statusCounts, setStatusCounts] = useState<StatusCount>({ planejada: 0, em_andamento: 0, retornada: 0 })
  const [filtroStatus, setFiltroStatus] = useState<'planejada' | 'em_andamento' | 'retornada' | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])

  // Modal criar supinda
  const [criarModal, setCriarModal] = useState(false)
  const [novaSupindaForm, setNovaSupindaForm] = useState({
    data: '',
    responsavel: '',
    observacoes: '',
  })
  const [salvando, setSalvando] = useState(false)

  // Modal fichas em lote
  const [fichasModal, setFichasModal] = useState<{ id: string; numero: number } | null>(null)

  // Modal adicionar/editar item avulso
  const [itemModal, setItemModal] = useState<string | null>(null) // supinda_id
  const [novoItemTexto, setNovoItemTexto] = useState('')
  const [novoItemTipo, setNovoItemTipo] = useState<'levar' | 'retornar'>('levar')
  const [editandoItemId, setEditandoItemId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    carregarDados()
    carregarFuncionarios()
  }, [])

  useEffect(() => {
    carregarSupindas()
  }, [filtroStatus])

  async function carregarFuncionarios() {
    const { data } = await supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')

    if (data) setFuncionarios(data)
  }

  async function carregarDados() {
    // Carregar contagens
    const statusList = ['planejada', 'em_andamento', 'retornada'] as const
    const counts: StatusCount = { planejada: 0, em_andamento: 0, retornada: 0 }

    const promises = statusList.map(async (status) => {
      const { count } = await supabase
        .from('supindas')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
      return { status, count: count || 0 }
    })

    const results = await Promise.all(promises)
    results.forEach(({ status, count }) => {
      counts[status] = count
    })

    setStatusCounts(counts)
    await carregarSupindas()
  }

  async function carregarSupindas() {
    setLoading(true)

    let query = supabase
      .from('supindas')
      .select('*')
      .order('data', { ascending: false })
      .limit(500)

    if (filtroStatus) {
      query = query.eq('status', filtroStatus)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar supindas:', error)
    } else {
      setSupindas((data || []) as Supinda[])
    }

    setLoading(false)
  }

  async function carregarContratosEItens(supindaId: string) {
    const [contratosRes, itensRes] = await Promise.all([
      supabase
        .from('contratos')
        .select('id, codigo, pet_nome, pet_peso, tutor_nome, status, tipo_cremacao, cinzas_recebidas, certificado_recebido')
        .eq('supinda_id', supindaId)
        .order('pet_nome'),
      supabase
        .from('supinda_itens')
        .select('id, descricao, tipo, feito')
        .eq('supinda_id', supindaId)
        .order('created_at'),
    ])

    setSupindas(prev => prev.map(s => {
      if (s.id !== supindaId) return s
      return {
        ...s,
        contratos: (contratosRes.data || []) as Contrato[],
        itens: (itensRes.data || []) as SupindaItem[],
      }
    }))
  }

  function toggleExpandir(supindaId: string) {
    if (expandida === supindaId) {
      setExpandida(null)
    } else {
      setExpandida(supindaId)
      const supinda = supindas.find(s => s.id === supindaId)
      if (supinda && !supinda.contratos) {
        carregarContratosEItens(supindaId)
      }
    }
  }

  async function salvarItem(supindaId: string) {
    if (!novoItemTexto.trim()) return

    if (editandoItemId) {
      // Editar existente
      const { error } = await supabase
        .from('supinda_itens')
        .update({ descricao: novoItemTexto.trim(), tipo: novoItemTipo } as never)
        .eq('id', editandoItemId)

      if (!error) {
        setSupindas(prev => prev.map(s => {
          if (s.id !== supindaId || !s.itens) return s
          return { ...s, itens: s.itens.map(i => i.id === editandoItemId ? { ...i, descricao: novoItemTexto.trim(), tipo: novoItemTipo } : i) }
        }))
      }
    } else {
      // Criar novo
      const { data, error } = await supabase
        .from('supinda_itens')
        .insert({ supinda_id: supindaId, descricao: novoItemTexto.trim(), tipo: novoItemTipo } as never)
        .select('id, descricao, tipo, feito')
        .single()

      if (!error && data) {
        setSupindas(prev => prev.map(s => {
          if (s.id !== supindaId) return s
          return { ...s, itens: [...(s.itens || []), data as SupindaItem] }
        }))
      }
    }

    setNovoItemTexto('')
    setNovoItemTipo('levar')
    setEditandoItemId(null)
    setItemModal(null)
  }

  async function toggleItemFeito(supindaId: string, itemId: string, valorAtual: boolean) {
    setSupindas(prev => prev.map(s => {
      if (s.id !== supindaId || !s.itens) return s
      return { ...s, itens: s.itens.map(i => i.id === itemId ? { ...i, feito: !valorAtual } : i) }
    }))

    await supabase
      .from('supinda_itens')
      .update({ feito: !valorAtual } as never)
      .eq('id', itemId)
  }

  async function removerItem(supindaId: string, itemId: string) {
    await supabase
      .from('supinda_itens')
      .delete()
      .eq('id', itemId)

    setSupindas(prev => prev.map(s => {
      if (s.id !== supindaId || !s.itens) return s
      return { ...s, itens: s.itens.filter(i => i.id !== itemId) }
    }))
  }

  async function marcarEmAndamento(supindaId: string) {
    const { error } = await supabase
      .from('supindas')
      .update({ status: 'em_andamento' } as never)
      .eq('id', supindaId)

    if (!error) {
      // Atualizar contratos para status 'pinda'
      await supabase
        .from('contratos')
        .update({ status: 'pinda' } as never)
        .eq('supinda_id', supindaId)

      // Recarregar dados
      await carregarDados()
    }
  }

  async function marcarRetornada(supindaId: string) {
    const { error } = await supabase
      .from('supindas')
      .update({ status: 'retornada' } as never)
      .eq('id', supindaId)

    if (!error) {
      // Atualizar contratos para status 'retorno'
      await supabase
        .from('contratos')
        .update({ status: 'retorno' } as never)
        .eq('supinda_id', supindaId)

      // Recarregar dados
      await carregarDados()
    }
  }

  // Calcula próximos sábado e domingo
  function getProximoFimDeSemana() {
    const hoje = new Date()
    const diaSemana = hoje.getDay()

    const diasAteSabado = diaSemana === 6 ? 7 : (6 - diaSemana)
    const proxSabado = new Date(hoje)
    proxSabado.setDate(hoje.getDate() + diasAteSabado)

    const diasAteDomingo = diaSemana === 0 ? 7 : (7 - diaSemana)
    const proxDomingo = new Date(hoje)
    proxDomingo.setDate(hoje.getDate() + diasAteDomingo)

    return {
      sabado: proxSabado.toISOString().split('T')[0],
      domingo: proxDomingo.toISOString().split('T')[0],
      hoje: hoje.toISOString().split('T')[0],
    }
  }

  async function criarSupinda() {
    if (!novaSupindaForm.data) return
    setSalvando(true)

    try {
      // Buscar próximo número
      const { data: ultimaSupinda } = await supabase
        .from('supindas')
        .select('numero')
        .order('numero', { ascending: false })
        .limit(1)
        .single()

      const resultado = ultimaSupinda as { numero: number } | null
      const proximoNumero = (resultado?.numero || 0) + 1

      const { error } = await supabase
        .from('supindas')
        .insert({
          numero: proximoNumero,
          data: novaSupindaForm.data,
          responsavel: novaSupindaForm.responsavel || null,
          observacoes: novaSupindaForm.observacoes || null,
          status: 'planejada',
          quantidade_pets: 0,
          peso_total: 0,
        } as never)

      if (error) throw error

      setCriarModal(false)
      setNovaSupindaForm({ data: '', responsavel: '', observacoes: '' })
      await carregarDados()
    } catch (err) {
      console.error('Erro ao criar supinda:', err)
      console.error('Erro ao criar supinda:', err)
    }

    setSalvando(false)
  }

  async function toggleContratoCheck(supindaId: string, contratoId: string, campo: 'cinzas_recebidas' | 'certificado_recebido', valorAtual: boolean) {
    // Atualizar local imediatamente
    setSupindas(prev => prev.map(s => {
      if (s.id !== supindaId || !s.contratos) return s
      return {
        ...s,
        contratos: s.contratos.map(c =>
          c.id === contratoId ? { ...c, [campo]: !valorAtual } : c
        )
      }
    }))

    // Salvar no banco
    await supabase
      .from('contratos')
      .update({ [campo]: !valorAtual } as never)
      .eq('id', contratoId)
  }

  function formatarData(dataStr: string) {
    const data = new Date(dataStr + 'T00:00:00')
    return data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-orange-900/30 items-center justify-center">
            <Route className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Supindas</h1>
            <p className="text-small text-[var(--shell-text-muted)]">Viagens para o crematório</p>
          </div>
        </div>
        <button
          onClick={() => setCriarModal(true)}
          className="btn-primary"
          style={{ background: '#ea580c' }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Supinda</span>
          <span className="sm:hidden">Nova</span>
        </button>
      </div>

      {/* Cards de Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 stagger-children">
        {(['planejada', 'em_andamento', 'retornada'] as const).map(status => {
          const config = STATUS_CONFIG[status]
          const Icon = config.icon
          const isActive = filtroStatus === status
          const count = statusCounts[status]

          return (
            <button
              key={status}
              onClick={() => setFiltroStatus(isActive ? null : status)}
              className={`card p-4 border-2 transition-all card-hover ${
                isActive
                  ? `${config.bgLightClass} border-current ${config.textClass}`
                  : 'border-[var(--surface-200)] hover:border-[var(--surface-300)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.bgClass} text-white`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-400">{config.label}</p>
                    <p className="text-2xl font-bold text-slate-200">{count}</p>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtro ativo */}
      {filtroStatus && (
        <div className="mb-4 flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-2">
          <span className="text-sm text-slate-400">
            Filtrando por: <strong>{STATUS_CONFIG[filtroStatus].label}</strong>
          </span>
          <button
            onClick={() => setFiltroStatus(null)}
            className="text-sm text-orange-400 hover:text-orange-300 font-medium"
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/* Lista de Supindas */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        ) : supindas.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Route className="h-12 w-12 mx-auto mb-3 text-slate-500" />
            <p>Nenhuma supinda encontrada</p>
          </div>
        ) : (
          <div className="divide-y">
            {supindas.map(supinda => {
              const config = STATUS_CONFIG[supinda.status || 'planejada']
              const isExpanded = expandida === supinda.id

              return (
                <div key={supinda.id} className="bg-slate-800">
                  {/* Linha principal */}
                  <div
                    className="flex items-center gap-4 p-4 hover:bg-slate-700 cursor-pointer"
                    onClick={() => toggleExpandir(supinda.id)}
                  >
                    {/* Número */}
                    <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-orange-900/30 flex items-center justify-center">
                      <span className="text-2xl font-black text-orange-400">#{supinda.numero}</span>
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-200">{formatarData(supinda.data)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgClass} text-white`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        {supinda.responsavel && (
                          <span>👤 {supinda.responsavel}</span>
                        )}
                        <span>🐾 {supinda.quantidade_pets || 0} pets</span>
                        <span>⚖️ {supinda.peso_total?.toFixed(1) || 0}kg</span>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      {supinda.status === 'planejada' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); marcarEmAndamento(supinda.id) }}
                          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                          title="Marcar como em andamento"
                        >
                          🚐 Iniciar
                        </button>
                      )}
                      {supinda.status === 'em_andamento' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); marcarRetornada(supinda.id) }}
                          className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                          title="Marcar como retornada"
                        >
                          ✅ Retornou
                        </button>
                      )}
                      <div className="p-2 text-slate-400">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Contratos expandidos */}
                  {isExpanded && (
                    <div className="bg-slate-700/50 border-t px-4 py-3">
                      <h4 className="text-sm font-medium text-slate-400 mb-2">Contratos vinculados:</h4>
                      {!supinda.contratos ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                        </div>
                      ) : supinda.contratos.length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">Nenhum contrato vinculado</p>
                      ) : (
                        <div className="space-y-2">
                          {supinda.contratos.map(contrato => (
                            <div
                              key={contrato.id}
                              className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg border border-slate-600"
                            >
                              {/* Checkboxes */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {contrato.tipo_cremacao === 'individual' && (
                                  <button
                                    onClick={() => toggleContratoCheck(supinda.id, contrato.id, 'cinzas_recebidas', contrato.cinzas_recebidas)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                      contrato.cinzas_recebidas
                                        ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                                        : 'bg-slate-600/50 text-slate-400 border border-slate-500/30 hover:border-green-500/40'
                                    }`}
                                    title="Cinzas recebidas"
                                  >
                                    ⚱️ {contrato.cinzas_recebidas ? '✓' : ''}
                                  </button>
                                )}
                                <button
                                  onClick={() => toggleContratoCheck(supinda.id, contrato.id, 'certificado_recebido', contrato.certificado_recebido)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                    contrato.certificado_recebido
                                      ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                                      : 'bg-slate-600/50 text-slate-400 border border-slate-500/30 hover:border-green-500/40'
                                  }`}
                                  title="Certificado recebido"
                                >
                                  📜 {contrato.certificado_recebido ? '✓' : ''}
                                </button>
                              </div>

                              {/* Info do contrato */}
                              <Link
                                href={`/contratos/${contrato.id}`}
                                className="flex items-center justify-between flex-1 min-w-0 hover:text-orange-300 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-slate-200">{contrato.pet_nome}</span>
                                  <span className="text-xs text-slate-400">{contrato.codigo}</span>
                                  {contrato.tipo_cremacao === 'individual' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300">IND</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-400">
                                  <span>{contrato.tutor_nome}</span>
                                  {contrato.pet_peso && <span>{contrato.pet_peso}kg</span>}
                                </div>
                              </Link>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Itens avulsos - Levar */}
                      {supinda.itens && supinda.itens.filter(i => i.tipo === 'levar').length > 0 && (
                        <>
                          <h4 className="text-sm font-medium text-orange-400 mb-2 mt-3">📦 Levar:</h4>
                          <div className="space-y-2">
                            {supinda.itens.filter(i => i.tipo === 'levar').map(item => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg border border-orange-500/30 group"
                              >
                                <button
                                  onClick={() => toggleItemFeito(supinda.id, item.id, item.feito)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 ${
                                    item.feito
                                      ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                                      : 'bg-slate-600/50 text-slate-400 border border-slate-500/30 hover:border-green-500/40'
                                  }`}
                                >
                                  {item.feito ? '✅' : '⬜'}
                                </button>
                                <button
                                  onClick={() => { setItemModal(supinda.id); setEditandoItemId(item.id); setNovoItemTexto(item.descricao); setNovoItemTipo(item.tipo) }}
                                  className={`flex-1 text-sm text-left hover:text-orange-300 transition-colors ${item.feito ? 'text-slate-500 line-through' : 'text-slate-200'}`}
                                >
                                  {item.descricao}
                                </button>
                                <button
                                  onClick={() => removerItem(supinda.id, item.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                  title="Remover item"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Itens avulsos - Retornar */}
                      {supinda.itens && supinda.itens.filter(i => i.tipo === 'retornar').length > 0 && (
                        <>
                          <h4 className="text-sm font-medium text-purple-400 mb-2 mt-3">🔙 Retornar:</h4>
                          <div className="space-y-2">
                            {supinda.itens.filter(i => i.tipo === 'retornar').map(item => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 p-2 bg-slate-700 rounded-lg border border-purple-500/30 group"
                              >
                                <button
                                  onClick={() => toggleItemFeito(supinda.id, item.id, item.feito)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 ${
                                    item.feito
                                      ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                                      : 'bg-slate-600/50 text-slate-400 border border-slate-500/30 hover:border-green-500/40'
                                  }`}
                                >
                                  {item.feito ? '✅' : '⬜'}
                                </button>
                                <button
                                  onClick={() => { setItemModal(supinda.id); setEditandoItemId(item.id); setNovoItemTexto(item.descricao); setNovoItemTipo(item.tipo) }}
                                  className={`flex-1 text-sm text-left hover:text-purple-300 transition-colors ${item.feito ? 'text-slate-500 line-through' : 'text-slate-200'}`}
                                >
                                  {item.descricao}
                                </button>
                                <button
                                  onClick={() => removerItem(supinda.id, item.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                  title="Remover item"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Botões de ação */}
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => { setItemModal(supinda.id); setNovoItemTexto(''); setNovoItemTipo('levar'); setEditandoItemId(null) }}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-orange-400 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar item
                        </button>
                        {supinda.contratos && supinda.contratos.length > 0 && (
                          <button
                            onClick={() => setFichasModal({ id: supinda.id, numero: supinda.numero })}
                            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors font-medium"
                          >
                            <FileImage className="h-3.5 w-3.5" />
                            Gerar Fichas ({supinda.contratos.length})
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Adicionar Item */}
      {itemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setItemModal(null)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-sm w-full mx-4 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-200">{editandoItemId ? 'Editar item' : 'Adicionar item'}</h3>
              <button onClick={() => setItemModal(null)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setNovoItemTipo('levar')}
                className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                  novoItemTipo === 'levar'
                    ? 'bg-orange-900/30 text-orange-300 border-orange-500'
                    : 'bg-slate-700 text-slate-400 border-slate-600 hover:border-orange-500/50'
                }`}
              >
                📦 Levar
              </button>
              <button
                onClick={() => setNovoItemTipo('retornar')}
                className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                  novoItemTipo === 'retornar'
                    ? 'bg-purple-900/30 text-purple-300 border-purple-500'
                    : 'bg-slate-700 text-slate-400 border-slate-600 hover:border-purple-500/50'
                }`}
              >
                🔙 Retornar
              </button>
            </div>
            <input
              type="text"
              value={novoItemTexto}
              onChange={e => setNovoItemTexto(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvarItem(itemModal)}
              placeholder="Descrição do item..."
              className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setItemModal(null)}
                className="flex-1 py-2 px-3 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => salvarItem(itemModal)}
                disabled={!novoItemTexto.trim()}
                className="flex-1 py-2 px-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm"
              >
                {editandoItemId ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Supinda */}
      {criarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setCriarModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">🚐 Nova Supinda</h3>
              <button onClick={() => setCriarModal(false)} className="text-slate-400 hover:text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Data */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Data da Supinda</label>
                <div className="flex gap-2 mb-2">
                  {(() => {
                    const { sabado, domingo, hoje } = getProximoFimDeSemana()
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setNovaSupindaForm({ ...novaSupindaForm, data: domingo })}
                          className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                            novaSupindaForm.data === domingo
                              ? 'bg-orange-900/300 text-white border-orange-500'
                              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-orange-900/30'
                          }`}
                        >
                          Próx. Domingo
                        </button>
                        <button
                          type="button"
                          onClick={() => setNovaSupindaForm({ ...novaSupindaForm, data: sabado })}
                          className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                            novaSupindaForm.data === sabado
                              ? 'bg-orange-900/300 text-white border-orange-500'
                              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-orange-900/30'
                          }`}
                        >
                          Próx. Sábado
                        </button>
                        <button
                          type="button"
                          onClick={() => setNovaSupindaForm({ ...novaSupindaForm, data: hoje })}
                          className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                            novaSupindaForm.data === hoje
                              ? 'bg-orange-900/300 text-white border-orange-500'
                              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-orange-900/30'
                          }`}
                        >
                          Hoje
                        </button>
                      </>
                    )
                  })()}
                </div>
                <input
                  type="date"
                  value={novaSupindaForm.data}
                  onChange={(e) => setNovaSupindaForm({ ...novaSupindaForm, data: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Responsável (opcional)</label>
                <select
                  value={novaSupindaForm.responsavel}
                  onChange={(e) => setNovaSupindaForm({ ...novaSupindaForm, responsavel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Não definido</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.nome}>{f.nome}</option>
                  ))}
                </select>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Observações (opcional)</label>
                <textarea
                  value={novaSupindaForm.observacoes}
                  onChange={(e) => setNovaSupindaForm({ ...novaSupindaForm, observacoes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  rows={2}
                  placeholder="Observações sobre a viagem..."
                />
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setCriarModal(false)}
                className="flex-1 py-2 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={criarSupinda}
                disabled={salvando || !novaSupindaForm.data}
                className="flex-1 py-2 px-4 bg-orange-900/300 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {salvando ? 'Criando...' : 'Criar Supinda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fichas em Lote */}
      {fichasModal && (
        <FichasBatchModal
          supindaId={fichasModal.id}
          supindaNumero={fichasModal.numero}
          onClose={() => setFichasModal(null)}
        />
      )}
    </div>
  )
}
