'use client'

/**
 * Esteira do GC DENTRO do card do pet — fase 2.14a (item 14 de docs/REDESENHO_CARDS_PIPELINE.md);
 * desenho da bancada aplicado no item 9 dos ajustes finos (09/10/2026). Celular e desktop.
 *
 *   ┌──────────────────────────────────────────────────────────┐   (moldura .pl-esteira)
 *   │ CONTATO  ●A Chamar ━━ ●Contatado ━━ ○Agendado              │
 *   │          06/set        08/set                              │
 *   │ ETAPA    ●Provis. ━━ ●Recebido ━━ ○Cremado ━━ ○Final.       │
 *   │          06/set      09/set     prev. 12/set 14h           │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Regras herdadas (FLOW §3.2): passos FIXOS (3 + 4, sempre), `A Chamar` e `Provisionado` nascem
 * cumpridos com a data da ida ("o relógio começou"), previsão de cremação em âmbar e SEM sinal de
 * atraso. Cores do contato invertidas só aqui (P-03): Contatado azul, Agendado verde.
 * GC concluído: três caixinhas coloridas com o nome (Recebido · Cremado · Finalizado) e a data
 * com ✓ embaixo, centralizadas; a setinha abre a esteira completa e um ˄ no canto recolhe.
 */
import { Fragment, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

export type GCDoCard = {
  etapa: string | null
  contato_status: string | null
  contato_tutor_em?: string | null
  data_agendamento?: string | null
  data_recebimento?: string | null
  data_cremacao?: string | null
  data_disponivel?: string | null
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `2026-09-06T14:30:00Z` → `06/set`, na data LOCAL (lição da mig 113). */
export function diaMes(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return `${String(d.getDate()).padStart(2, '0')}/${MESES[d.getMonth()]}`
}

type Passo = { rotulo: string; cor: string; data?: string; previsao?: string }

function Trilha({ titulo, passos, atual }: { titulo: string; passos: Passo[]; atual: number }) {
  return (
    <div className="flex items-start gap-1">
      <span className="pl-est-tit">{titulo}</span>
      <div className="flex items-start flex-1 min-w-0">
        {passos.map((p, i) => {
          const ok = i <= atual
          return (
            <Fragment key={p.rotulo}>
              {i > 0 && <div className="h-[2px] flex-1 mt-[5px] mx-0.5 rounded min-w-[4px]" style={{ background: ok ? p.cor : 'var(--surface-200)' }} />}
              <div className="flex flex-col items-center flex-none" style={{ minWidth: 46 }}>
                <span className={`pl-est-dot${ok ? ' on' : ''}`} style={{ '--gc': p.cor } as React.CSSProperties} />
                <span className={`pl-est-rot${ok ? ' on' : ''}`}>{p.rotulo}</span>
                {ok && p.data && <span className="pl-est-dt">{p.data}</span>}
                {!ok && p.previsao && <span className="pl-est-dt italic text-amber-500">{p.previsao}</span>}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default function EsteiraGC({ gc, dataIda }: { gc: GCDoCard; dataIda: string | null }) {
  const [aberta, setAberta] = useState(false)
  const etapa = gc.etapa || 'provisionado'
  const iEtapa = Math.max(0, ['provisionado', 'recebido', 'cremado', 'disponivel'].indexOf(etapa))
  const iContato = Math.max(0, [null, 'contatado', 'agendado'].indexOf(gc.contato_status || null))

  let previsao: string | undefined
  if (etapa === 'recebido' && gc.data_agendamento) {
    const d = new Date(gc.data_agendamento)
    if (!isNaN(d.getTime())) previsao = `prev. ${diaMes(gc.data_agendamento)} ${String(d.getHours()).padStart(2, '0')}h`
  }

  const contato: Passo[] = [
    { rotulo: 'A Chamar', cor: '#94a3b8', data: diaMes(dataIda) },
    { rotulo: 'Contatado', cor: '#1a73e8', data: diaMes(gc.contato_tutor_em) },
    { rotulo: 'Agendado', cor: '#34d399', data: diaMes(gc.data_agendamento) },
  ]
  const etapas: Passo[] = [
    { rotulo: 'Provis.', cor: '#64748b', data: diaMes(dataIda) },
    { rotulo: 'Recebido', cor: '#3b82f6', data: diaMes(gc.data_recebimento) },
    { rotulo: 'Cremado', cor: '#eab308', data: diaMes(gc.data_cremacao), previsao },
    { rotulo: 'Final.', cor: '#22c55e', data: diaMes(gc.data_disponivel) },
  ]

  const completa = (recolher: boolean) => (
    <div className="pl-esteira space-y-1.5 relative" onClick={e => e.stopPropagation()}>
      {recolher && (
        <button type="button" onClick={() => setAberta(false)} title="Recolher"
          className="absolute top-0.5 right-0.5 w-6 h-6 rounded-md grid place-items-center" style={{ color: 'var(--surface-400)' }}>
          <ChevronUp className="h-4 w-4" />
        </button>
      )}
      <Trilha titulo="Contato" passos={contato} atual={iContato} />
      <Trilha titulo="Etapa" passos={etapas} atual={iEtapa} />
    </div>
  )

  if (etapa !== 'disponivel') return completa(false)
  if (aberta) return completa(true)

  // GC concluído: as três caixinhas da bancada, centralizadas; a setinha abre a esteira inteira.
  const item = (rotulo: string, cor: string, data: string | null | undefined) => (
    <span className="flex flex-col items-center min-w-0 gap-0.5">
      <span className="pl-gcbox" style={{ '--gc': cor } as React.CSSProperties}>{rotulo}</span>
      <span className="pl-est-dt flex items-center gap-0.5">{diaMes(data) || '—'}<Check className="h-3 w-3" style={{ color: cor }} /></span>
    </span>
  )
  return (
    <button type="button" onClick={e => { e.stopPropagation(); setAberta(true) }} title="Ver a esteira completa"
      className="pl-esteira w-full flex items-center justify-center gap-5 relative px-9">
      {item('Recebido', '#3b82f6', gc.data_recebimento)}
      {item('Cremado', '#eab308', gc.data_cremacao)}
      {item('Finalizado', '#22c55e', gc.data_disponivel)}
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md grid place-items-center"
        style={{ background: 'var(--surface-100)', color: 'var(--surface-500)' }}>
        <ChevronDown className="h-4 w-4" />
      </span>
    </button>
  )
}
