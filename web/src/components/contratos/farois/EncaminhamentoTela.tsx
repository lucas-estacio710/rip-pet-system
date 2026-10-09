'use client'

/**
 * 🚐 Encaminhamento — 2º nível do popup de pendências (fase 2.13b, item 13 "B — pelo pet" de
 * docs/REDESENHO_CARDS_PIPELINE.md). Só existe no fluxo novo de encaminhamento (`encPipeline`),
 * na etapa Ativo, e nunca para pet Em Acolhimento (item 18).
 *
 *  - pet já numa viagem → diz qual e onde se tira (⋮ → Editar encaminhamento);
 *  - pet SEM lacre → "Coloque o lacre para encaminhar" + atalho (P-13, ponto 3 e 4);
 *  - senão → viagens planejadas da unidade (Incluir) + "+ Nova viagem".
 *
 * Incluir chama o `vincularAoEncaminhamento` da página, que tem a trava no próprio UPDATE
 * (fase 2.13a) — a tela não é a única defesa.
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export type ViagemPlanejada = { id: string; numero: string; data: string | null; responsavel: string | null; pets: number; pesoKg: number }

type Props = {
  petNome: string
  viagemAtual: string | null
  temLacre: boolean
  viagens: ViagemPlanejada[]
  onIncluir: (supindaId: string) => Promise<void>
  onNovaViagem: () => void
  onPorLacre: () => void
}

const dataCurta = (iso: string | null) => {
  if (!iso) return 'sem data'
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')
}

export default function EncaminhamentoTela(p: Props) {
  const [incluindo, setIncluindo] = useState<string | null>(null)

  if (p.viagemAtual) {
    return (
      <p className="py-2 text-[13px]" style={{ color: 'var(--surface-600)' }}>
        <b>{p.petNome}</b> está na viagem <b>{p.viagemAtual}</b>. Para tirar, use <i>Editar encaminhamento</i> no menu ⋮ da viagem.
      </p>
    )
  }

  if (!p.temLacre) {
    return (
      <div className="py-2 space-y-3">
        <div className="px-3 py-2.5 rounded-lg text-[13px]" style={{ background: 'rgba(245,158,11,.12)', color: '#b45309' }}>
          Coloque o lacre para encaminhar — pet sem lacre não entra em viagem.
        </div>
        <button type="button" onClick={p.onPorLacre} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: '#d97706' }}>
          Colocar o lacre
        </button>
      </div>
    )
  }

  return (
    <div className="py-1 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--surface-400)' }}>Viagens planejadas</p>
      {p.viagens.length === 0 && <p className="text-[13px]" style={{ color: 'var(--surface-400)' }}>Nenhuma viagem planejada nesta unidade.</p>}
      {p.viagens.map(v => (
        <button key={v.id} type="button" disabled={!!incluindo}
          onClick={async () => { setIncluindo(v.id); try { await p.onIncluir(v.id) } finally { setIncluindo(null) } }}
          className="w-full flex items-center gap-2.5 p-2 rounded-xl border text-left disabled:opacity-60" style={{ borderColor: 'var(--surface-200)' }}>
          <span className="flex-none text-[12px] font-black px-1.5 py-0.5 rounded" style={{ background: '#ea580c', color: '#fff' }}>{v.numero}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold" style={{ color: 'var(--surface-700)' }}>{dataCurta(v.data)}</span>
            <span className="block text-[11.5px] truncate" style={{ color: 'var(--surface-400)' }}>
              {v.pets} pet{v.pets !== 1 ? 's' : ''} · {Math.round(v.pesoKg)} kg{v.responsavel ? ` · ${v.responsavel}` : ''}
            </span>
          </span>
          <span className="flex-none px-2.5 py-1 rounded-md text-[12px] font-bold text-white inline-flex items-center gap-1" style={{ background: '#16a34a' }}>
            {incluindo === v.id && <Loader2 className="h-3 w-3 animate-spin" />}Incluir
          </span>
        </button>
      ))}
      <button type="button" onClick={p.onNovaViagem} disabled={!!incluindo}
        className="w-full py-2.5 rounded-xl border-2 border-dashed text-[13px] font-semibold" style={{ borderColor: '#f97316', color: '#ea580c' }}>
        + Nova viagem
      </button>
    </div>
  )
}
