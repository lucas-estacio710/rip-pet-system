'use client'

import { Search, X, AlertTriangle } from 'lucide-react'
import { ORDEM_ACESSORIOS, ordenarCategoriasUrnas } from '@/lib/categorias'

export type StatusEstoqueFiltro = '' | 'critico' | 'zerado' | 'ok'

type ProdutoLike = {
  tipo: 'urna' | 'acessorio'
  categoria: string | null
  estoque_atual: number
  estoque_minimo: number
  estoque_infinito?: boolean
}

type Props<P extends ProdutoLike> = {
  produtos: P[]
  busca: string
  onBusca: (v: string) => void
  /** Categoria selecionada (implica o tipo). '' = todas. */
  categoria: string
  onCategoria: (v: string) => void
  /** Tipo do produto (urna|acessorio|''). Derivado da categoria mas pode ser manipulado externo. */
  tipo: string
  onTipo: (v: string) => void
  status: StatusEstoqueFiltro
  onStatus: (v: StatusEstoqueFiltro) => void
  placeholder?: string
  /** Esconde a linha de subfamílias (caso quem use não tenha catálogo amplo). */
  semSubfamilias?: boolean
  /** Esconde o farol de "Crítico" (útil em modais de seleção de produto). */
  semStatus?: boolean
}

export default function ProdutosFilterBar<P extends ProdutoLike>({
  produtos,
  busca,
  onBusca,
  categoria,
  onCategoria,
  tipo,
  onTipo,
  status,
  onStatus,
  placeholder = 'Buscar produto...',
  semSubfamilias = false,
  semStatus = false,
}: Props<P>) {
  // Filtra apenas pela busca para calcular contadores por subfamília
  const buscaTrim = busca.trim().toLowerCase()
  const baseProdutos = !buscaTrim
    ? produtos
    : produtos.filter(p =>
        // Busca por nome — usa p.nome se existir
        (('nome' in p && typeof (p as unknown as { nome: string }).nome === 'string'
          ? (p as unknown as { nome: string }).nome.toLowerCase().includes(buscaTrim)
          : false)) ||
        (('codigo' in p && typeof (p as unknown as { codigo: string }).codigo === 'string'
          ? (p as unknown as { codigo: string }).codigo.toLowerCase().includes(buscaTrim)
          : false))
      )

  const subfamiliasUrnas = ordenarCategoriasUrnas([...new Set(
    baseProdutos.filter(p => p.tipo === 'urna' && p.categoria).map(p => p.categoria!)
  )])
  const subfamiliasAcessSet = new Set(
    baseProdutos.filter(p => p.tipo === 'acessorio' && p.categoria).map(p => p.categoria!)
  )
  const subfamiliasAcessConhecidas = (ORDEM_ACESSORIOS as readonly string[]).filter(c => subfamiliasAcessSet.has(c))
  const subfamiliasAcessOutras = [...subfamiliasAcessSet].filter(c => !(ORDEM_ACESSORIOS as readonly string[]).includes(c))
  const subfamiliasAcess = [...subfamiliasAcessConhecidas, ...subfamiliasAcessOutras]

  // Contadores de status (sobre o universo já filtrado por tipo/categoria)
  const baseTipoCat = baseProdutos.filter(p => {
    if (tipo && p.tipo !== tipo) return false
    if (categoria && p.categoria !== categoria) return false
    return true
  })
  const countCritico = baseTipoCat.filter(p => !p.estoque_infinito && p.estoque_atual < p.estoque_minimo).length

  function selecionarSubfamilia(tNovo: 'urna' | 'acessorio', cat: string) {
    // Sempre exclusivo: troca tipo + categoria
    if (categoria === cat && tipo === tNovo) {
      onTipo('')
      onCategoria('')
    } else {
      onTipo(tNovo)
      onCategoria(cat)
    }
  }

  return (
    <div className="mb-4 space-y-2">
      {/* Linha 1: busca + status */}
      <div className="flex items-stretch gap-1.5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--surface-400)]" />
          <input
            type="text"
            placeholder={placeholder}
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            className="input pl-9 pr-9 py-1.5 text-sm w-full"
          />
          {busca && (
            <button
              onClick={() => onBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--surface-400)] hover:text-[var(--surface-600)]"
              title="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!semStatus && (
          <button
            onClick={() => onStatus(status === 'critico' ? '' : 'critico')}
            title={`Abaixo do ideal — ${countCritico}`}
            className={`inline-flex items-center gap-1 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${status === 'critico' ? 'bg-red-600 text-white border-red-600' : 'bg-[var(--surface-50)] border-[var(--surface-200)] text-[var(--surface-500)] hover:bg-[var(--surface-100)]'}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="tabular-nums">{countCritico}</span>
          </button>
        )}
      </div>

      {/* Linha 2-3: chips de subfamília agrupados por tipo, em containers coloridos centralizados */}
      {!semSubfamilias && (
        <>
          {subfamiliasUrnas.length > 0 && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 px-2 py-1.5">
              <div className="flex items-center justify-center gap-1 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mr-1 shrink-0">Urnas</span>
                {subfamiliasUrnas.map(cat => {
                  const ativo = tipo === 'urna' && categoria === cat
                  return (
                    <button
                      key={`urna|${cat}`}
                      onClick={() => selecionarSubfamilia('urna', cat)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${ativo ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-100'}`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {subfamiliasAcess.length > 0 && (
            <div className="rounded-lg border border-sky-300/60 bg-sky-50/60 px-2 py-1.5">
              <div className="flex items-center justify-center gap-1 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-wider text-sky-700 mr-1 shrink-0">Acess.</span>
                {subfamiliasAcess.map(cat => {
                  const ativo = tipo === 'acessorio' && categoria === cat
                  return (
                    <button
                      key={`acess|${cat}`}
                      onClick={() => selecionarSubfamilia('acessorio', cat)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${ativo ? 'bg-sky-600 text-white border-sky-600' : 'bg-white border-sky-200 text-sky-800 hover:bg-sky-100'}`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
