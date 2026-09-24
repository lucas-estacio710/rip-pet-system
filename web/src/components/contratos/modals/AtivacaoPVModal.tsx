'use client'

import { useState, useEffect } from 'react'
import { X, MapPin, Navigation, FileDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { baixarContratoPDF } from '@/lib/contrato-pdf-download'
import FotoProva from '@/components/tarefas/FotoProva'
import type { FotoComprimida } from '@/lib/comprimir-imagem'
import { carregarExigeFoto, enviarFotoTarefa } from '@/lib/foto-tarefa'

// ============================================================================
// AtivacaoPVModal — conclusão da tarefa "Ativar Preventivo" (mig 138).
//
// `AtivarModal` (unidade com cb_operacional) atribui a tarefa E JÁ move o
// contrato pra `ativo`/`pinda` na hora (decisão de 05/09, testando em
// produção — ficar em `preventivo` até a conclusão deixava a tela de
// Preventivos com um vazio sem o card aparecer em lugar nenhum). O contrato
// fica travado com `aguardando_acolhimento=true` enquanto a tarefa não é
// concluída. ESTE modal é quem conclui de verdade: pergunta Lacre + Data/Hora
// (+ Colaborador na posição, se for o caso) — `status` NÃO muda mais aqui,
// só `data_acolhimento`/`numero_lacre`/`aguardando_acolhimento`.
//
// Self-contido de propósito (mesmo padrão de EntregaModal.tsx) — usado em 2
// lugares com a MESMA lógica: o popup de conclusão em /tarefas E o botão
// "Finalizar" no pipeline/detalhe do contrato (pra quem esqueceu de ir na aba
// de Atividades, ou pro gerente/concierge regularizar por quem executou).
// Resolve a tarefa pendente sozinho (por `contrato_id`) — não precisa que o
// chamador já saiba o id da linha em `tarefas_operacionais`.
//
// Fase 2 (TratativaModal/EM): generalizado via `tarefaTipo` pra também concluir
// tarefas `remocao` NOVAS (contrato_id-based, nascidas direto no "Iniciar
// Fluxo" — não confundir com a `remocao` ANTIGA, ficha_id-based, que continua
// concluindo pelo popup genérico de /tarefas). Default `'ativacao_pv'` — zero
// mudança de comportamento pra quem já chamava sem passar essa prop.
// ============================================================================

type ContratoMinimal = {
  id: string
  pet_nome: string
  tutor_nome: string
  unidade_id?: string | null
  tutor?: { nome: string } | null
}

// Info de acolhimento (pet/tutor/local/endereço) que a remoção normal (`tarefas/page.tsx`,
// tipo 'remocao') já mostra antes do formulário — achado faltando aqui (mig 138 nasceu só
// com o formulário de conclusão): quem vai buscar o pet de um preventivo abria a tarefa e
// não tinha nem o endereço, nem Waze/Maps pra chegar lá. Busca à parte (não vem do prop
// `contrato`, que os 3 chamadores passam com formatos diferentes) — mesmo padrão
// "self-contido" do resto do modal.
//
// "Baixar Contrato" (PDF) só aparece pra `tarefaTipo==='remocao'` (fase 2, EM) — o contrato
// acabou de nascer minutos antes, no "Iniciar Fluxo", e esse popup costuma ser a primeira
// vez que alguém baixa o documento pra entregar/assinar com o tutor. Pra `ativacao_pv` (PV)
// não faz sentido: o contrato existe há tempos, o PDF já foi gerado/entregue muito antes da
// ativação — reaproveita `baixarContratoPDF` (mesmo helper de contratos/[id] e do pipeline,
// já resolve ficha/tutor/unidade e decide EM×PV sozinho).
//
// Sem link "Ver Contrato" de propósito: quem mais abre esse popup é Operacional/posição, que
// não tem acesso a `/contratos/[id]` (LayoutWrapper.tsx só deixa esse perfil ver /tarefas) —
// o link nunca funcionaria pra quem mais precisa dele.
type InfoAcolhimento = {
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_peso: number | null
  local_coleta: string | null
  clinica_coleta: string | null
  estab: { nome: string } | null
  // `contratos` NÃO tem tutor_numero/tutor_complemento/tutor_estado como colunas próprias
  // (achado testando: 42703, coluna não existe) — `tutor_endereco` já vem com número e
  // complemento embutidos no texto (ex: "Avenida X, 342 - casa 02").
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  tutor_telefone: string | null
  tutor_telefone_nome: string | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: { id: string; data_acolhimento: string; numero_lacre: string | null; aguardando_acolhimento: false }) => void
  tarefaTipo?: 'ativacao_pv' | 'remocao'
}

