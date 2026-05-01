export type PeriodKey =
  | 'hoje' | 'ontem' | '7d' | '30d' | '90d' | '365d'
  | 'semana' | 'semana_a' | 'mes' | 'mes_a' | 'tri' | 'tri_a' | 'ano' | 'ano_a'
  | 'custom'

export type PeriodRange = {
  key: PeriodKey
  label: string
  from: Date
  to: Date
}

type PeriodDef = { key: PeriodKey; label: string }

export const PERIOD_GROUPS: { label: string; items: PeriodDef[] }[] = [
  {
    label: 'Calendário',
    items: [
      { key: 'semana',   label: 'Semana' },
      { key: 'semana_a', label: 'Semana-A' },
      { key: 'mes',      label: 'Mês' },
      { key: 'mes_a',    label: 'Mês-A' },
      { key: 'tri',      label: 'Tri' },
      { key: 'tri_a',    label: 'Tri-A' },
      { key: 'ano',      label: 'Ano' },
      { key: 'ano_a',    label: 'Ano-A' },
      { key: 'custom',   label: 'Personalizado' },
    ],
  },
  {
    label: 'Relativos',
    items: [
      { key: 'hoje',  label: 'Hoje' },
      { key: 'ontem', label: 'Ontem' },
      { key: '7d',    label: '7d' },
      { key: '30d',   label: '30d' },
      { key: '90d',   label: '90d' },
      { key: '365d',  label: '365d' },
    ],
  },
]

export const DEFAULT_PERIOD: PeriodKey = 'mes'

const startOfDay = (d: Date) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
const endOfDay   = (d: Date) => { const r = new Date(d); r.setHours(23, 59, 59, 999); return r }

export type CustomDates = { from?: Date | null; to?: Date | null }

export function computeRange(
  key: PeriodKey,
  now: Date = new Date(),
  custom?: CustomDates,
): PeriodRange {
  const today = startOfDay(now)
  const mk = (label: string, from: Date, to: Date): PeriodRange => ({ key, label, from, to })

  switch (key) {
    case 'custom': {
      let f = custom?.from ?? null
      let t = custom?.to ?? null
      if (f && t && startOfDay(f).getTime() > startOfDay(t).getTime()) {
        [f, t] = [t, f] // swap se invertido
      }
      const from = f ? startOfDay(f) : today
      const to   = t ? endOfDay(t)   : endOfDay(now)
      return mk('Personalizado', from, to)
    }
    case 'hoje':  return mk('Hoje',  today, endOfDay(now))
    case 'ontem': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return mk('Ontem', y, endOfDay(y))
    }
    case '7d':   { const f = new Date(today); f.setDate(f.getDate() - 6);   return mk('7d',   f, endOfDay(now)) }
    case '30d':  { const f = new Date(today); f.setDate(f.getDate() - 29);  return mk('30d',  f, endOfDay(now)) }
    case '90d':  { const f = new Date(today); f.setDate(f.getDate() - 89);  return mk('90d',  f, endOfDay(now)) }
    case '365d': { const f = new Date(today); f.setDate(f.getDate() - 364); return mk('365d', f, endOfDay(now)) }
    case 'semana': {
      const day = today.getDay() // 0=Dom..6=Sáb
      const diffToMon = day === 0 ? 6 : day - 1
      const seg = new Date(today); seg.setDate(seg.getDate() - diffToMon)
      const dom = new Date(seg);   dom.setDate(dom.getDate() + 6)
      return mk('Semana (Seg–Dom)', seg, endOfDay(dom))
    }
    case 'semana_a': {
      const day = today.getDay()
      const diffToMon = day === 0 ? 6 : day - 1
      const segCorrente = new Date(today); segCorrente.setDate(segCorrente.getDate() - diffToMon)
      const seg = new Date(segCorrente); seg.setDate(seg.getDate() - 7)
      const dom = new Date(seg);          dom.setDate(dom.getDate() + 6)
      return mk('Semana anterior', seg, endOfDay(dom))
    }
    case 'mes': {
      const f = new Date(today.getFullYear(), today.getMonth(), 1)
      const t = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return mk('Mês', f, endOfDay(t))
    }
    case 'mes_a': {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const t = new Date(today.getFullYear(), today.getMonth(),     0)
      return mk('Mês anterior', f, endOfDay(t))
    }
    case 'tri': {
      const m = today.getMonth()
      const triStart = Math.floor(m / 3) * 3
      const f = new Date(today.getFullYear(), triStart, 1)
      const t = new Date(today.getFullYear(), triStart + 3, 0)
      return mk('Tri', f, endOfDay(t))
    }
    case 'tri_a': {
      const m = today.getMonth()
      const triStart = Math.floor(m / 3) * 3 - 3
      const f = new Date(today.getFullYear(), triStart, 1)
      const t = new Date(today.getFullYear(), triStart + 3, 0)
      return mk('Tri anterior', f, endOfDay(t))
    }
    case 'ano': {
      const f = new Date(today.getFullYear(), 0, 1)
      const t = new Date(today.getFullYear(), 11, 31)
      return mk('Ano', f, endOfDay(t))
    }
    case 'ano_a': {
      const y = today.getFullYear() - 1
      const f = new Date(y, 0, 1)
      const t = new Date(y, 11, 31)
      return mk('Ano anterior', f, endOfDay(t))
    }
  }
}

