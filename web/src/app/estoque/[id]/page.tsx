'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, TrendingDown, Save, X, Pencil, Package, DollarSign, Target, ShoppingCart, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import Link from 'next/link'

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

type Entrada = {
  id: string
  produto_id: string
  quantidade: number
  custo_unitario: number | null
  data_entrada: string
  remessa: string | null
}

type Saida = {
  id: string
  contrato_id: string
  quantidade: number
  valor: number | null
  desconto: number | null
  created_at: string
  contrato: {
    codigo: string
    pet_nome: string
    tutor_nome: string
    status: string
  } | null
}

const TIPO_LABELS: Record<string, string> = {
  urna: 'Urna',
  acessorio: 'Acessório',
  incluso: 'Incluso'
}

const TIPO_COLORS: Record<string, string> = {
  urna: 'border-purple-400 bg-purple-900/30',
  acessorio: 'border-blue-400 bg-blue-900/30',
  incluso: 'border-green-400 bg-green-900/30'
}

const TIPO_TEXT_COLORS: Record<string, string> = {
  urna: 'text-purple-400',
  acessorio: 'text-blue-400',
  incluso: 'text-green-400'
}

function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '-'
  if (valor === 0) return 'Incluso'
  return `R$ ${valor.toFixed(2)}`
}

function formatarMoedaCusto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '-'
  return `R$ ${valor.toFixed(2)}`
}

