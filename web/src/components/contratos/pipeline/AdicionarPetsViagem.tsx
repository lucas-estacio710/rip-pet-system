'use client'

/**
 * "+ Adicionar pets" da viagem — fase 2.13c (item 13 "A — pela viagem" e item 35, ajuste 6).
 * Substitui o arrastar/segurar-e-tocar do celular: pets do Ativo SEM viagem, com busca e
 * checkbox → "Incluir N em ST172".
 *
 *  - Em Acolhimento não aparece (item 18).
 *  - Sem lacre aparece DESABILITADO com o motivo, não escondido (P-13, ponto 2).
 *  - Incluir chama o `vincularAoEncaminhamento` da página — a trava de verdade mora no
 *    UPDATE (2.13a); a tela só evita o erro óbvio.
 */
import { useMemo, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import PopupCentral from '@/components/ui/PopupCentral'

export type PetCandidato = { id: string; nome: string; lacre: string | null; individual: boolean; tutor: string; emoji: string }

type Props = {
  aberto: boolean
  numero: string
  candidatos: PetCandidato[]
  onFechar: () => void
  onIncluir: (ids: string[]) => Promise<void>
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function AdicionarPetsViagem(p: Props) {
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  const lista = useMemo(() => {
    const t = semAcento(busca.trim())
    return p.candidatos
      .filter(c => !t || semAcento(`${c.nome} ${c.tutor} ${c.lacre || ''}`).includes(t))
      // Os que podem entrar primeiro; sem lacre no fim, ainda visíveis.
      .sort((a, b) => Number(!a.lacre) - Number(!b.lacre))
  }, [p.candidatos, busca])

  function fechar() {
    if (salvando) return
    setMarcados(new Set()); setBusca('')
    p.onFechar()
  }

  async function incluir() {
    if (marcados.size === 0 || salvando) return
    setSalvando(true)
    try {
      await p.onIncluir([...marcados])
      setMarcados(new Set()); setBusca('')
    } finally {
      setSalvando(false)
    }
  }

  const titulo = (
    <div className="text-[15px] font-bold" style={{ color: 'var(--surface-800)' }}>
      Adicionar pets em <span className="px-1.5 py-0.5 rounded text-white text-[13px] font-black" style={{ background: '#ea580c' }}>{p.numero}</span>
    </div>
  )

  return (
    <PopupCentral aberto={p.aberto} onFechar={fechar} titulo={titulo}
      rodape={
        <div className="flex gap-2">
          <button type="button" onClick={fechar} disabled={salvando} className="flex-1 py-2.5 rounded-lg border text-[13px]"
            style={{ borderColor: 'var(--surface-300)', color: 'var(--surface-500)' }}>Cancelar</button>
          <button type="button" onClick={incluir} disabled={marcados.size === 0 || salvando}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-bold text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5" style={{ background: '#ea580c' }}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {marcados.size > 0 ? `Incluir ${marcados.size} em ${p.numero}` : 'Escolha os pets'}
          </button>
        </div>
      }>
      <div className="space-y-2 pt-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--surface-400)' }} />
          <input type="search" enterKeyHint="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pet, tutor ou lacre"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
            className="w-full pl-8 pr-2 py-2 rounded-lg border outline-none"
            style={{ borderColor: 'var(--surface-200)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
        </div>
        {p.candidatos.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--surface-400)' }}>Todos os pets do Ativo já estão numa viagem.</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--surface-400)' }}>Nada encontrado.</p>
        ) : (
          <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--surface-200)' }}>
            {lista.map(c => {
              const pode = !!c.lacre
              const on = marcados.has(c.id)
              return (
                <label key={c.id} className={`flex items-center gap-2 px-2.5 py-2 ${pode ? 'cursor-pointer' : 'opacity-55'}`} style={{ borderColor: 'var(--surface-200)' }}>
                  <input type="checkbox" disabled={!pode || salvando} checked={on} className="w-4 h-4 accent-orange-600 flex-none"
                    onChange={e => setMarcados(prev => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })} />
                  <span className="flex-none text-base">{c.emoji}</span>
                  {c.lacre && <span className="flex-none text-[11px] font-mono font-bold px-1 rounded text-white" style={{ background: '#1d4ed8' }}>{c.lacre}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--surface-700)' }}>
                      {c.nome} <span className="text-[11px] font-bold" style={{ color: c.individual ? '#10b981' : '#8b5cf6' }}>{c.individual ? 'IND' : 'COL'}</span>
                    </span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--surface-400)' }}>{c.tutor}</span>
                  </span>
                  {!pode && <span className="flex-none text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,.16)', color: '#d97706' }}>sem lacre</span>}
                </label>
              )
            })}
          </div>
        )}
      </div>
    </PopupCentral>
  )
}
