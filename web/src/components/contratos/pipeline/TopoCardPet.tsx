'use client'

/**
 * Topo do card de pet no CELULAR, pipeline redesenhado (fase 2.2 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md — itens 2, 3, 4, 5, 12, 30 e 31 de
 * docs/REDESENHO_CARDS_PIPELINE.md). Só entra com a chave obj_enc_pipeline.
 *
 *   linha 1: data · [lacre · nome do pet · IND/COL] · peso
 *   linha 2: tutor (com o WhatsApp DENTRO da caixa, à direita) · raça | cor (até 55%)
 *
 * Saem do card (item 2): DOC (P-24 — fica no detalhe), "Como nos conheceu" e "Local de
 * acolhimento". A seguradora vai pro cabeçalho do popup de pendências (P-25, commit 2.4).
 * Os faróis e a fileira de ações continuam os antigos, embaixo, até o 2.3/2.4.
 */
import type { ReactNode } from 'react'
import { dataDoCard, pesoDoCard, especieDoCard, nomeDoCard } from '@/lib/card-pet'

type Props = {
  dataAcolhimento: string | null
  /** Lacre gravado. Sem lacre (ou editando), a peça começa no nome e `lacreSolto` vai antes. */
  lacre: string | null
  /** O "+ Lacre" pulsante / campo de edição do pipeline — solto, antes da peça. */
  lacreSolto?: ReactNode
  petNome: string | null
  petGenero: string | null
  individual: boolean
  especie: string | null
  peso: number | null
  tutorNome: string | null
  telefone: string | null
  raca: string | null
  cor: string | null
  /** Ocupa o lugar da data (ex.: o selo "🕐 Em Acolhimento" — fase 2.15, item 18). */
  seloNoLugarDaData?: ReactNode
}

const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z'

export default function TopoCardPet(p: Props) {
  const data = dataDoCard(p.dataAcolhimento)
  const peso = pesoDoCard(p.peso)
  const esp = especieDoCard(p.especie, p.peso)
  const corTipo = p.individual ? '#10b981' : '#8b5cf6'
  const petNome = nomeDoCard(p.petNome)
  const tutor = nomeDoCard(p.tutorNome)
  const [primeiro, ...resto] = tutor.split(' ')
  const racaCor = [nomeDoCard(p.raca), nomeDoCard(p.cor)].filter(Boolean).join(' | ')
  const tel = (p.telefone || '').replace(/\D/g, '')

  return (
    <div className="space-y-1">
      {/* Linha 1: data · lacre·nome·IND · peso */}
      <div className="flex items-center gap-1.5 min-w-0">
        {p.seloNoLugarDaData ? p.seloNoLugarDaData : data ? (
          <div className="pl-chip flex-shrink-0 h-6 px-1.5 flex flex-col items-center justify-center" style={{ color: '#334155', gap: 1 }}>
            <span className="text-[11px] font-bold leading-none">{data.diaMes}</span>
            <span className="text-[8px] leading-none whitespace-nowrap" style={{ color: '#64748b' }}>{data.semanaHora}</span>
          </div>
        ) : (
          <div
            className="flex-shrink-0 h-6 px-1.5 rounded flex items-center justify-center text-center animate-pulse"
            style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #fde68a 50%, #fbbf24 100%)', color: '#78350f' }}
            title="Pet ainda não foi acolhido"
          >
            <span className="text-[8px] font-bold leading-none">Sem data<br />acolh.</span>
          </div>
        )}

        {p.lacreSolto}
        <div className="min-w-0 flex-1 flex">
          <div className="pl-tri" style={{ '--pl-tipo': corTipo } as React.CSSProperties}>
            {p.lacre && <span className="pl-tri-l">{p.lacre}</span>}
            <span className="pl-tri-n" style={{ color: p.petGenero === 'macho' ? '#1d4ed8' : '#db2777' }}>
              <span className="truncate">{petNome}</span>
              {p.petGenero && <span style={{ marginLeft: 2, fontSize: '.7rem' }}>{p.petGenero === 'macho' ? '♂' : '♀'}</span>}
            </span>
            <span className="pl-tri-t">{p.individual ? 'IND' : 'COL'}</span>
          </div>
        </div>

        <div className="pl-chip flex-shrink-0 h-6 px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap">
          <span className="leading-none" style={{ fontSize: 15 }}>{esp.emoji}</span>
          {peso && <span className="text-[12px] font-bold leading-none tabular-nums" style={{ color: esp.cor }}>{peso}</span>}
        </div>
      </div>

      {/* Linha 2: tutor (WhatsApp dentro da caixa) · raça | cor */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="pl-chip text-xs h-6 flex items-center gap-1 min-w-0 flex-1" style={{ padding: '0 2px 0 5px' }}>
          <span className="truncate flex-1 min-w-0">
            <span className="font-bold" style={{ color: '#6d28d9' }}>{primeiro}</span>
            {resto.length > 0 && <span className="font-normal" style={{ color: '#475569' }}>&nbsp;{resto.join(' ')}</span>}
          </span>
          {tel && (
            <a
              href={`https://wa.me/${tel}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 bg-[#25D366] text-white rounded-full"
              title="Conversar no WhatsApp"
              aria-label="Conversar no WhatsApp"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={WA_PATH} /></svg>
            </a>
          )}
        </span>
        {racaCor && (
          <span className="pl-chip text-[10px] font-medium h-6 flex items-center flex-shrink-0 max-w-[55%] min-w-0" style={{ padding: '0 5px' }}>
            <span className="truncate">{racaCor}</span>
          </span>
        )}
      </div>
    </div>
  )
}
