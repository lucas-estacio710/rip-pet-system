'use client'

import { useState, useEffect, Fragment } from 'react'
import { X, Loader2, Check, Phone, Calendar, Flame, Package, Award, ChevronDown, MessageSquare, FileDown, Eye } from 'lucide-react'
import ObservacoesCard from '@/components/contratos/ObservacoesCard'
import CertificadoModal from '@/components/contratos/modals/CertificadoModal'
import { createClient } from '@/lib/supabase/client'
import { gerarCertificadoPDF, certificadoFilename } from '@/lib/certificado-pdf'
import { linkAgendamentoDespedida, linkChatDireto } from '@/lib/whatsapp-msg'
import { isoParaInputLocal, inputLocalParaIso } from '@/lib/date-local'

type GCData = {
  id?: string
  contrato_id: string
  etapa: string
  contato_status: string | null
  lacre_conferido?: boolean | null
  recebido_por?: string | null
  data_recebimento?: string | null
  acompanhamento_confirmado?: string | null
  contato_tutor_em?: string | null
  contato_tutor_obs?: string | null
  data_agendamento?: string | null
  data_cremacao?: string | null
  cremacao_por?: string | null
  cinzas_prontas?: boolean
  certificado_pronto?: boolean
  data_disponivel?: string | null
  observacoes_unidade?: string | null
}

type Props = {
  contratoId: string
  contratoCodigo?: string
  petNome: string
  tipoCremacao: string
  petEspecie?: string | null
  petPeso?: number | null
  petRaca?: string | null
  petGenero?: string | null
  petCor?: string | null
  numeroLacre?: string | null
  tutorNome?: string | null
  tutorTelefone?: string | null
  /** Os 7 slots brutos do certificado (null para vazios). */
  certificadoNomesRaw?: (string | null)[]
  certificadoConfirmado?: boolean
  /** Callback chamado quando o usuário salva os nomes do certificado no modal interno.
   *  Também recebe `petDados` quando o usuário editou os dados do pet no mesmo modal. */
  onCertificadoSaved?: (
    nomes: (string | null)[],
    confirmado: boolean,
    petDados?: { pet_nome: string; pet_especie: string | null; pet_raca: string | null; pet_genero: string | null }
  ) => void
  supindaStatus?: string | null
  gcAtual: GCData | null
  onClose: () => void
  onSaved: (gcAtualizado?: Record<string, unknown>) => void | Promise<void>
}

const ETAPA_STEPS = [
  { key: 'provisionado', label: 'Provisionado', color: '#64748b' },
  { key: 'recebido', label: 'Recebido', color: '#3b82f6' },
  { key: 'cremado', label: 'Cremado', color: '#eab308' },
  { key: 'disponivel', label: 'Finalizado', color: '#22c55e' },
]

const CONTATO_STEPS = [
  { key: null, label: 'Chamar', color: '#a7f3d0' },
  { key: 'contatado', label: 'Contatado', color: '#a7f3d0' },
  { key: 'agendado', label: 'Agendado', color: '#1a73e8' },
]

