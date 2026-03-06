'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, TrendingDown, Save, X, Pencil, Package, DollarSign, Target, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  const [produto, setProduto] = useState<Produto | null>(null)
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [saidas, setSaidas] = useState<Saida[]>([])
  const [loading, setLoading] = useState(true)
  const [editandoPreco, setEditandoPreco] = useState(false)
  const [novoPreco, setNovoPreco] = useState('')
  const [salvando, setSalvando] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (params.id) {
      carregarDados()
    }
  }, [params.id])

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

    const { data: entradasData } = await supabase
      .from('estoque_entradas')
      .select('*')
      .eq('produto_id', params.id as string)
      .order('data_entrada', { ascending: false })

    if (entradasData) {
      setEntradas(entradasData)
    }

    const { data: saidasData } = await supabase
      .from('contrato_produtos')
      .select(`
        id,
        contrato_id,
        quantidade,
        valor,
        desconto,
        created_at,
        contrato:contratos(codigo, pet_nome, tutor_nome, status)
      `)
      .eq('produto_id', params.id as string)
      .order('created_at', { ascending: false })

    if (saidasData) {
      setSaidas(saidasData as Saida[])
    }

    setLoading(false)
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
  const estoqueOk = produto.estoque_infinito || produto.estoque_atual >= produto.estoque_minimo

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
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Package className="h-3.5 w-3.5" />
                  Estoque Atual
                </div>
                <span className={`font-bold text-lg ${
                  produto.estoque_infinito ? 'text-blue-400' : estoqueOk ? 'text-green-400' : 'text-red-400'
                }`}>
                  {produto.estoque_infinito ? '∞' : produto.estoque_atual}
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
    </div>
  )
}
