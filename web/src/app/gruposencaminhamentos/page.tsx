'use client'

/**
 * GRUPOS DE ENCAMINHAMENTO — o espelho dos 7 grupos de WhatsApp.
 *
 * POR QUE ESTA TELA EXISTE (Lucas, 15/09/2026)
 * Hoje a operação roda em 7 grupos de WhatsApp, um por unidade. A unidade tira **foto de
 * celular da ficha de remoção em papel** (bloco impresso, coisa de 1980) e manda no grupo,
 * seguida do **contato do tutor**, pra Matriz agendar a despedida. A gerente da Matriz é
 * analógica — imprime até a ficha digital.
 *
 * A transição precisa ser amigável: em vez de dar a ela uma tela de CRM, esta tela **desenha
 * o WhatsApp que ela já usa** — calendário → dia → "grupo" → conversa com as fichas e os
 * contatos anexados, na mesma ordem em que chegam no zap hoje. Com o chão igual, dá pra ir
 * tirando os atritos um a um.
 *
 * 🔴 STACK DE MENOR CONSUMO (pedido explícito): a "mini imagem" da ficha **não é imagem
 * nenhuma**. Usa o `FichaRemocaoDoc` — a ficha redesenhada em HTML+CSS, sem o PNG de template
 * de 398x512 e sem campo posicionado por coordenada (ver o cabeçalho dele). A miniatura é
 * `transform: scale()` nesse DOM:
 *   • zero imagem baixada   • zero upload pro Storage   • zero PNG gerado por ficha pra exibir
 * `html2canvas`/`jspdf` entram só por `import()` dinâmico, quando alguém clica em baixar
 * (`lib/ficha-download.ts`) — quem só olha a ficha não paga esse JS.
 *
 * ⚠️ O irmão `FichaRemocao.tsx` (o de coordenadas sobre PNG) **continua vivo e em produção**:
 * pipeline (PDF A4 com 2 cópias), detalhe do contrato e `lib/impressao-unificada.ts`. Os dois
 * layouts convivem até o Lucas aprovar o novo e mandar trocar lá também. O que de fato é código
 * morto é só o `components/supindas/FichasBatchModal.tsx` (html2canvas → Storage): nenhum
 * arquivo o importa e o bucket `fichas` não tem UMA pasta `encaminhamento_*` (conferido em
 * 15/09/2026). Não ressuscitar esse.
 *
 * GATE — `obj_enc_pipeline` (mig 142), o mesmo interruptor de rollout do fluxo novo:
 * chave ligada → esta tela substitui a `/encaminhamentos` no menu. Usa
 * `useFieldPermission` (não o `useUnidadeNoPipeline`) de propósito: a pergunta aqui é
 * "esta pessoa vê o fluxo novo?", e o super_admin ser `edit` por hardcode é justamente
 * como o Lucas testa antes de liberar unidade. A `/encaminhamentos` continua acessível
 * pela URL — e operável nas unidades não migradas, porque o gate DELA é o outro hook.
 *
 * ⚠️ Somente leitura. Esta tela não grava nada: quem monta e despacha encaminhamento no
 * fluxo novo é o Pipeline (`/contratos`). Ver `docs/ENCAMINHAMENTO_NO_PIPELINE.md`.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ArrowLeft, Users, MessageCircle, X,
  Dog, Cat, Bug, Phone, FileText, CheckCheck, Info, Download, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import { dataLocal } from '@/lib/date-local'
import { nomeParaAgenda } from '@/lib/nome-agenda'
import { linkChatDireto } from '@/lib/whatsapp-msg'
import { fmtTelefone, type FichaContratoData } from '@/components/fichas/FichaRemocao'
import FichaRemocaoDoc, { DOC_W, DOC_MIN_H } from '@/components/fichas/FichaRemocaoDoc'
import { baixarFichaPng, baixarFichaPdf, nomeDeArquivo } from '@/lib/ficha-download'

// Mesmas cores de unidade da /encaminhamentos — o badge do calendário tem que ser
// reconhecível entre as duas telas durante a convivência dos dois fluxos.
const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}
const textoSobreUnidade = (codigo: string) => (codigo === 'SJ' ? '#334155' : '#fff')

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Largura de projeto da ficha-documento. A ALTURA é livre (o HTML cresce com o conteúdo), por
// isso quem exibe mede o nó real — ver `FichaEscalada`. `DOC_MIN_H` serve só de palpite inicial.
const FICHA_W = DOC_W

const STATUS_ENC: Record<string, { rotulo: string; classe: string }> = {
  planejada: { rotulo: 'Montando', classe: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  embarcada_ida: { rotulo: 'Na estrada', classe: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ida_finalizada: { rotulo: 'Na Matriz', classe: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  finalizada: { rotulo: 'Concluído', classe: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
}

// ============================================
// Types
// ============================================
type EncGrupo = {
  id: string
  numero: string
  data: string
  codigo_unidade: string
  unidade_nome: string
  responsavel: string | null
  quantidade_pets: number
  peso_total: number
  status: string
  observacoes: string | null
}

/** Uma ficha na conversa: o que o FichaRemocao precisa + o que o card de contato precisa. */
type FichaMsg = {
  ficha: FichaContratoData
  contratoId: string
  petNome: string
  lacre: string | null
  tipoCremacao: string | null
  nomeAgenda: string
  tutorNome: string
  /** Só pra resolver o colaborador do acolhimento por RPC — ver `resolverColaboradores`. */
  responsavelUserId: string | null
  telefone: string | null
  especie: string | null
  hora: string
}

