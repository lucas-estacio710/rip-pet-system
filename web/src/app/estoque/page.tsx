'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Grid, List, Search, Package, AlertTriangle, ShoppingCart, Target, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [filtroEstoque, setFiltroEstoque] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const supabase = createClient()

  useEffect(() => {
    carregarProdutos()
  }, [])

  async function carregarProdutos() {
    setLoading(true)

    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('tipo')
      .order('nome')

    if (!error) {
      setProdutos(data || [])
    }
    setLoading(false)
  }

  function getStatusEstoque(atual: number, minimo: number, estoqueInfinito?: boolean) {
    if (estoqueInfinito) return { status: 'infinito', color: 'bg-blue-500', label: '∞' }
    if (atual >= minimo) return { status: 'ok', color: 'bg-green-500', label: 'OK' }
    return { status: 'critico', color: 'bg-red-500', label: 'Abaixo do ideal' }
  }

  const produtosFiltrados = produtos.filter(p => {
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
            <p className="text-small text-[var(--shell-text-muted)]">{produtos.length} produtos cadastrados</p>
          </div>
        </div>
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

      {/* Content */}
      {loading ? (
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
      )}
    </div>
  )
}
