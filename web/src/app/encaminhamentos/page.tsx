'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Route, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Cross, Dog, Cat, Bug, Flame, Plus, X, Loader2, ListChecks, Snowflake, Award, Package, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import Modal from '@/components/ui/Modal'

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}

// ============================================
// Helpers
// ============================================
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function gerarDias(centro: Date, range: number): Date[] {
  const dias: Date[] = []
  for (let i = -range; i <= range; i++) {
    const d = new Date(centro)
    d.setDate(d.getDate() + i)
    dias.push(d)
  }
  return dias
}

function formatDia(d: Date): string {
  const dia = d.getDate().toString().padStart(2, '0')
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${dia}/${mes}`
}

function isMesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isOntem(d: Date, hoje: Date): boolean {
  const ontem = new Date(hoje)
  ontem.setDate(ontem.getDate() - 1)
  return isMesmoDia(d, ontem)
}

// ============================================
// Types
// ============================================
type ContratoGC = {
  data_cremacao: string | null
  contato_status: string | null
  etapa: string | null
}

type ContratoEnc = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_peso: number | null
  tutor_nome: string
  tipo_cremacao: string | null
  status: string
  numero_lacre: string | null
  data_cremacao: string | null
  contrato_gc: ContratoGC[] | null
  supinda_id: string | null
  supinda_volta_id: string | null
  certificado_confirmado: boolean
  cinzas_recebidas: boolean
  certificado_recebido: boolean
}

function getDataCremacao(c: ContratoEnc): string | null {
  const gcData = c.contrato_gc?.[0]?.data_cremacao
  return gcData || c.data_cremacao || null
}

function formatDataCurta(d: string): string {
  const dt = new Date(d)
  const dia = dt.getUTCDate().toString().padStart(2, '0')
  const mes = dt.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${dia}/${mes}`
}

type EncResumo = { id: string; numero: string; data: string; codigo_unidade: string; responsavel: string | null; quantidade_pets: number; peso_total: number; status: string; observacoes: string | null }

function getEncsDia(encs: EncResumo[], dia: Date): EncResumo[] {
  const dStr = dia.toISOString().slice(0, 10)
  return encs.filter(e => e.data === dStr)
}

function getEncNumero(encs: EncResumo[], supindaId: string | null): string | null {
  if (!supindaId) return null
  return encs.find(e => e.id === supindaId)?.numero || null
}

function especieIcon(especie: string | null) {
  const e = especie?.toLowerCase() || ''
  if (e.includes('canina')) return Dog
  if (e.includes('felina')) return Cat
  return Bug
}