// ============================================
// Helpers
// ============================================
function formatDia(d: Date): string {
  const dia = d.getDate().toString().padStart(2, '0')
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${dia}/${mes}`
}

function isMesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** `date` YYYY-MM-DD → "sexta, 19 de setembro" sem instanciar Date (evita o off-by-one de fuso). */
function diaExtenso(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m) return data
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function horaDoAcolhimento(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function especieIcon(especie: string | null) {
  const e = especie?.toLowerCase() || ''
  if (e.includes('canina')) return Dog
  if (e.includes('felina')) return Cat
  return Bug
}

// Iniciais pro avatar do contato. Saem do nome do TUTOR, nunca do nome de agenda: o nome de
// agenda começa com a data e termina em IND/COL, então primeira+última palavra dele davam
// coisas como "2C" (de "26set14 … COL") — avatar que não identifica ninguém.
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

const fmtPeso = (kg: number) => `${(kg || 0).toFixed(1).replace('.', ',')} kg`

// Campos que a ficha consome. `clinica_veterinaria` e `colaborador_responsavel` NÃO são
// colunas: o componente exige que o chamador resolva (ver o cabeçalho dele).
//
// 🔴 O colaborador do acolhimento vem de TRÊS lugares diferentes, e cada unidade usa um:
//   1. `executado_por_funcionario_id` — "quem fez de verdade" (mig 137, login "posição")
//   2. `funcionario_id` — o caminho clássico (SJ e CP usam este)
//   3. `responsavel_user_id` — unidade com `cb_operacional` (mig 123)
// Medido em 15/09/2026: em **Santos o `funcionario_id` está vazio em 100% dos pets** (ST171 e
// ST172 varridos), porque ela é a única com `cb_operacional` — o responsável mora em
// `responsavel_user_id`. Ler só `funcionario_id`, como eu fazia, deixava o campo em branco
// justamente na unidade que o Lucas estava olhando. O (3) não dá JOIN aqui: `perfis` só
// devolve o PRÓPRIO perfil por RLS, então precisa da RPC — ver `resolverColaboradores`.
const CAMPOS_FICHA = `
  id, codigo, numero_lacre, tipo_cremacao, tipo_plano, data_contrato, data_acolhimento, status,
  pet_nome, pet_especie, pet_raca, pet_cor, pet_idade_anos, pet_peso, pet_genero,
  certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4,
  certificado_nome_5, certificado_nome_6, certificado_nome_7,
  local_coleta, clinica_coleta, observacoes, remocao_cidade, responsavel_user_id,
  tutor_nome, tutor_telefone, tutor_telefone2, tutor_telefone_nome, tutor_telefone2_nome,
  tutor_telefone_principal, tutor_endereco, tutor_bairro, tutor_cidade, tutor_cep,
  tutor:tutor_id ( nome, telefone, telefone2, telefone_principal, telefone_nome,
                   endereco, numero, complemento, bairro, cidade, estado, cep ),
  estabelecimento:estabelecimento_id ( nome ),
  funcionario:funcionario_id ( nome ),
  executor:executado_por_funcionario_id ( nome )
`

type LinhaContrato = {
  id: string
  codigo: string
  numero_lacre: string | null
  tipo_cremacao: string | null
  tipo_plano: string | null
  data_contrato: string | null
  data_acolhimento: string | null
  status: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_idade_anos: number | null
  pet_peso: number | null
  pet_genero: string | null
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  local_coleta: string | null
  clinica_coleta: string | null
  observacoes: string | null
  remocao_cidade: string | null
  tutor_nome: string | null
  tutor_telefone: string | null
  tutor_telefone2: string | null
  tutor_telefone_nome: string | null
  tutor_telefone2_nome: string | null
  tutor_telefone_principal: number | null
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  tutor_cep: string | null
  responsavel_user_id: string | null
  tutor: {
    nome: string | null; telefone: string | null; telefone2: string | null
    telefone_principal: number | null; telefone_nome: string | null
    endereco: string | null; numero: string | null; complemento: string | null
    bairro: string | null; cidade: string | null; estado: string | null; cep: string | null
  } | null
  estabelecimento: { nome: string | null } | null
  funcionario: { nome: string | null } | null
  executor: { nome: string | null } | null
}

function montarFicha(c: LinhaContrato): FichaMsg {
  // Cadastro do tutor na frente, snapshot do contrato como fallback — mesma precedência
  // que o resto do sistema usa (o snapshot envelhece; o cadastro é editável em /tutores).
  const tel1 = c.tutor?.telefone || c.tutor_telefone || null
  const tel2 = c.tutor?.telefone2 || c.tutor_telefone2 || null
  const principal = c.tutor?.telefone_principal ?? c.tutor_telefone_principal ?? 1
  const telAtivo = principal === 2 ? tel2 : tel1

  const ficha: FichaContratoData = {
    id: c.id,
    codigo: c.codigo,
    numero_lacre: c.numero_lacre,
    tipo_cremacao: c.tipo_cremacao === 'coletiva' ? 'coletiva' : 'individual',
    data_acolhimento: c.data_acolhimento,
    pet_nome: c.pet_nome,
    pet_especie: c.pet_especie,
    pet_raca: c.pet_raca,
    pet_cor: c.pet_cor,
    pet_idade_anos: c.pet_idade_anos,
    pet_peso: c.pet_peso,
    pet_genero: c.pet_genero,
    certificado_nome_1: c.certificado_nome_1,
    certificado_nome_2: c.certificado_nome_2,
    certificado_nome_3: c.certificado_nome_3,
    certificado_nome_4: c.certificado_nome_4,
    certificado_nome_5: c.certificado_nome_5,
    certificado_nome_6: c.certificado_nome_6,
    certificado_nome_7: c.certificado_nome_7,
    local_coleta: c.local_coleta,
    clinica_veterinaria: c.clinica_coleta || c.estabelecimento?.nome || null,
    // "Quem fez de verdade" na frente, depois o funcionário clássico. O 3º caminho
    // (`responsavel_user_id`, unidade com `cb_operacional`) só existe via RPC e é costurado
    // depois, em `resolverColaboradores` — aqui fica null de propósito.
    colaborador_responsavel: c.executor?.nome || c.funcionario?.nome || null,
    observacoes: c.observacoes,
    tutor_telefone: tel1,
    tutor_telefone2: tel2,
    tutor_telefone_nome: c.tutor?.telefone_nome || c.tutor_telefone_nome,
    tutor_telefone2_nome: c.tutor_telefone2_nome,
    tutor_telefone_principal: principal,
    remocao_cidade: c.remocao_cidade,
    tutor_nome: c.tutor?.nome || c.tutor_nome,
    // Endereço: o componente aplica a precedência cadastro › snapshot, então os dois vão.
    tutor_endereco: c.tutor_endereco,
    tutor_bairro: c.tutor_bairro,
    tutor_cidade: c.tutor_cidade,
    tutor_cep: c.tutor_cep,
    tutor: c.tutor,
  }

  return {
    ficha,
    contratoId: c.id,
    petNome: c.pet_nome,
    lacre: c.numero_lacre,
    tipoCremacao: c.tipo_cremacao,
    nomeAgenda: nomeParaAgenda(c),
    tutorNome: c.tutor?.nome || c.tutor_nome || '',
    responsavelUserId: c.responsavel_user_id,
    telefone: telAtivo,
    especie: c.pet_especie,
    hora: horaDoAcolhimento(c.data_acolhimento),
  }
}

/**
 * Preenche `colaborador_responsavel` nas fichas em que ele veio de `responsavel_user_id`
 * (unidade com `cb_operacional`, mig 123) — em Santos isso é **todas**.
 *
 * 🔴 **Não dá para fazer JOIN em `perfis`.** A policy `perfis_select` promete que super_admin
 * lê todo mundo, mas o `EXISTS` auto-referente nunca resolve: na prática **todo login só
 * enxerga o PRÓPRIO perfil**, e o `SELECT` volta vazio SEM ERRO — o campo simplesmente
 * aparece em branco. Por isso vai pela RPC `resolver_nomes_perfis` (mig 139,
 * `SECURITY DEFINER`), que é feita exatamente pra isso. ⚠️ O parâmetro é **`p_user_ids`**
 * (o CLAUDE.md dizia `user_ids`, que devolve `PGRST202`).
 *
 * Uma chamada só pro lote, e só com os IDs que faltam — se nenhuma ficha precisar, não chama.
 * Falhar aqui é aceitável: a ficha volta sem o colaborador, não quebra a conversa.
 */
async function resolverColaboradores(
  supabase: ReturnType<typeof createClient>,
  fichas: FichaMsg[],
): Promise<FichaMsg[]> {
  const faltando = fichas.filter(f => !f.ficha.colaborador_responsavel && f.responsavelUserId)
  if (faltando.length === 0) return fichas

  const ids = Array.from(new Set(faltando.map(f => f.responsavelUserId as string)))
  try {
    const { data } = await supabase.rpc('resolver_nomes_perfis' as never, { p_user_ids: ids } as never) as
      { data: { user_id: string; nome: string | null }[] | null }
    const porId = new Map((data || []).map(p => [p.user_id, p.nome]))
    return fichas.map(f => {
      const nome = f.responsavelUserId ? porId.get(f.responsavelUserId) : null
      if (f.ficha.colaborador_responsavel || !nome) return f
      return { ...f, ficha: { ...f.ficha, colaborador_responsavel: nome } }
    })
  } catch (e) {
    console.error('Erro ao resolver o colaborador do acolhimento:', e)
    return fichas
  }
}

// ============================================
// Page
// ============================================
export default function GruposEncaminhamentosPage() {
  const supabase = createClient()
  const { currentUnit } = useUnit()
  const { isVisible } = useFieldPermission()
  const fluxoNovo = isVisible('tela_pipeline', 'obj_enc_pipeline')

  const hoje = new Date()
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(hoje)
  const [desktopOffset, setDesktopOffset] = useState(0)
  const [encAberto, setEncAberto] = useState<EncGrupo | null>(null)

  const [grupos, setGrupos] = useState<EncGrupo[]>([])
  const [loading, setLoading] = useState(true)

  const [fichas, setFichas] = useState<FichaMsg[]>([])
  const [carregandoFichas, setCarregandoFichas] = useState(false)
  const [fichaAmpliada, setFichaAmpliada] = useState<FichaMsg | null>(null)

  // Escala da miniatura e do zoom saem do tamanho da janela: uma medida, dois usos.
  const [janela, setJanela] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const medir = () => setJanela({ w: window.innerWidth, h: window.innerHeight })
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  // Balão de foto do WhatsApp: ~200px no desktop, ~165px no celular.
  const escalaMini = janela.w < 640 ? 0.42 : 0.5
  // Ampliada: tem que caber inteira SEM CORTE, então a escala é limitada pelas DUAS dimensões —
  // só pela largura, num notebook de 768px de altura o pé da ficha ("Observações especiais")
  // ficava fora da tela, escondendo justamente o campo que a Matriz precisa ler. Os 132px
  // descontados são o cabeçalho do lightbox + a barra de baixar. `DOC_MIN_H` é a altura de
  // referência: a ficha pode crescer além disso, e aí o lightbox rola (tem `overflow-auto`).
  const escalaZoom = Math.max(0.5, Math.min(1.35, (janela.w - 40) / FICHA_W, (janela.h - 132) / DOC_MIN_H))

  // ---- Carga dos grupos (todos os encaminhamentos, de TODAS as unidades) ----
  // Sem filtro de unidade de propósito: são os 7 grupos do zap, e a Matriz vê os 7.
  // (A /encaminhamentos carrega essa mesma lista do mesmo jeito.)
  useEffect(() => {
    let vivo = true
    async function carregar() {
      const { data, error } = await supabase
        .from('supindas')
        .select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo, nome)')
        .order('data', { ascending: false })

      if (!vivo) return
      if (error) {
        console.error('Erro ao carregar encaminhamentos:', error)
        setLoading(false)
        return
      }
      setGrupos((data || []).map((e: Record<string, unknown>) => {
        const u = e.unidades as { codigo?: string; nome?: string } | null
        return {
          id: e.id as string,
          numero: e.numero as string,
          data: e.data as string,
          codigo_unidade: u?.codigo || '??',
          unidade_nome: u?.nome || u?.codigo || 'Unidade',
          responsavel: (e.responsavel as string) || null,
          quantidade_pets: (e.quantidade_pets as number) || 0,
          peso_total: (e.peso_total as number) || 0,
          status: e.status as string,
          observacoes: (e.observacoes as string) || null,
        }
      }))
      setLoading(false)
    }
    carregar()
    return () => { vivo = false }
  }, [supabase])

  // ---- Carga das fichas do grupo aberto (on demand — nunca as 523 viagens de uma vez) ----
  const abrirGrupo = useCallback(async (grupo: EncGrupo) => {
    setEncAberto(grupo)
    setFichas([])
    setCarregandoFichas(true)
    window.scrollTo({ top: 0 })

    const { data, error } = await supabase
      .from('contratos')
      .select(CAMPOS_FICHA)
      .eq('supinda_id', grupo.id)
      .order('data_acolhimento', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('Erro ao carregar fichas do encaminhamento:', error)
      setCarregandoFichas(false)
      return
    }
    const montadas = ((data || []) as unknown as LinhaContrato[]).map(c => montarFicha(c))
    setFichas(await resolverColaboradores(supabase, montadas))
    setCarregandoFichas(false)
  }, [supabase])

  // Fechar a ficha ampliada no Esc (é um lightbox, comportamento esperado)
  useEffect(() => {
    if (!fichaAmpliada) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFichaAmpliada(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fichaAmpliada])

  // ---- Calendário: mesmas janelas da /encaminhamentos (10 dias desktop, scroll no mobile) ----
  const desktopVisivel: Date[] = []
  for (let i = -7; i <= 2; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + desktopOffset + i)
    desktopVisivel.push(d)
  }
  const mobileDias: Date[] = []
  for (let i = -14; i <= 13; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    mobileDias.push(d)
  }

  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const mobileJaRolou = useRef(false)
  useEffect(() => {
    if (mobileScrollRef.current && !mobileJaRolou.current) {
      const c = mobileScrollRef.current
      c.scrollLeft = (c.scrollWidth / mobileDias.length) * 13 - 8
      mobileJaRolou.current = true
    }
  }, [mobileDias.length])

  const gruposDoDia = (dia: Date) => grupos.filter(g => g.data === dataLocal(dia))
  const gruposSelecionados = gruposDoDia(diaSelecionado)

  // ---- Gate ----
  // Não redireciona: `flsPermissions` nasce vazio (= permissivo) e um redirect piscaria a
  // tela antes de saber a resposta. Um aviso com o caminho certo não tem essa corrida.
  if (!fluxoNovo) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6 text-center">
        <Info className="h-8 w-8 mx-auto mb-3 text-[var(--surface-400)]" />
        <h1 className="text-lg font-semibold text-[var(--surface-700)] mb-1">Ainda não é por aqui</h1>
        <p className="text-sm text-[var(--surface-500)] mb-4">
          Esta unidade segue montando encaminhamento na tela de sempre.
        </p>
        <Link href="/encaminhamentos" className="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          Ir para Encaminhamentos
        </Link>
      </div>
    )
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="pb-24">
      {/* ===== Cabeçalho ===== */}
      {/* 🔴 Só ícone + nome da tela. **Nada de subtítulo/descrição aqui** — é regra de header
          do CRM, e eu tinha posto uma linha "Escolha o dia, abra o grupo…" que virou ruído.
          Se precisar contextualizar o que a tela faz, o lugar é o `desc` do `field-catalog.ts`
          (que aparece em /admin/visibilidade) ou um tooltip no ícone. */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[var(--surface-700)] flex items-center gap-2">
          <Users className="h-5 w-5 text-[#25D366]" />
          Grupos de Encaminhamento
        </h1>
      </div>

      {/* ===== DESKTOP: calendário-line ===== */}
      <div className="hidden md:block relative mb-6">
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
            onClick={() => setDesktopOffset(p => p - 2)}
            className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
            title="2 dias antes"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 flex gap-1 overflow-visible pt-2">
            {desktopVisivel.map((dia, i) => {
              const ehHoje = isMesmoDia(dia, hoje)
              const selecionado = isMesmoDia(dia, diaSelecionado)
              const fds = dia.getDay() === 0 || dia.getDay() === 6
              return (
                <button
                  key={i}
                  onClick={() => { setDiaSelecionado(dia); setEncAberto(null) }}
                  className={`relative flex-1 min-w-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                    ${selecionado
                      ? ehHoje
                        ? 'border-blue-500 bg-transparent text-blue-400'
                        : 'border-blue-500 bg-blue-500/15 text-blue-400'
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
                  <span className={`text-[11px] ${selecionado ? 'text-blue-300' : ''}`}>{formatDia(dia)}</span>
                  <span className="flex flex-col items-center gap-0.5 mt-0.5 w-full">
                    {gruposDoDia(dia).map(g => (
                      <span
                        key={g.id}
                        className="block w-full py-0.5 mx-0.5 rounded-sm text-[11px] font-bold leading-tight text-center"
                        style={{ background: UNIT_COLORS[g.codigo_unidade] || '#6366f1', color: textoSobreUnidade(g.codigo_unidade) }}
                      >
                        {g.numero}
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setDesktopOffset(p => p + 2)}
            className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
            title="2 dias depois"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ===== MOBILE: calendário-line ===== */}
      <div className="md:hidden mb-5">
        <div
          ref={mobileScrollRef}
          className="flex gap-2 overflow-x-auto overflow-y-visible scrollbar-hide snap-x snap-mandatory px-1 -mx-1 pt-2"
          style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
        >
          {mobileDias.map((dia, i) => {
            const ehHoje = isMesmoDia(dia, hoje)
            const selecionado = isMesmoDia(dia, diaSelecionado)
            const fds = dia.getDay() === 0 || dia.getDay() === 6
            return (
              <button
                key={i}
                onClick={() => { setDiaSelecionado(dia); setEncAberto(null) }}
                className={`relative snap-start shrink-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                  ${selecionado
                    ? ehHoje
                      ? 'border-blue-500 bg-transparent text-blue-400'
                      : 'border-blue-500 bg-blue-500/15 text-blue-400'
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
                <span className={`text-[11px] ${selecionado ? 'text-blue-300' : ''}`}>{formatDia(dia)}</span>
                <span className="flex flex-col items-center gap-0.5 mt-0.5 w-full px-0.5">
                  {gruposDoDia(dia).map(g => (
                    <span
                      key={g.id}
                      className="block w-full py-0.5 rounded-sm text-[10px] font-bold leading-tight text-center"
                      style={{ background: UNIT_COLORS[g.codigo_unidade] || '#6366f1', color: textoSobreUnidade(g.codigo_unidade) }}
                    >
                      {g.numero}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ===== Conteúdo: lista de grupos do dia OU a conversa ===== */}
      {loading ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Carregando encaminhamentos…</div>
      ) : encAberto ? (
        <Conversa
          grupo={encAberto}
          fichas={fichas}
          carregando={carregandoFichas}
          escalaMini={escalaMini}
          onVoltar={() => setEncAberto(null)}
          onAmpliar={setFichaAmpliada}
        />
      ) : (
        <ListaDeGrupos
          dia={diaSelecionado}
          grupos={gruposSelecionados}
          unidadeAtualCodigo={(currentUnit as { codigo?: string } | null)?.codigo}
          onAbrir={abrirGrupo}
        />
      )}

      {/* ===== Lightbox da ficha ampliada (com baixar PDF/PNG) ===== */}
      {fichaAmpliada && (
        <LightboxFicha
          ficha={fichaAmpliada}
          escala={escalaZoom}
          onFechar={() => setFichaAmpliada(null)}
        />
      )}
    </div>
  )
}

// ============================================
// A ficha reduzida
// ============================================
/**
 * A ficha-documento em escala. Largura é fixa (`DOC_W`), **altura é livre** — o HTML cresce com
 * o conteúdo (nome comprido quebra linha, observação longa empurra o pé).
 *
 * 🔴 Por isso a caixa **mede o nó real** em vez de calcular `DOC_H * escala`:
 * `transform: scale()` não muda o tamanho de layout, então sem medir o balão ficaria com a
 * altura de outra ficha — sobrando branco numa, cortando a outra. `offsetHeight` ignora
 * transform de propósito, e é exatamente o número que precisamos.
 */
function FichaEscalada({ ficha, escala }: { ficha: FichaContratoData; escala: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [alturaNatural, setAlturaNatural] = useState(DOC_MIN_H)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAlturaNatural(el.offsetHeight)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ width: DOC_W * escala, height: alturaNatural * escala, overflow: 'hidden' }}>
      <div ref={ref} style={{ width: DOC_W, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
        <FichaRemocaoDoc contrato={ficha} />
      </div>
    </div>
  )
}

// ============================================
// Lightbox: a ficha inteira + baixar PDF/PNG
// ============================================
function LightboxFicha({ ficha, escala, onFechar }: {
  ficha: FichaMsg
  escala: number
  onFechar: () => void
}) {
  // 🔴 Nó OCULTO em escala 1:1 — é dele que o html2canvas captura. O visível está dentro de um
  // `transform: scale()`, e o html2canvas lê o layout **ignorando transform**: capturar do
  // visível daria um arquivo em tamanho de projeto com o conteúdo desalinhado. Mesmo padrão que
  // o `lib/impressao-unificada.ts` já usa pra imprimir ficha em lote.
  const capturaRef = useRef<HTMLDivElement>(null)
  const [baixando, setBaixando] = useState<'png' | 'pdf' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const nomeBase = nomeDeArquivo('ficha', ficha.petNome, ficha.lacre)

  async function baixar(formato: 'png' | 'pdf') {
    const el = capturaRef.current
    if (!el || baixando) return
    setBaixando(formato)
    setErro(null)
    try {
      if (formato === 'png') await baixarFichaPng(el, nomeBase)
      else await baixarFichaPdf(el, nomeBase)
    } catch (e) {
      console.error('Erro ao baixar a ficha:', e)
      setErro('Não deu pra gerar o arquivo. Tente de novo.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 overflow-auto"
      onClick={onFechar}
    >
      <div className="flex items-center justify-between gap-3 w-full max-w-md mb-3 text-white/90">
        <span className="text-sm font-medium truncate">
          Ficha de {ficha.petNome}
          {ficha.lacre ? ` · lacre ${ficha.lacre}` : ''}
        </span>
        <button
          onClick={onFechar}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          title="Fechar (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* A ficha visível — o mesmo componente da miniatura, em escala maior */}
      <div onClick={e => e.stopPropagation()} style={{ borderRadius: 6, overflow: 'hidden' }}>
        <FichaEscalada ficha={ficha.ficha} escala={escala} />
      </div>

      {/* Baixar: PDF primeiro, que é o que vai pra impressora */}
      <div onClick={e => e.stopPropagation()} className="flex items-center gap-2 mt-3">
        <button
          onClick={() => baixar('pdf')}
          disabled={baixando !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {baixando === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </button>
        <button
          onClick={() => baixar('png')}
          disabled={baixando !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {baixando === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PNG
        </button>
        <Link
          href={`/contratos/${ficha.contratoId}`}
          className="ml-1 text-xs text-white/70 hover:text-white underline"
        >
          Abrir o contrato
        </Link>
      </div>

      {erro && <p className="mt-2 text-xs text-red-300">{erro}</p>}

      {/* Nó de captura: renderizado de verdade (o html2canvas precisa de layout real).
          🔴 Fica no **canto superior esquerdo**, NÃO em `left: -10000`. O
          `foreignObjectRendering` (obrigatório aqui — ver `lib/ficha-download.ts`) não
          translada o offset: elemento deslocado do topo do documento sai **em branco**.
          Quem esconde é o overlay preto do lightbox, que cobre a tela toda por cima — daí o
          `zIndex: 0` contra o `z-50` do overlay. */}
      <div
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' }}
      >
        <div ref={capturaRef} style={{ width: DOC_W }}>
          <FichaRemocaoDoc contrato={ficha.ficha} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// Lista de grupos do dia (a "lista de conversas")
// ============================================
function ListaDeGrupos({ dia, grupos, unidadeAtualCodigo, onAbrir }: {
  dia: Date
  grupos: EncGrupo[]
  unidadeAtualCodigo?: string
  onAbrir: (g: EncGrupo) => void
}) {
  return (
    <div>
      {/* `capitalize` do Tailwind maiusculiza TODA palavra ("Terça-Feira, 15 De Setembro").
          `first-letter` pega só a primeira, que é o que o português pede. */}
      <h2 className="text-sm font-semibold text-[var(--surface-600)] mb-3 first-letter:uppercase">
        {diaExtenso(dataLocal(dia))}
      </h2>

      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--surface-200)] p-8 text-center">
          <MessageCircle className="h-7 w-7 mx-auto mb-2 text-[var(--surface-300)]" />
          <p className="text-sm text-[var(--surface-400)]">Nenhum encaminhamento neste dia.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden divide-y divide-[var(--surface-200)]">
          {grupos.map(g => {
            const st = STATUS_ENC[g.status] || { rotulo: g.status, classe: 'bg-[var(--surface-100)] text-[var(--surface-500)] border-[var(--surface-200)]' }
            const cor = UNIT_COLORS[g.codigo_unidade] || '#6366f1'
            return (
              <button
                key={g.id}
                onClick={() => onAbrir(g)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--surface-50)] transition-colors"
              >
                {/* Avatar do grupo — a cor da unidade é o rosto do grupo */}
                <span
                  className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: cor, color: textoSobreUnidade(g.codigo_unidade) }}
                >
                  {g.codigo_unidade}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--surface-700)] truncate">
                      {g.unidade_nome}
                      {g.codigo_unidade === unidadeAtualCodigo && (
                        <span className="ml-1.5 text-[10px] font-medium text-[var(--surface-400)]">(sua unidade)</span>
                      )}
                    </span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${st.classe}`}>
                      {st.rotulo}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--surface-400)] mt-0.5">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="font-mono font-semibold text-[var(--surface-500)]">{g.numero}</span>
                    <span>·</span>
                    <span>{g.quantidade_pets} {g.quantidade_pets === 1 ? 'ficha' : 'fichas'}</span>
                    <span>·</span>
                    <span className="font-mono">{fmtPeso(g.peso_total)}</span>
                    {g.responsavel && (
                      <>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline truncate">{g.responsavel}</span>
                      </>
                    )}
                  </span>
                </span>

                <ChevronRight className="h-4 w-4 text-[var(--surface-300)] shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================
// A conversa do grupo
// ============================================
function Conversa({ grupo, fichas, carregando, escalaMini, onVoltar, onAmpliar }: {
  grupo: EncGrupo
  fichas: FichaMsg[]
  carregando: boolean
  escalaMini: number
  onVoltar: () => void
  onAmpliar: (f: FichaMsg) => void
}) {
  const cor = UNIT_COLORS[grupo.codigo_unidade] || '#6366f1'
  const st = STATUS_ENC[grupo.status] || { rotulo: grupo.status, classe: 'bg-[var(--surface-100)] text-[var(--surface-500)] border-[var(--surface-200)]' }
  // Só a largura é previsível — a altura da ficha varia com o conteúdo. Serve pra alinhar a
  // legenda embaixo da miniatura.
  const miniW = Math.round(FICHA_W * escalaMini)

  return (
    // Coluna estreita de propósito: a conversa é uma janela de chat, não uma tabela. Num
    // monitor de 1500px o balão de 200px ficava perdido num campo vazio de 1300px.
    <div className="max-w-2xl rounded-xl border border-[var(--surface-200)] overflow-hidden">
      {/* ---- Cabeçalho do grupo (a barra de cima da conversa) ---- */}
      <div className="flex items-center gap-3 p-3 bg-[var(--surface-100)] border-b border-[var(--surface-200)]">
        <button
          onClick={onVoltar}
          className="shrink-0 p-1.5 -ml-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-200)] transition-colors"
          title="Voltar para os grupos do dia"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span
          className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: cor, color: textoSobreUnidade(grupo.codigo_unidade) }}
        >
          {grupo.codigo_unidade}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--surface-700)] truncate">{grupo.unidade_nome}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${st.classe}`}>
              {st.rotulo}
            </span>
          </div>
          <div className="text-xs text-[var(--surface-400)] truncate">
            <span className="font-mono font-semibold">{grupo.numero}</span>
            {' · '}{grupo.quantidade_pets} {grupo.quantidade_pets === 1 ? 'ficha' : 'fichas'}
            {' · '}<span className="font-mono">{fmtPeso(grupo.peso_total)}</span>
            {grupo.responsavel && ` · ${grupo.responsavel}`}
          </div>
        </div>
      </div>

      {/* ---- Corpo da conversa ---- */}
      <div className="p-3 sm:p-4 bg-[var(--surface-50)] space-y-4">
        {/* Divisor de data, igual ao do zap */}
        <div className="flex justify-center">
          <span className="px-2.5 py-1 rounded-md bg-[var(--surface-100)] border border-[var(--surface-200)] text-[10px] font-medium uppercase tracking-wide text-[var(--surface-400)] capitalize">
            {diaExtenso(grupo.data)}
          </span>
        </div>

        {carregando ? (
          <div className="text-sm text-[var(--surface-400)] py-8 text-center">Carregando as fichas…</div>
        ) : fichas.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="h-7 w-7 mx-auto mb-2 text-[var(--surface-300)]" />
            <p className="text-sm text-[var(--surface-400)]">
              Este encaminhamento ainda não tem nenhum pet vinculado.
            </p>
            <p className="text-xs text-[var(--surface-400)] mt-1">
              Os pets entram arrastando no Pipeline, na etapa Ativo.
            </p>
          </div>
        ) : (
          fichas.map(f => {
            const Icone = especieIcon(f.especie)
            const linkZap = linkChatDireto(f.telefone)
            return (
              <div key={f.contratoId} className="space-y-1.5">
                {/* ===== Mensagem 1: a foto da ficha ===== */}
                <div className="flex">
                  <div className="max-w-[85%] rounded-lg rounded-tl-none bg-[var(--surface-100)] border border-[var(--surface-200)] p-1.5 shadow-sm">
                    <button
                      onClick={() => onAmpliar(f)}
                      className="block relative rounded overflow-hidden group"
                      title="Ver a ficha inteira"
                    >
                      {/* A miniatura É a ficha-documento em escala. Ver a nota do topo. */}
                      <FichaEscalada ficha={f.ficha} escala={escalaMini} />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </button>
                    <div className="flex items-center gap-1.5 px-1 pt-1.5 pb-0.5" style={{ maxWidth: miniW }}>
                      <Icone className="h-3.5 w-3.5 text-[var(--surface-400)] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--surface-700)] truncate">{f.petNome}</span>
                      {f.lacre && (
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--surface-400)]">
                          #{f.lacre}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1 px-1 pb-0.5">
                      {/* 🔴 IND = verde, COL = roxo — padrão de cor do produto. As classes são
                          as MESMAS do `chipsTipo` do pipeline (`contratos/page.tsx`), não
                          equivalentes: só elas têm remap no `[data-theme="white"]`, e o chip
                          precisa ler nos 4 temas. Eu tinha posto IND violeta / COL azul. */}
                      {f.tipoCremacao && (
                        <span className={`mr-auto px-1 rounded text-[9px] font-bold ${f.tipoCremacao === 'individual' ? 'bg-emerald-900/30 text-emerald-300' : 'bg-violet-900/30 text-violet-300'}`}>
                          {f.tipoCremacao === 'individual' ? 'IND' : 'COL'}
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--surface-400)] font-mono">{f.hora}</span>
                      <CheckCheck className="h-3 w-3 text-sky-400" />
                    </div>
                  </div>
                </div>

                {/* ===== Mensagem 2: o contato do tutor anexado ===== */}
                {/* É o contato que a unidade manda logo depois da foto, pra Matriz salvar na
                    agenda e ligar. O nome é o MESMO que o botão "copiar nome para agenda"
                    do detalhe do contrato gera (`lib/nome-agenda.ts`). */}
                <div className="flex">
                  <div className="max-w-[85%] w-full sm:w-auto sm:min-w-[260px] rounded-lg rounded-tl-none bg-[var(--surface-100)] border border-[var(--surface-200)] shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2.5 p-2.5">
                      <span className="shrink-0 h-9 w-9 rounded-full bg-[var(--surface-300)] text-[var(--surface-700)] flex items-center justify-center text-xs font-bold">
                        {iniciais(f.tutorNome || f.petNome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-[var(--surface-700)] break-words">
                          {f.nomeAgenda}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--surface-400)] mt-0.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{fmtTelefone(f.telefone) || 'sem telefone'}</span>
                        </span>
                      </span>
                    </div>
                    {linkZap ? (
                      <a
                        href={linkZap}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full py-2 border-t border-[var(--surface-200)] text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Conversar
                      </a>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5 w-full py-2 border-t border-[var(--surface-200)] text-xs text-[var(--surface-400)]">
                        Sem telefone cadastrado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
