'use client'

/**
 * Card do PREVENTIVO no padrão novo — item 6 dos ajustes finos (aprovado pelo Lucas em 10/10/2026
 * na bancada, seção "Tela /preventivos"). É o card de hoje da `/preventivos` REARRANJADO peça
 * por peça na linha dos cards do pipeline (`CardPetDesk` / `TopoCardPet`), nada de conceito novo:
 *
 *  - data dd/mmm + ANO (no PV a data é a da contratação, e o ano importa);
 *  - peso numa linha (emoji + kg), sem a letra de porte;
 *  - NOME·IND numa peça só (`.pl-tri`, sem lacre — PV não tem);
 *  - tutor + raça|cor na 2ª linha; fonte + seguradora juntas;
 *  - cidade e urna no "meio" (onde os outros mostram endereço/GC);
 *  - 💵 com a regra de hoje: pago pequeno à esquerda, em aberto grande à direita;
 *  - ✝️ ATV nas ações (dock no desktop, como o pipeline).
 *
 * Desktop (≥1024px) = 1 linha larga; celular = 3 linhas. Quem decide entre este e o antigo é a
 * página, pela mesma chave do pipeline novo (`useCardNovo`).
 */
import type { CSSProperties, ReactNode } from 'react'
import { pesoDoCard, especieDoCard, nomeDoCard } from '@/lib/card-pet'
import { separarPrimeiroNome } from '@/lib/nome-tutor'
import DockAcoes from '@/components/contratos/pipeline/DockAcoes'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export type FarolPagamentoPV = { concluido: boolean; emoji: string; sublabel?: string; tooltip?: string; bg: string; color: string; borderColor: string }
export type FontePV = { nome: string; titulo: string; icon?: string; img?: string; style: CSSProperties }

type Props = {
  dataContrato: string | null
  petNome: string | null
  petGenero: string | null
  individual: boolean
  especie: string | null
  peso: number | null
  tutorNome: string | null
  raca: string | null
  cor: string | null
  cidade: string | null
  urna: string | null
  seguradora: string | null
  fonte: FontePV | null
  /** null = FLS `btn_farol_pagamento` escondido. */
  pagamento: FarolPagamentoPV | null
  /** Botão de WhatsApp (ou null sem telefone). */
  whatsapp: ReactNode
  onAtivar: () => void
  onAbrir: () => void
}

function dataPV(iso: string | null): { diaMes: string; ano: string } | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return null
  return { diaMes: `${String(d.getDate()).padStart(2, '0')}/${MESES[d.getMonth()]}`, ano: String(d.getFullYear()) }
}

function Fonte({ p, alto }: { p: Props; alto: string }) {
  if (!p.fonte) return null
  return (
    <span className={`flex-none ${alto} rounded-md flex items-center gap-1 px-1.5`} style={p.fonte.style} title={p.fonte.titulo}>
      {p.fonte.img
        ? <img src={p.fonte.img} alt={p.fonte.nome} className="w-4 h-4" />
        : <span className="text-sm leading-none">{p.fonte.icon || '❓'}</span>}
      {p.seguradora && <span className="text-[10px] font-bold px-1 rounded bg-indigo-600 text-white leading-4">{p.seguradora}</span>}
    </span>
  )
}

function Farol({ f, grande }: { f: FarolPagamentoPV; grande: boolean }) {
  const w = grande ? 40 : 28
  return (
    <div className="flex-none rounded-lg flex flex-col items-center justify-center leading-none" title={f.tooltip}
      style={{ width: w, height: w, background: f.bg, color: f.color, borderColor: f.borderColor, borderWidth: grande ? 2 : 1, borderStyle: 'solid' }}>
      <span className={grande ? 'text-xl' : 'text-base'}>{f.emoji}</span>
      {f.sublabel && <span className={`${grande ? 'text-[9px]' : 'text-[7px]'} font-bold`}>{f.sublabel}</span>}
    </div>
  )
}

