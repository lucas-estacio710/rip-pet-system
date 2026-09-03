'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Table2, BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { filtroModo, mesLocalDeCorte, type DashboardModo } from '@/lib/dashboard-modo'
import ModoToggle from './ModoToggle'
import { PERIODOS_DIA, periodoDoDia, type PeriodoKey } from './PeriodoRemocaoKPI'

type Props = {
  modo: DashboardModo
  // A aba renderiza o próprio toggle de modo (junto da janela de tempo), mas o estado continua
  // na página — é ela que persiste a escolha em localStorage.
  selectModo: (m: DashboardModo) => void
}

// Mesmas cores já usadas nas outras telas de Dashboards — mantém a identidade visual
// consistente entre Operacional e Evolução (mesma fonte/espécie/tipo = mesma cor sempre).
const COLOR_VOLUME  = '#2a78d6' // azul  (FinanceiroTab)
const COLOR_RECEITA = '#199e70' // verde (FinanceiroTab)
const COLOR_TICKET  = '#f59e0b' // âmbar

const COLOR_IND = '#10b981' // verde  (TipoCremacaoKPI)
const COLOR_COL = '#a855f7' // roxo   (TipoCremacaoKPI)

const ESPECIE_COLORS: Record<string, string> = {
  canina: '#ca8a04', felina: '#ec4899', exotica: '#6366f1', // (EspecieKPI)
}
const ESPECIE_LABELS: Record<string, string> = { canina: 'Canina', felina: 'Felina', exotica: 'Exótica' }

// Cores das fontes canônicas mais comuns — mesmas do ComoConheceuKPI. As demais dobram em "Outras".
const FONTE_COLORS: Record<string, string> = {
  'Google': '#3b82f6',
  'Instagram/Facebook': '#f97316',
  'Indicação em Clínica': '#10b981',
  'Cliente': '#7c3aed',
  'Parente/Amigo': '#a78bfa',
  'Seguradora': '#4338ca',
  'Ponto': '#dc2626',
  'IA': '#ec4899',
  'Outro': '#64748b',
}
const COLOR_OUTRAS = '#94a3b8'