export default function AtivacaoPVModal({ isOpen, onClose, contrato, onSuccess, tarefaTipo = 'ativacao_pv' }: Props) {
  const supabase = createClient()
  const { currentUnit, isPosicao, currentRole, isSuperAdmin } = useUnit()
  const rotulo = tarefaTipo === 'ativacao_pv' ? 'Ativação de Preventivo' : 'Acolhimento'
  const concluidoTexto = tarefaTipo === 'ativacao_pv' ? 'concluída' : 'concluído'

  const [tarefaId, setTarefaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])
  const [info, setInfo] = useState<InfoAcolhimento | null>(null)

  const [lacre, setLacre] = useState('')
  const [modoData, setModoData] = useState<'agora' | 'outra'>('agora')
  const [dataHoraManual, setDataHoraManual] = useState('')
  const [executadoPorFuncionarioId, setExecutadoPorFuncionarioId] = useState('')
  const [anotacao, setAnotacao] = useState('')
  // Foto-prova (mig 147). A Ativação de PV é um acolhimento como outro qualquer: o tipo
  // `ativacao_pv` também entra na configuração `tarefas_exige_foto`.
  const [fotoProva, setFotoProva] = useState<FotoComprimida | null>(null)
  const [exigeFotoAqui, setExigeFotoAqui] = useState(false)
  useEffect(() => { carregarExigeFoto(supabase).then(c => setExigeFotoAqui(c['ativacao_pv'] === true)) }, [supabase])
  const podeDispensarFoto = currentRole === 'gerente' || isSuperAdmin
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const tutorNome = contrato.tutor?.nome || contrato.tutor_nome || ''
  const unidadeId = contrato.unidade_id || currentUnit?.id || null

  // Ao abrir: resolve a tarefa pendente (por contrato_id) + carrega funcionários da unidade
  useEffect(() => {
    if (!isOpen) return
    setCarregando(true)
    setErro(null)
    setLacre('')
    setModoData('agora')
    setDataHoraManual('')
    setExecutadoPorFuncionarioId('')
    setAnotacao('')
    setGerandoPdf(false)

    supabase
      .from('tarefas_operacionais')
      .select('id')
      .eq('contrato_id', contrato.id)
      .eq('tipo', tarefaTipo)
      .eq('status', 'pendente')
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        setTarefaId(data?.id || null)
        setCarregando(false)
      })

    if (unidadeId) {
      supabase.from('funcionarios').select('id, nome').eq('unidade_id', unidadeId).eq('ativo', true).order('nome')
        .then(({ data }) => setFuncionarios((data || []) as { id: string; nome: string }[]))
    }

    supabase.from('contratos')
      .select('pet_especie, pet_raca, pet_cor, pet_peso, local_coleta, clinica_coleta, estab:estabelecimentos!estabelecimento_id(nome), tutor_endereco, tutor_bairro, tutor_cidade, tutor_telefone, tutor_telefone_nome')
      .eq('id', contrato.id)
      .maybeSingle()
      .then(({ data }) => setInfo((data as unknown as InfoAcolhimento | null) || null))
  }, [isOpen, contrato.id, unidadeId, tarefaTipo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const podeConcluir = !!lacre.trim() && (modoData === 'agora' || !!dataHoraManual) && (!isPosicao || !!executadoPorFuncionarioId)
    && (!exigeFotoAqui || !!fotoProva || podeDispensarFoto)

  // Onde buscar o pet — mesma lógica da remoção normal (`tarefas/page.tsx`), adaptada pros
  // campos do CONTRATO (aqui não tem ficha/op_dados, o local já foi decidido na atribuição).
  const petDetalhe = info ? [info.pet_especie, info.pet_raca, info.pet_cor, info.pet_peso ? `${info.pet_peso}kg` : null].filter(Boolean).join(' · ') : ''
  let localLabel = ''
  let enderecoNavegavel = ''
  let semTraslado = false
  if (info) {
    const enderecoResidencia = info.tutor_endereco
      ? [info.tutor_endereco, info.tutor_bairro, info.tutor_cidade].filter(Boolean).join(' - ')
      : ''
    if (info.local_coleta === 'Clínica') {
      localLabel = 'Clínica / Hospital'
      enderecoNavegavel = info.estab?.nome || info.clinica_coleta || ''
    } else if (info.local_coleta === 'Outro') {
      localLabel = 'Outro endereço'
      enderecoNavegavel = info.clinica_coleta || ''
    } else if (info.local_coleta === 'Unidade') {
      localLabel = 'Unidade R.I.P. Pet'
      semTraslado = true
    } else {
      localLabel = 'Residência'
      enderecoNavegavel = enderecoResidencia
    }
  }
  const wazeUrl = enderecoNavegavel ? `https://waze.com/ul?q=${encodeURIComponent(enderecoNavegavel)}&navigate=yes` : null
  const gmapsUrl = enderecoNavegavel ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoNavegavel)}` : null

  async function gerarPdf() {
    setGerandoPdf(true)
    setErro(null)
    try {
      await baixarContratoPDF(supabase, contrato.id)
    } catch (err) {
      console.error('Erro ao gerar PDF do contrato:', err)
      setErro(err instanceof Error ? err.message : 'Erro ao gerar PDF do contrato. Tente novamente.')
    } finally {
      setGerandoPdf(false)
    }
  }

  async function concluir() {
    if (!podeConcluir) return
    setSalvando(true)
    setErro(null)

    try {
      // Foto primeiro (mig 147): o trigger `tarefa_exige_foto_ao_concluir` recusa a conclusão
      // da tarefa sem ela, e aqui o contrato é atualizado ANTES da tarefa — falhar no meio
      // deixaria o acolhimento gravado e a tarefa pendente.
      if (fotoProva && tarefaId) await enviarFotoTarefa(supabase, [tarefaId], fotoProva, null)

      const dataHoraIso = modoData === 'agora' ? new Date().toISOString() : new Date(dataHoraManual).toISOString()

      // status já virou 'ativo'/'pinda' na atribuição (AtivarModal.tsx) — não muda mais aqui.
      const { error: errContrato } = await supabase.from('contratos').update({
        data_acolhimento: dataHoraIso,
        numero_lacre: lacre.trim(),
        executado_por_funcionario_id: isPosicao ? (executadoPorFuncionarioId || null) : null,
        aguardando_acolhimento: false,
      } as never).eq('id', contrato.id)
      if (errContrato) throw errContrato

      const { data: { user } } = await supabase.auth.getUser()
      // Quem fez de verdade: se é posição, o colaborador escolhido; senão, o próprio login que
      // está concluindo (não dá pra ler o perfil de OUTRA pessoa aqui — mesma armadilha de RLS
      // resolvida em contratos/[id]/page.tsx — mas o PRÓPRIO perfil sempre pode, por isso não
      // precisa de RPC neste caso). Achado testando: sem isso, a observação e o "por X" no
      // detalhe do contrato ficavam mudos pra qualquer login normal (não-posição).
      let nomeExecutor: string | null = null
      if (isPosicao) {
        nomeExecutor = funcionarios.find(f => f.id === executadoPorFuncionarioId)?.nome || null
      } else if (user?.id) {
        const { data: meuPerfil } = await supabase.from('perfis').select('nome').eq('user_id', user.id).limit(1).maybeSingle() as { data: { nome: string | null } | null }
        nomeExecutor = meuPerfil?.nome || user.email || null
      }
      const sufixoExecutor = nomeExecutor
        ? (isPosicao ? ` (colaborador na posição: ${nomeExecutor})` : ` — por ${nomeExecutor}`)
        : ''

      if (tarefaId) {
        await supabase.from('tarefas_operacionais').update({
          status: 'concluida',
          concluido_em: new Date().toISOString(),
          lacre: lacre.trim(),
          anotacao_conclusao: anotacao.trim() || null,
          executado_por_funcionario_id: isPosicao ? (executadoPorFuncionarioId || null) : null,
        } as never).eq('id', tarefaId)
      }

      await supabase.from('historico_alteracoes').insert({
        entidade: 'contratos',
        entidade_id: contrato.id,
        entidade_nome: contrato.pet_nome,
        campo: 'status',
        campo_label: `${rotulo} ${concluidoTexto}`,
        valor_novo: `Remoção concluída — lacre ${lacre.trim()}${sufixoExecutor}`,
        tipo: 'conclusao',
        alterado_por: user?.id ?? null,
        alterado_por_email: user?.email ?? null,
        nota: anotacao.trim() || null,
      } as never)

      const { data: tipoTarefaObs } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
      await supabase.from('tarefas').insert({
        contrato_id: contrato.id,
        // `unidade_id` é o que faz o badge da observação mostrar a sigla da unidade (ex:
        // "ST") em vez de "??" — achado testando: sem isso, `ObservacoesCard.tsx` não acha
        // `tarefa.unidade` no join e cai no fallback.
        unidade_id: unidadeId,
        descricao: `${rotulo} ${concluidoTexto} — lacre ${lacre.trim()}${sufixoExecutor}.${anotacao.trim() ? ` Nota: ${anotacao.trim()}` : ''}`,
        tipo_id: tipoTarefaObs?.id || null,
        // 🔴 `false` — automático nunca nasce importante (23/09/2026). Este insert era o maior
        // gerador do problema: **54 das 172** linhas de log marcadas como importantes vinham
        // daqui ("Acolhimento concluído — lacre NNNN").
        importante: false,
      } as never)

      // Notificação de conclusão pro gerente/concierge da unidade — lacuna achada testando
      // (toda outra conclusão em /tarefas já notifica; este modal nunca notificou, nem no PV
      // nem agora no Acolhimento novo). Mesmo padrão de `notificarConclusaoUnidade`
      // (tarefas/page.tsx) mas duplicado aqui, porque aquela função é privada daquele arquivo
      // e este modal é self-contido de propósito (chamado de 3 telas diferentes).
      if (unidadeId) {
        try {
          const { data: atribuiveis } = await supabase.rpc('listar_atribuiveis_operacional' as never, { p_unidade_id: unidadeId, p_para: 'remocao' } as never) as { data: { user_id: string; role: string }[] | null }
          const destinatarios = (atribuiveis || [])
            .filter(p => (p.role === 'gerente' || p.role === 'operador') && p.user_id !== user?.id)
            .map(p => p.user_id)
          if (destinatarios.length > 0) {
            await fetch('/api/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userIds: destinatarios, title: '✅ Tarefa concluída', body: `${rotulo} — ${contrato.pet_nome}`, url: '/tarefas' }),
            })
          }
        } catch { /* push é best-effort — não trava o fluxo se falhar */ }
      }

      onSuccess?.({ id: contrato.id, data_acolhimento: dataHoraIso, numero_lacre: lacre.trim(), aguardando_acolhimento: false })
      onClose()
    } catch (err) {
      console.error('Erro ao concluir Ativação de Preventivo:', err)
      setErro(err instanceof Error ? err.message : 'Erro ao concluir. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    // 🔴 **Quem rola é o OVERLAY; o card tem altura natural.** Com `items-center` e
    // um card sem `overflow` nenhum, conteúdo mais alto que a tela vazava pra fora **sem
    // nada pra rolar**, e o botão de ação ficava inalcançável. Este era o pior dos 4
    // modais consertados em 24/09/2026: os de `/tarefas` ao menos tinham
    // `max-h-[92vh] overflow-y-auto`; este não tinha nem isso.
    // ⚠️ O que passou a estourar a altura foi a **foto de conclusão** (`FotoProva`,
    // prévia de até 224px). A foto não é a causa — ela só revelou o defeito.
    // `my-auto` no card centraliza quando cabe e deixa rolar quando não cabe.
    <div
      className="fixed inset-0 bg-black/60 overflow-y-auto overscroll-contain flex items-start justify-center z-[60] p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-0)] rounded-xl shadow-xl w-full max-w-sm my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)] bg-emerald-500/5 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <div>
              <h3 className="font-bold text-[var(--surface-800)]">Finalizar {rotulo}</h3>
              <p className="text-sm text-[var(--surface-500)]">{contrato.pet_nome} &middot; {tutorNome}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-100)] rounded-full transition-colors">
            <X className="h-5 w-5 text-[var(--surface-500)]" />
          </button>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-[var(--surface-400)]">Carregando...</div>
        ) : (
          <div className="p-4 space-y-3">
            {info && (
              <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
                <p className="text-sm"><strong className="text-[var(--surface-700)]">Pet:</strong> {contrato.pet_nome?.toUpperCase()}</p>
                {petDetalhe && <p className="text-xs text-[var(--surface-500)]">{petDetalhe}</p>}
                <p className="text-sm"><strong className="text-[var(--surface-700)]">Tutor:</strong> {tutorNome}</p>
                <p className="text-sm"><strong className="text-[var(--surface-700)]">Contato:</strong> {info.tutor_telefone_nome || tutorNome}{info.tutor_telefone ? ` · ${info.tutor_telefone}` : ''}</p>
                <p className="text-sm"><strong className="text-[var(--surface-700)]">Local:</strong> {localLabel}</p>
                {enderecoNavegavel && <p className="text-sm"><strong className="text-[var(--surface-700)]">Endereço:</strong> {enderecoNavegavel}</p>}
                {semTraslado && <p className="text-xs text-[var(--surface-500)]">Tutor já trouxe o pet até a unidade — sem deslocamento.</p>}
              </div>
            )}

            {(wazeUrl || gmapsUrl) && (
              <div className="grid grid-cols-2 gap-2">
                {wazeUrl && (
                  <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold">
                    <MapPin className="h-4 w-4" />Waze
                  </a>
                )}
                {gmapsUrl && (
                  <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
                    <Navigation className="h-4 w-4" />Google Maps
                  </a>
                )}
              </div>
            )}

            {tarefaTipo === 'remocao' && (
              <button
                onClick={gerarPdf}
                disabled={gerandoPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Baixar Contrato
              </button>
            )}

            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Número do Lacre <span className="text-red-400">*</span></label>
              <input type="text" value={lacre} onChange={e => setLacre(e.target.value)} placeholder="Número do lacre" className="input text-sm w-full" />
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Data e Hora do Acolhimento <span className="text-red-400">*</span></label>
              <div className="flex items-center gap-1 bg-[var(--surface-100)] rounded px-1 w-fit mb-1.5">
                <button type="button" onClick={() => setModoData('agora')} className={`px-2 py-0.5 rounded text-[11px] transition-colors ${modoData === 'agora' ? 'bg-[var(--surface-0)] text-emerald-500 font-medium' : 'text-[var(--surface-400)]'}`}>Agora</button>
                <button type="button" onClick={() => setModoData('outra')} className={`px-2 py-0.5 rounded text-[11px] transition-colors ${modoData === 'outra' ? 'bg-[var(--surface-0)] text-emerald-500 font-medium' : 'text-[var(--surface-400)]'}`}>Outra</button>
              </div>
              {modoData === 'outra' && (
                <input type="datetime-local" step="1800" value={dataHoraManual} onChange={e => setDataHoraManual(e.target.value)} className="input text-sm w-full" />
              )}
            </div>

            <FotoProva
              valor={fotoProva}
              onChange={setFotoProva}
              obrigatoria={exigeFotoAqui}
              aviso={<>Foto do <strong>lacre</strong> com a numeração visível já posicionado na pata do pet</>}
            />
            {isPosicao && (
              <div>
                <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Colaborador na posição <span className="text-red-400">*</span></label>
                <select value={executadoPorFuncionarioId} onChange={e => setExecutadoPorFuncionarioId(e.target.value)} className="input text-sm w-full">
                  <option value="">Selecione...</option>
                  {funcionarios.map(f => (<option key={f.id} value={f.id}>{f.nome}</option>))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Anotação (opcional)</label>
              <textarea value={anotacao} onChange={e => setAnotacao(e.target.value)} rows={2} placeholder="Alguma observação..." className="input text-sm w-full resize-none" />
            </div>

            {erro && <p className="text-xs text-red-400">{erro}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-2 px-4 border border-[var(--surface-300)] rounded-lg text-[var(--surface-600)] hover:bg-[var(--surface-100)] transition-colors text-sm">
                Cancelar
              </button>
              <button
                onClick={concluir}
                disabled={salvando || !podeConcluir}
                className="flex-1 py-2 px-4 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {salvando ? 'Concluindo...' : 'Concluir'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