function Tri({ p }: { p: Props }) {
  return (
    <div className="pl-tri" style={{ '--pl-tipo': p.individual ? '#10b981' : '#8b5cf6' } as CSSProperties}>
      <span className="pl-tri-n" style={{ color: p.petGenero === 'macho' ? '#1d4ed8' : '#db2777' }}>
        <span className="truncate">{nomeDoCard(p.petNome)}</span>
        {p.petGenero && <span style={{ marginLeft: 2, fontSize: '.75rem' }}>{p.petGenero === 'macho' ? '♂' : '♀'}</span>}
      </span>
      <span className="pl-tri-t">{p.individual ? 'IND' : 'COL'}</span>
    </div>
  )
}

function Peso({ p, alto, fs }: { p: Props; alto: string; fs: number }) {
  const peso = pesoDoCard(p.peso)
  const esp = especieDoCard(p.especie, p.peso)
  return (
    <div className={`pl-chip flex-none ${alto} px-1.5 rounded-md flex items-center gap-1 whitespace-nowrap`}>
      <span className="leading-none" style={{ fontSize: fs }}>{esp.emoji}</span>
      {peso
        ? <span className="text-[12px] font-bold leading-none tabular-nums" style={{ color: esp.cor }}>{peso}</span>
        : <span className="text-[11px] leading-none" style={{ color: '#94a3b8' }}>s/ peso</span>}
    </div>
  )
}

function Tutor({ p, whatsapp }: { p: Props; whatsapp?: ReactNode }) {
  const { primeiro, resto } = separarPrimeiroNome(nomeDoCard(p.tutorNome) || '—')
  return (
    <span className="pl-chip text-xs h-6 flex items-center gap-1 min-w-0 pl-1.5" style={{ flex: '1 1 auto', paddingRight: whatsapp ? 2 : 6 }}>
      <span className="truncate flex-1 min-w-0">
        <span className="font-bold" style={{ color: '#6d28d9' }}>{primeiro}</span>
        {resto && <span style={{ color: '#475569' }}>&nbsp;{resto}</span>}
      </span>
      {whatsapp}
    </span>
  )
}

function RacaCor({ p }: { p: Props }) {
  const t = [nomeDoCard(p.raca), nomeDoCard(p.cor)].filter(Boolean).join(' | ')
  if (!t) return null
  return (
    <span className="pl-chip text-[10px] font-medium h-6 flex items-center min-w-0 px-1.5" style={{ flex: '0 2 auto', maxWidth: '55%' }}>
      <span className="truncate">{t}</span>
    </span>
  )
}

function BotaoAtivar({ p, tam }: { p: Props; tam: string }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); p.onAtivar() }}
      className={`flex-none flex items-center justify-center ${tam} bg-red-900 text-white rounded-full hover:bg-red-800 transition-colors`}
      title="Ativar contrato (pet faleceu)">
      <div className="flex flex-col items-center justify-center leading-none gap-0">
        <span className="text-[10px] font-black tracking-tight">ATV</span>
        <span className="text-[11px]">✝️</span>
      </div>
    </button>
  )
}

