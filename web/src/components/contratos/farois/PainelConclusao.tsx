'use client'

/**
 * Painel de conclusão do gestor por item — o mesmo miolo da conclusão do /tarefas (item 27):
 * "Foto de Conclusão" (o `FotoProva` de lá, não recriado), "+ Anotação (opcional)",
 * Cancelar / Concluir. Foto obrigatória quando o tipo exige e quem conclui não é gerente/SA
 * (P-07 — o trigger da mig 147 recusaria de qualquer jeito).
 */
import { Loader2 } from 'lucide-react'
import FotoProva from '@/components/tarefas/FotoProva'
import type { FotoComprimida } from '@/lib/comprimir-imagem'

type Props = {
  foto: FotoComprimida | null
  onFoto: (f: FotoComprimida | null) => void
  anotacao: string
  onAnotacao: (v: string) => void
  fotoObrigatoria: boolean
  ocupado: boolean
  onCancelar: () => void
  onConcluir: () => void
}

export default function PainelConclusao(p: Props) {
  return (
    <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: 'var(--surface-200)' }}>
      <FotoProva valor={p.foto} onChange={p.onFoto} obrigatoria={p.fotoObrigatoria} />
      <textarea
        value={p.anotacao}
        onChange={e => p.onAnotacao(e.target.value)}
        placeholder="+ Anotação (opcional)"
        rows={2}
        className="w-full px-2.5 py-2 rounded-lg border outline-none"
        style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-50)', color: 'var(--surface-800)', fontSize: 16 }}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={p.onCancelar} disabled={p.ocupado} className="h-9 px-4 rounded-lg text-[13px] font-semibold" style={{ color: 'var(--surface-500)' }}>Cancelar</button>
        <button type="button" onClick={p.onConcluir} disabled={p.ocupado || (p.fotoObrigatoria && !p.foto)}
          className="h-9 px-5 rounded-lg text-[13px] font-bold text-white disabled:opacity-40 inline-flex items-center gap-1.5" style={{ background: '#059669' }}>
          {p.ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Concluir
        </button>
      </div>
    </div>
  )
}
