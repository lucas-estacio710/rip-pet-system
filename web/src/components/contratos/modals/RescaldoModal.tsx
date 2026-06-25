'use client'

import { useEffect, useState } from 'react'

// ============================================================================
// RescaldoModal — modal único compartilhado entre /contratos (pipeline) e
// /contratos/[id] (detalhe). Baseado na versão do pipeline (a mais completa):
// trata "Nenhum rescaldo" (0002), agrupa "Adicionar" por tipo com label/ícone,
// e mostra o tipo TRADUZIDO no badge dos itens já no contrato.
//
// Apresentacional: estados de dados e persistência ficam nos pais, injetados
// por callbacks. Só a busca é estado interno (reseta ao abrir).
// ============================================================================

export type RescaldoProduto = {
  id: string
  codigo: string
  nome: string
  tipo: string
  rescaldo_tipo: string
  preco: number | null
  imagem_url: string | null
}

/** Linha de contrato_produtos (tolerante às duas formas: pipeline tem produto_id no topo, detalhe em produto.id). */
export type RescaldoLinha = {
  id: string
  produto_id?: string
  rescaldo_feito: boolean
  produto: {
    id?: string
    codigo?: string | null
    nome?: string | null
    rescaldo_tipo?: string | null
    imagem_url?: string | null
  } | null
}

export const RESCALDO_TIPO_LABELS: Record<string, { label: string; icon: string }> = {
  molde_patinha: { label: 'Molde de Patinha', icon: '🐾' },
  pelo_extra: { label: 'Pelo Extra', icon: '✂️' },
  carimbo: { label: 'Carimbo', icon: '📄' },
}

type RescaldoModalProps = {
  isOpen: boolean
  petNome: string
  codigo: string
  /** Todas as linhas de contrato_produtos do contrato — o modal filtra as de rescaldo. */
  rescaldos: RescaldoLinha[]
  produtosRescaldo: RescaldoProduto[]
  salvando: boolean
  onToggleFeito: (cpId: string, novoValor: boolean) => void
  onAdicionar: (produto: RescaldoProduto) => void
  /** Adiciona o produto "Nenhum rescaldo" (código 0002) — o pai resolve o produto e persiste. */
  onAdicionarNenhum: () => void
  onRemover: (cpId: string, produtoId: string) => void
  onClose: () => void
}

function produtoIdDe(cp: RescaldoLinha): string {
  return cp.produto_id ?? cp.produto?.id ?? ''
}

