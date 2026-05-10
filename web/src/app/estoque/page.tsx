'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Grid, List, Search, Package, AlertTriangle, ShoppingCart, Target, X, Plus, Minus, Trash2, Save, TrendingUp, Sliders, Flame, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

type Produto = {
  id: string
  codigo: string
  nome: string
  tipo: 'urna' | 'acessorio' | 'incluso'
  categoria: string | null
  custo: number | null
  preco: number | null
  estoque_atual: number
  estoque_minimo: number
  imagem_url: string | null
  precisa_foto: boolean
  ativo: boolean
  estoque_infinito?: boolean
  qtde_vendida?: number
}

const CATEGORIA_URNA_LABELS: Record<string, string> = {
  'Arca/Sleeping': 'Arca/Sleeping',
  'Porta/Box': 'Porta/Box',
  'Pedras': 'Pedras',
  'High Prices': 'High Prices',
  'Low Prices': 'Low Prices',
  'Avulsos Legado RIP': 'Avulsos Legado',
}

const CATEGORIA_ACESSORIO_LABELS: Record<string, string> = {
  'Chaveiros Cinzas': 'Chaveiros Cinzas',
  'Porta-Pelos': 'Porta-Pelos',
  'Porta-Cinzas': 'Porta-Cinzas',
  'Porta-Retratos': 'Porta-Retratos',
  'Miniaturas': 'Miniaturas',
  'Outros': 'Outros',
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg']

function getImagemUrl(codigo: string, ext: string = 'png'): string {
  return `/estoque/${codigo}.${ext}`
}

const TIPO_LABELS: Record<string, string> = {
  urna: 'Urna',
  acessorio: 'Acessório',
  incluso: 'Incluso'
}

const TIPO_COLORS: Record<string, string> = {
  urna: 'bg-purple-50 text-purple-700 border-purple-200',
  acessorio: 'bg-blue-50 text-blue-700 border-blue-200',
  incluso: 'bg-green-50 text-green-700 border-green-200'
}

const TIPO_BORDER: Record<string, string> = {
  urna: 'border-purple-300',
  acessorio: 'border-blue-300',
  incluso: 'border-green-300'
}

export default function EstoquePage() {
  const router = useRouter()
  const { currentUnit } = useUnit()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [filtroEstoque, setFiltroEstoque] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Tabs
  const [tab, setTab] = useState<'atual' | 'entrada' | 'minimo' | 'historico'>('atual')

  // Carrinhos (persist em localStorage por unidade)
  const [carrinhoEntrada, setCarrinhoEntrada] = useState<Record<string, number>>({})
  const [carrinhoMinimo, setCarrinhoMinimo] = useState<Record<string, number>>({})
  const [criticosPrimeiro, setCriticosPrimeiro] = useState(false)

  // Salvamento
  const [modalSalvarEntrada, setModalSalvarEntrada] = useState(false)
  const [modalSalvarMinimo, setModalSalvarMinimo] = useState(false)
  const [salvandoLote, setSalvandoLote] = useState(false)
  const [loteData, setLoteData] = useState(new Date().toISOString().slice(0, 10))
  const [loteRemessa, setLoteRemessa] = useState('')

  // Tab Histórico (Últimas Entradas)
  type ItemRemessa = { id: string; produto_id: string; produto_nome: string; produto_codigo: string; quantidade: number; custo_unitario: number | null }
  type Remessa = { data: string; nome: string; itens: ItemRemessa[]; totalProdutos: number; totalUnidades: number }
  const [historicoData, setHistoricoData] = useState<Remessa[]>([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [verAntigos, setVerAntigos] = useState(false)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [editandoRemessa, setEditandoRemessa] = useState<{ keyAntiga: string; data: string; nome: string } | null>(null)

  const supabase = createClient()

  // Restaurar carrinhos ao trocar de unidade
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUnit?.id) return
    try {
      const ent = localStorage.getItem(`estoque_entrada_${currentUnit.id}`)
      setCarrinhoEntrada(ent ? JSON.parse(ent) : {})
    } catch { setCarrinhoEntrada({}) }
    try {
      const min = localStorage.getItem(`estoque_minimo_${currentUnit.id}`)
      setCarrinhoMinimo(min ? JSON.parse(min) : {})
    } catch { setCarrinhoMinimo({}) }
  }, [currentUnit?.id])

  // Persistir carrinhos
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUnit?.id) return
    localStorage.setItem(`estoque_entrada_${currentUnit.id}`, JSON.stringify(carrinhoEntrada))
  }, [carrinhoEntrada, currentUnit?.id])
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUnit?.id) return
    localStorage.setItem(`estoque_minimo_${currentUnit.id}`, JSON.stringify(carrinhoMinimo))
  }, [carrinhoMinimo, currentUnit?.id])

  useEffect(() => {
    carregarProdutos()
  }, [currentUnit?.id])

  async function carregarProdutos() {
    setLoading(true)

    const { data: produtosData, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('tipo')
      .order('nome')

    if (error) { setLoading(false); return }
    if (!produtosData) { setLoading(false); return }

    // Estoque DA UNIDADE ATIVA (atual + mínimo + qtde_vendida) — substitui campos globais
    type PeRow = { produto_id: string; estoque_atual: number; estoque_minimo: number; qtde_vendida: number }
    const peMap = new Map<string, PeRow>()
    if (currentUnit?.id) {
      const { data: peData } = await supabase
        .from('produtos_estoque')
        .select('produto_id, estoque_atual, estoque_minimo, qtde_vendida')
        .eq('unidade_id', currentUnit.id)
      const rows = (peData || []) as PeRow[]
      rows.forEach(r => peMap.set(r.produto_id, r))
    }
    const merged = produtosData.map((p: Produto) => {
      const pe = peMap.get(p.id)
      return {
        ...p,
        estoque_atual: pe?.estoque_atual ?? 0,
        estoque_minimo: pe?.estoque_minimo ?? 0,
        qtde_vendida: pe?.qtde_vendida ?? 0,
      }
    })
    setProdutos(merged)
    setLoading(false)
  }

  function getStatusEstoque(atual: number, minimo: number, estoqueInfinito?: boolean) {
    if (estoqueInfinito) return { status: 'infinito', color: 'bg-blue-500', label: '∞' }
    if (atual >= minimo) return { status: 'ok', color: 'bg-green-500', label: 'OK' }
    return { status: 'critico', color: 'bg-red-500', label: 'Abaixo do ideal' }
  }

  function isCritico(p: Produto) {
    return !p.estoque_infinito && p.estoque_atual < p.estoque_minimo
  }

  // ====================================
  // Helpers do carrinho de Entrada
  // ====================================
  function setCarrinhoEntradaQtd(produtoId: string, qtd: number) {
    setCarrinhoEntrada(prev => {
      const next = { ...prev }
      if (qtd <= 0) delete next[produtoId]
      else next[produtoId] = qtd
      return next
    })
  }
  function incCarrinhoEntrada(produtoId: string, delta: number) {
    setCarrinhoEntrada(prev => {
      const atual = prev[produtoId] || 0
      const novo = Math.max(0, atual + delta)
      const next = { ...prev }
      if (novo === 0) delete next[produtoId]
      else next[produtoId] = novo
      return next
    })
  }
  const totalItensEntrada = Object.keys(carrinhoEntrada).length
  const totalUnidadesEntrada = Object.values(carrinhoEntrada).reduce((a, b) => a + b, 0)

  async function confirmarSalvarEntrada() {
    if (!currentUnit?.id || totalItensEntrada === 0) return
    const remessa = loteRemessa.trim()
    if (!remessa) { alert('Informe o nome da remessa'); return }
    setSalvandoLote(true)
    const dataEntrada = loteData
    let erros = 0
    for (const [pid, qtd] of Object.entries(carrinhoEntrada)) {
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('registrar_entrada_estoque', {
        p_produto_id: pid,
        p_unidade_id: currentUnit.id,
        p_quantidade: qtd,
        p_custo_unitario: null,
        p_remessa: remessa,
        p_data_entrada: dataEntrada,
      })
      if (error) { console.error('Entrada falhou', pid, error); erros++ }
    }
    setSalvandoLote(false)
    if (erros > 0) {
      alert(`Lote salvo com ${erros} erro(s). Verifique o console.`)
    }
    setCarrinhoEntrada({})
    setModalSalvarEntrada(false)
    setLoteRemessa('')
    setLoteData(new Date().toISOString().slice(0, 10))
    await carregarProdutos()
  }

  // ====================================
  // Helpers do carrinho de Mínimo
  // ====================================
  function setCarrinhoMinimoVal(produtoId: string, valor: number, atual: number) {
    setCarrinhoMinimo(prev => {
      const next = { ...prev }
      if (valor === atual) delete next[produtoId]
      else next[produtoId] = valor
      return next
    })
  }
  // Conta só os efetivamente alterados
  const totalItensMinimo = Object.keys(carrinhoMinimo).length

  // ====================================
  // Tab Histórico (Últimas Entradas)
  // ====================================
  async function carregarHistorico() {
    if (!currentUnit?.id) { setHistoricoData([]); return }
    setLoadingHist(true)
    let q = supabase
      .from('estoque_entradas')
      .select('id, produto_id, quantidade, data_entrada, remessa, custo_unitario, produtos!inner(nome, codigo)')
      .eq('unidade_id', currentUnit.id)
      .order('data_entrada', { ascending: false })
      .order('created_at', { ascending: false })
    if (!verAntigos) {
      const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      q = q.gte('data_entrada', since)
    }
    const { data } = await q
    type Row = { id: string; produto_id: string; quantidade: number; data_entrada: string; remessa: string | null; custo_unitario: number | null; produtos: { nome: string; codigo: string } }
    const rows = (data || []) as unknown as Row[]
    const map = new Map<string, Remessa>()
    for (const r of rows) {
      const nome = r.remessa || '(sem nome)'
      const key = `${r.data_entrada}|${nome}`
      if (!map.has(key)) {
        map.set(key, { data: r.data_entrada, nome, itens: [], totalProdutos: 0, totalUnidades: 0 })
      }
      const grupo = map.get(key)!
      grupo.itens.push({
        id: r.id,
        produto_id: r.produto_id,
        produto_nome: r.produtos?.nome || '(sem nome)',
        produto_codigo: r.produtos?.codigo || '?',
        quantidade: r.quantidade,
        custo_unitario: r.custo_unitario,
      })
      grupo.totalUnidades += r.quantidade
    }
    for (const g of map.values()) g.totalProdutos = g.itens.length
    setHistoricoData(Array.from(map.values()))
    setLoadingHist(false)
  }

  // Recarrega histórico ao entrar na tab ou trocar unidade/filtro
  useEffect(() => {
    if (tab === 'historico') carregarHistorico()
  }, [tab, currentUnit?.id, verAntigos]) // eslint-disable-line react-hooks/exhaustive-deps

  async function logHistorico(args: { entidade_id: string; campo: string; campo_label: string; valor_anterior: string | null; valor_novo: string | null; tipo: 'edicao' | 'exclusao' | 'criacao'; entidade_nome?: string | null }) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('historico_alteracoes').insert({
      entidade: 'estoque_entradas',
      entidade_id: args.entidade_id,
      entidade_nome: args.entidade_nome || null,
      campo: args.campo,
      campo_label: args.campo_label,
      valor_anterior: args.valor_anterior,
      valor_novo: args.valor_novo,
      tipo: args.tipo,
      alterado_por: user?.id ?? null,
      alterado_por_email: user?.email ?? null,
    } as never)
  }

  async function alterarItemQuantidade(item: ItemRemessa, novaQtd: number) {
    if (novaQtd === item.quantidade) return
    if (novaQtd < 0) return
    if (novaQtd === 0) {
      if (!confirm(`Excluir ${item.produto_nome} desta remessa?\nO saldo da unidade vai cair em ${item.quantidade} (pode ficar negativo).`)) return
    }
    await logHistorico({
      entidade_id: item.id,
      entidade_nome: item.produto_nome,
      campo: 'quantidade',
      campo_label: `Qtd ${item.produto_codigo}`,
      valor_anterior: String(item.quantidade),
      valor_novo: String(novaQtd),
      tipo: novaQtd === 0 ? 'exclusao' : 'edicao',
    })
    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('editar_entrada_estoque', {
      p_entrada_id: item.id,
      p_nova_quantidade: novaQtd,
    })
    if (error) { alert('Erro: ' + error.message); return }
    await carregarHistorico()
    await carregarProdutos()
  }

  async function excluirRemessaCompleta(remessa: Remessa) {
    if (!confirm(`Excluir TODA a remessa "${remessa.nome}" de ${new Date(remessa.data).toLocaleDateString('pt-BR')}?\n\n${remessa.totalProdutos} produtos · ${remessa.totalUnidades} unidades serão devolvidas ao saldo (pode ficar negativo).`)) return
    let erros = 0
    for (const item of remessa.itens) {
      await logHistorico({
        entidade_id: item.id,
        entidade_nome: item.produto_nome,
        campo: 'quantidade',
        campo_label: `Qtd ${item.produto_codigo}`,
        valor_anterior: String(item.quantidade),
        valor_novo: '0',
        tipo: 'exclusao',
      })
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('editar_entrada_estoque', {
        p_entrada_id: item.id,
        p_nova_quantidade: 0,
      })
      if (error) erros++
    }
    if (erros > 0) alert(`${erros} item(ns) falharam.`)
    await carregarHistorico()
    await carregarProdutos()
  }

  async function salvarRenameRemessa() {
    if (!editandoRemessa || !currentUnit?.id) return
    const novoNome = editandoRemessa.nome.trim()
    if (!novoNome) { alert('Nome não pode ser vazio'); return }
    const [dataAntiga, nomeAntigoRaw] = editandoRemessa.keyAntiga.split('|')
    const nomeAntigo = nomeAntigoRaw === '(sem nome)' ? null : nomeAntigoRaw
    if (dataAntiga === editandoRemessa.data && (nomeAntigo || '') === novoNome) {
      setEditandoRemessa(null)
      return
    }
    // Auditoria: 1 row sumária
    await logHistorico({
      entidade_id: '00000000-0000-0000-0000-000000000000',
      entidade_nome: `Remessa ${dataAntiga} ${nomeAntigoRaw}`,
      campo: 'remessa',
      campo_label: 'Renomear remessa',
      valor_anterior: `${dataAntiga} | ${nomeAntigoRaw}`,
      valor_novo: `${editandoRemessa.data} | ${novoNome}`,
      tipo: 'edicao',
    })
    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('renomear_remessa', {
      p_unidade_id: currentUnit.id,
      p_data_antiga: dataAntiga,
      p_remessa_antiga: nomeAntigo,
      p_data_nova: editandoRemessa.data,
      p_remessa_nova: novoNome,
    })
    if (error) { alert('Erro: ' + error.message); return }
    setEditandoRemessa(null)
    await carregarHistorico()
  }

  async function confirmarSalvarMinimo() {
    if (!currentUnit?.id || totalItensMinimo === 0) return
    setSalvandoLote(true)
    let erros = 0
    for (const [pid, novo] of Object.entries(carrinhoMinimo)) {
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('set_estoque_minimo_unidade', {
        p_produto_id: pid,
        p_unidade_id: currentUnit.id,
        p_minimo: novo,
      })
      if (error) { console.error('Mínimo falhou', pid, error); erros++ }
    }
    setSalvandoLote(false)
    if (erros > 0) {
      alert(`Mínimos salvos com ${erros} erro(s). Verifique o console.`)
    }
    setCarrinhoMinimo({})
    setModalSalvarMinimo(false)
    await carregarProdutos()
  }

  const produtosFiltrados = useMemo(() => {
    let out = produtos.filter(p => {
      if (filtro && p.tipo !== filtro) return false
      if (filtroCategoria && p.categoria !== filtroCategoria) return false
      if (filtroEstoque === 'critico' && (p.estoque_infinito || p.estoque_atual >= p.estoque_minimo)) return false
      if (filtroEstoque === 'ok' && (!p.estoque_infinito && p.estoque_atual < p.estoque_minimo)) return false
      if (filtroEstoque === 'zerado' && (p.estoque_infinito || p.estoque_atual > 0)) return false
      if (busca) {
        const termo = busca.toLowerCase()
        return p.nome.toLowerCase().includes(termo) || p.codigo.toLowerCase().includes(termo)
      }
      return true
    })
    if (criticosPrimeiro && (tab === 'entrada' || tab === 'minimo')) {
      out = [...out].sort((a, b) => {
        const ca = isCritico(a) ? 1 : 0
        const cb = isCritico(b) ? 1 : 0
        return cb - ca
      })
    }
    return out
  }, [produtos, filtro, filtroCategoria, filtroEstoque, busca, criticosPrimeiro, tab])

  const contadores = {
    total: produtos.length,
    urna: produtos.filter(p => p.tipo === 'urna').length,
    acessorio: produtos.filter(p => p.tipo === 'acessorio').length,
    incluso: produtos.filter(p => p.tipo === 'incluso').length,
  }

  const produtosFiltradosPorTipo = filtro ? produtos.filter(p => p.tipo === filtro) : produtos
  const contadoresEstoque = {
    todos: produtosFiltradosPorTipo.length,
    critico: produtosFiltradosPorTipo.filter(p => !p.estoque_infinito && p.estoque_atual < p.estoque_minimo).length,
    ok: produtosFiltradosPorTipo.filter(p => p.estoque_infinito || p.estoque_atual >= p.estoque_minimo).length,
    zerado: produtosFiltradosPorTipo.filter(p => !p.estoque_infinito && p.estoque_atual === 0).length,
  }

  const categoriasUrnas = [...new Set(
    produtos.filter(p => p.tipo === 'urna' && p.categoria).map(p => p.categoria!)
  )].sort()

  const contadoresCategorias: Record<string, number> = {}
  categoriasUrnas.forEach(cat => {
    contadoresCategorias[cat] = produtos.filter(p => p.tipo === 'urna' && p.categoria === cat).length
  })

  const ORDEM_ACESSORIOS = ['Porta-Retratos', 'Porta-Pelos', 'Porta-Cinzas', 'Miniaturas', 'Chaveiros Cinzas', 'Outros']
  const categoriasAcessoriosSet = new Set(
    produtos.filter(p => p.tipo === 'acessorio' && p.categoria).map(p => p.categoria!)
  )
  const categoriasAcessorios = ORDEM_ACESSORIOS.filter(cat => categoriasAcessoriosSet.has(cat))

  const contadoresCategoriasAcessorios: Record<string, number> = {}
  categoriasAcessorios.forEach(cat => {
    contadoresCategoriasAcessorios[cat] = produtos.filter(p => p.tipo === 'acessorio' && p.categoria === cat).length
  })

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-amber-50 items-center justify-center">
            <Boxes className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Estoque</h1>
          </div>
        </div>
        {tab === 'atual' && (
          <div className="flex gap-1 bg-[var(--surface-100)] rounded-[var(--radius-md)] p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-[var(--radius-sm)] transition-all ${viewMode === 'grid' ? 'bg-[var(--surface-0)] shadow-sm text-[var(--brand-600)]' : 'text-[var(--surface-400)] hover:text-[var(--surface-600)]'}`}
              title="Grade"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-[var(--radius-sm)] transition-all ${viewMode === 'list' ? 'bg-[var(--surface-0)] shadow-sm text-[var(--brand-600)]' : 'text-[var(--surface-400)] hover:text-[var(--surface-600)]'}`}
              title="Lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-[var(--surface-200)] flex gap-1 overflow-x-auto scrollbar-hide">
        {[
          { k: 'atual' as const,     label: 'Estoque Atual',     icon: Package,      badge: null },
          { k: 'entrada' as const,   label: 'Entrada de Estoque',icon: TrendingUp,   badge: totalItensEntrada > 0 ? totalItensEntrada : null },
          { k: 'minimo' as const,    label: 'Ajuste de Mínimo',  icon: Sliders,      badge: totalItensMinimo > 0 ? totalItensMinimo : null },
          { k: 'historico' as const, label: 'Últimas Entradas',  icon: ShoppingCart, badge: null },
        ].map(t => {
          const Icon = t.icon
          const ativo = tab === t.k
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                ativo
                  ? 'border-[var(--brand-500)] text-[var(--brand-600)]'
                  : 'border-transparent text-[var(--surface-500)] hover:text-[var(--surface-700)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.badge !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  ativo ? 'bg-[var(--brand-500)] text-white' : 'bg-amber-500 text-white'
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Busca */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--surface-400)]" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input pl-10 pr-10"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--surface-600)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filtros estoque */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFiltroEstoque('')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            filtroEstoque === '' ? 'bg-[var(--surface-800)] text-white' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
          }`}
        >
          Todos ({contadoresEstoque.todos})
        </button>
        <button
          onClick={() => setFiltroEstoque('critico')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
            filtroEstoque === 'critico' ? 'bg-red-600 text-white' : 'bg-red-50 border border-red-200 text-red-700 hover:border-red-300'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Abaixo do ideal ({contadoresEstoque.critico})
        </button>
        <button
          onClick={() => setFiltroEstoque('zerado')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            filtroEstoque === 'zerado' ? 'bg-orange-600 text-white' : 'bg-orange-50 border border-orange-200 text-orange-700 hover:border-orange-300'
          }`}
        >
          Sem estoque ({contadoresEstoque.zerado})
        </button>
        <button
          onClick={() => setFiltroEstoque('ok')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            filtroEstoque === 'ok' ? 'bg-green-600 text-white' : 'bg-green-50 border border-green-200 text-green-700 hover:border-green-300'
          }`}
        >
          OK ({contadoresEstoque.ok})
        </button>
      </div>

      {/* Filtros tipo */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => { setFiltro(''); setFiltroCategoria(''); }}
          className={`px-4 py-2 rounded-full font-medium transition-all whitespace-nowrap ${
            filtro === '' ? 'bg-[var(--brand-500)] text-white shadow-md' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
          }`}
        >
          Todos ({contadores.total})
        </button>
        <button
          onClick={() => { setFiltro('urna'); setFiltroCategoria(''); }}
          className={`px-4 py-2 rounded-full font-medium transition-all whitespace-nowrap ${
            filtro === 'urna' ? 'bg-[var(--brand-500)] text-white shadow-md' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
          }`}
        >
          Urnas ({contadores.urna})
        </button>
        <button
          onClick={() => { setFiltro('acessorio'); setFiltroCategoria(''); }}
          className={`px-4 py-2 rounded-full font-medium transition-all whitespace-nowrap ${
            filtro === 'acessorio' ? 'bg-[var(--brand-500)] text-white shadow-md' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
          }`}
        >
          Acessórios ({contadores.acessorio})
        </button>
        <button
          onClick={() => { setFiltro('incluso'); setFiltroCategoria(''); }}
          className={`px-4 py-2 rounded-full font-medium transition-all whitespace-nowrap ${
            filtro === 'incluso' ? 'bg-[var(--brand-500)] text-white shadow-md' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
          }`}
        >
          Inclusos ({contadores.incluso})
        </button>
      </div>

      {/* Filtros categoria urna */}
      {filtro === 'urna' && categoriasUrnas.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setFiltroCategoria('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              filtroCategoria === '' ? 'bg-amber-500 text-white' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
            }`}
          >
            Todas categorias
          </button>
          {categoriasUrnas.map(cat => (
            <button
              key={cat}
              onClick={() => setFiltroCategoria(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                filtroCategoria === cat ? 'bg-amber-500 text-white' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
              }`}
            >
              {CATEGORIA_URNA_LABELS[cat] || cat} ({contadoresCategorias[cat]})
            </button>
          ))}
        </div>
      )}

      {/* Filtros categoria acessório */}
      {filtro === 'acessorio' && categoriasAcessorios.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setFiltroCategoria('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              filtroCategoria === '' ? 'bg-blue-500 text-white' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
            }`}
          >
            Todas categorias
          </button>
          {categoriasAcessorios.map(cat => (
            <button
              key={cat}
              onClick={() => setFiltroCategoria(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                filtroCategoria === cat ? 'bg-blue-500 text-white' : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
              }`}
            >
              {CATEGORIA_ACESSORIO_LABELS[cat] || cat} ({contadoresCategoriasAcessorios[cat]})
            </button>
          ))}
        </div>
      )}

      {/* Toggle "Críticos primeiro" — visível apenas nas tabs Entrada/Mínimo */}
      {(tab === 'entrada' || tab === 'minimo') && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setCriticosPrimeiro(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              criticosPrimeiro
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-red-50 border border-red-200 text-red-700 hover:border-red-300'
            }`}
            title="Mostrar produtos críticos no topo da lista"
          >
            <Flame className="h-3.5 w-3.5" />
            Críticos primeiro
          </button>
          <span className="text-xs text-[var(--surface-400)]">
            ({produtosFiltrados.filter(isCritico).length} críticos · {produtosFiltrados.length} total)
          </span>
        </div>
      )}

      {/* Content — Tab Atual */}
      {tab === 'atual' && (loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto encontrado"
          description={busca ? 'Tente ajustar o termo de busca' : 'Nenhum produto cadastrado'}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 stagger-children">
          {produtosFiltrados.map((produto) => {
            const statusEstoque = getStatusEstoque(produto.estoque_atual, produto.estoque_minimo, produto.estoque_infinito)

            return (
              <div
                key={produto.id}
                onClick={() => router.push(`/estoque/${produto.id}`)}
                className={`card card-hover cursor-pointer overflow-hidden border-t-2 ${TIPO_BORDER[produto.tipo]}`}
              >
                {/* Imagem */}
                <div className="aspect-square bg-[var(--surface-100)] relative group overflow-hidden">
                  <img
                    src={produto.imagem_url || getImagemUrl(produto.codigo)}
                    alt={produto.nome}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      const currentSrc = target.src
                      if (produto.imagem_url && currentSrc.includes(produto.imagem_url)) {
                        target.src = getImagemUrl(produto.codigo, 'png')
                      } else if (currentSrc.endsWith('.png')) {
                        target.src = getImagemUrl(produto.codigo, 'jpg')
                      } else if (currentSrc.endsWith('.jpg')) {
                        target.src = getImagemUrl(produto.codigo, 'jpeg')
                      } else {
                        target.style.display = 'none'
                        target.nextElementSibling?.classList.remove('hidden')
                      }
                    }}
                  />
                  <div className="hidden w-full h-full flex items-center justify-center absolute inset-0">
                    <Package className="h-12 w-12 text-[var(--surface-300)]" />
                  </div>
                  {statusEstoque.status !== 'ok' && statusEstoque.status !== 'infinito' && (
                    <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${statusEstoque.color} ring-2 ring-white`} title={statusEstoque.label} />
                  )}
                  <div className={`absolute bottom-2 right-2 text-white text-xs font-bold px-2 py-1 rounded-[var(--radius-sm)] shadow-md ${
                    produto.preco && produto.preco > 0 ? 'bg-green-600' : 'bg-[var(--surface-500)]'
                  }`}>
                    {produto.preco && produto.preco > 0 ? `R$ ${produto.preco.toFixed(0)}` : 'Incluso'}
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="font-medium text-[var(--surface-800)] text-sm leading-tight min-h-[2.5rem]">{produto.nome}</p>

                  <div className="flex items-center justify-between mt-2 text-sm">
                    <div className="flex items-center gap-1 w-12" title="Estoque atual">
                      {statusEstoque.status === 'critico' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                      {statusEstoque.status === 'ok' && <Package className="h-4 w-4 text-green-500" />}
                      {statusEstoque.status === 'infinito' && <Package className="h-4 w-4 text-blue-500" />}
                      <span className={`font-bold text-base text-mono ${
                        statusEstoque.status === 'infinito' ? 'text-blue-400' :
                        statusEstoque.status === 'critico' ? 'text-red-400' :
                        'text-green-400'
                      }`}>
                        {produto.estoque_infinito ? '∞' : produto.estoque_atual}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 w-12 justify-center text-[var(--surface-400)]" title="Estoque ideal">
                      <Target className="h-4 w-4" />
                      <span className="text-base text-mono">{produto.estoque_infinito ? '-' : produto.estoque_minimo}</span>
                    </div>

                    <div className="flex items-center gap-1 w-12 justify-end text-[var(--brand-600)]" title="Qtde vendida">
                      <ShoppingCart className="h-4 w-4" />
                      <span className="font-medium text-base text-mono">{produto.qtde_vendida || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-[var(--surface-50)] border-b border-[var(--surface-200)]">
              <tr>
                <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Produto</th>
                <th className="text-left px-4 py-3 text-caption text-[var(--surface-500)]">Tipo</th>
                <th className="text-center px-4 py-3 text-caption text-[var(--surface-500)]">Est.</th>
                <th className="text-center px-4 py-3 text-caption text-[var(--surface-500)]">Ideal</th>
                <th className="text-center px-4 py-3 text-caption text-[var(--surface-500)]">Vendas</th>
                <th className="text-right px-4 py-3 text-caption text-[var(--surface-500)]">Preço</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map((produto) => {
                const statusEstoque = getStatusEstoque(produto.estoque_atual, produto.estoque_minimo, produto.estoque_infinito)

                return (
                  <tr
                    key={produto.id}
                    onClick={() => router.push(`/estoque/${produto.id}`)}
                    className="border-b border-[var(--surface-100)] last:border-b-0 hover:bg-[var(--surface-50)] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[var(--surface-100)] rounded-[var(--radius-md)] overflow-hidden flex-shrink-0 relative">
                          <img
                            src={produto.imagem_url || getImagemUrl(produto.codigo)}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              const currentSrc = target.src
                              if (produto.imagem_url && currentSrc.includes(produto.imagem_url)) {
                                target.src = getImagemUrl(produto.codigo, 'png')
                              } else if (currentSrc.endsWith('.png')) {
                                target.src = getImagemUrl(produto.codigo, 'jpg')
                              } else if (currentSrc.endsWith('.jpg')) {
                                target.src = getImagemUrl(produto.codigo, 'jpeg')
                              } else {
                                target.style.display = 'none'
                                target.nextElementSibling?.classList.remove('hidden')
                              }
                            }}
                          />
                          <div className="hidden w-full h-full flex items-center justify-center absolute inset-0">
                            <Package className="h-5 w-5 text-[var(--surface-300)]" />
                          </div>
                        </div>
                        <span className="font-medium text-[var(--surface-800)]">{produto.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${TIPO_COLORS[produto.tipo]}`}>
                        {TIPO_LABELS[produto.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold text-mono ${
                        statusEstoque.status === 'infinito' ? 'text-blue-400' :
                        statusEstoque.status === 'critico' ? 'text-red-400' :
                        'text-green-400'
                      }`}>
                        {produto.estoque_infinito ? '∞' : produto.estoque_atual}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--surface-400)] text-mono">
                      {produto.estoque_infinito ? '-' : produto.estoque_minimo}
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--brand-600)] font-medium text-mono">
                      {produto.qtde_vendida || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {produto.preco && produto.preco > 0 ? (
                        <span className="font-semibold text-green-400 text-mono">R$ {produto.preco.toFixed(0)}</span>
                      ) : (
                        <span className="text-[var(--surface-400)]">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* ============================ */}
      {/* Tab: ENTRADA (carrinho) */}
      {/* ============================ */}
      {tab === 'entrada' && (
        <div>
          {/* Header sticky com contadores e ações */}
          <div className="sticky top-0 z-10 bg-[var(--surface-0)]/95 backdrop-blur-sm border border-[var(--surface-200)] rounded-lg p-3 mb-3 flex items-center justify-between gap-2 shadow-sm">
            <div className="text-sm">
              {totalItensEntrada === 0 ? (
                <span className="text-[var(--surface-400)]">Carrinho vazio — use os botões para adicionar quantidades</span>
              ) : (
                <span className="text-[var(--surface-700)]">
                  <strong>{totalItensEntrada}</strong> produto{totalItensEntrada > 1 ? 's' : ''} ·{' '}
                  <strong>{totalUnidadesEntrada}</strong> unidade{totalUnidadesEntrada > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {totalItensEntrada > 0 && (
                <button
                  onClick={() => { if (confirm('Limpar todo o carrinho?')) setCarrinhoEntrada({}) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar
                </button>
              )}
              <button
                onClick={() => setModalSalvarEntrada(true)}
                disabled={totalItensEntrada === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> Salvar entrada
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full rounded-lg" />))}
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <EmptyState icon={Package} title="Nenhum produto" description={busca ? 'Ajuste a busca' : 'Sem produtos cadastrados'} />
          ) : (
            <div className="card overflow-hidden">
              {produtosFiltrados.map(p => {
                const qtd = carrinhoEntrada[p.id] || 0
                const status = getStatusEstoque(p.estoque_atual, p.estoque_minimo, p.estoque_infinito)
                const apos = p.estoque_infinito ? null : p.estoque_atual + qtd
                const desabilitado = !!p.estoque_infinito
                const critico = isCritico(p)
                return (
                  <div key={p.id} className={`flex items-center gap-3 p-3 border-b border-[var(--surface-100)] last:border-b-0 ${qtd > 0 ? 'bg-emerald-50/30' : ''} ${desabilitado ? 'opacity-50' : ''}`}>
                    <div className="w-12 h-12 rounded-md bg-[var(--surface-100)] overflow-hidden flex-shrink-0 relative">
                      <img src={p.imagem_url || getImagemUrl(p.codigo)} alt="" className="w-full h-full object-cover"
                        onError={(e) => { const t = e.target as HTMLImageElement; t.style.visibility = 'hidden' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-[var(--surface-800)] truncate">{p.nome}</p>
                        {critico && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-[var(--surface-400)]">{TIPO_LABELS[p.tipo]}</p>
                    </div>
                    <div className="text-xs text-right text-[var(--surface-500)] hidden sm:block">
                      <div>atual: <span className={`font-semibold text-mono ${status.status === 'critico' ? 'text-red-600' : status.status === 'infinito' ? 'text-blue-500' : 'text-[var(--surface-700)]'}`}>{p.estoque_infinito ? '∞' : p.estoque_atual}</span></div>
                      <div>mín: <span className="text-mono text-[var(--surface-600)]">{p.estoque_infinito ? '-' : p.estoque_minimo}</span></div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => incCarrinhoEntrada(p.id, -1)} disabled={desabilitado || qtd === 0}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface-100)] text-[var(--surface-700)] hover:bg-[var(--surface-200)] disabled:opacity-30 disabled:cursor-not-allowed">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number" min="0" value={qtd}
                        onChange={e => setCarrinhoEntradaQtd(p.id, Math.max(0, parseInt(e.target.value) || 0))}
                        disabled={desabilitado}
                        className="w-14 h-7 text-center text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] rounded-md text-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                      />
                      <button onClick={() => incCarrinhoEntrada(p.id, +1)} disabled={desabilitado}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {apos !== null && qtd > 0 && (
                      <div className="text-xs text-emerald-700 font-semibold w-16 text-right hidden sm:block">
                        → {apos}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================ */}
      {/* Tab: MÍNIMO (carrinho) */}
      {/* ============================ */}
      {tab === 'minimo' && (
        <div>
          <div className="sticky top-0 z-10 bg-[var(--surface-0)]/95 backdrop-blur-sm border border-[var(--surface-200)] rounded-lg p-3 mb-3 flex items-center justify-between gap-2 shadow-sm">
            <div className="text-sm">
              {totalItensMinimo === 0 ? (
                <span className="text-[var(--surface-400)]">Sem alterações pendentes</span>
              ) : (
                <span className="text-[var(--surface-700)]">
                  <strong>{totalItensMinimo}</strong> produto{totalItensMinimo > 1 ? 's' : ''} alterado{totalItensMinimo > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {totalItensMinimo > 0 && (
                <button
                  onClick={() => { if (confirm('Descartar todas as alterações?')) setCarrinhoMinimo({}) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar
                </button>
              )}
              <button
                onClick={() => setModalSalvarMinimo(true)}
                disabled={totalItensMinimo === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> Salvar mínimos
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full rounded-lg" />))}
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <EmptyState icon={Package} title="Nenhum produto" description={busca ? 'Ajuste a busca' : 'Sem produtos cadastrados'} />
          ) : (
            <div className="card overflow-hidden">
              {produtosFiltrados.map(p => {
                const minAtual = p.estoque_minimo
                const valor = carrinhoMinimo[p.id] !== undefined ? carrinhoMinimo[p.id] : minAtual
                const alterado = carrinhoMinimo[p.id] !== undefined
                const desabilitado = !!p.estoque_infinito
                const critico = isCritico(p)
                return (
                  <div key={p.id} className={`flex items-center gap-3 p-3 border-b border-[var(--surface-100)] last:border-b-0 ${alterado ? 'bg-amber-50/40' : ''} ${desabilitado ? 'opacity-50' : ''}`}>
                    <div className="w-12 h-12 rounded-md bg-[var(--surface-100)] overflow-hidden flex-shrink-0">
                      <img src={p.imagem_url || getImagemUrl(p.codigo)} alt="" className="w-full h-full object-cover"
                        onError={(e) => { const t = e.target as HTMLImageElement; t.style.visibility = 'hidden' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-[var(--surface-800)] truncate">{p.nome}</p>
                        {critico && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-[var(--surface-400)]">{p.codigo} · {TIPO_LABELS[p.tipo]}</p>
                    </div>
                    <div className="text-xs text-[var(--surface-500)] hidden sm:block">
                      atual: <span className="text-mono font-semibold text-[var(--surface-700)]">{p.estoque_atual}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCarrinhoMinimoVal(p.id, Math.max(0, valor - 1), minAtual)} disabled={desabilitado || valor === 0}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface-100)] text-[var(--surface-700)] hover:bg-[var(--surface-200)] disabled:opacity-30">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number" min="0" value={valor}
                        onChange={e => setCarrinhoMinimoVal(p.id, Math.max(0, parseInt(e.target.value) || 0), minAtual)}
                        disabled={desabilitado}
                        className={`w-14 h-7 text-center text-sm border rounded-md text-mono focus:outline-none focus:border-amber-500 disabled:opacity-50 ${alterado ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold' : 'bg-[var(--surface-50)] border-[var(--surface-200)]'}`}
                      />
                      <button onClick={() => setCarrinhoMinimoVal(p.id, valor + 1, minAtual)} disabled={desabilitado}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-30">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {alterado && (
                      <div className="text-xs text-amber-700 font-semibold w-16 text-right hidden sm:block">
                        {minAtual} → {valor}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================ */}
      {/* Tab: HISTÓRICO (últimas entradas) */}
      {/* ============================ */}
      {tab === 'historico' && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="text-sm text-[var(--surface-500)]">
              {loadingHist ? 'Carregando…' : (
                <>
                  <strong>{historicoData.length}</strong> remessa{historicoData.length !== 1 ? 's' : ''}
                  {!verAntigos && <span className="text-xs"> (últimos 90 dias)</span>}
                </>
              )}
            </div>
            <button
              onClick={() => setVerAntigos(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                verAntigos
                  ? 'bg-[var(--surface-800)] text-white'
                  : 'bg-[var(--surface-0)] border border-[var(--surface-200)] text-[var(--surface-600)] hover:border-[var(--surface-300)]'
              }`}
            >
              {verAntigos ? 'Mostrando tudo' : 'Ver mais antigos'}
            </button>
          </div>

          {loadingHist ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-20 w-full rounded-lg" />))}
            </div>
          ) : historicoData.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Nenhuma remessa" description={verAntigos ? 'Nenhuma entrada registrada' : 'Nada nos últimos 90 dias'} />
          ) : (
            <div className="space-y-3">
              {historicoData.map(remessa => {
                const key = `${remessa.data}|${remessa.nome}`
                const aberta = expandidas.has(key)
                const editando = editandoRemessa?.keyAntiga === key
                return (
                  <div key={key} className="card overflow-hidden">
                    {/* Header da remessa */}
                    <div className="px-4 py-3 bg-[var(--surface-50)] border-b border-[var(--surface-100)]">
                      {editando ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input type="date" value={editandoRemessa.data}
                            onChange={e => setEditandoRemessa(r => r ? { ...r, data: e.target.value } : null)}
                            className="px-2 py-1 text-sm bg-[var(--surface-0)] border border-[var(--surface-300)] rounded" />
                          <input type="text" value={editandoRemessa.nome}
                            onChange={e => setEditandoRemessa(r => r ? { ...r, nome: e.target.value } : null)}
                            placeholder="Nome da remessa"
                            className="flex-1 min-w-[180px] px-2 py-1 text-sm bg-[var(--surface-0)] border border-[var(--surface-300)] rounded" />
                          <button onClick={salvarRenameRemessa}
                            className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700">
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditandoRemessa(null)}
                            className="p-1.5 bg-[var(--surface-200)] text-[var(--surface-600)] rounded hover:bg-[var(--surface-300)]">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <button
                            onClick={() => setExpandidas(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })}
                            className="flex items-center gap-2 text-left hover:text-[var(--brand-600)] transition-colors flex-1 min-w-0"
                          >
                            <ShoppingCart className="h-4 w-4 text-[var(--brand-500)] flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-[var(--surface-800)] truncate">{remessa.nome}</p>
                              <p className="text-xs text-[var(--surface-500)]">
                                {new Date(remessa.data + 'T00:00:00').toLocaleDateString('pt-BR')} · <strong>{remessa.totalProdutos}</strong> produtos · <strong>{remessa.totalUnidades}</strong> un
                              </p>
                            </div>
                            <span className={`text-xs text-[var(--surface-400)] transition-transform ${aberta ? 'rotate-180' : ''}`}>▼</span>
                          </button>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditandoRemessa({ keyAntiga: key, data: remessa.data, nome: remessa.nome === '(sem nome)' ? '' : remessa.nome })}
                              className="p-1.5 text-[var(--surface-500)] hover:text-[var(--brand-600)] hover:bg-[var(--surface-100)] rounded transition-colors"
                              title="Editar nome/data"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => excluirRemessaCompleta(remessa)}
                              className="p-1.5 text-[var(--surface-500)] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Excluir remessa inteira"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Itens (expandido) */}
                    {aberta && (
                      <div>
                        {remessa.itens.map(item => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-2 border-b border-[var(--surface-100)] last:border-b-0 hover:bg-[var(--surface-50)]">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--surface-800)] truncate">{item.produto_nome}</p>
                              <p className="text-[10px] text-[var(--surface-400)]">{item.produto_codigo}</p>
                            </div>
                            {item.custo_unitario != null && item.custo_unitario > 0 && (
                              <span className="text-xs text-[var(--surface-500)] hidden sm:inline">R$ {item.custo_unitario.toFixed(2)}/un</span>
                            )}
                            <input
                              type="number" min="0" defaultValue={item.quantidade}
                              onBlur={e => {
                                const v = Math.max(0, parseInt(e.target.value) || 0)
                                if (v !== item.quantidade) alterarItemQuantidade(item, v)
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              className="w-16 h-7 text-center text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] rounded text-mono focus:outline-none focus:border-[var(--brand-500)]"
                            />
                            <button
                              onClick={() => alterarItemQuantidade(item, 0)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                              title="Excluir item"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Salvar Entrada (lote) */}
      {modalSalvarEntrada && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !salvandoLote && setModalSalvarEntrada(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200 inline-flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" /> Salvar lote de entrada
              </h3>
              <button onClick={() => setModalSalvarEntrada(false)} disabled={salvandoLote} className="text-slate-400 hover:text-slate-200 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="text-xs text-slate-300 bg-slate-900/40 rounded p-3 mb-4 space-y-1">
              <div><strong>Unidade:</strong> {currentUnit?.nome} ({currentUnit?.codigo})</div>
              <div><strong>Produtos:</strong> {totalItensEntrada} · <strong>Unidades:</strong> {totalUnidadesEntrada}</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Data da entrada *</label>
                <input type="date" value={loteData} onChange={e => setLoteData(e.target.value)} disabled={salvandoLote}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Nome da Remessa *</label>
                <input type="text" value={loteRemessa} onChange={e => setLoteRemessa(e.target.value)} disabled={salvandoLote}
                  placeholder="Ex: Pedido In Memorian maio/2026"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500" />
                <p className="mt-1 text-[10px] text-slate-400">Mesma remessa será aplicada a todos os produtos do lote</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalSalvarEntrada(false)} disabled={salvandoLote}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarSalvarEntrada} disabled={salvandoLote || !loteData || !loteRemessa.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {salvandoLote ? 'Salvando…' : `Confirmar (${totalItensEntrada} produtos)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Salvar Mínimos */}
      {modalSalvarMinimo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !salvandoLote && setModalSalvarMinimo(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200 inline-flex items-center gap-2">
                <Sliders className="h-5 w-5 text-amber-400" /> Salvar ajuste de mínimos
              </h3>
              <button onClick={() => setModalSalvarMinimo(false)} disabled={salvandoLote} className="text-slate-400 hover:text-slate-200 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="text-xs text-slate-300 bg-slate-900/40 rounded p-3 mb-4">
              <div><strong>Unidade:</strong> {currentUnit?.nome} ({currentUnit?.codigo})</div>
              <div className="mt-1"><strong>{totalItensMinimo}</strong> mínimo{totalItensMinimo > 1 ? 's' : ''} será{totalItensMinimo > 1 ? 'ão' : ''} alterado{totalItensMinimo > 1 ? 's' : ''}</div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalSalvarMinimo(false)} disabled={salvandoLote}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarSalvarMinimo} disabled={salvandoLote}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50">
                {salvandoLote ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