export default function CardPreventivoNovo(p: Props & { whatsappPequeno: ReactNode }) {
  const data = dataPV(p.dataContrato)
  const cor = p.individual ? '#10b981' : '#8b5cf6'
  const fundo = p.individual
    ? 'linear-gradient(135deg, #10b981 0%, #6ee7b7 30%, transparent 70%)'
    : 'linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 30%, transparent 70%)'
  const pagoEsq = p.pagamento?.concluido ? p.pagamento : null
  const abertoDir = p.pagamento && !p.pagamento.concluido ? p.pagamento : null
  const caixaData = (alto: string, w: string, grande: boolean) => data && (
    <div className={`pl-chip flex-none ${w} ${alto} rounded${grande ? '-lg' : ''} flex flex-col items-center justify-center`} style={{ color: '#334155', gap: grande ? 2 : 1 }}>
      <span className={`${grande ? 'text-[12px]' : 'text-[11px]'} font-bold leading-none`}>{data.diaMes}</span>
      <span className={`${grande ? 'text-[9px]' : 'text-[8px]'} leading-none`} style={{ color: '#64748b' }}>{data.ano}</span>
    </div>
  )

  return (
    <div className="relative overflow-hidden rounded-lg border-2 shadow-sm hover:shadow-md cursor-pointer transition-all"
      style={{ backgroundImage: fundo, backgroundColor: 'var(--surface-0)', borderColor: cor }} onClick={p.onAbrir}>
      {/* DESKTOP: 1 linha larga */}
      <div className="hidden lg:flex items-center gap-2 min-w-0 p-1.5">
        {caixaData('h-11', 'w-14', true)}
        <Peso p={p} alto="h-11" fs={18} />
        <div className="flex-none flex items-center justify-center gap-1" style={{ minWidth: 90 }}>
          <Fonte p={p} alto="h-7" />
          {pagoEsq && <Farol f={pagoEsq} grande={false} />}
        </div>
        <div className="flex-none min-w-0 leading-tight" style={{ width: 280 }}>
          <div className="flex items-center min-w-0"><Tri p={p} /></div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0"><Tutor p={p} /><RacaCor p={p} /></div>
        </div>
        {abertoDir && <Farol f={abertoDir} grande />}
        <div className="flex-1 min-w-[12px]" />
        <div className="w-[300px] flex-shrink min-w-0 pl-3 pr-1 self-center flex flex-col gap-1 text-[12px]">
          <span className="flex items-center gap-1.5 min-w-0 text-[var(--surface-500)]">
            <span className="flex-none">📍</span><span className="truncate">{p.cidade || <i>sem cidade</i>}</span>
          </span>
          <span className="flex items-center gap-1.5 min-w-0" style={{ color: p.urna ? '#f59e0b' : 'var(--surface-400)' }}>
            <span className="flex-none">⚱️</span><span className="truncate">{p.urna || 'urna a definir'}</span>
          </span>
        </div>
        <div className="flex-none" onClick={e => e.stopPropagation()}>
          <DockAcoes>{p.whatsapp}<BotaoAtivar p={p} tam="w-9 h-9" /></DockAcoes>
        </div>
      </div>

      {/* CELULAR: 3 linhas, como o pipeline */}
      <div className="lg:hidden space-y-1 p-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {caixaData('h-6', 'px-1.5', false)}
          <div className="min-w-0 flex-1 flex"><Tri p={p} /></div>
          <Peso p={p} alto="h-6" fs={15} />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Tutor p={p} whatsapp={p.whatsappPequeno} />
          <RacaCor p={p} />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Fonte p={p} alto="h-8" />
          {p.pagamento && (
            <span className="flex-none h-8 px-2 rounded-lg flex items-center gap-1 text-[12px] font-bold" title={p.pagamento.tooltip}
              style={{ background: p.pagamento.bg, color: p.pagamento.color, border: `1px solid ${p.pagamento.borderColor}` }}>
              {p.pagamento.emoji} {p.pagamento.concluido ? 'Pago' : `Em aberto${p.pagamento.sublabel ? ' · ' + p.pagamento.sublabel : ''}`}
            </span>
          )}
          <span className="flex-1 min-w-0 flex flex-col text-[10.5px] leading-tight">
            <span className="truncate text-[var(--surface-500)]">📍 {p.cidade || '—'}</span>
            <span className="truncate" style={{ color: p.urna ? '#f59e0b' : 'var(--surface-400)' }}>⚱️ {p.urna || 'a definir'}</span>
          </span>
          <BotaoAtivar p={p} tam="w-8 h-8" />
        </div>
      </div>
    </div>
  )
}
