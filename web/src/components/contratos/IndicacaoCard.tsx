'use client'

import { useState, useEffect } from 'react'
import { Stethoscope, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import IndicacaoModal, { type IndicacaoContrato } from '@/components/contratos/modals/IndicacaoModal'

// ============================================================================
// IndicacaoCard — espaço de trabalho pra normalizar "quem indicou" (hospital/
// clínica + contato). Só aparece quando a ficha de origem tem "Como conheceu"
// = Veterinário (indicação de vet/clínica) — a única normalização que faz
// sentido pedir aqui. Coluna 1 = o que o tutor escreveu na ficha (texto bruto,
// busca ao vivo — sem snapshot, sem coluna nova). Coluna 2 = nossa
// normalização (o que já está gravado no contrato, editável via IndicacaoModal
// — o mesmo modal usado pelo farol 🩺 do Pipeline/Detalhe).
// ============================================================================

type Props = {
  contrato: IndicacaoContrato
  onUpdate: (updated: {
    estabelecimento_indicacao_id: string | null
    contato_id: string | null
    indicacao_clinica: string | null
    indicacao_contato: string | null
  }) => void
}

type FichaIndicacao = {
  como_conheceu: string[] | null
  veterinario_especificar: string | null
}

export default function IndicacaoCard({ contrato, onUpdate }: Props) {
  const supabase = createClient()
  const [ficha, setFicha] = useState<FichaIndicacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    supabase.from('fichas').select('como_conheceu, veterinario_especificar').eq('contrato_id', contrato.id).maybeSingle()
      .then(({ data }) => { setFicha(data as FichaIndicacao | null); setLoading(false) })
  }, [supabase, contrato.id])

  if (loading) return null
  if (!ficha?.como_conheceu?.includes('Veterinário')) return null

  const quemIndicou = contrato.contato?.nome || contrato.indicacao_contato
  const clinicaIndic = contrato.estabelecimento_indicacao?.nome || contrato.indicacao_clinica
  const normalizado = !!(quemIndicou || clinicaIndic)

  return (
    <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <Stethoscope className="h-4 w-4 text-slate-400" />
          </div>
          <h2 className="font-semibold text-slate-200">Indicação</h2>
          {!normalizado && (
            <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
              Pendente
            </span>
          )}
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
          <Pencil className="h-3.5 w-3.5" />{normalizado ? 'Editar' : 'Normalizar'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] uppercase text-slate-500 mb-1">O que o tutor escreveu</p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
            {ficha.veterinario_especificar || <span className="text-slate-500">Não especificado</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-500 mb-1">Nossa normalização</p>
          {normalizado ? (
            <p className="text-sm text-slate-200 font-medium">
              {quemIndicou}
              {quemIndicou && clinicaIndic && <span className="text-slate-500"> · </span>}
              {clinicaIndic}
            </p>
          ) : (
            <button onClick={() => setModalOpen(true)} className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Ainda não normalizado — clique pra preencher
            </button>
          )}
        </div>
      </div>

      {modalOpen && (
        <IndicacaoModal
          contrato={contrato}
          onClose={() => setModalOpen(false)}
          onSuccess={(updated) => { onUpdate(updated); setModalOpen(false) }}
        />
      )}
    </div>
  )
}