export default function GCAcaoModal({ contratoId, contratoCodigo, petNome, tipoCremacao, petEspecie, petPeso, petRaca, petGenero, petCor, numeroLacre, tutorNome, tutorTelefone, certificadoNomesRaw, certificadoConfirmado, onCertificadoSaved, supindaStatus, gcAtual, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [salvando, setSalvando] = useState(false)
  const [gc, setGc] = useState<GCData>(
    gcAtual || { contrato_id: contratoId, etapa: 'provisionado', contato_status: null, cinzas_prontas: false, certificado_pronto: false }
  )
  // Modal de edição dos nomes do certificado (mesmo componente do pipeline)
  const [certModalOpen, setCertModalOpen] = useState(false)
  // Cópia local dos nomes (atualiza ao salvar via modal pra refletir na badge sem precisar recarregar)
  const [certNomes, setCertNomes] = useState<(string | null)[]>(certificadoNomesRaw || [])
  const [certConfirmado, setCertConfirmado] = useState<boolean>(!!certificadoConfirmado)
  // NÃO ressincronizar com as props em updates. /gc/page.tsx regenera o array certificadoNomesRaw
  // (nova ref) ao chamar setAcaoModal no callback de save da prévia, mas SEM incluir os nomes
  // novos — o que zerava certNomes e bloqueava "Gerar Certificado". O onSuccess do CertificadoModal
  // já chama setCertNomes/setCertConfirmado localmente; o useState acima cobre o mount.
  const certNomesPreenchidos = certNomes.filter(n => n && n.trim()).length

  // Dados editáveis do pet (espelham as props mas podem ser atualizados pelo CertificadoModal)
  const [dadosPet, setDadosPet] = useState({
    pet_nome: petNome,
    pet_especie: petEspecie || null,
    pet_raca: petRaca || null,
    pet_genero: petGenero || null,
  })
  useEffect(() => {
    setDadosPet({
      pet_nome: petNome,
      pet_especie: petEspecie || null,
      pet_raca: petRaca || null,
      pet_genero: petGenero || null,
    })
  }, [petNome, petEspecie, petRaca, petGenero])

  // Gera o certificado (.pdf) client-side via pdf-lib
  async function gerarCertificado() {
    if (!gc.data_cremacao) {
      alert('Marque a data de cremação antes de gerar o certificado.')
      return
    }
    if (certNomesPreenchidos === 0) {
      alert('Defina os nomes do certificado primeiro (botão 🏅 no topo).')
      return
    }
    if (!certConfirmado) {
      alert('Confirme a prévia do certificado antes de gerar o PDF.')
      return
    }
    try {
      const blob = await gerarCertificadoPDF({
        codigo: contratoCodigo || '',
        petNome: dadosPet.pet_nome,
        petEspecie: dadosPet.pet_especie,
        petRaca: dadosPet.pet_raca,
        petGenero: dadosPet.pet_genero,
        nomes: certNomes,
        dataCremacao: gc.data_cremacao,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = certificadoFilename(contratoCodigo || contratoId, dadosPet.pet_nome)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      if (!gc.certificado_pronto) mudar({ certificado_pronto: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      alert('Falha ao gerar certificado: ' + msg)
    }
  }

  // NÃO ressincronizar `gc` a partir de `gcAtual` em updates de prop. O modal só monta uma vez
  // por sessão de edição; ressincronizar atropelava edições não-salvas quando ações externas
  // (ex: salvar CertificadoModal) atualizavam `acaoModal.gc` no /gc/page.tsx. O useState acima
  // já inicializa com `gcAtual` no mount, que é o único momento que precisa.

  const etapa = gc.etapa
  const contato = gc.contato_status
  const etapaIdx = ETAPA_STEPS.findIndex(s => s.key === etapa)
  const contatoIdx = CONTATO_STEPS.findIndex(s => s.key === contato)
  const isInd = tipoCremacao === 'individual'

  // Regras de bloqueio
  // "Ida finalizada" e "finalizada" liberam "Confirmar Recebimento":
  // após a migration 082, o status do encaminhamento é quebrado em ida/volta.
  const encFinalizado = supindaStatus === 'ida_finalizada' || supindaStatus === 'finalizada'
  const podeReceber = etapa === 'provisionado' && encFinalizado
  const [erro, setErro] = useState('')
  const [dirty, setDirty] = useState(false)
  const [agendarAberto, setAgendarAberto] = useState(false)
  const [obsAberto, setObsAberto] = useState(false)
  const [obsCount, setObsCount] = useState(0)
  const [obsTemImportante, setObsTemImportante] = useState(false)
  // Confirmação de data/hora ao avançar etapas (Contato / Receber / Cremar / Finalizar).
  // Quando aberto, troca o botão de ação por um mini-form com datetime-local pré-preenchido.
  const [confirmando, setConfirmando] = useState<null | 'contato' | 'recebido' | 'cremado' | 'disponivel'>(null)
  const [confirmData, setConfirmData] = useState<string>('')

  useEffect(() => {
    supabase.from('tarefas').select('id, importante, resolvido').eq('contrato_id', contratoId).then(({ data }) => {
      const tarefas = data || []
      setObsCount(tarefas.length)
      setObsTemImportante(tarefas.some((t: { importante: boolean }) => t.importante))
    })
  }, [contratoId, obsAberto])

  const podeContatar = !contato
  const podeAgendar = contato === 'contatado'
  const podeCremar = etapa === 'recebido' && contato === 'agendado'
  const podeDisponibilizar = etapa === 'cremado'

  function mudar(updates: Partial<GCData>) {
    setGc(prev => ({ ...prev, ...updates }))
    setDirty(true)
    setErro('')
  }

  // "DD/MM HH:mm" — formato compacto pra exibir abaixo dos passos da trilha
  function fmtDataTrilha(iso: string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Mapa step.key → data registrada (para mostrar embaixo do label na trilha)
  const dataPorStepContato: Record<string, string | null | undefined> = {
    contatado: gc.contato_tutor_em,
    agendado: gc.data_agendamento,
  }
  const dataPorStepEtapa: Record<string, string | null | undefined> = {
    recebido: gc.data_recebimento,
    cremado: gc.data_cremacao,
    disponivel: gc.data_disponivel,
  }

  function abrirConfirmacao(qual: 'contato' | 'recebido' | 'cremado' | 'disponivel') {
    setConfirmando(qual)
    // Cremação: sugere a data/hora do agendamento (cenário mais comum). Demais: now().
    const sugestao = qual === 'cremado' && gc.data_agendamento
      ? new Date(gc.data_agendamento)
      : new Date()
    setConfirmData(isoParaInputLocal(sugestao.toISOString()))
  }

  function confirmarTransicao() {
    if (!confirmData) return
    const iso = new Date(confirmData).toISOString()
    if (confirmando === 'contato') mudar({ contato_status: 'contatado', contato_tutor_em: iso })
    else if (confirmando === 'recebido') mudar({ etapa: 'recebido', data_recebimento: iso })
    else if (confirmando === 'cremado') mudar({ etapa: 'cremado', data_cremacao: iso })
    else if (confirmando === 'disponivel') mudar({ etapa: 'disponivel', data_disponivel: iso })
    setConfirmando(null)
  }

  // Painel inline de confirmação: pergunta + datetime-local + Agora/Cancelar/Confirmar.
  // Substitui o botão de ação enquanto a transição está sendo confirmada.
  function renderConfirmacao(borderCls: string, btnCls: string, pergunta: string) {
    return (
      <div className={`rounded-xl border-2 ${borderCls} p-3 space-y-2`}>
        <p className="text-xs font-semibold text-[var(--shell-text)]">{pergunta}</p>
        <input
          type="datetime-local"
          value={confirmData}
          onChange={e => setConfirmData(e.target.value)}
          className="input w-full text-sm py-1.5"
        />
        <div className="flex gap-2">
          <button onClick={() => setConfirmData(isoParaInputLocal(new Date().toISOString()))} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium text-[var(--surface-500)] border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors" title="Preencher com agora">↻ Agora</button>
          <button onClick={() => setConfirmando(null)} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium text-[var(--surface-500)] border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors">Cancelar</button>
          <button onClick={confirmarTransicao} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white ${btnCls} transition-colors`}>Confirmar</button>
        </div>
      </div>
    )
  }

  async function salvarTudo() {
    setSalvando(true)
    setErro('')
    try {
      const payload: Record<string, unknown> = {
        etapa: gc.etapa,
        contato_status: gc.contato_status || null,
        data_recebimento: gc.data_recebimento || null,
        lacre_conferido: gc.lacre_conferido ?? false,
        contato_tutor_em: gc.contato_tutor_em || null,
        contato_tutor_obs: gc.contato_tutor_obs || null,
        data_agendamento: gc.data_agendamento || null,
        acompanhamento_confirmado: gc.acompanhamento_confirmado || null,
        data_cremacao: gc.data_cremacao || null,
        cremacao_por: gc.cremacao_por || null,
        cinzas_prontas: !!gc.cinzas_prontas,
        certificado_pronto: !!gc.certificado_pronto,
        data_disponivel: gc.data_disponivel || null,
      }
      const res = await supabase
        .from('contrato_gc')
        .update(payload as never)
        .eq('contrato_id', contratoId)
        .select()

      if (res.error) throw new Error(res.error.message)
      if (!res.data || (res.data as unknown[]).length === 0) throw new Error('Permissão negada — RLS bloqueou update')

      if (gc.data_cremacao) {
        await supabase.from('contratos').update({ data_cremacao: gc.data_cremacao.slice(0, 10) } as never).eq('id', contratoId)
      }

      setDirty(false)
      await onSaved(payload)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      setErro(`Erro ao salvar: ${msg}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface-0)] rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-[var(--surface-200)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between border-b border-[var(--surface-200)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {numeroLacre && <span className="text-sm font-mono font-bold text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded">{numeroLacre}</span>}
              <h3 className="text-base font-bold text-[var(--shell-text)]">{dadosPet.pet_nome}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isInd ? 'bg-emerald-900/30 text-emerald-400' : 'bg-purple-900/30 text-purple-400'}`}>
                {isInd ? 'IND' : 'COL'}
              </span>
              {dadosPet.pet_especie && <span className="text-[10px] text-[var(--surface-400)]">{dadosPet.pet_especie}</span>}
              {dadosPet.pet_raca && <span className="text-[10px] text-[var(--surface-400)]">· {dadosPet.pet_raca}</span>}
              {petCor && <span className="text-[10px] text-[var(--surface-400)]">· {petCor}</span>}
              {petPeso != null && <span className="text-[10px] text-[var(--surface-400)]">· {petPeso}kg</span>}
            </div>
            {tutorNome && (
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--surface-500)] truncate flex-1">{tutorNome}</p>
                  {tutorTelefone && (
                    <div className="hidden md:flex items-center gap-1 shrink-0">
                      <a href={linkAgendamentoDespedida({ telefone: tutorTelefone, tutorNome, petNome: dadosPet.pet_nome, petGenero: dadosPet.pet_genero })} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold text-white hover:opacity-90 transition-opacity" style={{ background: '#25D366' }}
                        title="Enviar mensagem de agendamento da despedida">
                        <Phone className="h-3 w-3" />
                        Chamar no WhatsApp
                      </a>
                      <a href={linkChatDireto(tutorTelefone)} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold text-white hover:opacity-90 transition-opacity" style={{ background: '#128C7E' }}
                        title="Abrir conversa direta no WhatsApp (sem mensagem pré-preenchida)">
                        Abrir Conversa
                      </a>
                    </div>
                  )}
                </div>
                {tutorTelefone && (
                  <div className="md:hidden flex items-center gap-1 mt-1">
                    <a href={linkAgendamentoDespedida({ telefone: tutorTelefone, tutorNome, petNome: dadosPet.pet_nome, petGenero: dadosPet.pet_genero })} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold text-white hover:opacity-90 transition-opacity" style={{ background: '#25D366' }}>
                      <Phone className="h-3 w-3" />
                      Chamar no WhatsApp
                    </a>
                    <a href={linkChatDireto(tutorTelefone)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold text-white hover:opacity-90 transition-opacity" style={{ background: '#128C7E' }}>
                      Abrir Conversa
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => setCertModalOpen(true)}
              className="relative p-1.5 rounded-lg text-[var(--surface-400)] hover:text-amber-400 hover:bg-amber-900/10 transition-colors"
              title="Certificado de Cremação — ver/editar nomes"
            >
              <Award className="h-5 w-5" />
              {certNomesPreenchidos > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold text-white ${certConfirmado ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                  {certNomesPreenchidos}
                </span>
              )}
            </button>
            <button
              onClick={gerarCertificado}
              disabled={!gc.data_cremacao || !certConfirmado}
              className={`relative p-1.5 rounded-lg transition-colors ${gc.data_cremacao && certConfirmado ? 'text-[var(--surface-400)] hover:text-emerald-400 hover:bg-emerald-900/10' : 'text-[var(--surface-300)] opacity-40 cursor-not-allowed'}`}
              title={!gc.data_cremacao ? 'Disponível após registrar a data de cremação' : !certConfirmado ? 'Confirme a prévia do certificado primeiro' : 'Baixar Certificado de Cremação (.pdf)'}
            >
              <FileDown className="h-5 w-5" />
              {gc.certificado_pronto && gc.data_cremacao && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-1 ring-slate-800" />
              )}
            </button>
            <button onClick={() => setObsAberto(true)} className={`relative p-1.5 rounded-lg transition-colors ${obsTemImportante ? 'text-red-400 bg-red-900/20 animate-pulse' : 'text-[var(--surface-400)] hover:text-amber-400 hover:bg-amber-900/10'}`} title="Observações">
              <MessageSquare className="h-5 w-5" />
              {obsCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold text-white ${obsTemImportante ? 'bg-red-500' : 'bg-amber-500'}`}>
                  {obsCount}
                </span>
              )}
            </button>
            <button onClick={onClose} className="text-[var(--surface-400)] hover:text-[var(--shell-text)]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="md:flex md:items-stretch">
        {/* === SEÇÃO 1: AGENDAMENTO (trilha + ações) — some após cremação === */}
        {etapa !== 'cremado' && etapa !== 'disponivel' && <div className="md:flex-1 md:min-w-0 px-5 py-4 space-y-3 border-b md:border-b-0 md:border-r border-[var(--surface-200)]">
          <div>
            <p className="text-[10px] font-bold text-[var(--surface-400)] uppercase tracking-wider mb-2 text-center">Agendamento</p>
            <div className="flex items-center justify-center">
              {CONTATO_STEPS.map((step, i) => {
                const ativo = i <= contatoIdx
                const atual = step.key === contato
                const isAgendado = step.key === 'agendado'
                const textColor = isAgendado && ativo ? '#1a73e8' : ativo ? '#065f46' : 'var(--surface-400)'
                const bgColor = ativo ? step.color : 'var(--surface-200)'
                const dotTextColor = isAgendado && ativo ? '#fff' : ativo ? '#065f46' : 'var(--surface-400)'
                return (
                  <Fragment key={step.key || 'null'}>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold transition-all ${atual ? 'ring-2 ring-offset-2' : ''}`}
                        style={{ background: bgColor, color: dotTextColor, outlineColor: atual ? step.color : 'transparent' }}
                      >
                        {ativo ? '✓' : i + 1}
                      </div>
                      <span className="text-[9px] font-medium" style={{ color: textColor }}>{step.label}</span>
                      {step.key && dataPorStepContato[step.key] && (
                        <span className="text-[8px] font-mono text-[var(--surface-400)] leading-tight">{fmtDataTrilha(dataPorStepContato[step.key])}</span>
                      )}
                    </div>
                    {i < CONTATO_STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 mx-1" style={{ background: i < contatoIdx ? CONTATO_STEPS[i + 1].color : 'var(--surface-200)' }} />
                    )}
                  </Fragment>
                )
              })}
            </div>
          </div>

          {/* Ação: Contatar */}
          {podeContatar && (
            confirmando === 'contato'
              ? renderConfirmacao('border-amber-500/30', 'bg-amber-600 hover:bg-amber-700', 'Quando o contato foi feito?')
              : (
                <button onClick={() => abrirConfirmacao('contato')} disabled={salvando}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-amber-500/30 hover:bg-amber-900/10 transition-colors disabled:opacity-50">
                  <Phone className="h-5 w-5 text-amber-400" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--shell-text)]">Registrar Contato</p>
                    <p className="text-[10px] text-[var(--surface-400)]">Saudação já enviada para o tutor. Aguardar agendamento</p>
                  </div>
                </button>
              )
          )}

          {/* Ação: Agendar (colapsável) */}
          {podeAgendar && (
            <div className="rounded-xl border-2 border-emerald-500/30 overflow-hidden">
              <button
                onClick={() => setAgendarAberto(prev => !prev)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-emerald-900/5 transition-colors"
              >
                <Calendar className="h-5 w-5 text-emerald-400" />
                <p className="text-sm font-semibold text-[var(--shell-text)] flex-1 text-left">Agendar Cremação</p>
                <ChevronDown className={`h-4 w-4 text-[var(--surface-400)] transition-transform duration-200 ${agendarAberto ? 'rotate-180' : ''}`} />
              </button>
              <div className={`transition-all duration-200 ease-out overflow-hidden ${agendarAberto ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 pb-3 pt-1 space-y-1.5">
                  <div>
                    <label className="text-[9px] font-medium text-[var(--surface-500)] mb-0.5 block">Data e hora</label>
                    <input type="datetime-local" value={isoParaInputLocal(gc.data_agendamento)}
                      onChange={e => setGc({ ...gc, data_agendamento: inputLocalParaIso(e.target.value) })}
                      className="input text-xs w-full py-1" />
                  </div>
                  <div>
                    <label className="text-[9px] font-medium text-[var(--surface-500)] mb-0.5 block">Acompanhamento</label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { v: 'video_chamada', l: '📹 Chamada' },
                        { v: 'video_gravado', l: '🎥 Gravado' },
                        { v: 'presencial', l: '👥 Presencial' },
                        { v: 'nao_deseja', l: '❌ Não' },
                      ].map(o => (
                        <button key={o.v} onClick={() => setGc({ ...gc, acompanhamento_confirmado: o.v })}
                          className={`px-1 py-1 rounded text-[9px] font-medium border transition-colors ${gc.acompanhamento_confirmado === o.v ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' : 'border-[var(--surface-200)] text-[var(--surface-400)]'}`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => {
                    if (!gc.data_agendamento) { setErro('Preencha data e hora'); return }
                    if (!gc.acompanhamento_confirmado) { setErro('Selecione acompanhamento'); return }
                    mudar({ contato_status: 'agendado' }); setAgendarAberto(false)
                  }}
                    className="w-full py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                    Confirmar Agendamento
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Agendamento concluído — resumo + reagendar */}
          {contato === 'agendado' && gc.data_agendamento && !agendarAberto && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Calendar className="h-4 w-4" />
                <span>{new Date(gc.data_agendamento).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                {gc.acompanhamento_confirmado && <span>· {gc.acompanhamento_confirmado.replace(/_/g, ' ')}</span>}
              </div>
              <button onClick={() => setAgendarAberto(true)} className="text-[10px] text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Reagendar
              </button>
            </div>
          )}
          {/* Form reagendar (reusa o mesmo accordion) */}
          {contato === 'agendado' && agendarAberto && (
            <div className="rounded-xl border-2 border-blue-500/30 overflow-hidden">
              <div className="px-4 pb-3 pt-2 space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-[var(--shell-text)]">Reagendar</p>
                  <button onClick={() => setAgendarAberto(false)} className="text-[10px] text-[var(--surface-400)]">Fechar</button>
                </div>
                <div>
                  <label className="text-[9px] font-medium text-[var(--surface-500)] mb-0.5 block">Data e hora</label>
                  <input type="datetime-local" value={isoParaInputLocal(gc.data_agendamento)}
                    onChange={e => setGc({ ...gc, data_agendamento: inputLocalParaIso(e.target.value) })}
                    className="input text-xs w-full py-1" />
                </div>
                <div>
                  <label className="text-[9px] font-medium text-[var(--surface-500)] mb-0.5 block">Acompanhamento</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { v: 'video_chamada', l: '📹 Chamada' },
                      { v: 'video_gravado', l: '🎥 Gravado' },
                      { v: 'presencial', l: '👥 Presencial' },
                      { v: 'nao_deseja', l: '❌ Não' },
                    ].map(o => (
                      <button key={o.v} onClick={() => setGc({ ...gc, acompanhamento_confirmado: o.v })}
                        className={`px-1 py-1 rounded text-[9px] font-medium border transition-colors ${gc.acompanhamento_confirmado === o.v ? 'border-blue-500 bg-blue-900/20 text-blue-400' : 'border-[var(--surface-200)] text-[var(--surface-400)]'}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => { mudar({}); setAgendarAberto(false) }}
                  className="w-full py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors">
                  Confirmar Alteração
                </button>
              </div>
            </div>
          )}
        </div>}

        {/* === SEÇÃO 2: CREMAÇÃO (trilha + ações) === */}
        <div className="md:flex-1 md:min-w-0 px-5 py-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-[var(--surface-400)] uppercase tracking-wider mb-2 text-center">Cremação</p>
            <div className="flex items-center justify-center">
              {ETAPA_STEPS.map((step, i) => {
                const ativo = i <= etapaIdx
                const atual = step.key === etapa
                return (
                  <Fragment key={step.key}>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold transition-all ${atual ? 'ring-2 ring-offset-2' : ''}`}
                        style={{ background: ativo ? step.color : 'var(--surface-200)', color: ativo ? '#fff' : 'var(--surface-400)', outlineColor: atual ? step.color : 'transparent' }}
                      >
                        {ativo ? '✓' : i + 1}
                      </div>
                      <span className="text-[9px] font-medium" style={{ color: ativo ? step.color : 'var(--surface-400)' }}>{step.label}</span>
                      {dataPorStepEtapa[step.key] && (
                        <span className="text-[8px] font-mono text-[var(--surface-400)] leading-tight">{fmtDataTrilha(dataPorStepEtapa[step.key])}</span>
                      )}
                    </div>
                    {i < ETAPA_STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 mx-1" style={{ background: i < etapaIdx ? ETAPA_STEPS[i + 1].color : 'var(--surface-200)' }} />
                    )}
                  </Fragment>
                )
              })}
            </div>
          </div>

          {/* Ação: Receber */}
          {etapa === 'provisionado' && !encFinalizado && (
            <p className="text-[10px] text-amber-400 text-center italic">
              Aguardando encaminhamento ser finalizado para confirmar recebimento
            </p>
          )}
          {podeReceber && (
            confirmando === 'recebido'
              ? renderConfirmacao('border-purple-500/30', 'bg-purple-600 hover:bg-purple-700', 'Quando o pet chegou em Pinda?')
              : (
                <button onClick={() => abrirConfirmacao('recebido')} disabled={salvando}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-purple-500/30 hover:bg-purple-900/10 transition-colors disabled:opacity-50">
                  <Check className="h-5 w-5 text-purple-400" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--shell-text)]">Confirmar Recebimento</p>
                    <p className="text-[10px] text-[var(--surface-400)]">Pet chegou em Pinda</p>
                  </div>
                </button>
              )
          )}

          {/* Ação: Cremar */}
          {podeCremar && (
            confirmando === 'cremado'
              ? renderConfirmacao('border-red-500/30', 'bg-red-600 hover:bg-red-700', 'Quando a cremação foi realizada?')
              : (
                <button onClick={() => abrirConfirmacao('cremado')} disabled={salvando}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-red-500/30 hover:bg-red-900/10 transition-colors disabled:opacity-50">
                  <Flame className="h-5 w-5 text-red-400" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--shell-text)]">Registrar Cremação</p>
                    <p className="text-[10px] text-[var(--surface-400)]">Cremação foi realizada</p>
                  </div>
                </button>
              )
          )}

          {/* Info bloqueio */}
          {etapa === 'recebido' && contato !== 'agendado' && (
            <p className="text-[10px] text-amber-400 text-center italic">
              Aguardando agendamento para liberar cremação
            </p>
          )}
          {etapa === 'provisionado' && contato === 'agendado' && encFinalizado && (
            <p className="text-[10px] text-purple-400 text-center italic">
              Aguardando recebimento do pet para liberar cremação
            </p>
          )}

          {/* Ação: Disponibilizar */}
          {podeDisponibilizar && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-[var(--surface-400)] uppercase tracking-wider">Disponibilizar para retorno</p>
              {isInd && (
                <button onClick={() => mudar({ cinzas_prontas: !gc.cinzas_prontas })}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${gc.cinzas_prontas ? 'border-emerald-500 bg-emerald-900/10' : 'border-[var(--surface-200)] hover:bg-[var(--surface-50)]'}`}>
                  <Package className={`h-5 w-5 ${gc.cinzas_prontas ? 'text-emerald-400' : 'text-[var(--surface-400)]'}`} />
                  <span className={`text-sm font-semibold ${gc.cinzas_prontas ? 'text-emerald-400' : 'text-[var(--shell-text)]'}`}>
                    Cinzas {gc.cinzas_prontas ? '✓' : 'no nicho'}
                  </span>
                </button>
              )}
              <button
                onClick={() => setCertModalOpen(true)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${certConfirmado ? 'border-emerald-500 bg-emerald-900/10' : 'border-amber-500/40 hover:bg-amber-900/10'}`}>
                <Eye className={`h-5 w-5 ${certConfirmado ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className={`text-sm font-semibold ${certConfirmado ? 'text-emerald-400' : 'text-[var(--shell-text)]'}`}>
                  {certConfirmado ? 'Prévia ✓ (rever)' : 'Prévia do Certificado'}
                </span>
              </button>
              <button
                onClick={gerarCertificado}
                disabled={!certConfirmado}
                title={!certConfirmado ? 'Confirme a prévia do certificado primeiro' : ''}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${
                  !certConfirmado
                    ? 'border-[var(--surface-200)] opacity-50 cursor-not-allowed'
                    : gc.certificado_pronto
                      ? 'border-emerald-500 bg-emerald-900/10'
                      : 'border-[var(--surface-200)] hover:bg-[var(--surface-50)]'
                }`}>
                <Award className={`h-5 w-5 ${gc.certificado_pronto && certConfirmado ? 'text-emerald-400' : 'text-[var(--surface-400)]'}`} />
                <span className={`text-sm font-semibold ${gc.certificado_pronto && certConfirmado ? 'text-emerald-400' : 'text-[var(--shell-text)]'}`}>
                  {gc.certificado_pronto ? 'Certificado ✓ (regerar)' : 'Gerar Certificado'}
                </span>
              </button>
              {((isInd && gc.cinzas_prontas && gc.certificado_pronto) || (!isInd && gc.certificado_pronto)) && (
                confirmando === 'disponivel'
                  ? renderConfirmacao('border-emerald-500/30', 'bg-emerald-600 hover:bg-emerald-700', 'Quando ficou disponível para retorno?')
                  : (
                    <button onClick={() => abrirConfirmacao('disponivel')}
                      className="w-full py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors mt-1">
                      Marcar como Finalizada
                    </button>
                  )
              )}
            </div>
          )}

          {/* Estado finalizado */}
          {etapa === 'disponivel' && (
            <div className="text-center py-3">
              <p className="text-sm font-semibold text-emerald-400">✅ Disponível para retorno</p>
              <p className="text-[10px] text-[var(--surface-400)] mt-1">
                {gc.cinzas_prontas && 'Cinzas ✓ '}
                {gc.certificado_pronto && 'Certificado ✓'}
              </p>
            </div>
          )}

        </div>
        </div>

        {/* Rodapé global: erro + Cancelar/Salvar (largura total, fora do md:flex) */}
        {(erro || dirty) && (
          <div className="px-5 py-4 border-t border-[var(--surface-200)] space-y-3">
            {erro && (
              <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-xs">
                {erro}
              </div>
            )}
            {dirty && (
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-[var(--surface-500)] border border-[var(--surface-200)] hover:bg-[var(--surface-50)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarTudo}
                  disabled={salvando}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {salvando ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar Alterações'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sub-modal Observações */}
      {obsAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={() => setObsAberto(false)}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <button onClick={() => setObsAberto(false)} className="absolute top-3 right-3 z-10 text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
              <ObservacoesCard contratoId={contratoId} observacoesFicha={null} />
            </div>
          </div>
        </div>
      )}

      {/* Sub-modal Certificado — mesmo do pipeline. Two-way: salva no banco e atualiza local */}
      <CertificadoModal
        isOpen={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        contrato={{
          id: contratoId,
          codigo: contratoCodigo || '',
          pet_nome: dadosPet.pet_nome,
          pet_especie: dadosPet.pet_especie,
          pet_raca: dadosPet.pet_raca,
          pet_genero: dadosPet.pet_genero,
          tutor_nome: tutorNome || '',
          tutor: tutorNome ? { nome: tutorNome } : null,
          certificado_nome_1: certNomes[0] || null,
          certificado_nome_2: certNomes[1] || null,
          certificado_nome_3: certNomes[2] || null,
          certificado_nome_4: certNomes[3] || null,
          certificado_nome_5: certNomes[4] || null,
          certificado_nome_6: certNomes[5] || null,
          certificado_nome_7: certNomes[6] || null,
          certificado_confirmado: certConfirmado,
        }}
        onSuccess={(upd) => {
          const novos = [upd.certificado_nome_1, upd.certificado_nome_2, upd.certificado_nome_3, upd.certificado_nome_4, upd.certificado_nome_5, upd.certificado_nome_6, upd.certificado_nome_7]
          setCertNomes(novos)
          setCertConfirmado(upd.certificado_confirmado)
          // Snapshot atualizado vem em upd.contrato_gc (após migration 081)
          if (upd.contrato_gc) {
            const petDadosNovos = {
              pet_nome: upd.contrato_gc.pet_nome,
              pet_especie: upd.contrato_gc.pet_especie,
              pet_raca: upd.contrato_gc.pet_raca,
              pet_genero: upd.contrato_gc.pet_genero,
            }
            setDadosPet(petDadosNovos)
            onCertificadoSaved?.(novos, upd.certificado_confirmado, petDadosNovos)
          } else {
            onCertificadoSaved?.(novos, upd.certificado_confirmado)
          }
        }}
      />
    </div>
  )
}
