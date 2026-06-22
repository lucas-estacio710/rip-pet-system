'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Grid, List, Search, Package, AlertTriangle, ShoppingCart, Target, X, Plus, Minus, Trash2, Save, TrendingUp, Sliders, Pencil, Check, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import ProdutosFilterBar, { type StatusEstoqueFiltro } from '@/components/ui/ProdutosFilterBar'
import { ordenarCategoriasUrnas, ORDEM_ACESSORIOS } from '@/lib/categorias'
import { hojeLocal, dataLocal } from '@/lib/date-local'
import { fetchReservadoPV, calcularLivre } from '@/lib/estoque-reservado'

type Produto = {
  id: string
  codigo: string
  nome: string
  tipo: 'urna' | 'acessorio'
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
  reservado_pv?: number
}

const CATEGORIA_URNA_LABELS: Record<string, string> = {
  'Sleeping': 'Sleeping',
  'Resinas': 'Resinas',
  'Porta/Box': 'Porta/Box',
  'Pedras': 'Pedras',
  'Biournas': 'Biournas',
  'Potes': 'Potes',
  'Standard': 'Standard',
  'Avulsos Legado RIP': 'Avulsos Legado',
}

const CATEGORIA_ACESSORIO_LABELS: Record<string, string> = {
  'Chaveiros Cinzas': 'Chaveiros Cinzas',
  'Porta-Pelos': 'Porta-Pelos',
  'Porta-Cinzas': 'Porta-Cinzas',
  'Porta-Retratos': 'Porta-Retratos',
  'Miniaturas': 'Miniaturas',
  'Personalizados': 'Personalizados',
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
  const { currentUnit, isSuperAdmin } = useUnit()
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
  // Grupos família/subfamília colapsados nas tabs Entrada e Mínimo (chave: `${tab}|${tipo}|${categoria}`)
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set())
  function toggleGrupo(key: string) {
    setGruposColapsados(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }
  // Mosaico visual do estoque (uma imagem por unidade física)
  const [visualEstoque, setVisualEstoque] = useState<{ tipoLabel: string; categoria: string; produtos: Produto[] } | null>(null)
  // Tiques de validação visual no modal de "Visual do estoque" — não persiste em banco, resetam ao reabrir
  const [tiquesVistos, setTiquesVistos] = useState<Set<string>>(new Set())
  useEffect(() => { if (!visualEstoque) setTiquesVistos(new Set()) }, [visualEstoque])
  function toggleTique(pid: string) {
    setTiquesVistos(prev => {
      const n = new Set(prev)
      if (n.has(pid)) n.delete(pid); else n.add(pid)
      return n
    })
  }

  // Balanço de inventário (super_admin) — contagem real → ajusta o delta de cada item
  const [modalBalanco, setModalBalanco] = useState(false)
  const [balancoBusca, setBalancoBusca] = useState('')
  const [balancoContagem, setBalancoContagem] = useState<Record<string, number>>({})
  const [salvandoBalanco, setSalvandoBalanco] = useState(false)

  // Salvamento
  const [modalSalvarEntrada, setModalSalvarEntrada] = useState(false)
  const [modalSalvarMinimo, setModalSalvarMinimo] = useState(false)
  const [salvandoLote, setSalvandoLote] = useState(false)
  const [loteData, setLoteData] = useState(hojeLocal())
  const [loteRemessa, setLoteRemessa] = useState('')

  // Tab Mínimo — linha em edição (lápis para abrir, disquete para fechar)
  const [editandoMinimoId, setEditandoMinimoId] = useState<string | null>(null)
  // Carrinho expandido (header sticky pode mostrar lista dos itens)
  const [carrinhoExpandido, setCarrinhoExpandido] = useState(false)
  // Vendas por produto na unidade ativa — em 30d / 90d / 180d
  const [vendasPorProduto, setVendasPorProduto] = useState<Record<string, { d30: number; d90: number; d180: number }>>({})

  // Tab Histórico (Últimas Entradas)
  type ItemRemessa = { id: string; produto_id: string; produto_nome: string; produto_codigo: string; produto_imagem_url: string | null; quantidade: number; custo_unitario: number | null }
  type Remessa = { data: string; nome: string; itens: ItemRemessa[]; totalProdutos: number; totalUnidades: number }
  const [historicoData, setHistoricoData] = useState<Remessa[]>([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [verAntigos, setVerAntigos] = useState(false)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [editandoRemessa, setEditandoRemessa] = useState<{ keyAntiga: string; data: string; nome: string } | null>(null)
  // Edição de ITENS de uma remessa — modo explícito (abre → edita rascunho → Salvar/Cancelar).
  // editandoItensKey = qual remessa está em edição; itensDraft = qtd por item; itensExcluir = marcados pra remover.
  const [editandoItensKey, setEditandoItensKey] = useState<string | null>(null)
  const [itensDraft, setItensDraft] = useState<Record<string, number>>({})
  const [itensExcluir, setItensExcluir] = useState<Set<string>>(new Set())
  const [salvandoItens, setSalvandoItens] = useState(false)

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
    // Reservado p/ PV (Opção B): derivado de contratos preventivos via view, não da flag is_reserva_pv
    const reservadoMap = await fetchReservadoPV(supabase, currentUnit?.id)
    const merged = produtosData.map((p: Produto) => {
      const pe = peMap.get(p.id)
      return {
        ...p,
        estoque_atual: pe?.estoque_atual ?? 0,
        estoque_minimo: pe?.estoque_minimo ?? 0,
        qtde_vendida: pe?.qtde_vendida ?? 0,
        reservado_pv: reservadoMap.get(p.id) ?? 0,
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
    setLoteData(hojeLocal())
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
  // Carrega contagem de vendas por produto em 30d/90d/180d (na unidade ativa).
  // 2 queries explícitas pra evitar limitação do PostgREST com filtro em embed.
  async function carregarVendasPeriodo() {
    if (!currentUnit?.id) { setVendasPorProduto({}); return }
    const agora = Date.now()
    const d180Iso = dataLocal(new Date(agora - 180 * 24 * 3600 * 1000))
    const t30 = agora - 30 * 24 * 3600 * 1000
    const t90 = agora - 90 * 24 * 3600 * 1000

    // 1. Contratos da unidade ativa nos últimos 180 dias
    const { data: contratos } = await supabase
      .from('contratos')
      .select('id, data_contrato')
      .eq('unidade_id', currentUnit.id)
      .gte('data_contrato', d180Iso)
    type CRow = { id: string; data_contrato: string }
    const contratoData = new Map<string, string>()
    for (const c of (contratos || []) as CRow[]) contratoData.set(c.id, c.data_contrato)
    if (contratoData.size === 0) { setVendasPorProduto({}); return }

    // 2. contrato_produtos cujos contratos estão no set acima — fatiar em chunks por causa do limit do .in()
    const ids = Array.from(contratoData.keys())
    const map: Record<string, { d30: number; d90: number; d180: number }> = {}
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      const { data: cps } = await supabase
        .from('contrato_produtos')
        .select('produto_id, contrato_id')
        .in('contrato_id', slice)
      type CpRow = { produto_id: string; contrato_id: string }
      for (const cp of (cps || []) as CpRow[]) {
        const dc = contratoData.get(cp.contrato_id)
        if (!dc) continue
        const t = new Date(dc + 'T00:00:00').getTime()
        if (!map[cp.produto_id]) map[cp.produto_id] = { d30: 0, d90: 0, d180: 0 }
        map[cp.produto_id].d180++
        if (t >= t90) map[cp.produto_id].d90++
        if (t >= t30) map[cp.produto_id].d30++
      }
    }
    setVendasPorProduto(map)
  }

  async function carregarHistorico() {
    if (!currentUnit?.id) { setHistoricoData([]); return }
    setLoadingHist(true)
    let q = supabase
      .from('estoque_entradas')
      .select('id, produto_id, quantidade, data_entrada, remessa, custo_unitario, produtos!inner(nome, codigo, imagem_url)')
      .eq('unidade_id', currentUnit.id)
      .order('data_entrada', { ascending: false })
      .order('created_at', { ascending: false })
    if (!verAntigos) {
      const since = dataLocal(new Date(Date.now() - 90 * 24 * 3600 * 1000))
      q = q.gte('data_entrada', since)
    }
    const { data } = await q
    type Row = { id: string; produto_id: string; quantidade: number; data_entrada: string; remessa: string | null; custo_unitario: number | null; produtos: { nome: string; codigo: string; imagem_url: string | null } }
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
        produto_imagem_url: r.produtos?.imagem_url || null,
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

  // Vendas por período (30/90/180d) — carrega ao entrar na tab Mínimo ou Atual ou trocar unidade
  useEffect(() => {
    if (tab === 'minimo' || tab === 'atual') carregarVendasPeriodo()
  }, [tab, currentUnit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // --- Edição de itens em modo explícito (Salvar/Cancelar) ---
  function abrirEdicaoItens(remessa: Remessa, key: string) {
    setEditandoItensKey(key)
    setItensDraft(Object.fromEntries(remessa.itens.map(i => [i.id, i.quantidade])))
    setItensExcluir(new Set())
  }
  function cancelarEdicaoItens() {
    setEditandoItensKey(null)
    setItensDraft({})
    setItensExcluir(new Set())
  }
  async function salvarEdicaoItens(remessa: Remessa) {
    // Aplica só o que mudou: itens marcados pra excluir viram 0 (editar_entrada_estoque deleta);
    // demais aplicam a nova quantidade do rascunho. Audita cada um e recarrega uma vez só no fim.
    const mudancas = remessa.itens
      .map(item => {
        const novaQtd = itensExcluir.has(item.id) ? 0 : (itensDraft[item.id] ?? item.quantidade)
        return novaQtd !== item.quantidade ? { item, novaQtd } : null
      })
      .filter(Boolean) as { item: ItemRemessa; novaQtd: number }[]
    if (mudancas.length === 0) { cancelarEdicaoItens(); return }
    setSalvandoItens(true)
    let erros = 0
    for (const { item, novaQtd } of mudancas) {
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
      if (error) { console.error('Editar item falhou', item.id, error); erros++ }
    }
    setSalvandoItens(false)
    if (erros > 0) alert(`${erros} item(ns) falharam ao salvar. Verifique o console.`)
    cancelarEdicaoItens()
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

  // ====================================
  // Inventário (super_admin)
  // ====================================
  // Recebe a quantidade CONTADA por produto e aplica o delta (contado - saldo atual)
  // via registrar_inventario_estoque: grava uma remessa "Inventário ..." em
  // estoque_entradas (quantidade = delta, +/-) E ajusta o saldo. Assim o acerto fica
  // VISÍVEL em "Últimas Entradas". Também audita em historico_alteracoes (quem/quando).
  // Produtos com estoque_infinito são ignorados.
  const balancoAjustes = useMemo(() => {
    return Object.entries(balancoContagem)
      .map(([pid, contado]) => {
        const p = produtos.find(x => x.id === pid)
        if (!p || p.estoque_infinito) return null
        const delta = contado - p.estoque_atual
        return delta !== 0 ? { p, contado, delta } : null
      })
      .filter(Boolean) as { p: Produto; contado: number; delta: number }[]
  }, [balancoContagem, produtos])

  async function aplicarBalanco() {
    if (!currentUnit?.id || balancoAjustes.length === 0) return
    setSalvandoBalanco(true)
    const { data: { user } } = await supabase.auth.getUser()
    // Uma remessa única por execução (agrupa todos os itens deste inventário em "Últimas Entradas")
    const agora = new Date()
    const remessaNome = `Inventário ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    const dataInv = hojeLocal()
    let erros = 0
    for (const a of balancoAjustes) {
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('registrar_inventario_estoque', {
        p_produto_id: a.p.id,
        p_unidade_id: currentUnit.id,
        p_delta: a.delta,
        p_remessa: remessaNome,
        p_data_entrada: dataInv,
      })
      if (error) { console.error('Inventário falhou', a.p.id, error); erros++; continue }
      // Auditoria do ajuste (saldo do sistema -> contado) — guarda o autor (estoque_entradas não tem)
      await supabase.from('historico_alteracoes').insert({
        entidade: 'produtos_estoque',
        entidade_id: a.p.id,
        entidade_nome: a.p.nome,
        campo: 'estoque_atual',
        campo_label: `Inventário ${a.p.codigo} (${currentUnit.codigo})`,
        valor_anterior: String(a.p.estoque_atual),
        valor_novo: String(a.contado),
        nota: `Ajuste de inventário: ${a.delta > 0 ? '+' : ''}${a.delta}`,
        tipo: 'edicao',
        alterado_por: user?.id ?? null,
        alterado_por_email: user?.email ?? null,
      } as never)
    }
    setSalvandoBalanco(false)
    if (erros > 0) alert(`Inventário aplicado com ${erros} erro(s). Verifique o console.`)
    setBalancoContagem({})
    setBalancoBusca('')
    setModalBalanco(false)
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
    return out
  }, [produtos, filtro, filtroCategoria, filtroEstoque, busca, tab])

  // Aplica só busca — base para contadores facetados
  const produtosPorBusca = busca
    ? produtos.filter(p => {
        const t = busca.toLowerCase()
        return p.nome.toLowerCase().includes(t) || p.codigo.toLowerCase().includes(t)
      })
    : produtos

  const contadores = {
    total: produtosPorBusca.length,
    urna: produtosPorBusca.filter(p => p.tipo === 'urna').length,
    acessorio: produtosPorBusca.filter(p => p.tipo === 'acessorio').length,
  }

  const produtosFiltradosPorTipo = produtosPorBusca.filter(p => {
    if (filtro && p.tipo !== filtro) return false
    if (filtroCategoria && p.categoria !== filtroCategoria) return false
    return true
  })
  const contadoresEstoque = {
    todos: produtosFiltradosPorTipo.length,
    critico: produtosFiltradosPorTipo.filter(p => !p.estoque_infinito && p.estoque_atual < p.estoque_minimo).length,
    ok: produtosFiltradosPorTipo.filter(p => p.estoque_infinito || p.estoque_atual >= p.estoque_minimo).length,
    zerado: produtosFiltradosPorTipo.filter(p => !p.estoque_infinito && p.estoque_atual === 0).length,
  }

  const categoriasUrnas = ordenarCategoriasUrnas([...new Set(
    produtosPorBusca.filter(p => p.tipo === 'urna' && p.categoria).map(p => p.categoria!)
  )])

  const contadoresCategorias: Record<string, number> = {}
  categoriasUrnas.forEach(cat => {
    contadoresCategorias[cat] = produtosPorBusca.filter(p => p.tipo === 'urna' && p.categoria === cat).length
  })

  const categoriasAcessoriosSet = new Set(
    produtosPorBusca.filter(p => p.tipo === 'acessorio' && p.categoria).map(p => p.categoria!)
  )
  const categoriasAcessorios = ORDEM_ACESSORIOS.filter(cat => categoriasAcessoriosSet.has(cat))

  const contadoresCategoriasAcessorios: Record<string, number> = {}
  categoriasAcessorios.forEach(cat => {
    contadoresCategoriasAcessorios[cat] = produtosPorBusca.filter(p => p.tipo === 'acessorio' && p.categoria === cat).length
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
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => setModalBalanco(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
              title="Inventário (ajusta saldo pela contagem real e registra em Últimas Entradas)"
            >
              <Scale className="h-4 w-4" /> Inventário
            </button>
          )}
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

      {/* Toolbar nova: busca + status inline + chips de subfamílias */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <ProdutosFilterBar
            produtos={produtos}
            busca={busca}
            onBusca={setBusca}
            tipo={filtro}
            onTipo={setFiltro}
            categoria={filtroCategoria}
            onCategoria={setFiltroCategoria}
            status={filtroEstoque as StatusEstoqueFiltro}
            onStatus={(v) => setFiltroEstoque(v)}
          />
        </div>
      </div>

      {/* Content — Tab Atual */}
      {tab === 'atual' && (loading ? (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2.5">
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
      ) : viewMode === 'grid' ? (() => {
        // Agrupa por família (tipo) e subfamília (categoria); ordena alfabeticamente.
        type Grupo = { tipo: 'urna' | 'acessorio'; categoria: string; produtos: typeof produtosFiltrados }
        const grupos: Grupo[] = []
        for (const tipo of ['urna', 'acessorio'] as const) {
          const doTipo = produtosFiltrados.filter(p => p.tipo === tipo)
          if (doTipo.length === 0) continue
          const semCat = '__sem_categoria__'
          const distintas = [...new Set(doTipo.map(p => p.categoria || semCat))]
          const conhecidas = distintas.filter(c => c !== semCat)
          const ordenadas: string[] = tipo === 'urna'
            ? ordenarCategoriasUrnas(conhecidas)
            : [
                ...(ORDEM_ACESSORIOS as readonly string[]).filter(c => conhecidas.includes(c)),
                ...conhecidas.filter(c => !(ORDEM_ACESSORIOS as readonly string[]).includes(c)),
              ]
          const ordenadasComSemCat = [...ordenadas, ...(distintas.includes(semCat) ? [semCat] : [])]
          for (const cat of ordenadasComSemCat) {
            const produtosCat = doTipo
              .filter(p => (p.categoria || semCat) === cat)
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
            grupos.push({ tipo, categoria: cat === semCat ? 'Sem categoria' : cat, produtos: produtosCat })
          }
        }
        return (
        <div className="space-y-3">
        {grupos.map(g => {
          const grupoKey = `atual|${g.tipo}|${g.categoria}`
          const colapsado = gruposColapsados.has(grupoKey)
          const totalUnidades = g.produtos.reduce((acc, p) => acc + (p.estoque_infinito ? 0 : p.estoque_atual), 0)
          return (
          <div key={grupoKey} className="card overflow-hidden">
            <div className="w-full px-3 py-2 bg-[var(--surface-100)] border-b border-[var(--surface-200)] flex items-center gap-2">
              <button type="button" onClick={() => toggleGrupo(grupoKey)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 min-w-0 text-left">
                <span className={`text-[var(--surface-400)] transition-transform ${colapsado ? '-rotate-90' : ''}`}>▼</span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--surface-500)]">{TIPO_LABELS[g.tipo]}</span>
                <span className="text-[10px] text-[var(--surface-400)]">›</span>
                <span className="text-xs font-semibold text-[var(--surface-700)]">{g.categoria}</span>
                <span className="text-[10px] text-[var(--surface-400)] tabular-nums">{g.produtos.length}</span>
              </button>
              {!filtroEstoque && (
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); setVisualEstoque({ tipoLabel: TIPO_LABELS[g.tipo], categoria: g.categoria, produtos: g.produtos }) }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded transition-colors"
                  title={`Visualização do estoque (${totalUnidades} un)`}
                >
                  <Package className="h-3 w-3" />
                  <span className="hidden sm:inline">Visual</span>
                  <span className="tabular-nums">{totalUnidades}</span>
                </button>
              )}
            </div>
            {!colapsado && (
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2.5 p-2 stagger-children">
          {g.produtos.map((produto) => {
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
                  <div className={`absolute bottom-1 right-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-sm)] shadow-md ${
                    produto.preco && produto.preco > 0 ? 'bg-green-600' : 'bg-[var(--surface-500)]'
                  }`}>
                    {produto.preco && produto.preco > 0 ? `R$ ${produto.preco.toFixed(0)}` : 'Incluso'}
                  </div>
                </div>

                {/* Info */}
                <div className="p-2">
                  <p className="font-medium text-[var(--surface-800)] text-[11px] leading-tight min-h-[2rem] line-clamp-2">{produto.nome}</p>

                  <div className="flex items-center justify-between mt-1.5 text-xs">
                    <div className="flex items-center gap-0.5" title="Estoque atual">
                      {statusEstoque.status === 'critico' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                      {statusEstoque.status === 'ok' && <Package className="h-3 w-3 text-green-500" />}
                      {statusEstoque.status === 'infinito' && <Package className="h-3 w-3 text-blue-500" />}
                      <span className={`font-bold text-mono ${
                        statusEstoque.status === 'infinito' ? 'text-blue-400' :
                        statusEstoque.status === 'critico' ? 'text-red-400' :
                        'text-green-400'
                      }`}>
                        {produto.estoque_infinito ? '∞' : produto.estoque_atual}
                      </span>
                    </div>

                    {!produto.estoque_infinito && (produto.reservado_pv || 0) > 0 && (
                      <div
                        className="flex items-center gap-0.5 text-amber-500"
                        title={`${produto.reservado_pv} reservado(s) p/ preventivo · livre: ${calcularLivre(produto.estoque_atual, produto.reservado_pv || 0)}`}
                      >
                        <span className="font-medium text-mono">PV-{produto.reservado_pv}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-0.5 text-[var(--surface-400)]" title="Estoque ideal">
                      <Target className="h-3 w-3" />
                      <span className="text-mono">{produto.estoque_infinito ? '-' : produto.estoque_minimo}</span>
                    </div>

                    <div className="flex items-center gap-0.5 text-[var(--brand-600)]" title="Qtde vendida">
                      <ShoppingCart className="h-3 w-3" />
                      <span className="font-medium text-mono">{produto.qtde_vendida || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
            </div>
            )}
          </div>
          )
        })}
        </div>
        )
      })() : (() => {
        // Mesma lógica de agrupamento aplicada à tabela
        type Grupo = { tipo: 'urna' | 'acessorio'; categoria: string; produtos: typeof produtosFiltrados }
        const grupos: Grupo[] = []
        for (const tipo of ['urna', 'acessorio'] as const) {
          const doTipo = produtosFiltrados.filter(p => p.tipo === tipo)
          if (doTipo.length === 0) continue
          const semCat = '__sem_categoria__'
          const distintas = [...new Set(doTipo.map(p => p.categoria || semCat))]
          const conhecidas = distintas.filter(c => c !== semCat)
          const ordenadas: string[] = tipo === 'urna'
            ? ordenarCategoriasUrnas(conhecidas)
            : [
                ...(ORDEM_ACESSORIOS as readonly string[]).filter(c => conhecidas.includes(c)),
                ...conhecidas.filter(c => !(ORDEM_ACESSORIOS as readonly string[]).includes(c)),
              ]
          const ordenadasComSemCat = [...ordenadas, ...(distintas.includes(semCat) ? [semCat] : [])]
          for (const cat of ordenadasComSemCat) {
            const produtosCat = doTipo
              .filter(p => (p.categoria || semCat) === cat)
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
            grupos.push({ tipo, categoria: cat === semCat ? 'Sem categoria' : cat, produtos: produtosCat })
          }
        }
        return (
        <div className="space-y-3">
        {grupos.map(g => {
          const grupoKey = `atual|${g.tipo}|${g.categoria}`
          const colapsado = gruposColapsados.has(grupoKey)
          return (
          <div key={grupoKey} className="card overflow-hidden">
            <button type="button" onClick={() => toggleGrupo(grupoKey)}
              className="w-full px-3 py-2 bg-[var(--surface-100)] border-b border-[var(--surface-200)] flex items-center gap-2 hover:bg-[var(--surface-200)] transition-colors">
              <span className={`text-[var(--surface-400)] transition-transform ${colapsado ? '-rotate-90' : ''}`}>▼</span>
              <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--surface-500)]">{TIPO_LABELS[g.tipo]}</span>
              <span className="text-[10px] text-[var(--surface-400)]">›</span>
              <span className="text-xs font-semibold text-[var(--surface-700)]">{g.categoria}</span>
              <span className="ml-auto text-[10px] text-[var(--surface-400)] tabular-nums">{g.produtos.length}</span>
            </button>
            {!colapsado && (
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
              {g.produtos.map((produto) => {
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
            )}
          </div>
          )
        })}
        </div>
        )
      })())}

      {/* ============================ */}
      {/* Tab: ENTRADA (carrinho) */}
      {/* ============================ */}
      {tab === 'entrada' && (
        <div>
          {/* Header sticky com contadores, lista expansível e ações */}
          <div className="sticky top-0 z-10 bg-[var(--surface-0)]/95 backdrop-blur-sm border border-[var(--surface-200)] rounded-lg mb-3 shadow-sm">
            <div className="p-3 flex items-center justify-between gap-2">
              <button
                onClick={() => totalItensEntrada > 0 && setCarrinhoExpandido(v => !v)}
                disabled={totalItensEntrada === 0}
                className="flex items-center gap-2 text-sm text-left flex-1 min-w-0 disabled:cursor-default"
              >
                <ShoppingCart className={`h-4 w-4 flex-shrink-0 ${totalItensEntrada > 0 ? 'text-emerald-600' : 'text-[var(--surface-400)]'}`} />
                {totalItensEntrada === 0 ? (
                  <span className="text-[var(--surface-400)]">Carrinho vazio — use os botões para adicionar quantidades</span>
                ) : (
                  <>
                    <span className="text-[var(--surface-700)]">
                      <strong>{totalItensEntrada}</strong> produto{totalItensEntrada > 1 ? 's' : ''} ·{' '}
                      <strong>{totalUnidadesEntrada}</strong> unidade{totalUnidadesEntrada > 1 ? 's' : ''}
                    </span>
                    <span className={`text-[var(--surface-400)] transition-transform text-xs ${carrinhoExpandido ? 'rotate-180' : ''}`}>▼</span>
                  </>
                )}
              </button>
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
            {carrinhoExpandido && totalItensEntrada > 0 && (
              <div className="border-t border-[var(--surface-100)] bg-[var(--surface-50)]/50 max-h-48 overflow-y-auto">
                {Object.entries(carrinhoEntrada).map(([pid, qtd]) => {
                  const prod = produtos.find(p => p.id === pid)
                  if (!prod) return null
                  return (
                    <div key={pid} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-[var(--surface-100)] last:border-b-0 hover:bg-[var(--surface-100)]/50">
                      <span className="flex-1 truncate text-[var(--surface-700)]">{prod.nome}</span>
                      <span className="text-mono font-semibold text-emerald-700 tabular-nums">+{qtd}</span>
                      <button
                        onClick={() => setCarrinhoEntradaQtd(pid, 0)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5"
                        title="Remover do carrinho"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full rounded-lg" />))}
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <EmptyState icon={Package} title="Nenhum produto" description={busca ? 'Ajuste a busca' : 'Sem produtos cadastrados'} />
          ) : (() => {
            // Agrupa por família (tipo) e subfamília (categoria); ordena alfabeticamente
            // dentro de cada subgrupo.
            const elegiveis = produtosFiltrados.filter(p => !p.estoque_infinito)
            type Grupo = { tipo: 'urna' | 'acessorio'; categoria: string; produtos: typeof elegiveis }
            const grupos: Grupo[] = []
            for (const tipo of ['urna', 'acessorio'] as const) {
              const doTipo = elegiveis.filter(p => p.tipo === tipo)
              if (doTipo.length === 0) continue
              const semCat = '__sem_categoria__'
              const distintas = [...new Set(doTipo.map(p => p.categoria || semCat))]
              const conhecidas = distintas.filter(c => c !== semCat)
              const ordenadas: string[] = tipo === 'urna'
                ? ordenarCategoriasUrnas(conhecidas)
                : [
                    ...(ORDEM_ACESSORIOS as readonly string[]).filter(c => conhecidas.includes(c)),
                    ...conhecidas.filter(c => !(ORDEM_ACESSORIOS as readonly string[]).includes(c)),
                  ]
              const ordenadasComSemCat = [...ordenadas, ...(distintas.includes(semCat) ? [semCat] : [])]
              for (const cat of ordenadasComSemCat) {
                const produtosCat = doTipo
                  .filter(p => (p.categoria || semCat) === cat)
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
                grupos.push({
                  tipo,
                  categoria: cat === semCat ? 'Sem categoria' : cat,
                  produtos: produtosCat,
                })
              }
            }

            return (
              <div className="space-y-3">
                {grupos.map(g => {
                  const grupoKey = `entrada|${g.tipo}|${g.categoria}`
                  const colapsado = gruposColapsados.has(grupoKey)
                  const qtdNoGrupo = g.produtos.reduce((acc, p) => acc + (carrinhoEntrada[p.id] || 0), 0)
                  return (
                  <div key={grupoKey} className="card overflow-hidden">
                    <button type="button" onClick={() => toggleGrupo(grupoKey)}
                      className="w-full px-3 py-2 bg-[var(--surface-100)] border-b border-[var(--surface-200)] flex items-center gap-2 hover:bg-[var(--surface-200)] transition-colors">
                      <span className={`text-[var(--surface-400)] transition-transform ${colapsado ? '-rotate-90' : ''}`}>▼</span>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--surface-500)]">{TIPO_LABELS[g.tipo]}</span>
                      <span className="text-[10px] text-[var(--surface-400)]">›</span>
                      <span className="text-xs font-semibold text-[var(--surface-700)]">{g.categoria}</span>
                      {qtdNoGrupo > 0 && (
                        <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          +{qtdNoGrupo}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[var(--surface-400)] tabular-nums">{g.produtos.length}</span>
                    </button>
                    {!colapsado && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-2">
                    {g.produtos.map(p => {
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
                    <div className="flex-1 min-w-0 sm:flex-initial sm:w-[280px] sm:max-w-[280px] lg:flex-1 lg:w-auto lg:max-w-none xl:flex-initial xl:w-[280px] xl:max-w-[280px]">
                      <div className="flex items-start gap-2">
                        <p className="font-medium text-sm text-[var(--surface-800)] line-clamp-2 leading-tight">{p.nome}</p>
                        {critico && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                      </div>
                    </div>
                    <div className="text-right hidden sm:flex gap-4">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-wide text-[var(--surface-400)]">Estoque Atual</span>
                        <span className={`text-xl font-bold text-mono leading-none mt-0.5 ${status.status === 'critico' ? 'text-red-600' : status.status === 'infinito' ? 'text-blue-500' : 'text-[var(--surface-700)]'}`}>
                          {p.estoque_infinito ? '∞' : p.estoque_atual}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-wide text-[var(--surface-400)]">Mínimo Ideal</span>
                        <span className="text-xl font-bold text-mono leading-none mt-0.5 text-[var(--surface-500)]">
                          {p.estoque_infinito ? '-' : p.estoque_minimo}
                        </span>
                      </div>
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
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* ============================ */}
      {/* Tab: MÍNIMO (carrinho) */}
      {/* ============================ */}
      {tab === 'minimo' && (
        <div>
          <div className="sticky top-0 z-10 bg-[var(--surface-0)]/95 backdrop-blur-sm border border-[var(--surface-200)] rounded-lg mb-3 shadow-sm">
            <div className="p-3 flex items-center justify-between gap-2">
              <button
                onClick={() => totalItensMinimo > 0 && setCarrinhoExpandido(v => !v)}
                disabled={totalItensMinimo === 0}
                className="flex items-center gap-2 text-sm text-left flex-1 min-w-0 disabled:cursor-default"
              >
                <Sliders className={`h-4 w-4 flex-shrink-0 ${totalItensMinimo > 0 ? 'text-amber-600' : 'text-[var(--surface-400)]'}`} />
                {totalItensMinimo === 0 ? (
                  <span className="text-[var(--surface-400)]">Sem alterações pendentes</span>
                ) : (
                  <>
                    <span className="text-[var(--surface-700)]">
                      <strong>{totalItensMinimo}</strong> produto{totalItensMinimo > 1 ? 's' : ''} alterado{totalItensMinimo > 1 ? 's' : ''}
                    </span>
                    <span className={`text-[var(--surface-400)] transition-transform text-xs ${carrinhoExpandido ? 'rotate-180' : ''}`}>▼</span>
                  </>
                )}
              </button>
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
            {carrinhoExpandido && totalItensMinimo > 0 && (
              <div className="border-t border-[var(--surface-100)] bg-[var(--surface-50)]/50 max-h-48 overflow-y-auto">
                {Object.entries(carrinhoMinimo).map(([pid, novoMin]) => {
                  const prod = produtos.find(p => p.id === pid)
                  if (!prod) return null
                  return (
                    <div key={pid} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-[var(--surface-100)] last:border-b-0 hover:bg-[var(--surface-100)]/50">
                      <span className="flex-1 truncate text-[var(--surface-700)]">{prod.nome}</span>
                      <span className="text-mono text-[var(--surface-500)] tabular-nums">{prod.estoque_minimo}</span>
                      <span className="text-[var(--surface-400)]">→</span>
                      <span className="text-mono font-semibold text-amber-700 tabular-nums">{novoMin}</span>
                      <button
                        onClick={() => setCarrinhoMinimo(prev => { const n = { ...prev }; delete n[pid]; return n })}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5"
                        title="Descartar alteração"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-16 w-full rounded-lg" />))}
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <EmptyState icon={Package} title="Nenhum produto" description={busca ? 'Ajuste a busca' : 'Sem produtos cadastrados'} />
          ) : (() => {
            // Agrupa por família (tipo) e subfamília (categoria); ordena alfabeticamente
            // dentro de cada subgrupo.
            const elegiveis = produtosFiltrados.filter(p => !p.estoque_infinito)
            type Grupo = { tipo: 'urna' | 'acessorio'; categoria: string; produtos: typeof elegiveis }
            const grupos: Grupo[] = []
            for (const tipo of ['urna', 'acessorio'] as const) {
              const doTipo = elegiveis.filter(p => p.tipo === tipo)
              if (doTipo.length === 0) continue
              const semCat = '__sem_categoria__'
              const distintas = [...new Set(doTipo.map(p => p.categoria || semCat))]
              const conhecidas = distintas.filter(c => c !== semCat)
              const ordenadas: string[] = tipo === 'urna'
                ? ordenarCategoriasUrnas(conhecidas)
                : [
                    ...(ORDEM_ACESSORIOS as readonly string[]).filter(c => conhecidas.includes(c)),
                    ...conhecidas.filter(c => !(ORDEM_ACESSORIOS as readonly string[]).includes(c)),
                  ]
              const ordenadasComSemCat = [...ordenadas, ...(distintas.includes(semCat) ? [semCat] : [])]
              for (const cat of ordenadasComSemCat) {
                const produtosCat = doTipo
                  .filter(p => (p.categoria || semCat) === cat)
                  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
                grupos.push({
                  tipo,
                  categoria: cat === semCat ? 'Sem categoria' : cat,
                  produtos: produtosCat,
                })
              }
            }

            return (
              <div className="space-y-3">
                {grupos.map(g => {
                  const grupoKey = `minimo|${g.tipo}|${g.categoria}`
                  const colapsado = gruposColapsados.has(grupoKey)
                  const alteradosNoGrupo = g.produtos.filter(p => carrinhoMinimo[p.id] !== undefined).length
                  return (
                  <div key={grupoKey} className="card overflow-hidden">
                    <button type="button" onClick={() => toggleGrupo(grupoKey)}
                      className="w-full px-3 py-2 bg-[var(--surface-100)] border-b border-[var(--surface-200)] flex items-center gap-2 hover:bg-[var(--surface-200)] transition-colors">
                      <span className={`text-[var(--surface-400)] transition-transform ${colapsado ? '-rotate-90' : ''}`}>▼</span>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--surface-500)]">{TIPO_LABELS[g.tipo]}</span>
                      <span className="text-[10px] text-[var(--surface-400)]">›</span>
                      <span className="text-xs font-semibold text-[var(--surface-700)]">{g.categoria}</span>
                      {alteradosNoGrupo > 0 && (
                        <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          {alteradosNoGrupo} alt.
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[var(--surface-400)] tabular-nums">{g.produtos.length}</span>
                    </button>
                    {!colapsado && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-2">
                    {g.produtos.map(p => {
                      const minAtual = p.estoque_minimo
                      const valor = carrinhoMinimo[p.id] !== undefined ? carrinhoMinimo[p.id] : minAtual
                      const alterado = carrinhoMinimo[p.id] !== undefined
                      const desabilitado = !!p.estoque_infinito
                      const critico = isCritico(p)
                      return (
                  <div key={p.id} className={`flex items-center gap-3 p-3 border-b border-[var(--surface-100)] last:border-b-0 ${valor === 0 ? 'bg-slate-500/15' : 'bg-emerald-500/15'} ${desabilitado ? 'opacity-50' : ''}`}>
                    <div className="w-12 h-12 rounded-md bg-[var(--surface-100)] overflow-hidden flex-shrink-0">
                      <img src={p.imagem_url || getImagemUrl(p.codigo)} alt="" className="w-full h-full object-cover"
                        onError={(e) => { const t = e.target as HTMLImageElement; t.style.visibility = 'hidden' }} />
                    </div>
                    <div className="flex-1 min-w-0 sm:flex-initial sm:w-[280px] sm:max-w-[280px] lg:flex-1 lg:w-auto lg:max-w-none xl:flex-initial xl:w-[280px] xl:max-w-[280px]">
                      <div className="flex items-start gap-2">
                        <p className="font-medium text-sm text-[var(--surface-800)] line-clamp-2 leading-tight">{p.nome}</p>
                        {critico && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                      </div>
                    </div>
                    <div className="text-right hidden sm:flex flex-col items-end">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--surface-400)]">Estoque Atual</span>
                      <span className="text-xl font-bold text-mono leading-none mt-0.5 text-[var(--surface-700)]">
                        {p.estoque_atual}
                      </span>
                    </div>
                    {/* Vendas: total + janelas 30/90/180 dias */}
                    <div className="hidden md:flex lg:hidden xl:flex flex-col items-end min-w-[140px]">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--surface-400)]">Vendas</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xl font-bold text-mono leading-none text-purple-600">{p.qtde_vendida || 0}</span>
                        <span className="text-[9px] text-[var(--surface-400)] uppercase">total</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] tabular-nums text-[var(--surface-500)]">
                        {([
                          { v: vendasPorProduto[p.id]?.d30 || 0, label: '30d' },
                          { v: vendasPorProduto[p.id]?.d90 || 0, label: '90d' },
                          { v: vendasPorProduto[p.id]?.d180 || 0, label: '180d' },
                        ]).map((j, i, arr) => {
                          const cor = j.v > 0 ? 'text-blue-500' : 'text-amber-500'
                          return (
                            <span key={j.label} className="flex items-center gap-2">
                              <span className={cor}>
                                <span className="font-semibold">{j.v}</span>
                                <span className="text-[9px]">/{j.label}</span>
                              </span>
                              {i < arr.length - 1 && <span>·</span>}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    {(() => {
                      const emEdicao = editandoMinimoId === p.id
                      if (!emEdicao) {
                        return (
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] uppercase tracking-wide text-[var(--surface-400)]">Mínimo Ideal</span>
                              <span className={`text-xl font-bold text-mono leading-none mt-0.5 ${alterado ? 'text-amber-700' : 'text-[var(--surface-500)]'}`}>
                                {valor}
                              </span>
                            </div>
                            <button
                              onClick={() => setEditandoMinimoId(p.id)}
                              disabled={desabilitado}
                              className="p-1.5 text-[var(--surface-500)] hover:text-amber-600 hover:bg-amber-50 rounded transition-colors disabled:opacity-30"
                              title="Editar mínimo"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )
                      }
                      return (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCarrinhoMinimoVal(p.id, Math.max(0, valor - 1), minAtual)} disabled={desabilitado || valor === 0}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface-100)] text-[var(--surface-700)] hover:bg-[var(--surface-200)] disabled:opacity-30">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number" min="0" value={valor}
                            autoFocus
                            onChange={e => setCarrinhoMinimoVal(p.id, Math.max(0, parseInt(e.target.value) || 0), minAtual)}
                            onKeyDown={e => { if (e.key === 'Enter') setEditandoMinimoId(null); if (e.key === 'Escape') setEditandoMinimoId(null) }}
                            disabled={desabilitado}
                            className={`w-14 h-7 text-center text-sm border rounded-md text-mono focus:outline-none focus:border-amber-500 disabled:opacity-50 ${alterado ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold' : 'bg-[var(--surface-50)] border-[var(--surface-200)]'}`}
                          />
                          <button onClick={() => setCarrinhoMinimoVal(p.id, valor + 1, minAtual)} disabled={desabilitado}
                            className="w-7 h-7 flex items-center justify-center rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-30">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditandoMinimoId(null)}
                            className="ml-1 w-7 h-7 flex items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                            title="Fechar edição (mudança fica no carrinho)">
                            <Save className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })()}
                    {alterado && editandoMinimoId !== p.id && (
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
                  )
                })}
              </div>
            )
          })()}
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
                    {aberta && (() => {
                      const editandoItens = editandoItensKey === key
                      return (
                      <div>
                        {/* Toolbar de edição de itens */}
                        <div className="flex items-center justify-end gap-2 px-4 py-2 bg-[var(--surface-50)]/50 border-b border-[var(--surface-100)]">
                          {editandoItens ? (
                            <>
                              <span className="text-xs text-[var(--surface-500)] mr-auto">Edite as quantidades e salve, ou cancele para descartar.</span>
                              <button onClick={cancelarEdicaoItens} disabled={salvandoItens}
                                className="px-3 py-1.5 text-xs rounded-md bg-[var(--surface-200)] text-[var(--surface-700)] hover:bg-[var(--surface-300)] disabled:opacity-50">
                                Cancelar
                              </button>
                              <button onClick={() => salvarEdicaoItens(remessa)} disabled={salvandoItens}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                                <Save className="h-3.5 w-3.5" /> {salvandoItens ? 'Salvando…' : 'Salvar'}
                              </button>
                            </>
                          ) : (
                            <button onClick={() => abrirEdicaoItens(remessa, key)} disabled={editandoItensKey !== null}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-[var(--surface-200)] text-[var(--surface-600)] hover:bg-[var(--surface-100)] disabled:opacity-40"
                              title={editandoItensKey !== null ? 'Termine a edição em andamento primeiro' : 'Editar quantidades dos itens'}>
                              <Pencil className="h-3.5 w-3.5" /> Editar itens
                            </button>
                          )}
                        </div>
                        {remessa.itens.map(item => {
                          const marcadoExcluir = itensExcluir.has(item.id)
                          return (
                          <div key={item.id} className={`flex items-center gap-3 px-4 py-2 border-b border-[var(--surface-100)] last:border-b-0 hover:bg-[var(--surface-50)] ${marcadoExcluir ? 'opacity-50' : ''}`}>
                            <div className="w-10 h-10 rounded bg-[var(--surface-100)] overflow-hidden flex-shrink-0 flex items-center justify-center">
                              <img
                                src={item.produto_imagem_url || getImagemUrl(item.produto_codigo)}
                                alt={item.produto_nome}
                                className="w-full h-full object-cover"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                              />
                            </div>
                            <p className={`flex-1 min-w-0 text-sm text-[var(--surface-800)] truncate ${marcadoExcluir ? 'line-through' : ''}`}>{item.produto_nome}</p>
                            {editandoItens ? (
                              <>
                                <input
                                  type="number" value={itensDraft[item.id] ?? item.quantidade}
                                  disabled={marcadoExcluir}
                                  onChange={e => {
                                    const v = parseInt(e.target.value, 10)
                                    setItensDraft(prev => ({ ...prev, [item.id]: Number.isNaN(v) ? 0 : v }))
                                  }}
                                  className="w-16 h-7 text-center text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] rounded text-mono focus:outline-none focus:border-[var(--brand-500)] disabled:opacity-40"
                                />
                                <button
                                  onClick={() => setItensExcluir(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n })}
                                  className={`p-1 rounded transition-colors ${marcadoExcluir ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-500 hover:text-red-700 hover:bg-red-50'}`}
                                  title={marcadoExcluir ? 'Desfazer exclusão' : 'Marcar para excluir'}
                                >
                                  {marcadoExcluir ? <Check className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                              </>
                            ) : (
                              <span className="w-16 text-center text-sm text-mono text-[var(--surface-700)]">{item.quantidade}</span>
                            )}
                          </div>
                          )
                        })}
                      </div>
                      )
                    })()}
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

      {/* Modal: Balanço de inventário (super_admin) */}
      {modalBalanco && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !salvandoBalanco && setModalBalanco(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-slate-200 inline-flex items-center gap-2">
                <Scale className="h-5 w-5 text-amber-400" /> Inventário
              </h3>
              <button onClick={() => setModalBalanco(false)} disabled={salvandoBalanco} className="text-slate-400 hover:text-slate-200 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pt-4 flex-shrink-0">
              <p className="text-xs text-slate-400 mb-3">
                Informe a <strong className="text-slate-300">quantidade contada</strong> de cada produto. O sistema ajusta o saldo pelo delta (pode ficar negativo) e registra uma remessa <strong className="text-slate-300">&quot;Inventário&quot;</strong> em Últimas Entradas. Unidade: <strong className="text-slate-300">{currentUnit?.nome} ({currentUnit?.codigo})</strong>.
              </p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text" value={balancoBusca} onChange={e => setBalancoBusca(e.target.value)}
                  placeholder="Buscar produto por nome ou código…"
                  className="w-full pl-9 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto px-5 flex-1">
              {produtos
                .filter(p => !p.estoque_infinito)
                .filter(p => {
                  if (!balancoBusca.trim()) return true
                  const t = balancoBusca.toLowerCase()
                  return p.nome.toLowerCase().includes(t) || p.codigo.toLowerCase().includes(t)
                })
                .map(p => {
                  const contado = balancoContagem[p.id] ?? p.estoque_atual
                  const delta = contado - p.estoque_atual
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-700/50">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-200 truncate">{p.nome}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{p.codigo} · sistema: {p.estoque_atual}</div>
                      </div>
                      <input
                        type="number" value={contado}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10)
                          setBalancoContagem(prev => {
                            const next = { ...prev }
                            if (Number.isNaN(v) || v === p.estoque_atual) delete next[p.id]
                            else next[p.id] = v
                            return next
                          })
                        }}
                        className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-center text-sm focus:outline-none focus:border-amber-500"
                      />
                      <span className={`w-12 text-right text-sm font-mono font-semibold ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                        {delta === 0 ? '—' : (delta > 0 ? `+${delta}` : delta)}
                      </span>
                    </div>
                  )
                })}
            </div>
            <div className="flex gap-2 p-5 border-t border-slate-700 flex-shrink-0">
              <button onClick={() => setModalBalanco(false)} disabled={salvandoBalanco}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50">Cancelar</button>
              <button onClick={aplicarBalanco} disabled={salvandoBalanco || balancoAjustes.length === 0}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {salvandoBalanco ? 'Lançando…' : `Lançar inventário (${balancoAjustes.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Visual do estoque (mosaico — uma imagem por unidade física) */}
      {visualEstoque && (() => {
        const totalUnidades = visualEstoque.produtos.reduce((acc, p) => acc + (p.estoque_infinito ? 0 : p.estoque_atual), 0)
        const totalProdutos = visualEstoque.produtos.filter(p => !p.estoque_infinito && p.estoque_atual > 0).length
        return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setVisualEstoque(null)}>
          <div className="bg-[var(--surface-0)] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-[var(--surface-200)]"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--surface-200)] flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-[var(--shell-text)]">
                  📦 Visual do estoque
                </h3>
                <p className="text-xs text-[var(--surface-500)] mt-0.5">
                  <span className="font-semibold">{visualEstoque.tipoLabel}</span> › <span>{visualEstoque.categoria}</span>
                  <span className="mx-2 text-[var(--surface-300)]">·</span>
                  <span className="text-emerald-600 font-bold">{totalUnidades}</span> un em <span className="font-semibold">{totalProdutos}</span> produto{totalProdutos !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setVisualEstoque(null)} className="text-[var(--surface-400)] hover:text-[var(--shell-text)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Conteúdo: mosaico contínuo — uma imagem por unidade física, com pequeno espaço entre produtos diferentes */}
            <div className="overflow-y-auto p-4">
              {(() => {
                const comEstoque = visualEstoque.produtos.filter(p => !p.estoque_infinito && p.estoque_atual > 0)
                if (comEstoque.length === 0) {
                  return <p className="text-center text-sm text-[var(--surface-400)] py-8 italic">Nenhuma unidade em estoque nesta categoria.</p>
                }
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {comEstoque.map((p, idx) => {
                      const imgSrc = p.imagem_url || getImagemUrl(p.codigo)
                      const visto = tiquesVistos.has(p.id)
                      const reservado = p.reservado_pv || 0
                      return (
                        <Fragment key={p.id}>
                          {/* Colchete de abertura + qtd + tique */}
                          <div className="flex items-center gap-1 self-center text-xs font-mono text-[var(--surface-500)]">
                            <span className="text-base leading-none text-[var(--surface-400)]">[</span>
                            <span
                              className={`font-bold tabular-nums ${(p.reservado_pv || 0) > 0 ? 'bg-amber-200 text-amber-900 rounded px-1' : ''}`}
                              title={(p.reservado_pv || 0) > 0 ? `${p.reservado_pv} segurado(s) p/ PV · livre ${p.estoque_atual - (p.reservado_pv || 0)}` : undefined}
                            >
                              {p.estoque_atual}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleTique(p.id)}
                              className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-colors ${visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-transparent border-[var(--surface-300)] text-transparent hover:border-emerald-400'}`}
                              title={visto ? 'Marcar como não conferido' : 'Marcar como conferido'}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          </div>
                          {/* Imagens — quando > 8, mostra só 1 thumb com badge "xN" pra não estourar o layout */}
                          {p.estoque_atual > 8 ? (
                            <div className={`relative w-14 h-14 rounded-md bg-[var(--surface-100)] overflow-hidden flex-shrink-0 transition-opacity ${visto ? 'opacity-50' : ''}`}
                              title={`${p.nome} (${p.estoque_atual} un)`}>
                              <img src={imgSrc} alt={p.nome} className="w-full h-full object-cover"
                                onError={(e) => { const t = e.target as HTMLImageElement; t.style.visibility = 'hidden' }} />
                              <span className="absolute bottom-0.5 right-0.5 text-white text-xs font-bold font-mono tabular-nums bg-black/70 rounded px-1 py-0 leading-tight">
                                ×{p.estoque_atual}
                              </span>
                              {reservado > 0 && (
                                <span className="absolute top-0.5 left-0.5 text-amber-900 text-[9px] font-bold font-mono bg-amber-300/95 rounded px-1 leading-tight"
                                  title={`${reservado} segurado(s) p/ PV · livre ${p.estoque_atual - reservado}`}>
                                  PV {reservado}
                                </span>
                              )}
                            </div>
                          ) : (
                            Array.from({ length: p.estoque_atual }).map((_, i) => {
                              // As últimas `reservado` unidades estão seguradas p/ PV
                              const ehReserva = i >= p.estoque_atual - reservado
                              return (
                              <div key={i} className={`relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0 transition-opacity ${visto ? 'opacity-50' : ''} ${ehReserva ? 'ring-2 ring-amber-400 bg-amber-100' : 'bg-[var(--surface-100)]'}`}
                                title={ehReserva ? `${p.nome} — segurado p/ PV` : `${p.nome} (${p.estoque_atual} un)`}>
                                <img src={imgSrc} alt={p.nome} className={`w-full h-full object-cover ${ehReserva ? 'opacity-60' : ''}`}
                                  onError={(e) => { const t = e.target as HTMLImageElement; t.style.visibility = 'hidden' }} />
                                {ehReserva && (
                                  <span className="absolute inset-x-0 bottom-0 text-center text-[9px] font-bold text-amber-900 bg-amber-300/90 leading-tight">PV</span>
                                )}
                              </div>
                              )
                            })
                          )}
                          {/* Colchete de fechamento */}
                          <span className="self-center text-base leading-none font-mono text-[var(--surface-400)]">]</span>
                          {idx < comEstoque.length - 1 && <div className="w-3 h-14 flex-shrink-0" aria-hidden="true" />}
                        </Fragment>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
