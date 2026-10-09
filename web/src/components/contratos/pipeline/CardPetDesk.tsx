'use client'

/**
 * Card do pet no DESKTOP (≥1024px), pipeline redesenhado — fase 2.17b (D2 e D6 de
 * docs/REDESENHO_CARDS_PIPELINE.md). Continua a linha larga, 1 por linha, com as peças novas:
 *
 *  [data dd/mmm · Www hh:mm] [🐕 12kg] [faróis concluídos 90px] [LACRE·NOME·IND / tutor · raça|cor 280px]
 *  [faróis pendentes grandes]  ……  [meio: esteira do GC ou endereço do tutor]  [ações]
 *
 * - Faróis À VISTA (não vira o resumo ✓⏱ do celular), na ordem fixa do item 26. Colunas de
 *   largura fixa pra os pendentes alinharem em coluna de um card pro outro. Clicar num farol
 *   abre DIRETO o 2º nível dele (`onFarol`); "‹ Pendências" volta pra lista.
 * - raça | cor some na Entrega/Pendente (item 36) — ali o meio é o endereço.
 * - Sem `btn_farois` na unidade (P-05) as colunas de faróis não aparecem.
 * - A fileira de ações é a dock (2.17c, `DockAcoes`).
 */
import type { ReactNode } from 'react'
import { TAG_STATE_STYLES, type ComputedTag } from '@/lib/contrato-tags'
import { dataDoCard, pesoDoCard, especieDoCard, nomeDoCard } from '@/lib/card-pet'
import DockAcoes from './DockAcoes'
import Destacado from './Destacado'

type Props = {
  dataAcolhimento: string | null
  lacre: string | null
  lacreSolto?: ReactNode
  petNome: string | null
  petGenero: string | null
  individual: boolean
  especie: string | null
  peso: number | null
  tutorNome: string | null
  raca: string | null
  cor: string | null
  mostrarRaca: boolean
  /** null = unidade sem faróis (P-05). */
  farois: ComputedTag[] | null
  onFarol: (id: string) => void
  meio?: ReactNode
  acoes: ReactNode
  /** Termos da busca por texto pra marcar no nome do pet e do tutor (parte 5 da busca nova). */
  destaque?: string[]
}

const concluido = (t: ComputedTag) => t.state === 'completed' || t.state === 'rejected'
const pendente = (t: ComputedTag) => t.state === 'pending' || t.state === 'in_progress' || t.state === 'alert'

function Farol({ t, grande, onFarol }: { t: ComputedTag; grande: boolean; onFarol: (id: string) => void }) {
  const st = TAG_STATE_STYLES[t.state]
  const w = grande ? 40 : 28
  const marca = t.id === 'encaminhamento' && t.state === 'completed' ? t.sublabel : (t.count ? String(t.count) : undefined)
  return (
    <button type="button" title={`${t.label}${t.tooltip ? ' · ' + t.tooltip : ''}`}
      onClick={e => { e.stopPropagation(); onFarol(t.id) }}
      className="flex-none rounded-lg flex flex-col items-center justify-center leading-none hover:opacity-80 transition-opacity"
      style={{ width: w, height: w, background: st.bg, color: st.color, borderColor: st.borderColor, borderWidth: grande ? 2 : 1, borderStyle: 'solid' }}>
      <span className={grande ? 'text-xl' : marca ? 'text-xs' : 'text-base'}>{t.emoji}</span>
      {marca && <span className={`${grande ? 'text-[9px]' : 'text-[7px]'} font-bold`}>{marca}</span>}
    </button>
  )
}

