'use client'

import { useState, useEffect } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  /** Quantidade atual de linhas de pelinho no contrato (pra pré-preencher o seletor) */
  quantidadeAtual: number
  onSuccess?: () => void
}

// Popup de 1 tela — só quantidade. Pelinho virou rescaldo "de verdade" (igual molde/carimbo/
// pelo_extra): adicionar aqui só ajusta as linhas de `contrato_produtos`, sem marcar feito —
// isso é responsabilidade do fluxo normal de rescaldo (RescaldoModal / farol / Operacional).
export default function PelinhoModal({ isOpen, onClose, contrato, quantidadeAtual, onSuccess }: Props) {
  const supabase = createClient()

  const [qtd, setQtd] = useState(1)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setQtd(Math.max(1, quantidadeAtual || 1))
  }, [isOpen, quantidadeAtual])

  if (!isOpen) return null

  async function salvarPelinho(qtdDesejada: number) {
    setSalvando(true)
    try {
      // 1. Produto pelinho (codigo 0004)
      const { data: produtoPelinho, error: errProd } = await supabase
        .from('produtos')
        .select('id, preco')
        .eq('codigo', '0004')
        .single<{ id: string; preco: number | null }>()

      if (errProd || !produtoPelinho) {
        console.error('Produto pelinho (0004) nao encontrado:', errProd)
        alert('Produto pelinho (codigo 0004) nao encontrado no cadastro.')
        return
      }

      // 2. Linhas de pelinho já existentes nesse contrato
      type PelinhoLine = { id: string }
      const { data: linhasExistentes, error: errLinhas } = await supabase
        .from('contrato_produtos')
        .select('id')
        .eq('contrato_id', contrato.id)
        .eq('produto_id', produtoPelinho.id) as unknown as { data: PelinhoLine[] | null; error: Error | null }

      if (errLinhas) {
        console.error('Erro ao buscar linhas pelinho:', errLinhas)
        throw errLinhas
      }

      const linhas = linhasExistentes || []
      const qtdAtual = linhas.length

      // 3. Sincroniza linhas físicas com a quantidade escolhida (1 linha = 1 item físico)
      if (qtdDesejada > qtdAtual) {
        const novasLinhas = Array.from({ length: qtdDesejada - qtdAtual }, () => ({
          contrato_id: contrato.id,
          produto_id: produtoPelinho.id,
          quantidade: 1,
          valor: produtoPelinho.preco || 0,
          separado: false,
          is_reserva_pv: false,
          rescaldo_feito: false,
        }))
        const { error: errInsert } = await supabase.from('contrato_produtos').insert(novasLinhas as never)
        if (errInsert) {
          console.error('Erro ao inserir linhas pelinho:', errInsert)
          throw errInsert
        }
      } else if (qtdDesejada < qtdAtual) {
        const idsParaRemover = linhas.slice(qtdDesejada).map(l => l.id)
        if (idsParaRemover.length > 0) {
          const { error: errDelete } = await supabase.from('contrato_produtos').delete().in('id', idsParaRemover)
          if (errDelete) {
            console.error('Erro ao remover linhas pelinho:', errDelete)
            throw errDelete
          }
        }
      }

      onSuccess?.()
      onClose()
    } catch (err) {
      console.error('Erro ao salvar pelinho:', err)
      alert('Erro ao salvar pelinho. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-slate-700">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="text-lg">&#129531;</span>
            <h3 className="font-semibold">Pelinho</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <p className="text-center text-sm text-slate-400">
            {contrato.pet_nome} &middot; {contrato.codigo}
          </p>

          <div className="space-y-2">
            <p className="text-sm text-slate-400 text-center">Quantidade</p>
            <div className="flex items-center gap-3 justify-center">
              <button
                type="button"
                onClick={() => setQtd(q => Math.max(0, q - 1))}
                disabled={qtd <= 0}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="text-2xl font-bold text-slate-100 w-8 text-center tabular-nums">{qtd}</span>
              <button
                type="button"
                onClick={() => setQtd(q => Math.min(5, q + 1))}
                disabled={qtd >= 5}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {qtd === 0 && <p className="text-xs text-red-400 text-center">Remove o pelinho do contrato — farol volta a vermelho.</p>}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => salvarPelinho(qtd)}
              disabled={salvando}
              className="flex-1 py-2.5 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
