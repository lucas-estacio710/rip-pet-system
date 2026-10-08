'use client'

/**
 * Popup de pendências do card de pet — pipeline redesenhado, fase 2.4 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md (itens 6, 23, 25, 26 e 33; P-25).
 *
 * - Centralizado (`PopupCentral`, item 23 — o anti-incidente 24/09).
 * - Cabeçalho em 2 linhas: lacre · nome ♂/♀ · IND/COL · peso / espécie · raça | cor · 🛡️
 *   seguradora (P-25: a seguradora saiu do card e mora aqui).
 * - Lista: CONCLUÍDAS em cima (✓ desenhado a lápis só na 1ª abertura; "Sem pelinho"/"Não tem"
 *   em chip cinza), PENDENTES embaixo com o estado escrito. Ordem fixa (item 26) — vem pronta do
 *   computeAllTags.
 * - Tocar numa linha chama `onFarol(id)`. Até cada tela nova chegar (2.5–2.12), quem chama
 *   fecha o popup e abre o modal de hoje: nada fica inacessível no meio do caminho.
 *
 * O botão voltar do celular é do `usePopupHistory`, no /contratos — aqui só se desenha.
 */
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import PopupCentral from '@/components/ui/PopupCentral'
import type { ComputedTag } from '@/lib/contrato-tags'
import { separarFarois, type FarolLista } from '@/lib/farois'
import { pesoDoCard, especieDoCard, nomeDoCard } from '@/lib/card-pet'

type Props = {
  aberto: boolean
  onFechar: () => void
  tags: ComputedTag[]
  /** Desenha o ✓ a lápis? Só na 1ª abertura (voltar não repete). */
  animar: boolean
  onFarol: (id: string) => void
  pet: {
    lacre: string | null
    nome: string | null
    genero: string | null
    individual: boolean
    especie: string | null
    peso: number | null
    raca: string | null
    cor: string | null
    seguradora: string | null
  }
}

const ESPECIE_TXT: Record<string, string> = { canina: 'Canina', felina: 'Felina', exotica: 'Exótica' }

function Ok({ animar, atraso }: { animar: boolean; atraso: number }) {
  return (
    <span className={`pl-ok${animar ? ' anim' : ''}`} style={{ '--d': `${atraso}ms` } as React.CSSProperties} aria-label="Feito">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  )
}

function Linha({ f, onFarol, direita }: { f: FarolLista; onFarol: (id: string) => void; direita: ReactNode }) {
  return (
    <button type="button" className="pl-linha" onClick={() => onFarol(f.id)}>
      <span className="pl-linha-emoji">{f.emoji}</span>
      <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{f.label}</span>
      {direita}
    </button>
  )
}

export default function FarolPopup({ aberto, onFechar, tags, animar, onFarol, pet }: Props) {
  const { concluidas, pendentes } = separarFarois(tags)
  const peso = pesoDoCard(pet.peso)
  const esp = especieDoCard(pet.especie, pet.peso)
  const corTipo = pet.individual ? '#10b981' : '#8b5cf6'
  const racaCor = [nomeDoCard(pet.raca), nomeDoCard(pet.cor)].filter(Boolean).join(' | ')
  let feitoIdx = 0

  const titulo = (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="pl-tri" style={{ '--pl-tipo': corTipo } as React.CSSProperties}>
          {pet.lacre && <span className="pl-tri-l">{pet.lacre}</span>}
          <span className="pl-tri-n" style={{ color: pet.genero === 'macho' ? '#1d4ed8' : '#db2777' }}>
            <span className="truncate">{nomeDoCard(pet.nome)}</span>
            {pet.genero && <span style={{ marginLeft: 2, fontSize: '.7rem' }}>{pet.genero === 'macho' ? '♂' : '♀'}</span>}
          </span>
          <span className="pl-tri-t">{pet.individual ? 'IND' : 'COL'}</span>
        </div>
        {peso && (
          <span className="pl-chip flex-shrink-0 h-6 px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap">
            <span className="leading-none" style={{ fontSize: 15 }}>{esp.emoji}</span>
            <span className="text-[12px] font-bold leading-none tabular-nums" style={{ color: esp.cor }}>{peso}</span>
          </span>
        )}
      </div>
      <div className="text-[12px] font-normal truncate" style={{ color: 'var(--surface-500)' }}>
        {[ESPECIE_TXT[(pet.especie || '').toLowerCase()] || nomeDoCard(pet.especie), racaCor].filter(Boolean).join(' · ')}
        {pet.seguradora && <span className="font-semibold" style={{ color: '#4338ca' }}> · 🛡️ {pet.seguradora}</span>}
      </div>
    </div>
  )

  return (
    <PopupCentral aberto={aberto} onFechar={onFechar} titulo={titulo}>
      <div className="space-y-2 pt-1">
        {concluidas.length > 0 && (
          <div className="space-y-0.5">
            <div className="pl-faixa" style={{ '--pl-c': '#16a34a' } as React.CSSProperties}>
              <CheckCircle2 className="h-3.5 w-3.5" />Concluídas
            </div>
            {concluidas.map(f => (
              <Linha
                key={f.id}
                f={f}
                onFarol={onFarol}
                direita={f.tipo === 'feito'
                  ? <Ok animar={animar} atraso={(feitoIdx++) * 90} />
                  : <span className="pl-chip-nao">{f.texto}</span>}
              />
            ))}
          </div>
        )}
        {pendentes.length > 0 && (
          <div className="space-y-0.5">
            <div className="pl-faixa" style={{ '--pl-c': '#f59e0b' } as React.CSSProperties}>
              <AlertTriangle className="h-3.5 w-3.5" />Pendentes
            </div>
            {pendentes.map(f => (
              <Linha key={f.id} f={f} onFarol={onFarol} direita={<span className="pl-estado-pend">{f.texto}</span>} />
            ))}
          </div>
        )}
        {concluidas.length === 0 && pendentes.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: 'var(--surface-400)' }}>Nenhuma pendência neste contrato.</p>
        )}
      </div>
    </PopupCentral>
  )
}