export default function ProdutoDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const { currentUnit } = useUnit()
  const [produto, setProduto] = useState<Produto | null>(null)
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [saidas, setSaidas] = useState<Saida[]>([])
  const [loading, setLoading] = useState(true)
  const [editandoPreco, setEditandoPreco] = useState(false)
  const [novoPreco, setNovoPreco] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Estoque DA UNIDADE ATIVA (vem de produtos_estoque)
  const [estoqueUnidade, setEstoqueUnidade] = useState<number>(0)

  // Modal "Nova entrada"
  const [novaEntradaModal, setNovaEntradaModal] = useState(false)
  const [novaEntradaForm, setNovaEntradaForm] = useState({
    quantidade: '',
    custoUnitario: '',
    remessa: '',
    dataEntrada: new Date().toISOString().slice(0, 10),
  })
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (params.id) {
      carregarDados()
    }
  }, [params.id, currentUnit?.id])

  async function carregarDados() {
    setLoading(true)

    const { data: produtoData } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', params.id as string)
      .single()

    if (produtoData) {
      setProduto(produtoData as Produto)
      setNovoPreco((produtoData as Produto).preco?.toString() || '0')
    }

    // Estoque DA UNIDADE ATIVA (produtos_estoque)
    if (currentUnit?.id) {
      const { data: peData } = await supabase
        .from('produtos_estoque')
        .select('estoque_atual')
        .eq('produto_id', params.id as string)
        .eq('unidade_id', currentUnit.id)
        .maybeSingle<{ estoque_atual: number }>()
      setEstoqueUnidade(peData?.estoque_atual ?? 0)
    }

    // Entradas DA UNIDADE ATIVA
    let qEnt = supabase
      .from('estoque_entradas')
      .select('*')
      .eq('produto_id', params.id as string)
      .order('data_entrada', { ascending: false })
    if (currentUnit?.id) qEnt = qEnt.eq('unidade_id', currentUnit.id)
    const { data: entradasData } = await qEnt
    if (entradasData) setEntradas(entradasData as Entrada[])

    // Saídas (contrato_produtos) — filtra por contrato.unidade_id
    const { data: saidasData } = await supabase
      .from('contrato_produtos')
      .select(`
        id,
        contrato_id,
        quantidade,
        valor,
        desconto,
        created_at,
        contrato:contratos!inner(codigo, pet_nome, tutor_nome, status, unidade_id)
      `)
      .eq('produto_id', params.id as string)
      .eq('contrato.unidade_id', currentUnit?.id || '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false })

    if (saidasData) {
      setSaidas(saidasData as Saida[])
    }

    setLoading(false)
  }

  async function salvarNovaEntrada() {
    if (!produto || !currentUnit?.id) return
    const qtd = parseInt(novaEntradaForm.quantidade, 10)
    if (!qtd || qtd <= 0) {
      alert('Quantidade deve ser maior que zero')
      return
    }
    setSalvandoEntrada(true)
    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)('registrar_entrada_estoque', {
      p_produto_id: produto.id,
      p_unidade_id: currentUnit.id,
      p_quantidade: qtd,
      p_custo_unitario: novaEntradaForm.custoUnitario ? parseFloat(novaEntradaForm.custoUnitario) : null,
      p_remessa: novaEntradaForm.remessa.trim() || null,
      p_data_entrada: novaEntradaForm.dataEntrada,
    })
    if (error) {
      alert('Erro ao registrar entrada: ' + error.message)
      setSalvandoEntrada(false)
      return
    }
    setNovaEntradaModal(false)
    setNovaEntradaForm({ quantidade: '', custoUnitario: '', remessa: '', dataEntrada: new Date().toISOString().slice(0, 10) })
    setSalvandoEntrada(false)
    await carregarDados()
  }

  async function salvarPreco() {
    if (!produto) return
    setSalvando(true)

    const preco = parseFloat(novoPreco) || 0

    const { error } = await supabase
      .from('produtos')
      .update({ preco } as never)
      .eq('id', produto.id)

    if (!error) {
      setProduto({ ...produto, preco })
      setEditandoPreco(false)
    }

    setSalvando(false)
  }

  function getImagemUrl(codigo: string): string {
    return `/estoque/${codigo}.png`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Carregando...</div>
      </div>
    )
  }

  if (!produto) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Produto não encontrado</p>
        <Link href="/estoque" className="text-purple-400 hover:underline mt-2 inline-block">
          Voltar ao estoque
        </Link>
      </div>
    )
  }

  const totalEntradas = entradas.reduce((sum, e) => sum + e.quantidade, 0)
  const totalSaidas = saidas.reduce((sum, s) => sum + s.quantidade, 0)
  const estoqueOk = produto.estoque_infinito || estoqueUnidade >= produto.estoque_minimo

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header com imagem e info principal */}
      <div className={`bg-slate-800 rounded-xl border-2 ${TIPO_COLORS[produto.tipo]} p-6 mb-6`}>
        <div className="flex items-start gap-6">
          {/* Botão voltar */}
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </button>

          {/* Imagem pequena */}
          <div className="w-24 h-24 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0 border border-slate-600 shadow-sm">
            <img
              src={produto.imagem_url || getImagemUrl(produto.codigo)}
              alt={produto.nome}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = '/placeholder-product.png'
                target.onerror = null
              }}
            />
          </div>

          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-200 mb-1">{produto.nome}</h1>
                <p className="text-sm text-slate-400">Código: {produto.codigo}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${TIPO_TEXT_COLORS[produto.tipo]} bg-slate-700 border border-slate-600`}>
                {TIPO_LABELS[produto.tipo]}
              </span>
            </div>

            {/* Stats horizontais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              {/* Preço editável */}
              <div className="bg-slate-700 rounded-lg p-3 border border-slate-600 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  Preço Catálogo
                </div>
                {editandoPreco ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={novoPreco}
                      onChange={(e) => setNovoPreco(e.target.value)}
                      className="w-20 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                      step="0.01"
                      min="0"
                      autoFocus
                    />
                    <button
                      onClick={salvarPreco}
                      disabled={salvando}
                      className="p-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditandoPreco(false)
                        setNovoPreco(produto.preco?.toString() || '0')
                      }}
                      className="p-1 bg-slate-600 text-slate-400 rounded hover:bg-slate-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className={`font-bold ${produto.preco && produto.preco > 0 ? 'text-green-400' : 'text-slate-400'}`}>
                      {formatarMoeda(produto.preco)}
                    </span>
                    <button
                      onClick={() => setEditandoPreco(true)}
                      className="p-1 text-slate-400 hover:text-purple-400 rounded"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Estoque Atual */}
              <div className="bg-slate-700 rounded-lg p-3 border border-slate-600 shadow-sm">
                <div className="flex items-center justify-between gap-2 text-slate-400 text-xs mb-1">
                  <span className="inline-flex items-center gap-2">
                    <Package className="h-3.5 w-3.5" />
                    Estoque {currentUnit?.codigo ? `(${currentUnit.codigo})` : ''}
                  </span>
                  {!produto.estoque_infinito && (
                    <button
                      onClick={() => setNovaEntradaModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                      title="Registrar entrada nesta unidade"
                    >
                      <Plus className="h-3 w-3" /> Entrada
                    </button>
                  )}
                </div>
                <span className={`font-bold text-lg ${
                  produto.estoque_infinito ? 'text-blue-400' : estoqueOk ? 'text-green-400' : 'text-red-400'
                }`}>
                  {produto.estoque_infinito ? '∞' : estoqueUnidade}
                </span>
              </div>

              {/* Estoque Ideal */}
              <div className="bg-slate-700 rounded-lg p-3 border border-slate-600 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Target className="h-3.5 w-3.5" />
                  Estoque Ideal
                </div>
                <span className="font-bold text-lg text-slate-300">
                  {produto.estoque_infinito ? '-' : produto.estoque_minimo}
                </span>
              </div>

              {/* Total Vendido */}
              <div className="bg-slate-700 rounded-lg p-3 border border-slate-600 shadow-sm">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Total Vendido
                </div>
                <span className="font-bold text-lg text-purple-400">
                  {produto.qtde_vendida || 0}
                </span>
              </div>
            </div>

            {/* Custo de referência */}
            <div className="mt-3 text-sm text-slate-400">
              Custo de referência: <span className="font-medium text-slate-300">{formatarMoedaCusto(produto.custo)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de históricos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entradas */}
        <div className="bg-slate-800 rounded-xl border border-slate-600 overflow-hidden">
          <div className="px-4 py-3 bg-green-900/30 border-b flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            <h2 className="font-semibold text-green-300">Entradas de Estoque</h2>
            <span className="ml-auto bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full text-sm font-medium">
              {totalEntradas} un
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {entradas.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma entrada registrada</p>
              </div>
            ) : (
              <div className="divide-y">
                {entradas.map((entrada) => (
                  <div key={entrada.id} className="px-4 py-3 hover:bg-slate-700 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-green-400 bg-green-900/30 px-2 py-1 rounded">
                          +{entrada.quantidade}
                        </span>
                        {entrada.custo_unitario !== null && entrada.custo_unitario > 0 && (
                          <span className="text-sm text-slate-400">
                            R$ {entrada.custo_unitario.toFixed(2)}/un
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(entrada.data_entrada).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {entrada.remessa && (
                      <p className="text-sm text-slate-400 mt-1 pl-1">{entrada.remessa}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Saídas (Vendas) */}
        <div className="bg-slate-800 rounded-xl border border-slate-600 overflow-hidden">
          <div className="px-4 py-3 bg-purple-900/30 border-b flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold text-purple-300">Saídas (Vendas)</h2>
            <span className="ml-auto bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full text-sm font-medium">
              {totalSaidas} un
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {saidas.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma venda registrada</p>
              </div>
            ) : (
              <div className="divide-y">
                {saidas.map((saida) => (
                  <Link
                    key={saida.id}
                    href={`/contratos/${saida.contrato_id}`}
                    className="block px-4 py-3 hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-purple-400 bg-purple-900/30 px-2 py-1 rounded">
                          -{saida.quantidade}
                        </span>
                        {saida.valor !== null && saida.valor > 0 && (
                          <span className="text-sm text-slate-400">
                            R$ {((saida.valor - (saida.desconto || 0)) * saida.quantidade).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(saida.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {saida.contrato && (
                      <div className="mt-1.5 flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-300">{saida.contrato.pet_nome}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-400">{saida.contrato.tutor_nome}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {saida.contrato.codigo}
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Nova Entrada */}
      {novaEntradaModal && produto && currentUnit && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setNovaEntradaModal(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-400" /> Nova entrada de estoque
                </span>
              </h3>
              <button onClick={() => setNovaEntradaModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-slate-400 mb-4 bg-slate-900/40 rounded p-2">
              <div><strong>Produto:</strong> {produto.codigo} — {produto.nome}</div>
              <div><strong>Unidade:</strong> {currentUnit.nome} ({currentUnit.codigo})</div>
              <div className="mt-1 text-slate-500">Saldo atual da unidade: <strong className="text-slate-300">{estoqueUnidade}</strong></div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Quantidade *</label>
                <input
                  type="number"
                  min="1"
                  value={novaEntradaForm.quantidade}
                  onChange={e => setNovaEntradaForm(f => ({ ...f, quantidade: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: 10"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Custo unitário (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={novaEntradaForm.custoUnitario}
                  onChange={e => setNovaEntradaForm(f => ({ ...f, custoUnitario: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: 250.00"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Remessa / Lote (opcional)</label>
                <input
                  type="text"
                  value={novaEntradaForm.remessa}
                  onChange={e => setNovaEntradaForm(f => ({ ...f, remessa: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: NF 12345"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Data da entrada *</label>
                <input
                  type="date"
                  value={novaEntradaForm.dataEntrada}
                  onChange={e => setNovaEntradaForm(f => ({ ...f, dataEntrada: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setNovaEntradaModal(false)}
                disabled={salvandoEntrada}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarNovaEntrada}
                disabled={salvandoEntrada || !novaEntradaForm.quantidade}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {salvandoEntrada ? 'Salvando…' : 'Registrar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