export default function RescaldoModal({
  isOpen,
  petNome,
  codigo,
  rescaldos,
  produtosRescaldo,
  salvando,
  onToggleFeito,
  onAdicionar,
  onAdicionarNenhum,
  onRemover,
  onClose,
}: RescaldoModalProps) {
  const [busca, setBusca] = useState('')

  // Reseta a busca sempre que o modal abre
  useEffect(() => {
    if (isOpen) setBusca('')
  }, [isOpen])

  if (!isOpen) return null

  const rescaldosNoContrato = rescaldos.filter(cp => cp.produto?.rescaldo_tipo || cp.produto?.codigo === '0002')
  const temNenhum = rescaldosNoContrato.some(cp => cp.produto?.codigo === '0002')
  const rescaldosReais = rescaldosNoContrato.filter(cp => cp.produto?.codigo !== '0002')

  const produtosDisponiveis = produtosRescaldo.filter(p =>
    busca ? p.nome.toLowerCase().includes(busca.toLowerCase()) || p.codigo.toLowerCase().includes(busca.toLowerCase()) : true
  )

  const porTipo = new Map<string, RescaldoProduto[]>()
  produtosDisponiveis.forEach(p => {
    const tipo = p.rescaldo_tipo || 'outro'
    if (!porTipo.has(tipo)) porTipo.set(tipo, [])
    porTipo.get(tipo)!.push(p)
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200">🐾 Rescaldos — {petNome}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <p className="text-sm text-slate-400 mb-4">{codigo}</p>

        {/* Marcado como "Nenhum rescaldo" */}
        {temNenhum && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-red-700 bg-red-900/30 mb-4">
            <span className="text-lg">🚫</span>
            <div className="flex-1">
              <p className="font-medium text-red-300 text-sm">Nenhum rescaldo</p>
              <p className="text-xs text-red-400">Tutor não quer rescaldo</p>
            </div>
            <button
              onClick={() => {
                const cpNenhum = rescaldosNoContrato.find(cp => cp.produto?.codigo === '0002')
                if (cpNenhum) onRemover(cpNenhum.id, produtoIdDe(cpNenhum))
              }}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-red-900/40 text-red-500 hover:bg-red-900/50 transition-colors"
              title="Remover"
            >
              ✕
            </button>
          </div>
        )}

        {/* Seção 1: Rescaldos no contrato */}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">No contrato</p>
          {rescaldosReais.length === 0 && !temNenhum && (
            <p className="text-center text-slate-400 py-3 text-sm">Nenhum rescaldo adicionado</p>
          )}
          {rescaldosReais.map(cp => {
            const tipoInfo = cp.produto?.rescaldo_tipo ? RESCALDO_TIPO_LABELS[cp.produto.rescaldo_tipo] : null
            return (
              <div
                key={cp.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  cp.rescaldo_feito ? 'bg-green-900/30 border-green-700' : 'bg-amber-900/30 border-amber-700'
                }`}
              >
                {cp.produto?.imagem_url && (
                  <img src={cp.produto.imagem_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-200 text-sm truncate">{cp.produto?.nome || 'Produto'}</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-xs ${cp.rescaldo_feito ? 'text-green-400' : 'text-amber-400'}`}>
                      {cp.rescaldo_feito ? '✅ Feito' : '⏳ Pendente'}
                    </p>
                    {cp.produto?.rescaldo_tipo && (
                      <span className="text-[10px] text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded">
                        {tipoInfo ? `${tipoInfo.icon} ${tipoInfo.label}` : cp.produto.rescaldo_tipo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Toggle feito */}
                <button
                  onClick={() => onToggleFeito(cp.id, !cp.rescaldo_feito)}
                  className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                    cp.rescaldo_feito
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-slate-600 text-slate-400 hover:bg-amber-400 hover:text-white'
                  }`}
                  title={cp.rescaldo_feito ? 'Marcar como pendente' : 'Marcar como feito'}
                >
                  {cp.rescaldo_feito ? '✓' : '○'}
                </button>

                {/* Remover */}
                <button
                  onClick={() => onRemover(cp.id, produtoIdDe(cp))}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-red-900/40 text-red-500 hover:bg-red-900/50 transition-colors"
                  title="Remover produto de rescaldo"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>

        {/* Seção 2: Adicionar produto de rescaldo — agrupado por tipo */}
        {!temNenhum && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Adicionar</p>
              <button
                onClick={onAdicionarNenhum}
                disabled={salvando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-700 bg-red-900/30 hover:bg-red-900/50 transition-colors text-red-300 text-xs font-medium disabled:opacity-50"
              >
                🚫 Nenhum rescaldo
              </button>
            </div>
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome ou codigo..."
              className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 mb-3"
            />
            <div className="space-y-4 max-h-60 overflow-y-auto">
              {[...porTipo.entries()].map(([tipo, prods]) => {
                const info = RESCALDO_TIPO_LABELS[tipo] || { label: tipo, icon: '💎' }
                return (
                  <div key={tipo}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{info.icon}</span>
                      <h4 className="text-xs font-semibold text-purple-300">{info.label}</h4>
                      <span className="text-xs text-slate-500">({prods.length})</span>
                      <div className="flex-1 h-px bg-purple-900/40" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {prods.map(p => (
                        <button
                          key={p.id}
                          onClick={() => onAdicionar(p)}
                          disabled={salvando}
                          className="flex items-center gap-2 p-2 rounded-lg border border-purple-700 bg-purple-900/30 hover:bg-purple-900/50 transition-colors text-left disabled:opacity-50"
                        >
                          {p.imagem_url ? (
                            <img src={p.imagem_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-purple-900/40 flex items-center justify-center flex-shrink-0 text-xs">{info.icon}</div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-200 truncate">{p.nome}</p>
                            {p.preco ? <p className="text-[10px] text-slate-400">R$ {p.preco.toFixed(2)}</p> : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              {porTipo.size === 0 && (
                <p className="text-center text-slate-400 py-2 text-sm">Nenhum produto encontrado</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