/** Período anterior do mesmo "tamanho", imediatamente antes do range atual.
 *  - hoje/ontem/Nd/custom → desloca pelo nº de dias do range
 *  - semana → semana anterior (Seg-Dom)
 *  - mes → mês anterior (1º → último dia)
 *  - tri → trimestre anterior
 *  - ano → ano anterior */
export function computePreviousRange(r: PeriodRange): PeriodRange {
  switch (r.key) {
    case 'semana':
    case 'semana_a': {
      const f = new Date(r.from); f.setDate(f.getDate() - 7)
      const t = new Date(r.to);   t.setDate(t.getDate() - 7)
      return { key: r.key, label: r.label, from: startOfDay(f), to: endOfDay(t) }
    }
    case 'mes':
    case 'mes_a': {
      const y = r.from.getFullYear(), m = r.from.getMonth()
      const f = new Date(y, m - 1, 1)
      const t = new Date(y, m, 0) // último dia do mês anterior
      return { key: r.key, label: r.label, from: startOfDay(f), to: endOfDay(t) }
    }
    case 'tri':
    case 'tri_a': {
      const y = r.from.getFullYear(), m = r.from.getMonth()
      const f = new Date(y, m - 3, 1)
      const t = new Date(y, m, 0)
      return { key: r.key, label: r.label, from: startOfDay(f), to: endOfDay(t) }
    }
    case 'ano':
    case 'ano_a': {
      const y = r.from.getFullYear()
      const f = new Date(y - 1, 0, 1)
      const t = new Date(y - 1, 11, 31)
      return { key: r.key, label: r.label, from: startOfDay(f), to: endOfDay(t) }
    }
    default: {
      // hoje, ontem, 7d, 30d, 90d, 365d, custom — desloca pela duração
      const ms = r.to.getTime() - r.from.getTime()
      const t = new Date(r.from.getTime() - 1)
      const f = new Date(t.getTime() - ms)
      return { key: r.key, label: r.label, from: startOfDay(f), to: endOfDay(t) }
    }
  }
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mmm = MESES_ABREV[d.getMonth()]
  const yyyy = d.getFullYear()
  return `${dd}/${mmm}/${yyyy}`
}

/** Texto curto pra exibir embaixo das pills: "01/mai/2026 – 31/mai/2026" */
export function formatRangeShort(r: PeriodRange): string {
  const sameDay = r.from.toDateString() === r.to.toDateString()
  if (sameDay) return fmtDate(r.from)
  return `${fmtDate(r.from)} – ${fmtDate(r.to)}`
}