// ============================================
// Page
// ============================================
export default function EncaminhamentosPage() {
  const supabase = createClient()
  const { currentUnit, isSuperAdmin } = useUnit()

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const [diaSelecionado, setDiaSelecionado] = useState<Date>(hoje)
  const [menuCremacao, setMenuCremacao] = useState(false)
  const [menuAtivos, setMenuAtivos] = useState(false)

  // Seleção de pets (long press)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const dragOccurred = useRef(false)

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handlePointerDown(id: string) {
    // Se já selecionado, não inicia long press (vai ser drag)
    if (selecionados.has(id)) return
    longPressTriggered.current = false
    dragOccurred.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      toggleSelecionado(id)
    }, 500)
  }

  function handlePointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleClick(id: string) {
    // Ignorar click após drag
    if (dragOccurred.current) { dragOccurred.current = false; return }
    // Ignorar click após long press
    if (longPressTriggered.current) return
    // Se tem seleção ativa: toggle (add não-selecionado ou remove selecionado)
    if (selecionados.size > 0) {
      toggleSelecionado(id)
    }
  }

  // Drag & Drop para calendário
  const [dragging, setDragging] = useState(false)
  const [dragOverDia, setDragOverDia] = useState<string | null>(null)

  function getDragSummary(): string {
    const selCrem = cremados.filter(c => selecionados.has(c.id)).length
    const selAtiv = ativos.filter(c => selecionados.has(c.id)).length
    const parts: string[] = []
    if (selCrem > 0) parts.push(`${selCrem} concluído${selCrem > 1 ? 's' : ''}`)
    if (selAtiv > 0) parts.push(`${selAtiv} ativo${selAtiv > 1 ? 's' : ''}`)
    return parts.join(' + ')
  }

  async function toggleCheck(id: string, campo: 'certificado_confirmado' | 'cinzas_recebidas' | 'certificado_recebido', atual: boolean) {
    const novo = !atual
    await supabase.from('contratos').update({ [campo]: novo } as never).eq('id', id)
    const update = (list: ContratoEnc[]) => list.map(c => c.id === id ? { ...c, [campo]: novo } : c)
    setCremados(update)
    setAtivos(update)
    setVinculados(update)
  }

  function handleDragStart(e: React.DragEvent) {
    dragOccurred.current = true
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', getDragSummary())
    // Custom drag image
    const ghost = document.createElement('div')
    ghost.textContent = `🚐 ${selecionados.size} pet${selecionados.size > 1 ? 's' : ''}`
    ghost.style.cssText = 'position:fixed;top:-100px;padding:8px 16px;border-radius:12px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;white-space:nowrap;'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  function handleDragEnd() {
    setDragging(false)
    setDragOverDia(null)
  }

  function handleDiaDragOver(e: React.DragEvent, diaKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDia(diaKey)
  }

  function handleDiaDragLeave() {
    setDragOverDia(null)
  }

  async function handleDiaDrop(e: React.DragEvent | { preventDefault: () => void }, dia: Date) {
    e.preventDefault()
    setDragging(false)
    setDragOverDia(null)
    if (selecionados.size === 0 || !currentUnit) return

    // FLS: só considerar encaminhamentos da própria unidade (ou tudo se super_admin)
    const encsDia = getEncsDia(encaminhamentos, dia).filter(
      enc => isSuperAdmin || enc.codigo_unidade === currentUnit.codigo
    )
    if (encsDia.length > 0) {
      // Dia já tem encaminhamento(s) da unidade — perguntar
      const proxCod = await gerarProximoCodigo()
      setEscolhaProxCodigo(proxCod)
      setEscolhaDia(dia)
      setEscolhaIds(new Set(selecionados))
    } else {
      abrirTelaEdicao(dia, selecionados)
    }
  }

  // Escolha: criar novo ou incluir em existente
  const [escolhaDia, setEscolhaDia] = useState<Date | null>(null)
  const [escolhaIds, setEscolhaIds] = useState<Set<string>>(new Set())
  const [escolhaProxCodigo, setEscolhaProxCodigo] = useState('')
  const [dragOverEnc, setDragOverEnc] = useState<string | null>(null)

  // Editar encaminhamento existente
  const [editEncId, setEditEncId] = useState<string | null>(null)
  const [editEncData, setEditEncData] = useState('')
  const [editEncResponsavel, setEditEncResponsavel] = useState('')
  const [editEncObs, setEditEncObs] = useState('')

  // Tela edição encaminhamento
  const [telaEdicao, setTelaEdicao] = useState(false)
  const [novoData, setNovoData] = useState(hoje.toISOString().slice(0, 10))
  const [novoResponsavel, setNovoResponsavel] = useState('')
  const [novoObs, setNovoObs] = useState('')
  const [novoCodigo, setNovoCodigo] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [novoIdsLevar, setNovoIdsLevar] = useState<string[]>([])
  const [novoIdsRetirar, setNovoIdsRetirar] = useState<string[]>([])

  // Dados
  const [cremados, setCremados] = useState<ContratoEnc[]>([])
  const [ativos, setAtivos] = useState<ContratoEnc[]>([])
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [encaminhamentos, setEncaminhamentos] = useState<{ id: string; numero: string; data: string; codigo_unidade: string; responsavel: string | null; quantidade_pets: number; peso_total: number; status: string; observacoes: string | null }[]>([])
  const [vinculados, setVinculados] = useState<ContratoEnc[]>([])
  const [encAbertos, setEncAbertos] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!currentUnit) return
    async function carregar() {
      const campos = 'id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tipo_cremacao, status, numero_lacre, data_cremacao, supinda_id, supinda_volta_id, certificado_confirmado, cinzas_recebidas, certificado_recebido, contrato_gc(data_cremacao,contato_status,etapa)'
      const [{ data: crem }, { data: ativ }, { data: funcs }, { data: encs }, { data: vinc }] = await Promise.all([
        supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id).eq('status', 'pinda').order('data_contrato', { ascending: true }),
        supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id).eq('status', 'ativo').order('data_contrato', { ascending: true }),
        supabase.from('funcionarios').select('id, nome').eq('unidade_id', currentUnit!.id).eq('ativo', true).order('nome'),
        supabase.from('supindas').select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo)').order('data'),
        supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id).in('status', ['ativo', 'pinda', 'retorno']).or('supinda_id.not.is.null,supinda_volta_id.not.is.null').order('data_contrato', { ascending: true }),
      ])
      setCremados(((crem || []) as ContratoEnc[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.etapa === 'disponivel'
    }))
      setAtivos((ativ || []) as ContratoEnc[])
      setVinculados((vinc || []) as ContratoEnc[])
      setFuncionarios((funcs || []) as { id: string; nome: string }[])
      setEncaminhamentos((encs || []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        numero: e.numero as string,
        data: e.data as string,
        responsavel: (e.responsavel as string) || null,
        quantidade_pets: (e.quantidade_pets as number) || 0,
        peso_total: (e.peso_total as number) || 0,
        status: e.status as string,
        observacoes: (e.observacoes as string) || null,
        codigo_unidade: ((e.unidades as Record<string, string>)?.codigo) || '??',
      })))
    }
    carregar()
  }, [currentUnit])

  // Desktop: offset em dias (move de 2 em 2)
  // Janela visível: offset-2 (anteontem relativo) até offset+7 = 10 dias
  const [desktopOffset, setDesktopOffset] = useState(0)

  // Mobile: scroll container ref
  const mobileScrollRef = useRef<HTMLDivElement>(null)

  // Desktop: 10 dias visíveis, range total controlado pelo offset
  const desktopBase = new Date(hoje)
  desktopBase.setDate(desktopBase.getDate() + desktopOffset)
  const desktopDias = gerarDias(desktopBase, 4) // -4..+4 = 9, mas usamos slice pra 10
  // Gerar -2 (anteontem) até +7 = 10 dias
  const desktopVisivel: Date[] = []
  for (let i = -2; i <= 7; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + desktopOffset + i)
    desktopVisivel.push(d)
  }

  // Mobile: -13 (ontem-12) até +13 (d+13) = 27 dias. Visíveis: 5 (d-1 até d+3)
  const mobileDias: Date[] = []
  for (let i = -14; i <= 13; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    mobileDias.push(d)
  }

  // Scroll mobile pra posição inicial (d-1 = index 13)
  const mobileScrolledRef = useRef(false)
  const mobileInitialScroll = useRef(0)
  const [mobileForaDeHoje, setMobileForaDeHoje] = useState(false)

  useEffect(() => {
    if (mobileScrollRef.current && !mobileScrolledRef.current) {
      const container = mobileScrollRef.current
      const itemWidth = container.scrollWidth / mobileDias.length
      const pos = itemWidth * 13 - 8
      container.scrollLeft = pos
      mobileInitialScroll.current = pos
      mobileScrolledRef.current = true
    }
  }, [mobileDias.length])

  useEffect(() => {
    const container = mobileScrollRef.current
    if (!container) return
    const onScroll = () => {
      const diff = Math.abs(container.scrollLeft - mobileInitialScroll.current)
      setMobileForaDeHoje(diff > 30)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  function voltarHojeMobile() {
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollLeft = mobileInitialScroll.current
    }
    setDiaSelecionado(hoje)
  }

  const navegarDesktop = useCallback((dir: number) => {
    setDesktopOffset(prev => prev + dir * 2)
  }, [])

  async function gerarProximoCodigo(): Promise<string> {
    if (!currentUnit) return 'XX1'
    const codigo = (currentUnit as { codigo?: string }).codigo || 'XX'
    const { data } = await supabase
      .from('supindas')
      .select('numero')
      .eq('unidade_id', currentUnit.id)
      .like('numero', `${codigo}%`)
    let maxNum = 0
    for (const s of (data || []) as { numero: string }[]) {
      const num = parseInt(s.numero.replace(codigo, ''), 10)
      if (!isNaN(num) && num > maxNum) maxNum = num
    }
    return `${codigo}${maxNum + 1}`
  }

  async function incluirEmExistente(enc: EncResumo, ids: Set<string>) {
    if (!currentUnit) return
    // Bloquear vinculação em encaminhamento de outra unidade (FLS)
    if (enc.codigo_unidade !== currentUnit.codigo && !isSuperAdmin) {
      alert(`Você não pode vincular pets em um encaminhamento de outra unidade (${enc.codigo_unidade}).`)
      setSelecionados(new Set())
      return
    }
    const idsArr = Array.from(ids)
    const idsLevar = idsArr.filter(id => ativos.some(c => c.id === id))
    const idsRetirar = idsArr.filter(id => cremados.some(c => c.id === id))

    if (idsLevar.length > 0) {
      await supabase.from('contratos').update({ supinda_id: enc.id } as never).in('id', idsLevar)
    }
    if (idsRetirar.length > 0) {
      await supabase.from('contratos').update({ supinda_volta_id: enc.id } as never).in('id', idsRetirar)
    }

    // Atualizar quantidade_pets e peso_total (só ida conta)
    const pesoExtraIda = ativos.filter(c => idsLevar.includes(c.id)).reduce((acc, c) => acc + (c.pet_peso || 0), 0)
    await supabase.from('supindas').update({
      quantidade_pets: enc.quantidade_pets + idsLevar.length,
      peso_total: enc.peso_total + pesoExtraIda,
    } as never).eq('id', enc.id)

    setSelecionados(new Set())
    const diaEnc = escolhaDia
    setEscolhaDia(null)
    if (diaEnc) setDiaSelecionado(diaEnc)
    setEncAbertos(prev => { const next = new Set(prev); next.add(enc.id); return next })

    // Recarregar
    const campos = 'id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tipo_cremacao, status, numero_lacre, data_cremacao, supinda_id, supinda_volta_id, certificado_confirmado, cinzas_recebidas, certificado_recebido, contrato_gc(data_cremacao,contato_status,etapa)'
    const [{ data: crem }, { data: ativ }, { data: encs }, { data: vinc }] = await Promise.all([
      supabase.from('contratos').select(campos).eq('unidade_id', currentUnit.id).eq('status', 'pinda').order('data_contrato', { ascending: true }),
      supabase.from('contratos').select(campos).eq('unidade_id', currentUnit.id).eq('status', 'ativo').order('data_contrato', { ascending: true }),
      supabase.from('supindas').select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo)').order('data'),
      supabase.from('contratos').select(campos).eq('unidade_id', currentUnit.id).or('supinda_id.not.is.null,supinda_volta_id.not.is.null').order('data_contrato', { ascending: true }),
    ])
    setCremados(((crem || []) as ContratoEnc[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.etapa === 'disponivel'
    }))
    setAtivos((ativ || []) as ContratoEnc[])
    setVinculados((vinc || []) as ContratoEnc[])
    setEncaminhamentos((encs || []).map((e: Record<string, unknown>) => ({ id: e.id as string, numero: e.numero as string, data: e.data as string, responsavel: (e.responsavel as string) || null, quantidade_pets: (e.quantidade_pets as number) || 0, peso_total: (e.peso_total as number) || 0, status: e.status as string, observacoes: (e.observacoes as string) || null, codigo_unidade: ((e.unidades as Record<string, string>)?.codigo) || '??' })))
  }

  async function abrirTelaEdicao(dataPreenchida?: Date, idsSelecionados?: Set<string>) {
    const cod = await gerarProximoCodigo()
    setNovoCodigo(cod)
    setNovoData(dataPreenchida ? dataPreenchida.toISOString().slice(0, 10) : hoje.toISOString().slice(0, 10))
    setNovoResponsavel('')
    setNovoObs('')

    if (idsSelecionados && idsSelecionados.size > 0) {
      const idsArr = Array.from(idsSelecionados)
      setNovoIdsLevar(idsArr.filter(id => ativos.some(c => c.id === id)))
      setNovoIdsRetirar(idsArr.filter(id => cremados.some(c => c.id === id)))
    } else {
      setNovoIdsLevar([])
      setNovoIdsRetirar([])
    }

    setSelecionados(new Set())
    setTelaEdicao(true)
  }

  function removerDoEncaminhamento(id: string) {
    setNovoIdsLevar(prev => prev.filter(x => x !== id))
    setNovoIdsRetirar(prev => prev.filter(x => x !== id))
  }

  async function salvarEncaminhamento() {
    if (!currentUnit || !novoCodigo.trim() || !novoResponsavel.trim()) return
    setSalvandoNovo(true)

    const todosIds = [...novoIdsLevar, ...novoIdsRetirar]
    const pesoIda = ativos
      .filter(c => novoIdsLevar.includes(c.id))
      .reduce((acc, c) => acc + (c.pet_peso || 0), 0)

    const { data: novaSupinda, error } = await supabase.from('supindas').insert({
      numero: novoCodigo.trim(),
      data: novoData,
      responsavel: novoResponsavel.trim(),
      observacoes: novoObs.trim() || null,
      status: 'planejada',
      peso_total: pesoIda,
      quantidade_pets: novoIdsLevar.length,
      unidade_id: currentUnit.id,
    } as never).select('id').single() as { data: { id: string } | null; error: { message: string } | null }

    if (error || !novaSupinda) {
      alert(`Erro: ${error?.message || 'Falha ao criar'}`)
      setSalvandoNovo(false)
      return
    }

    // Vincular contratos: ida (supinda_id) e volta (supinda_volta_id)
    if (novoIdsLevar.length > 0) {
      await supabase.from('contratos').update({ supinda_id: novaSupinda.id } as never).in('id', novoIdsLevar)
    }
    if (novoIdsRetirar.length > 0) {
      await supabase.from('contratos').update({ supinda_volta_id: novaSupinda.id } as never).in('id', novoIdsRetirar)
    }

    setSalvandoNovo(false)
    setTelaEdicao(false)

    // Selecionar dia e expandir o novo encaminhamento
    const diaCriado = new Date(novoData + 'T00:00:00')
    setDiaSelecionado(diaCriado)
    setEncAbertos(prev => { const next = new Set(prev); next.add(novaSupinda.id); return next })

    // Recarregar tudo
    const campos = 'id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tipo_cremacao, status, numero_lacre, data_cremacao, supinda_id, supinda_volta_id, certificado_confirmado, cinzas_recebidas, certificado_recebido, contrato_gc(data_cremacao,contato_status,etapa)'
    const [{ data: crem }, { data: ativ }, { data: encs }, { data: vinc }] = await Promise.all([
      supabase.from('contratos').select(campos).eq('unidade_id', currentUnit.id).eq('status', 'pinda').order('data_contrato', { ascending: true }),
      supabase.from('contratos').select(campos).eq('unidade_id', currentUnit.id).eq('status', 'ativo').order('data_contrato', { ascending: true }),
      supabase.from('supindas').select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo)').order('data'),
      supabase.from('contratos').select(campos).eq('unidade_id', currentUnit.id).or('supinda_id.not.is.null,supinda_volta_id.not.is.null').order('data_contrato', { ascending: true }),
    ])
    setCremados(((crem || []) as ContratoEnc[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.etapa === 'disponivel'
    }))
    setAtivos((ativ || []) as ContratoEnc[])
    setVinculados((vinc || []) as ContratoEnc[])
    setEncaminhamentos((encs || []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      numero: e.numero as string,
      data: e.data as string,
      responsavel: (e.responsavel as string) || null,
      quantidade_pets: (e.quantidade_pets as number) || 0,
      peso_total: (e.peso_total as number) || 0,
      status: e.status as string,
      observacoes: (e.observacoes as string) || null,
      codigo_unidade: ((e.unidades as Record<string, string>)?.codigo) || '??',
    })))
  }

  return (
    <div className={`space-y-6 ${selecionados.size > 0 ? 'pb-16' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-orange-900/30 items-center justify-center">
            <Route className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-title text-[var(--shell-text)]">Encaminhamentos</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => abrirTelaEdicao()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Encaminhamento</span>
        </button>
        </div>
      </div>

      {/* Menus expansíveis */}
      <div className="space-y-2">
        {/* Ativos */}
        <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden">
          <div
            onClick={() => ativos.length > 0 && setMenuAtivos(prev => !prev)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${ativos.length > 0 ? 'hover:bg-[var(--surface-50)] cursor-pointer' : 'cursor-default'}`}
          >
            <div className="w-8 h-8 rounded-lg bg-red-900/30 flex items-center justify-center shrink-0">
              <Cross className="h-4 w-4 text-red-800" />
            </div>
            {menuAtivos && ativos.length > 0 && (() => {
              const disponiveis = ativos.filter(c => !c.supinda_id)
              if (disponiveis.length === 0) return null
              const todosSel = disponiveis.every(c => selecionados.has(c.id))
              return (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setSelecionados(prev => {
                      const next = new Set(prev)
                      if (todosSel) { disponiveis.forEach(c => next.delete(c.id)) }
                      else { disponiveis.forEach(c => next.add(c.id)) }
                      return next
                    })
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${todosSel ? 'text-blue-400 bg-blue-900/20' : 'text-[var(--surface-400)] hover:text-blue-400 hover:bg-blue-900/10'}`}
                  title={todosSel ? 'Desmarcar todos' : 'Selecionar todos'}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                </button>
              )
            })()}
            <span className="flex-1 text-left text-sm font-semibold text-[var(--shell-text)]">Ativos</span>
            <span className="text-xs text-[var(--surface-400)] font-medium">({ativos.length})</span>
            {ativos.length > 0 && <ChevronDown className={`h-4 w-4 text-[var(--surface-400)] transition-transform duration-200 ${menuAtivos ? 'rotate-180' : ''}`} />}
          </div>
          {ativos.length > 0 && (
            <div className={`transition-all duration-200 ease-out overflow-hidden ${menuAtivos ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-2 py-2 md:px-3 md:py-3 border-t border-[var(--surface-100)]">
              <div className="max-h-[calc(3*(5.5rem+0.375rem))] overflow-y-auto">
                <div className="grid grid-cols-3 md:grid-cols-9 gap-1.5">
                  {ativos.map(c => {
                    const coletiva = c.tipo_cremacao === 'coletiva'
                    const idaEnc = getEncNumero(encaminhamentos, c.supinda_id)
                    const bloqueado = !!idaEnc
                    return (
                      <div
                        key={c.id}
                        draggable={selecionados.has(c.id)}
                        onDragStart={selecionados.has(c.id) ? handleDragStart : undefined}
                        onDragEnd={selecionados.has(c.id) ? handleDragEnd : undefined}
                        onPointerDown={() => !bloqueado && handlePointerDown(c.id)}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        onContextMenu={e => e.preventDefault()}
                        onClick={() => !bloqueado && handleClick(c.id)}
                        className={`p-2 rounded-lg border transition-colors select-none ${
                          bloqueado
                            ? 'border-emerald-500/40 bg-emerald-900/10 opacity-70 cursor-default'
                            : selecionados.has(c.id)
                              ? 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30 cursor-grab active:cursor-grabbing'
                              : coletiva
                                ? 'border-[var(--surface-200)] bg-[var(--surface-50)] cursor-pointer'
                                : 'border-[var(--surface-200)] bg-transparent hover:bg-[var(--surface-50)] cursor-pointer'
                        }`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {c.numero_lacre && (
                            <span className="text-[9px] font-mono font-bold text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded">{c.numero_lacre}</span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${coletiva ? 'bg-purple-900/30 text-purple-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                            {coletiva ? 'COL' : 'IND'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[var(--shell-text)] truncate">{c.pet_nome}</p>
                        <p className="text-[10px] text-[var(--surface-400)] truncate">{c.tutor_nome}</p>
                        {idaEnc ? (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            <span className="text-[8px] text-amber-400 font-bold bg-amber-900/20 px-1 py-0.5 rounded">↑ {idaEnc}</span>
                          </div>
                        ) : c.pet_peso ? (
                          <p className="text-[10px] text-[var(--surface-400)] mt-1">{c.pet_peso}kg</p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
              </div>
            </div>
          )}
        </div>

        {/* Cremação Concluída */}
        <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden">
          <div
            onClick={() => cremados.length > 0 && setMenuCremacao(prev => !prev)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${cremados.length > 0 ? 'hover:bg-[var(--surface-50)] cursor-pointer' : 'cursor-default'}`}
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-900/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            {menuCremacao && cremados.length > 0 && (() => {
              const disponiveis = cremados.filter(c => !c.supinda_volta_id)
              if (disponiveis.length === 0) return null
              const todosSel = disponiveis.every(c => selecionados.has(c.id))
              return (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setSelecionados(prev => {
                      const next = new Set(prev)
                      if (todosSel) { disponiveis.forEach(c => next.delete(c.id)) }
                      else { disponiveis.forEach(c => next.add(c.id)) }
                      return next
                    })
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${todosSel ? 'text-blue-400 bg-blue-900/20' : 'text-[var(--surface-400)] hover:text-blue-400 hover:bg-blue-900/10'}`}
                  title={todosSel ? 'Desmarcar todos' : 'Selecionar todos'}
                >
                  <ListChecks className="h-3.5 w-3.5" />
                </button>
              )
            })()}
            <span className="flex-1 text-left text-sm font-semibold text-[var(--shell-text)]">Cremação Concluída</span>
            <span className="text-xs text-[var(--surface-400)] font-medium">({cremados.length})</span>
            {cremados.length > 0 && <ChevronDown className={`h-4 w-4 text-[var(--surface-400)] transition-transform duration-200 ${menuCremacao ? 'rotate-180' : ''}`} />}
          </div>
          {cremados.length > 0 && (
            <div className={`transition-all duration-200 ease-out overflow-hidden ${menuCremacao ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="px-2 py-2 md:px-3 md:py-3 border-t border-[var(--surface-100)]">
              <div className="max-h-[calc(3*(5.5rem+0.375rem))] overflow-y-auto">
                <div className="grid grid-cols-3 md:grid-cols-9 gap-1.5">
                  {cremados.map(c => {
                    const coletiva = c.tipo_cremacao === 'coletiva'
                    const dataCrem = getDataCremacao(c)
                    const idaEnc = getEncNumero(encaminhamentos, c.supinda_id)
                    const voltaEnc = getEncNumero(encaminhamentos, c.supinda_volta_id)
                    const bloqueado = !!voltaEnc
                    return (
                      <div
                        key={c.id}
                        draggable={selecionados.has(c.id)}
                        onDragStart={selecionados.has(c.id) ? handleDragStart : undefined}
                        onDragEnd={selecionados.has(c.id) ? handleDragEnd : undefined}
                        onPointerDown={() => !bloqueado && handlePointerDown(c.id)}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        onContextMenu={e => e.preventDefault()}
                        onClick={() => !bloqueado && handleClick(c.id)}
                        className={`p-2 rounded-lg border transition-colors select-none ${
                          bloqueado
                            ? 'border-emerald-500/40 bg-emerald-900/10 opacity-70 cursor-default'
                            : selecionados.has(c.id)
                              ? 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30 cursor-grab active:cursor-grabbing'
                              : coletiva
                                ? 'border-[var(--surface-200)] bg-[var(--surface-50)] cursor-pointer'
                                : 'border-[var(--surface-200)] bg-transparent hover:bg-[var(--surface-50)] cursor-pointer'
                        }`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {c.numero_lacre && (
                            <span className="text-[9px] font-mono font-bold text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded">{c.numero_lacre}</span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${coletiva ? 'bg-purple-900/30 text-purple-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                            {coletiva ? 'COL' : 'IND'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[var(--shell-text)] truncate">{c.pet_nome}</p>
                        <p className="text-[10px] text-[var(--surface-400)] truncate">{c.tutor_nome}</p>
                        {(idaEnc || voltaEnc) ? (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {idaEnc && <span className="text-[8px] text-amber-400 font-bold bg-amber-900/20 px-1 py-0.5 rounded">↑ {idaEnc}</span>}
                            {voltaEnc && <span className="text-[8px] text-blue-400 font-bold bg-blue-900/20 px-1 py-0.5 rounded">↓ {voltaEnc}</span>}
                          </div>
                        ) : dataCrem ? (
                          <div className="flex items-center gap-1 mt-1.5">
                            <Flame className="h-3 w-3 text-orange-400" />
                            <span className="text-[10px] text-orange-400 font-medium">{formatDataCurta(dataCrem)}</span>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== DESKTOP: calendário-line ===== */}
      <div className="hidden md:block relative">
        {desktopOffset !== 0 && (
          <button
            onClick={() => { setDesktopOffset(0); setDiaSelecionado(hoje) }}
            className="absolute -top-5 left-0 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            Ver Hoje
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navegarDesktop(-1)}
            className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
            title="10 dias antes"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 flex gap-1 overflow-visible pt-2">
            {desktopVisivel.map((dia, i) => {
              const ehHoje = isMesmoDia(dia, hoje)
              const selecionado = isMesmoDia(dia, diaSelecionado)
              const fds = dia.getDay() === 0 || dia.getDay() === 6
              const diaKey = dia.toISOString().slice(0, 10)
              const isDropTarget = dragging && dragOverDia === diaKey

              return (
                <button
                  key={i}
                  onClick={() => selecionados.size > 0 ? handleDiaDrop({ preventDefault: () => {} } as React.DragEvent, dia) : setDiaSelecionado(dia)}
                  onDragOver={e => handleDiaDragOver(e, diaKey)}
                  onDragLeave={handleDiaDragLeave}
                  onDrop={e => handleDiaDrop(e, dia)}
                  className={`relative flex-1 min-w-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                    ${isDropTarget
                      ? 'border-blue-400 bg-blue-500/20 text-blue-300 scale-105 shadow-lg shadow-blue-500/20'
                      : selecionado
                        ? ehHoje
                          ? 'border-blue-500 bg-transparent text-blue-400'
                          : 'border-blue-500 bg-blue-500/15 text-blue-400'
                        : (dragging || selecionados.size > 0)
                          ? 'border-dashed border-[var(--surface-300)] bg-transparent text-[var(--surface-400)] hover:border-blue-400 hover:bg-blue-500/10'
                          : fds
                            ? 'border-[var(--surface-200)] bg-[var(--surface-100)] text-[var(--surface-400)] hover:border-[var(--surface-300)]'
                            : 'border-[var(--surface-200)] bg-transparent text-[var(--surface-500)] hover:border-[var(--surface-300)] hover:bg-[var(--surface-50)]'
                    }`}
                >
                  {ehHoje && (
                    <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 z-10 px-2 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-[var(--shell-bg)]">
                      Hoje
                    </span>
                  )}
                  <span className={`text-[11px] font-semibold uppercase ${selecionado ? 'text-blue-400' : ''}`}>
                    {DIAS_SEMANA[dia.getDay()]}
                  </span>
                  <span className={`text-[11px] ${selecionado ? 'text-blue-300' : ''}`}>
                    {formatDia(dia)}
                  </span>
                  <span className="flex flex-col items-center gap-0.5 mt-0.5">
                    {getEncsDia(encaminhamentos, dia).map((enc, j) => (
                      <span
                        key={j}
                        className="block py-0.5 mx-0.5 rounded-sm text-[11px] font-bold leading-tight text-center"
                        style={{ background: UNIT_COLORS[enc.codigo_unidade] || '#6366f1', color: enc.codigo_unidade === 'SJ' ? '#334155' : '#fff' }}
                      >
                        {enc.numero}
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => navegarDesktop(1)}
            className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
            title="10 dias depois"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ===== MOBILE: calendário-line ===== */}
      <div className="md:hidden relative">
        {mobileForaDeHoje && (
          <button
            onClick={voltarHojeMobile}
            className="absolute -top-5 left-0 z-10 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            Ver Hoje
          </button>
        )}
        <div
          ref={mobileScrollRef}
          className="flex gap-2 overflow-x-auto overflow-y-visible scrollbar-hide snap-x snap-mandatory px-1 -mx-1 pt-2"
          style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
        >
          {mobileDias.map((dia, i) => {
            const ehHoje = isMesmoDia(dia, hoje)
            const selecionado = isMesmoDia(dia, diaSelecionado)
            const fds = dia.getDay() === 0 || dia.getDay() === 6
            const diaKey = dia.toISOString().slice(0, 10)
            const isDropTarget = dragging && dragOverDia === diaKey

            return (
              <button
                key={i}
                onClick={() => selecionados.size > 0 ? handleDiaDrop({ preventDefault: () => {} } as React.DragEvent, dia) : setDiaSelecionado(dia)}
                onDragOver={e => handleDiaDragOver(e, diaKey)}
                onDragLeave={handleDiaDragLeave}
                onDrop={e => handleDiaDrop(e, dia)}
                className={`relative snap-start shrink-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                  ${isDropTarget
                    ? 'border-blue-400 bg-blue-500/20 text-blue-300 scale-105 shadow-lg shadow-blue-500/20'
                    : selecionado
                      ? ehHoje
                        ? 'border-blue-500 bg-transparent text-blue-400'
                        : 'border-blue-500 bg-blue-500/15 text-blue-400'
                      : (dragging || selecionados.size > 0)
                        ? 'border-dashed border-[var(--surface-300)] bg-transparent text-[var(--surface-400)]'
                        : fds
                          ? 'border-[var(--surface-200)] bg-[var(--surface-100)] text-[var(--surface-400)]'
                          : 'border-[var(--surface-200)] bg-transparent text-[var(--surface-500)]'
                  }`}
                style={{ width: 'calc((100% - 2rem) / 5)' }}
              >
                {ehHoje && (
                  <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 z-10 px-2 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-[var(--shell-bg)]">
                    Hoje
                  </span>
                )}
                <span className={`text-[11px] font-semibold uppercase ${selecionado ? 'text-blue-400' : ''}`}>
                  {DIAS_SEMANA[dia.getDay()]}
                </span>
                <span className={`text-[11px] ${selecionado ? 'text-blue-300' : ''}`}>
                  {formatDia(dia)}
                </span>
                <span className="flex flex-col items-center gap-0.5 mt-0.5">
                  {getEncsDia(encaminhamentos, dia).map((enc, j) => (
                    <span
                      key={j}
                      className="block py-0.5 mx-0.5 rounded-sm text-[10px] font-bold leading-tight text-center"
                      style={{ background: UNIT_COLORS[enc.codigo_unidade] || '#6366f1', color: enc.codigo_unidade === 'SJ' ? '#334155' : '#fff' }}
                    >
                      {enc.numero}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Encaminhamentos do dia selecionado */}
      {(() => {
        const encsDia = getEncsDia(encaminhamentos, diaSelecionado)
        if (encsDia.length === 0) return null
        const statusLabel: Record<string, { label: string; color: string }> = {
          planejada: { label: 'Planejada', color: 'text-blue-400 bg-blue-900/30' },
          em_andamento: { label: 'Em andamento', color: 'text-amber-400 bg-amber-900/30' },
          embarcada: { label: 'Embarcada', color: 'text-emerald-400 bg-emerald-900/30' },
          finalizada: { label: 'Finalizada', color: 'text-[var(--surface-400)] bg-[var(--surface-100)]' },
        }
        const diaLabel = isMesmoDia(diaSelecionado, hoje)
          ? 'Hoje'
          : isOntem(diaSelecionado, hoje)
            ? 'Ontem'
            : diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')
        return (
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-[var(--surface-500)] uppercase tracking-wider">
              Detalhamento — {diaLabel} ({encsDia.length})
            </h2>
            {encsDia.map(enc => {
              const aberto = encAbertos.has(enc.id)
              const st = statusLabel[enc.status] || { label: enc.status, color: 'text-[var(--surface-400)] bg-[var(--surface-100)]' }
              const cor = UNIT_COLORS[enc.codigo_unidade] || '#6366f1'
              const encIda = vinculados.filter(c => c.supinda_id === enc.id)
              const encVolta = vinculados.filter(c => c.supinda_volta_id === enc.id)
              const idaChecksOk = encIda.every(c => c.certificado_confirmado)
              const voltaChecksOk = encVolta.every(c => {
                if (c.tipo_cremacao !== 'coletiva') return c.cinzas_recebidas && c.certificado_recebido
                return c.certificado_recebido
              })
              const todosChecksOk = (encIda.length > 0 || encVolta.length > 0) && idaChecksOk && voltaChecksOk
              return (
                <div
                  key={enc.id}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverEnc(enc.id) }}
                  onDragLeave={() => setDragOverEnc(null)}
                  onDrop={async e => {
                    e.preventDefault()
                    setDragging(false)
                    setDragOverEnc(null)
                    if (selecionados.size === 0) return
                    await incluirEmExistente(enc, selecionados)
                  }}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    dragOverEnc === enc.id
                      ? 'border-blue-400 bg-blue-500/10 ring-2 ring-blue-500/20 scale-[1.01]'
                      : 'border-[var(--surface-200)]'
                  }`}
                >
                  <div
                    onClick={() => {
                      if (selecionados.size > 0) {
                        incluirEmExistente(enc, selecionados)
                        return
                      }
                      // Bloquear expansão de encaminhamento de outra unidade (FLS)
                      if (enc.codigo_unidade !== currentUnit?.codigo && !isSuperAdmin) {
                        return
                      }
                      setEncAbertos(prev => {
                        const next = new Set(prev)
                        if (next.has(enc.id)) next.delete(enc.id)
                        else next.add(enc.id)
                        return next
                      })
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                      enc.codigo_unidade !== currentUnit?.codigo && !isSuperAdmin
                        ? 'cursor-default'
                        : selecionados.size > 0
                          ? 'cursor-pointer hover:bg-blue-500/10'
                          : 'cursor-pointer hover:bg-[var(--surface-50)]'
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: cor + '30', color: cor }}
                    >
                      {enc.codigo_unidade}
                    </span>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--shell-text)]">{enc.numero}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--surface-400)]">
                        {enc.responsavel && <span>{enc.responsavel}</span>}
                        {encIda.length > 0 && <span>· {encIda.length} pet{encIda.length > 1 ? 's' : ''}</span>}
                        {encVolta.length > 0 && <span>· {encVolta.length} entrega{encVolta.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    {enc.status !== 'finalizada' && (enc.codigo_unidade === currentUnit?.codigo || isSuperAdmin) && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setEditEncId(enc.id)
                          setEditEncData(enc.data)
                          setEditEncResponsavel(enc.responsavel || '')
                          setEditEncObs(enc.observacoes || '')
                        }}
                        className="p-1.5 rounded-lg text-[var(--surface-400)] hover:text-blue-400 hover:bg-blue-900/10 transition-colors shrink-0"
                        title="Editar encaminhamento"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {enc.status === 'planejada' && (enc.codigo_unidade === currentUnit?.codigo || isSuperAdmin) && (
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          if (!confirm(`Embarcar ${enc.numero}?\n\nApós embarcar, não será possível adicionar ou remover pets deste encaminhamento.`)) return
                          await supabase.from('supindas').update({ status: 'embarcada' } as never).eq('id', enc.id)
                          setEncaminhamentos(prev => prev.map(x => x.id === enc.id ? { ...x, status: 'embarcada' } : x))
                        }}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shrink-0"
                      >
                        Embarcar
                      </button>
                    )}
                    {enc.status === 'embarcada' && todosChecksOk && (enc.codigo_unidade === currentUnit?.codigo || isSuperAdmin) && (
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          if (!confirm(`Finalizar ${enc.numero}? Isso marca a viagem como concluída.`)) return
                          const dataEnc = enc.data
                          const idsIda = encIda.map(c => c.id)
                          const idsVolta = encVolta.map(c => c.id)
                          await supabase.from('supindas').update({ status: 'finalizada' } as never).eq('id', enc.id)
                          if (idsIda.length > 0) {
                            await supabase.from('contratos').update({ data_leva_pinda: dataEnc, status: 'pinda' } as never).in('id', idsIda)
                          }
                          if (idsVolta.length > 0) {
                            await supabase.from('contratos').update({ data_retorno: dataEnc, status: 'retorno' } as never).in('id', idsVolta)
                          }
                          setEncaminhamentos(prev => prev.map(x => x.id === enc.id ? { ...x, status: 'finalizada' } : x))
                          // Recarregar contratos
                          const campos = 'id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tipo_cremacao, status, numero_lacre, data_cremacao, supinda_id, supinda_volta_id, certificado_confirmado, cinzas_recebidas, certificado_recebido, contrato_gc(data_cremacao,contato_status,etapa)'
                          const [{ data: crem }, { data: ativ }, { data: vinc2 }] = await Promise.all([
                            supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id).eq('status', 'pinda').order('data_contrato', { ascending: true }),
                            supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id).eq('status', 'ativo').order('data_contrato', { ascending: true }),
                            supabase.from('contratos').select(campos).eq('unidade_id', currentUnit!.id).in('status', ['ativo', 'pinda', 'retorno']).or('supinda_id.not.is.null,supinda_volta_id.not.is.null').order('data_contrato', { ascending: true }),
                          ])
                          setCremados(((crem || []) as ContratoEnc[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.etapa === 'disponivel'
    }))
                          setAtivos((ativ || []) as ContratoEnc[])
                          setVinculados((vinc2 || []) as ContratoEnc[])
                        }}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shrink-0"
                      >
                        Finalizar
                      </button>
                    )}
                    <ChevronDown className={`h-4 w-4 text-[var(--surface-400)] transition-transform duration-200 shrink-0 ${aberto ? 'rotate-180' : ''}`} />
                  </div>
                  <div className={`transition-all duration-200 ease-out overflow-hidden ${aberto ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="px-4 py-3 border-t border-[var(--surface-100)] space-y-3">
                      {enc.observacoes && (
                        <p className="text-xs text-[var(--surface-400)] italic">{enc.observacoes}</p>
                      )}
                      {(() => {
                        const ida = encIda
                        const volta = encVolta
                        if (ida.length === 0 && volta.length === 0) return <p className="text-xs text-[var(--surface-400)]">Nenhum pet vinculado.</p>
                        return (
                          <>
                            {ida.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <span className="text-amber-400">↑</span> Levar ({ida.length})
                                </h4>
                                <div className="divide-y divide-[var(--surface-200)]">
                                  {ida.map(c => (
                                      <div key={c.id} className={`px-2 py-2 ${c.certificado_confirmado ? 'bg-cyan-900/10' : ''}`}>
                                        <div className="flex items-center gap-2">
                                          {c.numero_lacre && <span className="text-[8px] font-mono font-bold text-blue-300 bg-blue-900/30 px-1 py-0.5 rounded">{c.numero_lacre}</span>}
                                          <span className={`text-[8px] px-1 py-0.5 rounded-full font-medium ${c.tipo_cremacao === 'coletiva' ? 'bg-purple-900/30 text-purple-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                                            {c.tipo_cremacao === 'coletiva' ? 'COL' : 'IND'}
                                          </span>
                                          <span className="text-xs font-semibold text-[var(--shell-text)] truncate flex-1">{c.pet_nome}</span>
                                          {enc.status === 'planejada' && (() => {
                                            const gcData = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
                                            const podeRemover = !gcData?.contato_status
                                            return podeRemover ? (
                                              <button
                                                onClick={async () => {
                                                  if (!confirm(`Remover ${c.pet_nome} do encaminhamento?`)) return
                                                  await supabase.from('contratos').update({ supinda_id: null } as never).eq('id', c.id)
                                                  await supabase.from('supindas').update({
                                                    quantidade_pets: Math.max(0, enc.quantidade_pets - 1),
                                                    peso_total: Math.max(0, enc.peso_total - (c.pet_peso || 0)),
                                                  } as never).eq('id', enc.id)
                                                  const campos2 = 'id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tipo_cremacao, status, numero_lacre, data_cremacao, supinda_id, supinda_volta_id, certificado_confirmado, cinzas_recebidas, certificado_recebido, contrato_gc(data_cremacao,contato_status,etapa)'
                                                  const [{ data: crem }, { data: ativ }, { data: vinc4 }, { data: encs2 }] = await Promise.all([
                                                    supabase.from('contratos').select(campos2).eq('unidade_id', currentUnit!.id).eq('status', 'pinda').order('data_contrato', { ascending: true }),
                                                    supabase.from('contratos').select(campos2).eq('unidade_id', currentUnit!.id).eq('status', 'ativo').order('data_contrato', { ascending: true }),
                                                    supabase.from('contratos').select(campos2).eq('unidade_id', currentUnit!.id).in('status', ['ativo', 'pinda', 'retorno']).or('supinda_id.not.is.null,supinda_volta_id.not.is.null').order('data_contrato', { ascending: true }),
                                                    supabase.from('supindas').select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo)').order('data'),
                                                  ])
                                                  setCremados(((crem || []) as ContratoEnc[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.etapa === 'disponivel'
    }))
                                                  setAtivos((ativ || []) as ContratoEnc[])
                                                  setVinculados((vinc4 || []) as ContratoEnc[])
                                                  setEncaminhamentos((encs2 || []).map((e: Record<string, unknown>) => ({ id: e.id as string, numero: e.numero as string, data: e.data as string, responsavel: (e.responsavel as string) || null, quantidade_pets: (e.quantidade_pets as number) || 0, peso_total: (e.peso_total as number) || 0, status: e.status as string, observacoes: (e.observacoes as string) || null, codigo_unidade: ((e.unidades as Record<string, string>)?.codigo) || '??' })))
                                                }}
                                                className="p-1 rounded-lg text-[var(--surface-400)] hover:text-red-400 hover:bg-red-900/10 transition-colors shrink-0"
                                                title="Remover do encaminhamento"
                                              >
                                                <X className="h-3.5 w-3.5" />
                                              </button>
                                            ) : (
                                              <span className="text-[8px] text-amber-400 shrink-0" title="Matriz já contatou o tutor">🔒</span>
                                            )
                                          })()}
                                          {enc.status === 'embarcada' && (
                                            <button
                                              onClick={e => { e.stopPropagation(); toggleCheck(c.id, 'certificado_confirmado', c.certificado_confirmado) }}
                                              className={`p-2 rounded-lg transition-colors shrink-0 ${c.certificado_confirmado ? 'text-cyan-400 bg-cyan-900/30' : 'text-[var(--surface-400)] hover:text-cyan-400 hover:bg-cyan-900/10'}`}
                                              title={c.certificado_confirmado ? 'Acondicionado' : 'Marcar acondicionado'}
                                            >
                                              <Snowflake className="h-4 w-4" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--surface-400)]">
                                          <span className="truncate">{c.tutor_nome}</span>
                                          {c.pet_peso && <span>· {c.pet_peso}kg</span>}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                            {volta.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-bold text-[var(--surface-500)] uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <span className="text-blue-400">↓</span> Retirar cinzas e/ou certificado ({volta.length})
                                </h4>
                                <div className="divide-y divide-[var(--surface-200)]">
                                  {volta.map(c => {
                                    const dataCrem = getDataCremacao(c)
                                    const isInd = c.tipo_cremacao !== 'coletiva'
                                    const todosOk = isInd ? (c.cinzas_recebidas && c.certificado_recebido) : c.certificado_recebido
                                    return (
                                      <div key={c.id} className={`px-2 py-2 ${todosOk ? 'bg-emerald-900/10' : ''}`}>
                                        <div className="flex items-center gap-2">
                                          {c.numero_lacre && <span className="text-[8px] font-mono font-bold text-blue-300 bg-blue-900/30 px-1 py-0.5 rounded">{c.numero_lacre}</span>}
                                          <span className={`text-[8px] px-1 py-0.5 rounded-full font-medium ${!isInd ? 'bg-purple-900/30 text-purple-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                                            {!isInd ? 'COL' : 'IND'}
                                          </span>
                                          <span className="text-xs font-semibold text-[var(--shell-text)] truncate flex-1">{c.pet_nome}</span>
                                          {enc.status === 'planejada' && (
                                            <button
                                              onClick={async () => {
                                                if (!confirm(`Remover ${c.pet_nome} do encaminhamento?`)) return
                                                await supabase.from('contratos').update({ supinda_volta_id: null } as never).eq('id', c.id)
                                                const campos2 = 'id, codigo, pet_nome, pet_especie, pet_peso, tutor_nome, tipo_cremacao, status, numero_lacre, data_cremacao, supinda_id, supinda_volta_id, certificado_confirmado, cinzas_recebidas, certificado_recebido, contrato_gc(data_cremacao,contato_status,etapa)'
                                                const [{ data: crem }, { data: ativ }, { data: vinc4 }, { data: encs2 }] = await Promise.all([
                                                  supabase.from('contratos').select(campos2).eq('unidade_id', currentUnit!.id).eq('status', 'pinda').order('data_contrato', { ascending: true }),
                                                  supabase.from('contratos').select(campos2).eq('unidade_id', currentUnit!.id).eq('status', 'ativo').order('data_contrato', { ascending: true }),
                                                  supabase.from('contratos').select(campos2).eq('unidade_id', currentUnit!.id).in('status', ['ativo', 'pinda', 'retorno']).or('supinda_id.not.is.null,supinda_volta_id.not.is.null').order('data_contrato', { ascending: true }),
                                                  supabase.from('supindas').select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo)').order('data'),
                                                ])
                                                setCremados(((crem || []) as ContratoEnc[]).filter(c => {
      const gc = Array.isArray(c.contrato_gc) ? c.contrato_gc[0] : c.contrato_gc
      return gc?.etapa === 'disponivel'
    }))
                                                setAtivos((ativ || []) as ContratoEnc[])
                                                setVinculados((vinc4 || []) as ContratoEnc[])
                                                setEncaminhamentos((encs2 || []).map((e: Record<string, unknown>) => ({ id: e.id as string, numero: e.numero as string, data: e.data as string, responsavel: (e.responsavel as string) || null, quantidade_pets: (e.quantidade_pets as number) || 0, peso_total: (e.peso_total as number) || 0, status: e.status as string, observacoes: (e.observacoes as string) || null, codigo_unidade: ((e.unidades as Record<string, string>)?.codigo) || '??' })))
                                              }}
                                              className="p-1 rounded-lg text-[var(--surface-400)] hover:text-red-400 hover:bg-red-900/10 transition-colors shrink-0"
                                              title="Remover do encaminhamento"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          {enc.status === 'embarcada' && (
                                            <div className="flex items-center gap-1 shrink-0">
                                              {isInd && (
                                                <button
                                                  onClick={e => { e.stopPropagation(); toggleCheck(c.id, 'cinzas_recebidas', c.cinzas_recebidas) }}
                                                  className={`p-1.5 rounded-lg transition-colors ${c.cinzas_recebidas ? 'text-emerald-400 bg-emerald-900/30' : 'text-[var(--surface-400)] hover:text-emerald-400 hover:bg-emerald-900/10'}`}
                                                  title={c.cinzas_recebidas ? 'Cinzas retiradas' : 'Marcar cinzas'}
                                                >
                                                  <Package className="h-4 w-4" />
                                                </button>
                                              )}
                                              <button
                                                onClick={e => { e.stopPropagation(); toggleCheck(c.id, 'certificado_recebido', c.certificado_recebido) }}
                                                className={`p-1.5 rounded-lg transition-colors ${c.certificado_recebido ? 'text-amber-400 bg-amber-900/30' : 'text-[var(--surface-400)] hover:text-amber-400 hover:bg-amber-900/10'}`}
                                                title={c.certificado_recebido ? 'Certificado retirado' : 'Marcar certificado'}
                                              >
                                                <Award className="h-4 w-4" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--surface-400)]">
                                          <span className="truncate">{c.tutor_nome}</span>
                                          {dataCrem && <span className="flex items-center gap-0.5 text-orange-400"><Flame className="h-2.5 w-2.5" />{formatDataCurta(dataCrem)}</span>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Modal escolha: criar novo ou incluir em existente */}
      {escolhaDia && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 bg-[var(--surface-0)] border border-[var(--surface-200)]">
            <h3 className="text-sm font-bold text-[var(--shell-text)]">
              Já existe encaminhamento em {formatDia(escolhaDia)}
            </h3>
            <p className="text-xs text-[var(--surface-400)]">
              Incluir os {escolhaIds.size} selecionados em um existente ou criar novo?
            </p>
            <div className="space-y-2">
              {getEncsDia(encaminhamentos, escolhaDia).filter(enc => isSuperAdmin || enc.codigo_unidade === currentUnit?.codigo).map(enc => {
                const cor = UNIT_COLORS[enc.codigo_unidade] || '#6366f1'
                return (
                  <button
                    key={enc.id}
                    onClick={() => incluirEmExistente(enc, escolhaIds)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors text-left"
                  >
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: cor + '30', color: cor }}>
                      {enc.codigo_unidade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-[var(--shell-text)]">Incluir em {enc.numero}</span>
                      <span className="text-[10px] text-[var(--surface-400)] block">{enc.responsavel || 'Sem responsável'} · {enc.quantidade_pets} pets</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => { setEscolhaDia(null); abrirTelaEdicao(escolhaDia!, escolhaIds) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-blue-500/30 hover:bg-blue-900/10 transition-colors text-left"
              >
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold shrink-0 bg-blue-500/20 text-blue-400">
                  <Plus className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-[var(--shell-text)]">Criar {escolhaProxCodigo}</span>
                  <span className="text-[10px] text-[var(--surface-400)] block">Novo encaminhamento</span>
                </div>
              </button>
              <button
                onClick={() => setEscolhaDia(null)}
                className="w-full py-2 rounded-lg text-xs text-[var(--surface-500)] hover:bg-[var(--surface-100)] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Encaminhamento Existente */}
      {editEncId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 bg-[var(--surface-0)] border border-[var(--surface-200)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--shell-text)]">
                Editar {encaminhamentos.find(e => e.id === editEncId)?.numero}
              </h3>
              <button onClick={() => setEditEncId(null)} className="text-[var(--surface-400)] hover:text-[var(--shell-text)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Data</label>
                <input type="date" value={editEncData} onChange={e => setEditEncData(e.target.value)} className="input text-sm w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Responsável</label>
                <select value={editEncResponsavel} onChange={e => setEditEncResponsavel(e.target.value)} className="input text-sm w-full">
                  <option value="">Selecionar...</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.nome}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Observações</label>
                <textarea value={editEncObs} onChange={e => setEditEncObs(e.target.value)} placeholder="Opcional" rows={2} className="input text-sm w-full resize-y" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditEncId(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold text-[var(--surface-500)] border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await supabase.from('supindas').update({
                    data: editEncData,
                    responsavel: editEncResponsavel.trim() || null,
                    observacoes: editEncObs.trim() || null,
                  } as never).eq('id', editEncId)
                  setEncaminhamentos(prev => prev.map(e => e.id === editEncId ? { ...e, data: editEncData, responsavel: editEncResponsavel.trim() || null, observacoes: editEncObs.trim() || null } : e))
                  setEditEncId(null)
                }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tela Edição Encaminhamento */}
      <Modal isOpen={telaEdicao} onClose={() => setTelaEdicao(false)} title={`Novo Encaminhamento: ${novoCodigo}`} size="xl" footer={
        <div className="flex gap-3 justify-end w-full">
          <button onClick={() => setTelaEdicao(false)} className="btn-secondary text-sm">Cancelar</button>
          <button
            onClick={salvarEncaminhamento}
            disabled={salvandoNovo || !novoResponsavel.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {salvandoNovo ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : 'Criar Encaminhamento'}
          </button>
        </div>
      }>
        <div className="space-y-5">
          {/* Dados principais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Data</label>
              <input type="date" value={novoData} onChange={e => setNovoData(e.target.value)} className="input text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Responsável <span className="text-red-400">*</span></label>
              <select value={novoResponsavel} onChange={e => setNovoResponsavel(e.target.value)} className="input text-sm w-full">
                <option value="">Selecionar...</option>
                {funcionarios.map(f => (
                  <option key={f.id} value={f.nome}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Observações</label>
              <input type="text" value={novoObs} onChange={e => setNovoObs(e.target.value)} placeholder="Opcional" className="input text-sm w-full" />
            </div>
          </div>

          {/* Levar (ativos) */}
          {novoIdsLevar.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[var(--surface-500)] uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="text-amber-400 text-sm">↑</span>
                Levar — Ativos ({novoIdsLevar.length})
              </h3>
              <div className="space-y-1">
                {novoIdsLevar.map(id => {
                  const c = ativos.find(a => a.id === id)
                  if (!c) return null
                  const coletiva = c.tipo_cremacao === 'coletiva'
                  return (
                    <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
                      {c.numero_lacre && <span className="text-[9px] font-mono font-bold text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded">{c.numero_lacre}</span>}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${coletiva ? 'bg-purple-900/30 text-purple-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                        {coletiva ? 'COL' : 'IND'}
                      </span>
                      <span className="text-sm font-semibold text-[var(--shell-text)] flex-1 truncate">{c.pet_nome}</span>
                      <span className="text-xs text-[var(--surface-400)] truncate hidden sm:inline">{c.tutor_nome}</span>
                      {c.pet_peso && <span className="text-xs text-[var(--surface-400)]">{c.pet_peso}kg</span>}
                      <button onClick={() => removerDoEncaminhamento(id)} className="p-1 text-[var(--surface-400)] hover:text-red-400 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Retirar cinzas e/ou certificado (pinda) */}
          {novoIdsRetirar.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[var(--surface-500)] uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="text-blue-400 text-sm">↓</span>
                Retirar — Cinzas e Certificados ({novoIdsRetirar.length})
              </h3>
              <div className="space-y-1">
                {novoIdsRetirar.map(id => {
                  const c = cremados.find(a => a.id === id)
                  if (!c) return null
                  const coletiva = c.tipo_cremacao === 'coletiva'
                  const dataCrem = getDataCremacao(c)
                  return (
                    <div key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
                      {c.numero_lacre && <span className="text-[9px] font-mono font-bold text-blue-300 bg-blue-900/30 px-1.5 py-0.5 rounded">{c.numero_lacre}</span>}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${coletiva ? 'bg-purple-900/30 text-purple-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                        {coletiva ? 'COL' : 'IND'}
                      </span>
                      <span className="text-sm font-semibold text-[var(--shell-text)] flex-1 truncate">{c.pet_nome}</span>
                      <span className="text-xs text-[var(--surface-400)] truncate hidden sm:inline">{c.tutor_nome}</span>
                      {dataCrem && (
                        <span className="flex items-center gap-1 text-xs text-orange-400">
                          <Flame className="h-3 w-3" />{formatDataCurta(dataCrem)}
                        </span>
                      )}
                      <button onClick={() => removerDoEncaminhamento(id)} className="p-1 text-[var(--surface-400)] hover:text-red-400 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {novoIdsLevar.length === 0 && novoIdsRetirar.length === 0 && (
            <div className="text-center py-6 text-[var(--surface-400)] text-sm">
              Nenhum pet selecionado. Selecione pets antes de criar ou adicione depois.
            </div>
          )}
        </div>
      </Modal>

      {/* Barra de seleção fixa no footer — draggable */}
      {selecionados.size > 0 && (
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className="fixed bottom-0 left-0 right-0 z-50 bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-lg md:left-[var(--sidebar-width,4rem)] cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">🚐 {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>
            <span className="text-xs text-blue-200">{getDragSummary()}</span>
            <span className="text-[10px] text-blue-300 hidden sm:inline">— arraste até um dia</span>
            <span className="text-[10px] text-blue-300 sm:hidden">— toque num dia</span>
          </div>
          <button
            onClick={() => setSelecionados(new Set())}
            className="text-xs text-blue-200 hover:text-white transition-colors"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  )
}
