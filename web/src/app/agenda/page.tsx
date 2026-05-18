'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X, Phone, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { primeiroNome } from '@/lib/nome-tutor'

// ============================================
// Tipos
// ============================================
type Evento = {
  gc_id: string
  contrato_id: string
  data_agendamento: string  // ISO timestamptz
  acompanhamento_confirmado: string | null
  etapa: string | null
  contato_status: string | null
  pet_nome: string
  pet_genero: string | null
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  tutor_nome: string | null
  tutor_telefone: string | null
  tipo_cremacao: string | null
  codigo: string | null
  numero_lacre: string | null
  unidade_id: string | null
  unidade_codigo: string | null
}

// Cores por unidade (mesma paleta do /gc)
const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed',
  SP: '#ef4444',
  CP: '#22c55e',
  SJ: '#cbd5e1',
  RS: '#f59e0b',
  PA: '#ec4899',
  PI: '#06b6d4',
  MA: '#f97316',
}

type AcompKey = 'presencial' | 'video_chamada' | 'video_gravado' | 'nao_deseja' | 'default'

// ============================================
// Cores por acompanhamento
// ============================================
const ACOMP: Record<AcompKey, { bg: string; ring: string; text: string; label: string; emoji: string }> = {
  presencial:    { bg: '#1e40af', ring: '#1e3a8a', text: '#ffffff', label: 'Presencial',  emoji: '👥' },
  video_chamada: { bg: '#16a34a', ring: '#15803d', text: '#ffffff', label: 'Chamada',     emoji: '📹' },
  video_gravado: { bg: '#c084fc', ring: '#a855f7', text: '#ffffff', label: 'Gravado',     emoji: '🎥' },
  nao_deseja:    { bg: '#94a3b8', ring: '#64748b', text: '#ffffff', label: 'Não deseja',  emoji: '❌' },
  default:       { bg: '#f1f5f9', ring: '#cbd5e1', text: '#475569', label: 'A definir',   emoji: '❓' },
}

function acompOf(v: string | null | undefined): AcompKey {
  if (v === 'presencial' || v === 'video_chamada' || v === 'video_gravado' || v === 'nao_deseja') return v
  return 'default'
}