const JANELAS = [
  { meses: 6 as const,  label: '6 meses' },
  { meses: 12 as const, label: '12 meses' },
  { meses: 24 as const, label: '24 meses' },
]

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Números amigáveis em cima das barras — abrevia por ordem de grandeza só quando o número é
// grande o bastante pra atrapalhar (senão o rótulo "1.3k" fica pior que "1292").
function formatK(v: number): string {
  const r = Math.round(v / 100) / 10
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}k`
}
function formatM(v: number): string {
  const r = Math.round(v / 100_000) / 10
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}M`
}
function abreviarNumero(v: number): string {
  if (!v) return ''
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return formatM(v)
  if (abs >= 10_000) return formatK(v)
  return Math.round(v).toLocaleString('pt-BR')
}
function abreviarMoeda(v: number): string {
  if (!v) return ''
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `R$ ${formatM(v)}`
  if (abs >= 10_000) return `R$ ${formatK(v)}`
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`
}

// Rótulo customizado em cima da barra/ponto — "thinFactor" pula rótulos (mostra 1 a cada N)
// quando a janela tem bar demais pra caber todo mundo sem sobrepor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBarLabel(fmt: (v: number) => string, thinFactor: number, fontSize: number, color: string) {
  return (props: any) => {
    const x = Number(props.x ?? 0), y = Number(props.y ?? 0), width = Number(props.width ?? 0)
    const value = props.value, index = Number(props.index ?? 0)
    const skip = (thinFactor > 1 && index % thinFactor !== 0)
    const text = skip ? '' : fmt(Number(value ?? 0))
    if (!text) return <></>
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={fontSize} fill={color} fontFamily="ui-monospace, monospace">
        {text}
      </text>
    )
  }
}
function makeLineLabel(fmt: (v: number) => string, thinFactor: number, fontSize: number, color: string) {
  return (props: any) => {
    const x = Number(props.x ?? 0), y = Number(props.y ?? 0)
    const value = props.value, index = Number(props.index ?? 0)
    const skip = (thinFactor > 1 && index % thinFactor !== 0)
    const text = skip ? '' : fmt(Number(value ?? 0))
    if (!text) return <></>
    return (
      <text x={x} y={y - 10} textAnchor="middle" fontSize={fontSize} fill={color} fontFamily="ui-monospace, monospace">
        {text}
      </text>
    )
  }
}

type ContratoRow = {
  data_acolhimento: string | null
  data_contrato: string | null
  valor_plano: number | null
  desconto_plano_unificado: number | null
  valor_acessorios: number | null
  desconto_acessorios: number | null
  desconto_acessorios_ajuste: number | null
  tipo_cremacao: 'individual' | 'coletiva' | null
  pet_especie: 'canina' | 'felina' | 'exotica' | null
  fonte_conhecimento_id: string | null
  fonte_conhecimento_ids: string[] | null
}

type FonteRow = { id: string; nome: string }

type MesPonto = {
  mesKey: string
  label: string
  labelCompleto: string
  volume: number
  receita: number
  individual: number
  coletiva: number
  canina: number
  felina: number
  exotica: number
  madrugada: number
  manha: number
  tarde: number
  noite: number
  fontes: Record<string, number>
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ⚠️ Não trocar por `ymKey(new Date(dataStr))`: `data_contrato` é `date` puro e o JS lê
// ISO date-only como meia-noite UTC — em Brasília isso é 21h do dia anterior, e todo contrato
// do dia 1º ia parar no mês anterior (era a divergência com a aba Operacional). Ver
// `mesLocalDeCorte` em lib/dashboard-modo.ts, que trata as duas colunas do toggle.
const mesKeyDe = mesLocalDeCorte

function novoMesPonto(d: Date, key: string): MesPonto {
  return {
    mesKey: key,
    label: `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
    labelCompleto: `${MESES_ABREV[d.getMonth()]} de ${d.getFullYear()}`,
    volume: 0, receita: 0,
    individual: 0, coletiva: 0,
    canina: 0, felina: 0, exotica: 0,
    madrugada: 0, manha: 0, tarde: 0, noite: 0,
    fontes: {},
  }
}

function TrendBadge({ atual, anterior, formatar, rotulo }: { atual: number; anterior: number; formatar: (v: number) => string; rotulo: string }) {
  const delta = atual - anterior
  const pct = anterior > 0 ? Math.round((delta / anterior) * 100) : (atual > 0 ? 100 : 0)
  const trend: 'up' | 'down' | 'flat' = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const cor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : 'var(--surface-500)'
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: cor }}>
      <Icon className="h-3.5 w-3.5" />
      {trend === 'flat' ? 'sem variação' : `${delta > 0 ? '+' : ''}${pct}%`}
      <span className="text-[var(--surface-400)] font-normal">{rotulo} ({formatar(anterior)})</span>
    </span>
  )
}

