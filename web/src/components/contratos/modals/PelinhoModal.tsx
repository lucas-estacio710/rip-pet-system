'use client'

import { useState, useEffect } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ContratoMinimal = {
  id: string
  codigo: string
  pet_nome: string
  pelinho_quer: boolean | null
  pelinho_feito: boolean
  pelinho_quantidade: number
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: {
    id: string
    pelinho_quer: boolean
    pelinho_feito: boolean
    pelinho_quantidade: number
  }) => void
}

export default function PelinhoModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const supabase = createClient()

  const [step, setStep] = useState<1 | 2>(1)
  const [pelinhoQuer, setPelinhoQuer] = useState(false)
  const [pelinhoFeito, setPelinhoFeito] = useState(false)
  const [pelinhoQtd, setPelinhoQtd] = useState(1)
  const [salvando, setSalvando] = useState(false)

  // On open: determine step and initialize state from contrato
  useEffect(() => {
    if (!isOpen) return

    if (contrato.pelinho_quer === true) {
      setStep(2)
      setPelinhoQuer(true)
    } else {
      setStep(1)
      setPelinhoQuer(true)
    }

    setPelinhoFeito(contrato.pelinho_feito ?? false)
    setPelinhoQtd(contrato.pelinho_quantidade || 1)
  }, [isOpen, contrato])

  if (!isOpen) return null

  async function salvarPelinho() {
    setSalvando(true)

    try {
      // 1. Get produto pelinho (codigo 0004)
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

      // 2. Get existing pelinho lines in contrato_produtos
      type PelinhoLine = { id: string; separado: boolean; rescaldo_feito: boolean }
      const { data: linhasExistentes, error: errLinhas } = await supabase
        .from('contrato_produtos')
        .select('id, separado, rescaldo_feito')
        .eq('contrato_id', contrato.id)
        .eq('produto_id', produtoPelinho.id) as unknown as { data: PelinhoLine[] | null; error: Error | null }

      if (errLinhas) {
        console.error('Erro ao buscar linhas pelinho:', errLinhas)
        throw errLinhas
      }

      const linhas = linhasExistentes || []
      const qtdAtual = linhas.length
      const qtdDesejada = pelinhoQuer ? pelinhoQtd : 0

      // 3. Sync: add or remove lines to match desired quantity
      if (qtdDesejada > qtdAtual) {
        // Add missing lines
        const novasLinhas = Array.from({ length: qtdDesejada - qtdAtual }, () => ({
          contrato_id: contrato.id,
          produto_id: produtoPelinho.id,
          quantidade: 1,
          valor: produtoPelinho.preco || 0,
          separado: pelinhoFeito,
          is_reserva_pv: false,
          rescaldo_feito: pelinhoFeito,
        }))

        const { error: errInsert } = await supabase
          .from('contrato_produtos')
          .insert(novasLinhas as never)

        if (errInsert) {
          console.error('Erro ao inserir linhas pelinho:', errInsert)
          throw errInsert
        }
      } else if (qtdDesejada < qtdAtual) {
        // Remove excess lines (from the end)
        const idsParaRemover = linhas
          .slice(qtdDesejada)
          .map(l => l.id)

        if (idsParaRemover.length > 0) {
          const { error: errDelete } = await supabase
            .from('contrato_produtos')
            .delete()
            .in('id', idsParaRemover)

          if (errDelete) {
            console.error('Erro ao remover linhas pelinho:', errDelete)
            throw errDelete
          }
        }
      }

      // 4. Update separado/rescaldo_feito status on remaining lines
      const idsRestantes = linhas
        .slice(0, Math.min(qtdDesejada, qtdAtual))
        .map(l => l.id)

      if (idsRestantes.length > 0) {
        const { error: errUpdate } = await supabase
          .from('contrato_produtos')
          .update({
            separado: pelinhoFeito,
            rescaldo_feito: pelinhoFeito,
          } as never)
          .in('id', idsRestantes)

        if (errUpdate) {
          console.error('Erro ao atualizar linhas pelinho:', errUpdate)
          throw errUpdate
        }
      }

      // 5. Update contratos: pelinho_quer, pelinho_feito, pelinho_quantidade
      const { error: errContrato } = await supabase
        .from('contratos')
        .update({
          pelinho_quer: pelinhoQuer,
          pelinho_feito: pelinhoFeito,
          pelinho_quantidade: pelinhoQuer ? pelinhoQtd : 0,
        } as never)
        .eq('id', contrato.id)

      if (errContrato) {
        console.error('Erro ao atualizar contrato pelinho:', errContrato)
        throw errContrato
      }

      // 6. Call onSuccess
      onSuccess?.({
        id: contrato.id,
        pelinho_quer: pelinhoQuer,
        pelinho_feito: pelinhoFeito,
        pelinho_quantidade: pelinhoQuer ? pelinhoQtd : 0,
      })

      // 7. Close modal
      onClose()
    } catch (err) {
      console.error('Erro ao salvar pelinho:', err)
      alert('Erro ao salvar pelinho. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function naoQuerMais() {
    setSalvando(true)
    try {
      // 1. Buscar produto pelinho
      const { data: produtoPelinho } = await supabase
        .from('produtos')
        .select('id')
        .eq('codigo', '0004')
        .single<{ id: string }>()

      if (produtoPelinho) {
        // 2. Excluir todas as linhas pelinho deste contrato
        await supabase
          .from('contrato_produtos')
          .delete()
          .eq('contrato_id', contrato.id)
          .eq('produto_id', produtoPelinho.id)
      }

      // 3. Atualizar contrato
      await supabase
        .from('contratos')
        .update({ pelinho_quer: false, pelinho_feito: false, pelinho_quantidade: 0 } as never)
        .eq('id', contrato.id)

      onSuccess?.({ id: contrato.id, pelinho_quer: false, pelinho_feito: false, pelinho_quantidade: 0 })
      onClose()
    } catch (err) {
      console.error('Erro ao desistir pelinho:', err)
      alert('Erro ao salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  // Quantity controls component (reused in both steps)
  function QuantityControls() {
    return (
      <div className="flex items-center gap-3 justify-center">
        <button
          type="button"
          onClick={() => setPelinhoQtd(q => Math.max(1, q - 1))}
          disabled={pelinhoQtd <= 1}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-2xl font-bold text-slate-100 w-8 text-center tabular-nums">
          {pelinhoQtd}
        </span>
        <button
          type="button"
          onClick={() => setPelinhoQtd(q => Math.min(5, q + 1))}
          disabled={pelinhoQtd >= 5}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // ---- STEP 1: Pergunta "Quer pelinho?" ----
  if (step === 1) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2"
        onClick={onClose}
      >
        <div
          className="bg-slate-800 rounded-2xl w-full max-w-sm shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700">
            <div className="flex items-center gap-2 text-slate-200">
              <span className="text-lg">&#129531;</span>
              <h3 className="font-semibold">Pelinho</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-5">
            {/* Pet name context */}
            <p className="text-center text-sm text-slate-400">
              {contrato.pet_nome} &middot; {contrato.codigo}
            </p>

            {/* Toggle: Quer pelinho? */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-300 text-center">
                Quer pelinho?
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPelinhoQuer(true)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    pelinhoQuer
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setPelinhoQuer(false)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    !pelinhoQuer
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                  }`}
                >
                  N&atilde;o
                </button>
              </div>
            </div>

            {/* Quantity (only if Sim) */}
            {pelinhoQuer && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400 text-center">Quantidade</p>
                <QuantityControls />
              </div>
            )}

            {/* Footer buttons */}
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
                onClick={salvarPelinho}
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

  // ---- STEP 2: Validar pelinho ----
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-sm shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-700">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="text-lg">&#129531;</span>
            <h3 className="font-semibold">Pelinho - Validar</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-5">
          {/* Pet name */}
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-200">{contrato.pet_nome}</p>
            <p className="text-sm text-slate-400">{contrato.codigo}</p>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <p className="text-sm text-slate-400 text-center">Quantidade</p>
            <QuantityControls />
          </div>

          {/* Checkbox: Validado */}
          <label className="flex items-center gap-3 cursor-pointer group justify-center">
            <input
              type="checkbox"
              checked={pelinhoFeito}
              onChange={(e) => setPelinhoFeito(e.target.checked)}
              className="sr-only"
            />
            <div
              className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                pelinhoFeito
                  ? 'bg-emerald-600 border-emerald-500'
                  : 'bg-slate-700 border-slate-500 group-hover:border-slate-400'
              }`}
            >
              {pelinhoFeito && (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-medium transition-colors ${
              pelinhoFeito ? 'text-emerald-400' : 'text-slate-300'
            }`}>
              Validado
            </span>
          </label>

          {/* Footer buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={naoQuerMais}
              disabled={salvando}
              className="py-2.5 px-4 border border-red-600 rounded-lg text-red-400 hover:bg-red-900/30 text-sm transition-colors disabled:opacity-50"
            >
              Não quer mais
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarPelinho}
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