// ============================================
// Helpers de data (local, sem TZ)
// ============================================
function startOfMonth(d: Date): Date { const r = new Date(d); r.setDate(1); r.setHours(0,0,0,0); return r }
function endOfMonth(d: Date): Date { const r = new Date(d); r.setMonth(r.getMonth() + 1, 0); r.setHours(23,59,59,999); return r }
function startOfWeek(d: Date): Date { const r = new Date(d); r.setHours(0,0,0,0); r.setDate(r.getDate() - r.getDay()); return r }
function endOfWeek(d: Date): Date { const r = startOfWeek(d); r.setDate(r.getDate() + 6); r.setHours(23,59,59,999); return r }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function hourOf(dateIso: string): number {
  const d = new Date(dateIso)
  return d.getHours() + d.getMinutes() / 60
}
function formatHora(dateIso: string): string {
  const d = new Date(dateIso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function formatDataLonga(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// Horário visível na grade (semana/dia)
const HORA_MIN = 7
const HORA_MAX = 22
const HORAS = Array.from({ length: HORA_MAX - HORA_MIN }, (_, i) => HORA_MIN + i)
const SLOT_HEIGHT = 120  // px por hora (2px = 1 min)
const EVENT_DURATION_MIN = 10  // cada evento ocupa visualmente 10 min na grade
const EVENT_HEIGHT = (EVENT_DURATION_MIN / 60) * SLOT_HEIGHT  // = 20px

// ============================================
// Componente
// ============================================
export default function AgendaPage() {
  const { hasModule, currentUnit } = useUnit()
  const supabase = createClient()

  const [view, setView] = useState<'mes' | 'semana' | '3dias' | 'dia'>('semana')
  const [dataRef, setDataRef] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [eventoSelId, setEventoSelId] = useState<string | null>(null)

  // Range a buscar: sempre 1 mês antes e 1 depois do dataRef pra cobrir mudanças de view
  const rangeQuery = useMemo(() => {
    const ini = addDays(startOfMonth(dataRef), -7)
    const fim = addDays(endOfMonth(dataRef), 7)
    return { ini, fim }
  }, [dataRef])

  // Range visível por view
  const rangeVisivel = useMemo(() => {
    if (view === 'mes') {
      // Começa no domingo da semana do dia 1; termina no sábado da semana do último dia
      const som = startOfMonth(dataRef)
      const eom = endOfMonth(dataRef)
      return { ini: startOfWeek(som), fim: endOfWeek(eom) }
    }
    if (view === 'semana') {
      return { ini: startOfWeek(dataRef), fim: endOfWeek(dataRef) }
    }
    if (view === '3dias') {
      const ini = new Date(dataRef); ini.setHours(0,0,0,0)
      const fim = addDays(ini, 2); fim.setHours(23,59,59,999)
      return { ini, fim }
    }
    // dia
    const d = new Date(dataRef); d.setHours(0,0,0,0)
    const f = new Date(d); f.setHours(23,59,59,999)
    return { ini: d, fim: f }
  }, [view, dataRef])

  // Carregar eventos
  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contrato_gc')
      .select(`
        id,
        contrato_id,
        data_agendamento,
        acompanhamento_confirmado,
        etapa,
        contato_status,
        contrato:contratos!contrato_gc_contrato_id_fkey (
          codigo,
          pet_nome,
          pet_genero,
          pet_especie,
          pet_raca,
          pet_cor,
          tutor_nome,
          tutor_telefone,
          tutor_telefone2,
          tutor_telefone_nome,
          tutor_telefone2_nome,
          tutor_telefone_principal,
          tipo_cremacao,
          numero_lacre,
          unidade_id,
          unidade:unidades!contratos_unidade_id_fkey(codigo)
        )
      `)
      .not('data_agendamento', 'is', null)
      .gte('data_agendamento', rangeQuery.ini.toISOString())
      .lte('data_agendamento', rangeQuery.fim.toISOString())
    if (error) {
      console.error('Erro ao carregar agendamentos:', error)
      setEventos([])
      setLoading(false)
      return
    }

    interface RawRow {
      id: string
      contrato_id: string
      data_agendamento: string
      acompanhamento_confirmado: string | null
      etapa: string | null
      contato_status: string | null
      contrato: {
        codigo: string | null
        pet_nome: string
        pet_genero: string | null
        pet_especie: string | null
        pet_raca: string | null
        pet_cor: string | null
        tutor_nome: string | null
        tutor_telefone: string | null
        tutor_telefone2: string | null
        tutor_telefone_nome: string | null
        tutor_telefone2_nome: string | null
        tutor_telefone_principal: number | null
        tipo_cremacao: string | null
        numero_lacre: string | null
        unidade_id: string | null
        unidade: { codigo: string | null } | null
      } | null
    }
    const lista: Evento[] = (data as unknown as RawRow[] | null || []).map(r => {
      const c = r.contrato
      const usaSec = c?.tutor_telefone_principal === 2 && !!c?.tutor_telefone2
      return {
        gc_id: r.id,
        contrato_id: r.contrato_id,
        data_agendamento: r.data_agendamento,
        acompanhamento_confirmado: r.acompanhamento_confirmado,
        etapa: r.etapa,
        contato_status: r.contato_status,
        pet_nome: c?.pet_nome || '?',
        pet_genero: c?.pet_genero || null,
        pet_especie: c?.pet_especie || null,
        pet_raca: c?.pet_raca || null,
        pet_cor: c?.pet_cor || null,
        tutor_nome: c?.tutor_nome || null,
        tutor_telefone: usaSec ? (c?.tutor_telefone2 || null) : (c?.tutor_telefone || null),
        tipo_cremacao: c?.tipo_cremacao || null,
        codigo: c?.codigo || null,
        numero_lacre: c?.numero_lacre || null,
        unidade_id: c?.unidade_id || null,
        unidade_codigo: c?.unidade?.codigo || null,
      }
    })
    // Sem filtro por unidade — agenda mostra todos os pets, igual à tela GC (visão da Matriz)
    setEventos(lista)
    setLoading(false)
  }, [supabase, rangeQuery])

  useEffect(() => { carregar() }, [carregar])

  // Indexar eventos por dia (chave YYYY-MM-DD)
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, Evento[]>()
    eventos.forEach(e => {
      const d = new Date(e.data_agendamento)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    })
    // Ordenar cada dia por hora
    map.forEach(arr => arr.sort((a, b) => a.data_agendamento.localeCompare(b.data_agendamento)))
    return map
  }, [eventos])

  function getEventosDia(d: Date): Evento[] {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return eventosPorDia.get(key) || []
  }

  // Navegação
  function irPara(direcao: -1 | 0 | 1) {
    if (direcao === 0) { setDataRef((() => { const d = new Date(); d.setHours(0,0,0,0); return d })()); return }
    if (view === 'mes') setDataRef(addMonths(dataRef, direcao))
    else if (view === 'semana') setDataRef(addDays(dataRef, direcao * 7))
    else if (view === '3dias') setDataRef(addDays(dataRef, direcao * 3))
    else setDataRef(addDays(dataRef, direcao))
  }

  const titulo = useMemo(() => {
    if (view === 'mes') return `${MESES[dataRef.getMonth()]} ${dataRef.getFullYear()}`
    if (view === 'semana') {
      const ini = startOfWeek(dataRef)
      const fim = endOfWeek(dataRef)
      if (ini.getMonth() === fim.getMonth()) {
        return `${ini.getDate()}–${fim.getDate()} ${MESES[ini.getMonth()]} ${ini.getFullYear()}`
      }
      return `${ini.getDate()} ${MESES[ini.getMonth()]} – ${fim.getDate()} ${MESES[fim.getMonth()]} ${ini.getFullYear()}`
    }
    if (view === '3dias') {
      const ini = new Date(dataRef)
      const fim = addDays(ini, 2)
      if (ini.getMonth() === fim.getMonth()) {
        return `${ini.getDate()}–${fim.getDate()} ${MESES[ini.getMonth()]} ${ini.getFullYear()}`
      }
      return `${ini.getDate()} ${MESES[ini.getMonth()]} – ${fim.getDate()} ${MESES[fim.getMonth()]} ${ini.getFullYear()}`
    }
    return formatDataLonga(dataRef)
  }, [view, dataRef])

  const eventoSelecionado = useMemo(() => eventos.find(e => e.gc_id === eventoSelId) || null, [eventos, eventoSelId])

  // Imprime agenda do dia. Sem argumento: usa dataRef (ou hoje em view=mês).
  // Com argumento (botão por célula): usa o dia explícito.
  function imprimirAgendaDoDia(diaForcado?: Date) {
    const dia = diaForcado ?? (view === 'mes' ? new Date() : dataRef)
    const dKey = `${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,'0')}-${String(dia.getDate()).padStart(2,'0')}`
    const evts = eventosPorDia.get(dKey) || []
    const titulo = `Agenda — ${DIAS_SEMANA[dia.getDay()]}, ${dia.getDate()} de ${MESES[dia.getMonth()]} de ${dia.getFullYear()}`

    const acompLabel: Record<string, string> = {
      presencial: 'Presencial',
      video_chamada: 'Vídeo',
      video_gravado: 'Gravado',
      nao_deseja: 'Não',
    }

    // Agrupar por tipo de acompanhamento na ordem fixa
    const BUCKETS: Array<{ keys: AcompKey[]; label: string; bg: string }> = [
      { keys: ['presencial'],                label: 'Presenciais',         bg: '#1e40af' },
      { keys: ['video_chamada'],             label: 'Chamadas',            bg: '#16a34a' },
      { keys: ['video_gravado'],             label: 'Gravados',            bg: '#c084fc' },
      { keys: ['nao_deseja', 'default'],     label: 'Sem acomp. / A definir', bg: '#94a3b8' },
    ]

    const buildRow = (e: Evento, a: AcompKey) => {
      const tipo = e.tipo_cremacao === 'individual' ? 'IND' : e.tipo_cremacao === 'coletiva' ? 'COL' : ''
      return `<tr>
        <td class="hora">${formatHora(e.data_agendamento)}</td>
        <td><span class="unit unit-${e.unidade_codigo || ''}">${e.unidade_codigo || '—'}</span></td>
        <td><span class="tipo tipo-${tipo.toLowerCase()}">${tipo}</span></td>
        <td>${primeiroNome(e.tutor_nome) || '—'}</td>
        <td><strong>${e.pet_nome}</strong></td>
        <td>${e.pet_raca || ''}</td>
        <td>${e.pet_cor || ''}</td>
        <td class="lacre">${e.numero_lacre || ''}</td>
        <td>${acompLabel[a] || '—'}</td>
        <td class="obs"></td>
        <td class="check"></td>
        <td class="check"></td>
      </tr>`
    }

    // Monta seções agrupadas + ordenadas internamente por hora ASC
    const secoes = BUCKETS.map(b => {
      const grupo = evts
        .filter(e => b.keys.includes(acompOf(e.acompanhamento_confirmado)))
        .sort((x, y) => x.data_agendamento.localeCompare(y.data_agendamento))
      if (grupo.length === 0) return ''
      const header = `<tr class="grupo"><td colspan="12" style="background:${b.bg};color:#fff;font-weight:bold;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:4px 8px;">${b.label} (${grupo.length})</td></tr>`
      return header + grupo.map(e => buildRow(e, acompOf(e.acompanhamento_confirmado))).join('')
    }).join('')

    const totalEventos = evts.length
    const linhasVazias = Math.max(0, 25 - totalEventos - BUCKETS.filter(b => evts.some(e => b.keys.includes(acompOf(e.acompanhamento_confirmado)))).length)
    const empty = Array.from({ length: linhasVazias }, () => `<tr class="empty">${'<td></td>'.repeat(12)}</tr>`).join('')

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; padding: 0; }
  h1 { font-size: 14px; margin-bottom: 6px; }
  .meta { font-size: 9px; color: #666; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; vertical-align: middle; }
  th { background: #e5e7eb; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
  td.hora { font-family: monospace; font-weight: bold; }
  td.check { width: 50px; }
  td.lacre { font-family: monospace; font-weight: bold; font-size: 13px; background: #dbeafe; color: #1e3a8a; text-align: center; }
  td.obs { min-width: 120px; }
  tr.empty td { height: 22px; }
  .unit { display: inline-block; padding: 1px 5px; font-weight: bold; font-size: 9px; color: #fff; border-radius: 3px; }
  .unit-ST { background: #7c3aed; }
  .unit-SP { background: #ef4444; }
  .unit-CP { background: #22c55e; }
  .unit-SJ { background: #cbd5e1; color: #334155; }
  .unit-RS { background: #f59e0b; }
  .unit-PA { background: #ec4899; }
  .unit-PI { background: #06b6d4; }
  .unit-MA { background: #f97316; }
  .tipo { font-size: 9px; padding: 1px 4px; font-weight: bold; border-radius: 3px; color: #fff; }
  .tipo-ind { background: #16a34a; }
  .tipo-col { background: #7c3aed; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>
<h1>${titulo}</h1>
<p class="meta">${evts.length} agendamento${evts.length !== 1 ? 's' : ''}</p>
<table>
  <thead><tr>
    <th style="width:48px">Hora</th>
    <th style="width:42px">Un.</th>
    <th style="width:42px">Tipo</th>
    <th>Tutor</th>
    <th>Pet</th>
    <th>Raça</th>
    <th>Cor</th>
    <th style="width:70px">Lacre</th>
    <th style="width:75px">Acomp.</th>
    <th>Observação</th>
    <th>Cremou</th>
    <th>Saiu</th>
  </tr></thead>
  <tbody>${secoes}${empty}</tbody>
</table>
</body></html>`

    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    if (isMobile) {
      const win = window.open('', '_blank')
      if (!win) { alert('Permita popups deste site para imprimir.'); return }
      win.document.open(); win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 400)
    } else {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'; iframe.style.top = '-10000px'; iframe.style.left = '-10000px'
      iframe.style.width = '297mm'; iframe.style.height = '210mm'
      document.body.appendChild(iframe)
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) { document.body.removeChild(iframe); return }
      doc.open(); doc.write(html); doc.close()
      setTimeout(() => {
        iframe.contentWindow?.print()
        setTimeout(() => document.body.removeChild(iframe), 1000)
      }, 300)
    }
  }

  // FLS gate
  if (!hasModule('tela_agenda')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--surface-500)]">Esta tela não está habilitada para sua unidade.</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-orange-900/30 items-center justify-center">
            <CalIcon className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Agenda</h1>
            <p className="text-xs text-[var(--surface-400)]">Agendamentos de cremações com tutores</p>
          </div>
        </div>

        {/* Navegação + Hoje */}
        <div className="flex items-center gap-1">
          <button onClick={() => irPara(-1)} className="p-2 rounded-lg hover:bg-[var(--surface-100)] text-[var(--surface-500)]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => irPara(0)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-100)] text-[var(--surface-700)] hover:bg-[var(--surface-200)]">
            Hoje
          </button>
          <button onClick={() => irPara(1)} className="p-2 rounded-lg hover:bg-[var(--surface-100)] text-[var(--surface-500)]">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm font-semibold text-[var(--shell-text)] capitalize">{titulo}</span>
        </div>

        {/* Toggle de view — mobile: Mês / 3 dias / Dia · desktop: Mês / Semana / Dia */}
        <div className="inline-flex bg-[var(--surface-100)] rounded-lg p-0.5">
          <button onClick={() => setView('mes')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === 'mes' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'
            }`}>Mês</button>
          {/* Semana só desktop */}
          <button onClick={() => setView('semana')}
            className={`hidden md:inline-flex px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === 'semana' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'
            }`}>Semana</button>
          {/* 3 dias só mobile */}
          <button onClick={() => setView('3dias')}
            className={`md:hidden inline-flex px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === '3dias' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'
            }`}>3 dias</button>
          <button onClick={() => setView('dia')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === 'dia' ? 'bg-[var(--surface-0)] text-[var(--shell-text)] shadow-sm' : 'text-[var(--surface-400)]'
            }`}>Dia</button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px]">
        {(['presencial','video_chamada','video_gravado','nao_deseja','default'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: ACOMP[k].bg, color: ACOMP[k].text }}>
            <span>{ACOMP[k].emoji}</span> {ACOMP[k].label}
          </span>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--surface-400)]">Carregando...</div>
      ) : view === 'mes' ? (
        <ViewMes dataRef={dataRef} eventosPorDia={eventosPorDia} onSelectEvento={setEventoSelId} onImprimirDia={imprimirAgendaDoDia} />
      ) : view === 'semana' ? (
        <ViewSemana dataRef={dataRef} numDias={7} getEventosDia={getEventosDia} onSelectEvento={setEventoSelId} onImprimirDia={imprimirAgendaDoDia} />
      ) : view === '3dias' ? (
        <ViewSemana dataRef={dataRef} numDias={3} getEventosDia={getEventosDia} onSelectEvento={setEventoSelId} onImprimirDia={imprimirAgendaDoDia} />
      ) : (
        <ViewDia dataRef={dataRef} eventos={getEventosDia(dataRef)} onSelectEvento={setEventoSelId} onImprimirDia={imprimirAgendaDoDia} />
      )}

      {/* Modal lateral (slide-in da direita) */}
      {eventoSelecionado && (
        <DetalhePanel evento={eventoSelecionado} onClose={() => setEventoSelId(null)} />
      )}
    </div>
  )
}

// ============================================
// View: Mês (grid 7x6)
// ============================================
function ViewMes({ dataRef, eventosPorDia, onSelectEvento, onImprimirDia }: {
  dataRef: Date
  eventosPorDia: Map<string, Evento[]>
  onSelectEvento: (id: string) => void
  onImprimirDia: (dia: Date) => void
}) {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const som = startOfMonth(dataRef)
  const eom = endOfMonth(dataRef)
  const inicio = startOfWeek(som)
  const fim = endOfWeek(eom)

  const dias: Date[] = []
  let cur = new Date(inicio)
  while (cur <= fim) { dias.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--surface-200)]">
      {/* Cabeçalho dos dias */}
      <div className="grid grid-cols-7 bg-[var(--surface-50)]">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--surface-500)] border-r border-[var(--surface-200)] last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {dias.map((d, idx) => {
          const ehHoje = isSameDay(d, hoje)
          const ehMesAtivo = d.getMonth() === dataRef.getMonth()
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const evts = eventosPorDia.get(key) || []
          return (
            <div key={idx}
              className={`min-h-[88px] border-r border-b border-[var(--surface-200)] p-1 ${
                ehMesAtivo ? 'bg-[var(--surface-0)]' : 'bg-[var(--surface-50)]/50'
              }`}
              style={{ ...(idx % 7 === 6 ? { borderRight: 'none' } : {}) }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-semibold ${ehHoje ? 'inline-flex w-5 h-5 rounded-full bg-orange-500 text-white items-center justify-center' : ehMesAtivo ? 'text-[var(--surface-700)]' : 'text-[var(--surface-400)]'}`}>
                  {d.getDate()}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onImprimirDia(d) }}
                  title="Agenda Dia"
                  className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-700 text-white hover:bg-red-800 transition-colors"
                >
                  <Printer className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-0.5">
                {evts.slice(0, 3).map(e => {
                  const a = ACOMP[acompOf(e.acompanhamento_confirmado)]
                  const unidadeCor = e.unidade_codigo ? (UNIT_COLORS[e.unidade_codigo] || '#6366f1') : null
                  return (
                    <button key={e.gc_id} onClick={() => onSelectEvento(e.gc_id)}
                      className="w-full text-left text-[9px] truncate px-1 py-0.5 rounded font-medium hover:opacity-80 transition-opacity inline-flex items-center gap-1"
                      style={{ background: a.bg, color: a.text }}
                      title={`${formatHora(e.data_agendamento)} — ${e.unidade_codigo || ''} ${e.pet_nome} — ${a.label}`}
                    >
                      {e.unidade_codigo && (
                        <span className="px-0.5 rounded text-[8px] font-black" style={{ background: unidadeCor || '#6366f1', color: e.unidade_codigo === 'SJ' ? '#334155' : '#fff' }}>{e.unidade_codigo}</span>
                      )}
                      <span className="truncate">{formatHora(e.data_agendamento)} {e.pet_nome}</span>
                    </button>
                  )
                })}
                {evts.length > 3 && (
                  <span className="text-[9px] text-[var(--surface-500)] px-1">+{evts.length - 3} mais</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// View: Semana (header dias + grid horária)
// ============================================
function ViewSemana({ dataRef, numDias, getEventosDia, onSelectEvento, onImprimirDia }: {
  dataRef: Date
  numDias: number
  getEventosDia: (d: Date) => Evento[]
  onSelectEvento: (id: string) => void
  onImprimirDia: (dia: Date) => void
}) {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  // Semana (7d): começa no domingo da semana do dataRef. 3 dias: começa no próprio dataRef.
  const ini = numDias === 7 ? startOfWeek(dataRef) : (() => { const d = new Date(dataRef); d.setHours(0,0,0,0); return d })()
  const dias = Array.from({ length: numDias }, (_, i) => addDays(ini, i))

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--surface-200)]">
      {/* Header dos dias */}
      <div className="grid bg-[var(--surface-50)] border-b border-[var(--surface-200)]" style={{ gridTemplateColumns: `50px repeat(${numDias}, 1fr)` }}>
        <div className="border-r border-[var(--surface-200)]" />
        {dias.map((d, i) => {
          const ehHoje = isSameDay(d, hoje)
          return (
            <div key={i} className="py-2 text-center border-r border-[var(--surface-200)] last:border-r-0">
              <div className="text-[10px] font-bold uppercase text-[var(--surface-500)]">{DIAS_SEMANA[d.getDay()]}</div>
              <div className={`text-sm font-semibold ${ehHoje ? 'inline-flex w-7 h-7 rounded-full bg-orange-500 text-white items-center justify-center mt-0.5' : 'text-[var(--surface-700)]'}`}>
                {d.getDate()}
              </div>
              <button
                type="button"
                onClick={() => onImprimirDia(d)}
                title="Agenda Dia"
                className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors"
              >
                <Printer className="h-2.5 w-2.5" />
                Agenda Dia
              </button>
            </div>
          )
        })}
      </div>
      {/* Grid horária */}
      <div className="relative grid bg-[var(--surface-0)]" style={{ gridTemplateColumns: `50px repeat(${numDias}, 1fr)` }}>
        {/* Coluna de horas */}
        <div className="border-r border-[var(--surface-200)]">
          {HORAS.map(h => (
            <div key={h} className="text-[9px] text-[var(--surface-400)] text-right pr-1.5 border-b border-[var(--surface-100)]" style={{ height: SLOT_HEIGHT }}>
              {String(h).padStart(2,'0')}:00
            </div>
          ))}
        </div>
        {/* Dias */}
        {dias.map((d, i) => (
          <DiaColuna key={i} dia={d} eventos={getEventosDia(d)} onSelectEvento={onSelectEvento} />
        ))}
      </div>
    </div>
  )
}

// ============================================
// View: Dia (1 coluna)
// ============================================
function ViewDia({ dataRef, eventos, onSelectEvento, onImprimirDia }: {
  dataRef: Date
  eventos: Evento[]
  onSelectEvento: (id: string) => void
  onImprimirDia: (dia: Date) => void
}) {
  return (
    <div className="rounded-lg overflow-hidden border border-[var(--surface-200)]">
      <div className="py-2 px-3 bg-[var(--surface-50)] border-b border-[var(--surface-200)] flex items-center justify-center gap-3">
        <span className="text-sm font-semibold text-[var(--shell-text)]">{DIAS_SEMANA[dataRef.getDay()]} · {dataRef.getDate()} {MESES[dataRef.getMonth()]}</span>
        <button
          type="button"
          onClick={() => onImprimirDia(dataRef)}
          title="Agenda Dia"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-700 text-white hover:bg-red-800 transition-colors"
        >
          <Printer className="h-3 w-3" />
          Agenda Dia
        </button>
      </div>
      <div className="relative grid bg-[var(--surface-0)]" style={{ gridTemplateColumns: '60px 1fr' }}>
        {/* Coluna de horas */}
        <div className="border-r border-[var(--surface-200)]">
          {HORAS.map(h => (
            <div key={h} className="text-[10px] text-[var(--surface-400)] text-right pr-2 border-b border-[var(--surface-100)]" style={{ height: SLOT_HEIGHT }}>
              {String(h).padStart(2,'0')}:00
            </div>
          ))}
        </div>
        {/* Eventos */}
        <DiaColuna dia={dataRef} eventos={eventos} onSelectEvento={onSelectEvento} expand />
      </div>
    </div>
  )
}

// ============================================
// Sub: Coluna de dia (eventos posicionados absolutamente)
// ============================================
function DiaColuna({ eventos, onSelectEvento, expand }: { dia: Date; eventos: Evento[]; onSelectEvento: (id: string) => void; expand?: boolean }) {
  const totalHeight = HORAS.length * SLOT_HEIGHT
  return (
    <div className="relative border-r border-[var(--surface-200)] last:border-r-0" style={{ height: totalHeight }}>
      {/* Grid de fundo */}
      {HORAS.map(h => (
        <div key={h} className="border-b border-[var(--surface-100)] absolute left-0 right-0" style={{ top: (h - HORA_MIN) * SLOT_HEIGHT, height: SLOT_HEIGHT }} />
      ))}
      {/* Eventos */}
      {eventos.map(e => {
        const h = hourOf(e.data_agendamento)
        if (h < HORA_MIN || h >= HORA_MAX) return null
        const top = (h - HORA_MIN) * SLOT_HEIGHT
        const a = ACOMP[acompOf(e.acompanhamento_confirmado)]
        const unidadeCor = e.unidade_codigo ? (UNIT_COLORS[e.unidade_codigo] || '#6366f1') : null
        return (
          <button key={e.gc_id} onClick={() => onSelectEvento(e.gc_id)}
            className="absolute left-0.5 right-0.5 rounded px-1 text-left hover:opacity-90 transition-opacity overflow-hidden flex items-center gap-1"
            style={{
              top,
              height: EVENT_HEIGHT,
              background: a.bg,
              color: a.text,
              borderLeft: `3px solid ${a.ring}`,
            }}
          >
            {e.unidade_codigo && (
              <span className="px-0.5 rounded text-[8px] font-black shrink-0" style={{ background: unidadeCor || '#6366f1', color: e.unidade_codigo === 'SJ' ? '#334155' : '#fff' }}>{e.unidade_codigo}</span>
            )}
            <span className={`text-[10px] font-bold leading-tight ${expand ? '' : 'truncate'}`}>
              {formatHora(e.data_agendamento)} · {e.pet_nome}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ============================================
// Modal lateral: detalhes do evento (slide-in da direita)
// ============================================
function DetalhePanel({ evento, onClose }: { evento: Evento; onClose: () => void }) {
  const a = ACOMP[acompOf(evento.acompanhamento_confirmado)]
  const isInd = evento.tipo_cremacao === 'individual'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onClose} />
      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-[var(--surface-0)] shadow-2xl border-l border-[var(--surface-200)] flex flex-col animate-slide-in-right">
        {/* Header colorido por acompanhamento */}
        <div className="px-4 py-3 flex items-start justify-between" style={{ background: a.bg, color: a.text }}>
          <div>
            <div className="text-[10px] font-bold uppercase opacity-90">{a.emoji} {a.label}</div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              {evento.unidade_codigo && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black" style={{ background: UNIT_COLORS[evento.unidade_codigo] || '#6366f1', color: evento.unidade_codigo === 'SJ' ? '#334155' : '#fff' }}>
                  {evento.unidade_codigo}
                </span>
              )}
              <span>{evento.pet_nome} {evento.pet_genero === 'macho' ? '♂' : evento.pet_genero === 'femea' ? '♀' : ''}</span>
            </h2>
            <p className="text-xs opacity-90 mt-0.5">
              {new Date(evento.data_agendamento).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Pet info */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
            <h4 className="text-[10px] font-bold uppercase text-[var(--surface-500)] mb-1">Pet</h4>
            <p className="text-sm font-semibold">{evento.pet_nome}</p>
            <p className="text-xs text-[var(--surface-500)]">
              {evento.pet_especie || '—'}{evento.tipo_cremacao && (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${isInd ? 'bg-emerald-500 text-white' : 'bg-purple-500 text-white'}`}>
                  {isInd ? 'IND' : 'COL'}
                </span>
              )}
            </p>
          </div>

          {/* Tutor */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
            <h4 className="text-[10px] font-bold uppercase text-[var(--surface-500)] mb-1">Tutor</h4>
            <p className="text-sm font-semibold">{evento.tutor_nome || '—'}</p>
            {evento.tutor_telefone && (
              <a
                href={`https://wa.me/${evento.tutor_telefone.replace(/\D/g,'')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
              >
                <Phone className="h-3 w-3" /> WhatsApp
              </a>
            )}
          </div>

          {/* Contrato */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
            <h4 className="text-[10px] font-bold uppercase text-[var(--surface-500)] mb-1">Contrato</h4>
            <p className="text-xs text-mono text-[var(--surface-600)]">{evento.codigo || '—'}</p>
            {evento.numero_lacre && (
              <p className="text-xs text-mono text-blue-400 mt-0.5">Lacre: {evento.numero_lacre}</p>
            )}
          </div>

          {/* GC status */}
          <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
            <h4 className="text-[10px] font-bold uppercase text-[var(--surface-500)] mb-1">Status GC</h4>
            <p className="text-xs">Etapa: <strong>{evento.etapa || 'provisionado'}</strong></p>
            {evento.contato_status && (
              <p className="text-xs">Contato: <strong>{evento.contato_status}</strong></p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