// Small multiple: 1 série só, usado nas grades "quebradas" (Individual×Coletiva, Período, Fontes)
// — cada categoria vira seu próprio mini-gráfico em vez de empilhar tudo numa barra só.
function MiniEvolucaoChart({
  pontos, dataKey, color, titulo, janela, formatarValor,
}: {
  pontos: Record<string, unknown>[]
  dataKey: string
  color: string
  titulo: string
  janela: 6 | 12 | 24
  formatarValor?: (v: number) => string
}) {
  const fmt = formatarValor ?? abreviarNumero
  const thinFactor = janela >= 12 ? 2 : 1
  return (
    <div className="card p-3 sm:p-4">
      <h4 className="text-xs font-semibold text-[var(--surface-700)] mb-2 truncate" title={titulo}>{titulo}</h4>
      <div style={{ width: '100%', height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pontos} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-200)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--surface-500)' }} interval={janela > 12 ? 2 : janela > 6 ? 1 : 0} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} allowDecimals={false} width={26} />
            <Tooltip formatter={value => [fmt(Number(value ?? 0)), titulo]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Bar dataKey={dataKey} radius={[3, 3, 0, 0]} maxBarSize={28}>
              <LabelList content={makeBarLabel(fmt, thinFactor, 9, 'var(--surface-600)')} />
              {pontos.map((p, i) => (
                <Cell key={String(p.mesKey)} fill={color} fillOpacity={i === pontos.length - 1 ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function EvolucaoTab({ modo, selectModo }: Props) {
  const { currentUnit } = useUnit()
  const [janela, setJanela] = useState<6 | 12 | 24>(12)
  const [rows, setRows] = useState<ContratoRow[] | null>(null)
  const [idToNome, setIdToNome] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [tabela, setTabela] = useState(false)

  // Fontes de conhecimento — tabela global, independente de unidade/janela
  useEffect(() => {
    const supabase = createClient()
    supabase.from('fontes_conhecimento').select('id,nome').then(({ data }) => {
      const map = new Map<string, string>()
      ;((data ?? []) as FonteRow[]).forEach(f => map.set(f.id, f.nome))
      setIdToNome(map)
    })
  }, [])

  useEffect(() => {
    if (!currentUnit) return
    const supabase = createClient()
    let cancelled = false
    setLoading(true)

    async function fetchAll(): Promise<ContratoRow[]> {
      const hoje = new Date()
      // Busca 12 meses A MAIS que a janela exibida, pra sempre poder comparar com "mesmo mês ano passado"
      const totalMeses = janela + 12
      const from = new Date(hoje.getFullYear(), hoje.getMonth() - (totalMeses - 1), 1)
      const to = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999)
      const campos = 'data_acolhimento,data_contrato,valor_plano,desconto_plano_unificado,valor_acessorios,desconto_acessorios,desconto_acessorios_ajuste,tipo_cremacao,pet_especie,fonte_conhecimento_id,fonte_conhecimento_ids'

      // Supabase corta em 1000 linhas por página — pagina até esgotar (feedback_supabase_limite_1000_linhas)
      const all: ContratoRow[] = []
      const PAGE = 1000
      let offset = 0
      for (;;) {
        let q = supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id)
        q = filtroModo(q, modo, from, to)
        const { data, error } = await q.range(offset, offset + PAGE - 1)
        if (error) { console.error('[EvolucaoTab]', error); break }
        const page = (data ?? []) as unknown as ContratoRow[]
        all.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
      return all
    }

    fetchAll().then(data => {
      if (cancelled) return
      setRows(data)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [currentUnit?.id, modo, janela])

  // Buckets mensais — janela + 12 meses de histórico (o excedente só serve pra comparação YoY)
  const { pontos, buscarMes, fontesTop } = useMemo(() => {
    const hoje = new Date()
    const totalMeses = janela + 12
    const buckets = new Map<string, MesPonto>()
    for (let i = totalMeses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const key = ymKey(d)
      buckets.set(key, novoMesPonto(d, key))
    }

    const fonteTotais = new Map<string, number>()
    const fontesPorMes = new Map<string, Map<string, number>>()

    for (const r of rows ?? []) {
      const dataRef = modo === 'contratos' ? r.data_contrato : r.data_acolhimento
      if (!dataRef) continue
      const key = mesKeyDe(dataRef)
      const bucket = buckets.get(key)
      if (!bucket) continue

      bucket.volume += 1
      const vendidoPlano = (r.valor_plano || 0) - (r.desconto_plano_unificado || 0)
      const vendidoAcessorios = (r.valor_acessorios || 0) - (r.desconto_acessorios || 0) - (r.desconto_acessorios_ajuste || 0)
      bucket.receita += vendidoPlano + vendidoAcessorios

      if (r.tipo_cremacao === 'individual') bucket.individual += 1
      else if (r.tipo_cremacao === 'coletiva') bucket.coletiva += 1

      if (r.pet_especie === 'canina') bucket.canina += 1
      else if (r.pet_especie === 'felina') bucket.felina += 1
      else if (r.pet_especie === 'exotica') bucket.exotica += 1

      // Período do dia usa SEMPRE a hora do acolhimento real, independente do modo
      if (r.data_acolhimento) {
        const p: PeriodoKey = periodoDoDia(r.data_acolhimento)
        bucket[p] += 1
      }

      const ids = (r.fonte_conhecimento_ids && r.fonte_conhecimento_ids.length > 0)
        ? r.fonte_conhecimento_ids
        : (r.fonte_conhecimento_id ? [r.fonte_conhecimento_id] : [])
      if (ids.length > 0) {
        let porMes = fontesPorMes.get(key)
        if (!porMes) { porMes = new Map(); fontesPorMes.set(key, porMes) }
        for (const id of ids) {
          const nome = idToNome.get(id)
          if (!nome) continue
          porMes.set(nome, (porMes.get(nome) ?? 0) + 1)
          fonteTotais.set(nome, (fonteTotais.get(nome) ?? 0) + 1)
        }
      }
    }

    // Top 4 fontes pelo total da janela buscada — o resto dobra em "Outras" (evita legenda com 9 séries)
    const top4 = Array.from(fonteTotais.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([nome]) => nome)
    for (const [key, porMes] of fontesPorMes) {
      const bucket = buckets.get(key)
      if (!bucket) continue
      let outras = 0
      for (const [nome, count] of porMes) {
        if (top4.includes(nome)) bucket.fontes[nome] = count
        else outras += count
      }
      if (outras > 0) bucket.fontes['Outras'] = outras
    }

    const keysOrdenados = Array.from(buckets.keys())
    const pontosExibidos = keysOrdenados.slice(-janela).map(k => buckets.get(k)!)

    return {
      pontos: pontosExibidos,
      buscarMes: (key: string) => buckets.get(key) ?? null,
      fontesTop: top4,
    }
  }, [rows, janela, modo, idToNome])

  // Mês corrente é parcial — comparações usam os 2 últimos meses FECHADOS (+ mesmo mês ano passado)
  const mesFechado = pontos.length >= 2 ? pontos[pontos.length - 2] : null
  const mesAnteriorFechado = pontos.length >= 3 ? pontos[pontos.length - 3] : null
  const mesFechadoAnoPassado = useMemo(() => {
    if (!mesFechado) return null
    const [y, m] = mesFechado.mesKey.split('-').map(Number)
    const key = ymKey(new Date(y - 1, m - 1, 1))
    return buscarMes(key)
  }, [mesFechado, buscarMes])

  const fmtReceita = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
  const fmtVolume = (v: number) => v.toLocaleString('pt-BR')
  const fmtTicket = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`

  const pontosComTicket = useMemo(
    () => pontos.map(p => ({ ...p, ticket: p.volume > 0 ? p.receita / p.volume : 0 })),
    [pontos]
  )
  const ticketFechado = mesFechado && mesFechado.volume > 0 ? mesFechado.receita / mesFechado.volume : 0
  const ticketAnteriorFechado = mesAnteriorFechado && mesAnteriorFechado.volume > 0 ? mesAnteriorFechado.receita / mesAnteriorFechado.volume : 0

  const especiesPresentes = useMemo(
    () => (['canina', 'felina', 'exotica'] as const).filter(k => pontos.some(p => p[k] > 0)),
    [pontos]
  )
  const fontesSeries = useMemo(() => [...fontesTop, ...(pontos.some(p => (p.fontes['Outras'] ?? 0) > 0) ? ['Outras'] : [])], [fontesTop, pontos])
  const pontosComFontes = useMemo(() => pontos.map(p => ({ ...p, ...p.fontes })), [pontos])

  if (!currentUnit) return null

  return (
    <div className="space-y-4">
      {/* Controles da aba, todos na MESMA linha: janela · modo · tabela. O toggle de modo ficava
          numa faixa própria acima das tabs (renderizado pela página) — três alturas de botão pra
          três controles da mesma aba. */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center flex-wrap gap-2">
        <div className="inline-flex rounded-full border border-[var(--surface-300)] p-0.5 bg-[var(--surface-0)]">
          {JANELAS.map(j => {
            const isActive = janela === j.meses
            return (
              <button
                key={j.meses}
                onClick={() => setJanela(j.meses)}
                className="text-[11px] font-medium px-2.5 py-0.5 rounded-full transition-colors"
                style={{
                  background: isActive ? 'var(--brand-500)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--surface-600)',
                }}
              >
                {j.label}
              </button>
            )
          })}
        </div>

        <ModoToggle modo={modo} selectModo={selectModo} />
        </div>

        <button
          onClick={() => setTabela(v => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-[var(--surface-300)] text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors"
        >
          {tabela ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          {tabela ? 'Ver gráficos' : 'Ver tabela'}
        </button>
      </div>

      {loading ? (
        <div className="card p-6 sm:p-10 text-center text-sm text-[var(--surface-400)]">Carregando…</div>
      ) : tabela ? (
        <div className="card p-4 sm:p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--surface-500)] border-b border-[var(--surface-200)]">
                <th className="py-2 pr-4 font-medium">Mês</th>
                <th className="py-2 pr-4 font-medium text-right">{modo === 'contratos' ? 'Contratos' : 'Remoções'}</th>
                <th className="py-2 pr-4 font-medium text-right">Receita Vendida</th>
                <th className="py-2 font-medium text-right">Ticket Médio</th>
              </tr>
            </thead>
            <tbody>
              {pontosComTicket.map((p, i) => (
                <tr key={p.mesKey} className="border-b border-[var(--surface-100)] last:border-0">
                  <td className="py-2 pr-4 text-[var(--surface-700)] capitalize">
                    {p.labelCompleto}{i === pontos.length - 1 ? ' (parcial)' : ''}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--surface-800)]">{fmtVolume(p.volume)}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--surface-800)]">{fmtReceita(p.receita)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-[var(--surface-800)]">{p.volume > 0 ? fmtTicket(p.ticket) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Evolução de Volume */}
          <div className="card p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-3">
              <h3 className="text-sm font-semibold text-[var(--surface-800)]">
                Evolução de {modo === 'contratos' ? 'Contratos' : 'Remoções'}
              </h3>
              <div className="flex flex-col items-end gap-0.5">
                {mesFechado && mesAnteriorFechado && (
                  <TrendBadge atual={mesFechado.volume} anterior={mesAnteriorFechado.volume} formatar={fmtVolume} rotulo="vs. mês anterior" />
                )}
                {mesFechado && mesFechadoAnoPassado && (
                  <TrendBadge atual={mesFechado.volume} anterior={mesFechadoAnoPassado.volume} formatar={fmtVolume} rotulo="vs. mesmo mês ano passado" />
                )}
              </div>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pontos} margin={{ top: 20, right: 4, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-200)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--surface-500)' }} interval={janela > 12 ? 1 : 0} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                  <Tooltip
                    formatter={value => [fmtVolume(Number(value ?? 0)), modo === 'contratos' ? 'Contratos' : 'Remoções']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="volume" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    <LabelList content={makeBarLabel(abreviarNumero, janela === 24 ? 2 : 1, 10, 'var(--surface-600)')} />
                    {pontos.map((p, i) => (
                      <Cell key={p.mesKey} fill={COLOR_VOLUME} fillOpacity={i === pontos.length - 1 ? 0.45 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-[var(--surface-400)] mt-1">Último mês (mais claro) ainda em andamento — não conta na variação.</p>
          </div>

          {/* Evolução de Receita */}
          <div className="card p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-3">
              <h3 className="text-sm font-semibold text-[var(--surface-800)]">Evolução de Receita Vendida</h3>
              <div className="flex flex-col items-end gap-0.5">
                {mesFechado && mesAnteriorFechado && (
                  <TrendBadge atual={mesFechado.receita} anterior={mesAnteriorFechado.receita} formatar={fmtReceita} rotulo="vs. mês anterior" />
                )}
                {mesFechado && mesFechadoAnoPassado && (
                  <TrendBadge atual={mesFechado.receita} anterior={mesFechadoAnoPassado.receita} formatar={fmtReceita} rotulo="vs. mesmo mês ano passado" />
                )}
              </div>
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pontos} margin={{ top: 20, right: 4, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-200)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--surface-500)' }} interval={janela > 12 ? 1 : 0} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={value => [fmtReceita(Number(value ?? 0)), 'Receita Vendida']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="receita" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    <LabelList content={makeBarLabel(abreviarMoeda, janela === 24 ? 2 : 1, 10, 'var(--surface-600)')} />
                    {pontos.map((p, i) => (
                      <Cell key={p.mesKey} fill={COLOR_RECEITA} fillOpacity={i === pontos.length - 1 ? 0.45 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-[var(--surface-400)] mt-1">
              Mesma fórmula do detalhe do contrato: (plano − desconto) + (acessórios − descontos). Regime de competência, igual à aba Financeiro.
            </p>
          </div>

          {/* Evolução de Ticket Médio */}
          <div className="card p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-3">
              <h3 className="text-sm font-semibold text-[var(--surface-800)]">Evolução de Ticket Médio</h3>
              {mesFechado && mesAnteriorFechado && (
                <TrendBadge atual={ticketFechado} anterior={ticketAnteriorFechado} formatar={fmtTicket} rotulo="vs. mês anterior" />
              )}
            </div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pontosComTicket} margin={{ top: 20, right: 8, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-200)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--surface-500)' }} interval={janela > 12 ? 1 : 0} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => v.toLocaleString('pt-BR')} />
                  <Tooltip
                    formatter={value => [fmtTicket(Number(value ?? 0)), 'Ticket Médio']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="ticket" stroke={COLOR_TICKET} strokeWidth={2} dot={{ r: 3, fill: COLOR_TICKET }} activeDot={{ r: 5 }}>
                    <LabelList content={makeLineLabel(abreviarMoeda, janela === 24 ? 2 : 1, 10, COLOR_TICKET)} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-[var(--surface-400)] mt-1">Receita Vendida ÷ volume do mês. Mês parcial incluso — cai naturalmente antes de fechar.</p>
          </div>

          {/* Individual × Coletiva — quebrado em 2 mini-gráficos, meia largura cada */}
          <div className="card p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--surface-800)] mb-3">Individual × Coletiva</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MiniEvolucaoChart pontos={pontos} dataKey="individual" color={COLOR_IND} titulo="Individual" janela={janela} />
              <MiniEvolucaoChart pontos={pontos} dataKey="coletiva" color={COLOR_COL} titulo="Coletiva" janela={janela} />
            </div>
          </div>

          {/* Mix por Espécie */}
          {especiesPresentes.length > 0 && (
            <div className="card p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-[var(--surface-800)] mb-3">Mix por Espécie</h3>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pontos} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-200)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--surface-500)' }} interval={janela > 12 ? 1 : 0} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--surface-500)' }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => ESPECIE_LABELS[v] ?? v} />
                    {especiesPresentes.map((esp, i) => (
                      <Bar
                        key={esp}
                        dataKey={esp}
                        stackId="especie"
                        fill={ESPECIE_COLORS[esp]}
                        maxBarSize={36}
                        radius={i === especiesPresentes.length - 1 ? [3, 3, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Período de Remoção — quebrado em 4 mini-gráficos, meia largura cada (2×2) */}
          <div className="card p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-[var(--surface-800)] mb-3">Por Período de Remoção</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PERIODOS_DIA.map(p => (
                <MiniEvolucaoChart key={p.key} pontos={pontos} dataKey={p.key} color={p.color} titulo={p.label} janela={janela} />
              ))}
            </div>
            <p className="text-[10px] text-[var(--surface-400)] mt-3">Baseado na hora do acolhimento — contratos sem essa data não entram.</p>
          </div>

          {/* Fonte de Conhecimento — quebrado em 1 mini-gráfico por fonte, meia largura cada */}
          {fontesSeries.length > 0 && (
            <div className="card p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-[var(--surface-800)] mb-3">Por Fonte de Conhecimento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fontesSeries.map(nome => (
                  <MiniEvolucaoChart
                    key={nome}
                    pontos={pontosComFontes}
                    dataKey={nome}
                    color={nome === 'Outras' ? COLOR_OUTRAS : (FONTE_COLORS[nome] ?? COLOR_OUTRAS)}
                    titulo={nome}
                    janela={janela}
                  />
                ))}
              </div>
              <p className="text-[10px] text-[var(--surface-400)] mt-3">Top 4 fontes da janela selecionada — as demais somam em &quot;Outras&quot;. Contrato com múltiplas fontes conta em cada uma (absoluto).</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
