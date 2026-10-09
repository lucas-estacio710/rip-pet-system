'use client'

/**
 * Esteira do GC DENTRO do card do pet no celular — fase 2.14a (item 14 de
 * docs/REDESENHO_CARDS_PIPELINE.md). No celular isto é NOVO: até aqui a linha do tempo só
 * existia no desktop (`renderLinhaDoTempoGC`, no `meio` do card largo).
 *
 *   CONTATO  ●A Chamar ── ●Contatado ── ○Agendado
 *            06/set       08/set
 *   ETAPA    ●Provis. ── ●Recebido ── ○Cremado ── ○Finalizado
 *            06/set       09/set     prev. 12/set 14h
 *
 * Regras herdadas da linha do tempo do desktop (FLOW §3.2): passos FIXOS (3 + 4, sempre),
 * `A Chamar` e `Provisionado` nascem cumpridos com a data da ida ("o relógio começou"), a
 * previsão de cremação em âmbar e SEM sinal de atraso (decisão de 30/09).
 * Cores do contato INVERTIDAS só aqui (P-03): Contatado azul, Agendado verde — selos
 * antigos, /gc e /gruposencaminhamentos mantêm as cores de hoje até o 3.3.
 * GC finalizado: uma linha só ("Recebido · Cremado · Finalizado") com setinha que abre as
 * duas trilhas.
 */
import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'

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
      <span className="flex-none w-[46px] pt-[3px] text-[8.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--surface-500)' }}>{titulo}</span>
      <div className="flex items-start flex-1 min-w-0">
        {passos.map((p, i) => {
          const ok = i <= atual
          return (
            <Fragment key={p.rotulo}>
              {i > 0 && <div className="h-px flex-1 mt-[6px] min-w-[4px]" style={{ background: ok ? p.cor : 'var(--surface-300)' }} />}
              <div className="flex flex-col items-center flex-none min-w-0" style={{ maxWidth: 64 }}>
                <span className={`w-3 h-3 rounded-full border-2 ${ok ? '' : 'motion-safe:animate-pulse'}`}
                  style={{ background: ok ? p.cor : 'transparent', borderColor: ok ? p.cor : 'var(--surface-300)' }} />
                <span className="text-[9px] leading-tight mt-0.5 text-center" style={{ color: ok ? 'var(--surface-700)' : 'var(--surface-500)' }}>{p.rotulo}</span>
                {ok && p.data && <span className="text-[9px] leading-tight tabular-nums" style={{ color: 'var(--surface-500)' }}>{p.data}</span>}
                {!ok && p.previsao && <span className="text-[9px] leading-tight italic text-amber-500 text-center">{p.previsao}</span>}
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
    { rotulo: 'Contatado', cor: '#3b82f6', data: diaMes(gc.contato_tutor_em) },
    { rotulo: 'Agendado', cor: '#22c55e', data: diaMes(gc.data_agendamento) },
  ]
  const etapas: Passo[] = [
    { rotulo: 'Provisionado', cor: '#64748b', data: diaMes(dataIda) },
    { rotulo: 'Recebido', cor: '#3b82f6', data: diaMes(gc.data_recebimento) },
    { rotulo: 'Cremado', cor: '#eab308', data: diaMes(gc.data_cremacao), previsao },
    { rotulo: 'Finalizado', cor: '#22c55e', data: diaMes(gc.data_disponivel) },
  ]

  const trilhas = (
    <div className="space-y-1">
      <Trilha titulo="Contato" passos={contato} atual={iContato} />
      <Trilha titulo="Etapa" passos={etapas} atual={iEtapa} />
    </div>
  )

  if (etapa !== 'disponivel') {
    return <div className="px-0.5 py-1" onClick={e => e.stopPropagation()}>{trilhas}</div>
  }

  // GC finalizado: uma linha só, com a setinha que abre (e recolhe) as duas trilhas.
  const resumo = [['Recebido', gc.data_recebimento], ['Cremado', gc.data_cremacao], ['Finalizado', gc.data_disponivel]]
    .map(([r, d]) => `${r} ${diaMes(d) || '—'}`).join(' · ')
  return (
    <div className="px-0.5 py-0.5" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setAberta(a => !a)} className="w-full flex items-center gap-1.5 text-left" aria-expanded={aberta}>
        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: '#22c55e' }} />
        <span className="flex-1 min-w-0 truncate text-[11px]" style={{ color: 'var(--surface-600)' }}>{resumo}</span>
        <ChevronDown className={`h-4 w-4 flex-none transition-transform ${aberta ? 'rotate-180' : ''}`} style={{ color: 'var(--surface-400)' }} />
      </button>
      {aberta && <div className="mt-1.5">{trilhas}</div>}
    </div>
  )
}
