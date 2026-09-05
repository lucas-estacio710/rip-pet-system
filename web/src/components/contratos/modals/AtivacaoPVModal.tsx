'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

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
// ============================================================================

type ContratoMinimal = {
  id: string
  pet_nome: string
  tutor_nome: string
  unidade_id?: string | null
  tutor?: { nome: string } | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  contrato: ContratoMinimal
  onSuccess?: (updated: { id: string; data_acolhimento: string; numero_lacre: string | null; aguardando_acolhimento: false }) => void
}

export default function AtivacaoPVModal({ isOpen, onClose, contrato, onSuccess }: Props) {
  const supabase = createClient()
  const { currentUnit, isPosicao } = useUnit()

  const [tarefaId, setTarefaId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])

  const [lacre, setLacre] = useState('')
  const [modoData, setModoData] = useState<'agora' | 'outra'>('agora')
  const [dataHoraManual, setDataHoraManual] = useState('')
  const [executadoPorFuncionarioId, setExecutadoPorFuncionarioId] = useState('')
  const [anotacao, setAnotacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

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

    supabase
      .from('tarefas_operacionais')
      .select('id')
      .eq('contrato_id', contrato.id)
      .eq('tipo', 'ativacao_pv')
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
  }, [isOpen, contrato.id, unidadeId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const podeConcluir = !!lacre.trim() && (modoData === 'agora' || !!dataHoraManual) && (!isPosicao || !!executadoPorFuncionarioId)

  async function concluir() {
    if (!podeConcluir) return
    setSalvando(true)
    setErro(null)

    try {
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
      const nomeExecutor = isPosicao ? funcionarios.find(f => f.id === executadoPorFuncionarioId)?.nome : null

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
        campo_label: 'Ativação de Preventivo concluída',
        valor_novo: `Remoção concluída — lacre ${lacre.trim()}${nomeExecutor ? ` (colaborador na posição: ${nomeExecutor})` : ''}`,
        tipo: 'conclusao',
        alterado_por: user?.id ?? null,
        alterado_por_email: user?.email ?? null,
        nota: anotacao.trim() || null,
      } as never)

      const { data: tipoTarefaObs } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
      await supabase.from('tarefas').insert({
        contrato_id: contrato.id,
        descricao: `Ativação de Preventivo concluída — lacre ${lacre.trim()}${nomeExecutor ? ` (colaborador na posição: ${nomeExecutor})` : ''}.${anotacao.trim() ? ` Nota: ${anotacao.trim()}` : ''}`,
        tipo_id: tipoTarefaObs?.id || null,
        importante: true,
      } as never)

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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface-0)] rounded-xl shadow-xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)] bg-emerald-500/5 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <div>
              <h3 className="font-bold text-[var(--surface-800)]">Finalizar Ativação de Preventivo</h3>
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
            <div>
              <label className="text-xs font-medium text-[var(--surface-600)] mb-1 block">Número do Lacre <span className="text-red-400">*</span></label>
              <input type="text" value={lacre} onChange={e => setLacre(e.target.value)} placeholder="Número do lacre" className="input text-sm w-full" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--surface-600)]">Data e Hora do Acolhimento <span className="text-red-400">*</span></label>
                <div className="flex items-center gap-1 bg-[var(--surface-100)] rounded px-1">
                  <button type="button" onClick={() => setModoData('agora')} className={`px-2 py-0.5 rounded text-[11px] transition-colors ${modoData === 'agora' ? 'bg-[var(--surface-0)] text-emerald-500 font-medium' : 'text-[var(--surface-400)]'}`}>Agora</button>
                  <button type="button" onClick={() => setModoData('outra')} className={`px-2 py-0.5 rounded text-[11px] transition-colors ${modoData === 'outra' ? 'bg-[var(--surface-0)] text-emerald-500 font-medium' : 'text-[var(--surface-400)]'}`}>Outra</button>
                </div>
              </div>
              {modoData === 'outra' && (
                <input type="datetime-local" step="1800" value={dataHoraManual} onChange={e => setDataHoraManual(e.target.value)} className="input text-sm w-full" />
              )}
            </div>

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