export default function CardPetDesk(p: Props) {
  const data = dataDoCard(p.dataAcolhimento)
  const peso = pesoDoCard(p.peso)
  const esp = especieDoCard(p.especie, p.peso)
  const corTipo = p.individual ? '#10b981' : '#8b5cf6'
  const tutor = nomeDoCard(p.tutorNome)
  const [primeiro, ...resto] = tutor.split(' ')
  const racaCor = [nomeDoCard(p.raca), nomeDoCard(p.cor)].filter(Boolean).join(' | ')
  const feitos = (p.farois || []).filter(concluido)
  const pends = (p.farois || []).filter(pendente)

  return (
    <div className="flex items-center gap-2 min-w-0">
      {data ? (
        <div className="pl-chip flex-none w-14 h-11 rounded-lg flex flex-col items-center justify-center gap-0.5" style={{ color: '#334155' }}>
          <span className="text-[12px] font-bold leading-none">{data.diaMes}</span>
          <span className="text-[9px] leading-none whitespace-nowrap" style={{ color: '#64748b' }}>{data.semanaHora}</span>
        </div>
      ) : (
        <div className="flex-none w-14 h-11 rounded-lg flex items-center justify-center text-center animate-pulse px-1"
          style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #fde68a 50%, #fbbf24 100%)', color: '#78350f' }} title="Pet ainda não foi acolhido">
          <span className="text-[9px] font-bold leading-tight">Sem data acolh.</span>
        </div>
      )}

      <div className="pl-chip flex-none h-11 px-2 rounded-lg flex items-center gap-1 whitespace-nowrap">
        <span className="leading-none" style={{ fontSize: 18 }}>{esp.emoji}</span>
        {peso && <span className="text-[13px] font-bold tabular-nums" style={{ color: esp.cor }}>{peso}</span>}
      </div>

      {p.farois && (
        <div className="flex-none flex flex-wrap items-center justify-center content-center gap-0.5" style={{ width: 90 }}>
          {feitos.map(t => <Farol key={t.id} t={t} grande={false} onFarol={p.onFarol} />)}
        </div>
      )}

      <div className="flex-none min-w-0 leading-tight" style={{ width: 280 }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {p.lacreSolto}
          <div className="pl-tri" style={{ '--pl-tipo': corTipo } as React.CSSProperties}>
            {p.lacre && <span className="pl-tri-l">{p.lacre}</span>}
            <span className="pl-tri-n" style={{ color: p.petGenero === 'macho' ? '#1d4ed8' : '#db2777' }}>
              <span className="truncate"><Destacado texto={nomeDoCard(p.petNome)} termos={p.destaque} /></span>
              {p.petGenero && <span style={{ marginLeft: 2, fontSize: '.75rem' }}>{p.petGenero === 'macho' ? '♂' : '♀'}</span>}
            </span>
            <span className="pl-tri-t">{p.individual ? 'IND' : 'COL'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs mt-1 min-w-0">
          <span className="pl-chip truncate min-w-0 px-1.5 py-px rounded" style={{ flex: '0 1 auto' }}>
            <span className="font-bold" style={{ color: '#6d28d9' }}><Destacado texto={primeiro} termos={p.destaque} /></span>
            {resto.length > 0 && <span style={{ color: '#475569' }}> <Destacado texto={resto.join(' ')} termos={p.destaque} /></span>}
          </span>
          {p.mostrarRaca && racaCor && (
            <span className="pl-chip truncate min-w-0 text-[11px] font-medium px-1.5 py-px rounded" style={{ flex: '0 2 auto', color: '#475569' }}>{racaCor}</span>
          )}
        </div>
      </div>

      {pends.length > 0 && (
        <div className="flex-none flex items-center gap-1.5">
          {pends.map(t => <Farol key={t.id} t={t} grande onFarol={p.onFarol} />)}
        </div>
      )}

      {p.meio ? (
        <>
          <div className="flex-1 min-w-[12px]" />
          <div className="w-[400px] flex-shrink min-w-0 pl-3 pr-1 self-center" onClick={e => e.stopPropagation()}>{p.meio}</div>
        </>
      ) : <div className="flex-1" />}

      {/* Dock do Mac (2.17c, D3): sempre à mostra, pequena; cresce pela distância do mouse. */}
      <div className="flex-none" onClick={e => e.stopPropagation()}><DockAcoes>{p.acoes}</DockAcoes></div>
    </div>
  )
}
