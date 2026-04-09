'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Check, Plus, MessageSquare, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}

type Tarefa = {
  id: string
  contrato_id: string
  descricao: string
  importante: boolean
  resolvido: boolean
  resolvido_por: string | null
  resolvido_em: string | null
  criado_por: string | null
  criado_por_email: string | null
  created_at: string
  unidade_id: string | null
  tipo: { id: string; nome: string } | null
  unidade: { codigo: string; nome: string } | null
}

type Props = {
  contratoId: string
  observacoesFicha: string | null
}

export default function ObservacoesCard({ contratoId, observacoesFicha }: Props) {
  const supabase = createClient()
  const { currentUnit, userName, userEmail } = useUnit()

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [novaObs, setNovaObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [tipoIds, setTipoIds] = useState<Record<string, string>>({})

  useEffect(() => {
    carregarTarefas()
    carregarTipos()
  }, [contratoId])

  async function carregarTipos() {
    const { data } = await supabase
      .from('tarefa_tipos')
      .select('id, nome')
    if (data) {
      const map: Record<string, string> = {}
      for (const t of data as { id: string; nome: string }[]) {
        map[t.nome] = t.id
      }
      setTipoIds(map)
    }
  }

  async function carregarTarefas() {
    setLoading(true)
    const { data } = await supabase
      .from('tarefas')
      .select('id, contrato_id, descricao, importante, resolvido, resolvido_por, resolvido_em, criado_por, criado_por_email, created_at, unidade_id, tipo:tarefa_tipos(id, nome), unidade:unidades(codigo, nome)')
      .eq('contrato_id', contratoId)
      .order('created_at', { ascending: true })

    setTarefas((data || []) as Tarefa[])
    setLoading(false)
  }

  async function adicionarObs() {
    if (!novaObs.trim() || !currentUnit) return
    setSalvando(true)

    // Determinar tipo: Matriz = "Observação da Matriz", senão "Observação da Unidade"
    const tipoNome = currentUnit.is_matriz ? 'Observação da Matriz' : 'Observação da Unidade'
    const tipoId = tipoIds[tipoNome] || null

    await supabase.from('tarefas').insert({
      contrato_id: contratoId,
      descricao: novaObs.trim(),
      tipo_id: tipoId,
      unidade_id: currentUnit.id,
      criado_por: userName || userEmail?.split('@')[0] || null,
      criado_por_email: userEmail || null,
      importante: false,
      resolvido: false,
    } as never)

    setNovaObs('')
    await carregarTarefas()
    setSalvando(false)
  }

  async function toggleImportante(tarefa: Tarefa) {
    await supabase.from('tarefas').update({ importante: !tarefa.importante } as never).eq('id', tarefa.id)
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, importante: !t.importante } : t))

    // Log no histórico
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('historico_alteracoes').insert({
      entidade: 'contratos',
      entidade_id: contratoId,
      entidade_nome: tarefa.descricao.slice(0, 50),
      campo: 'tarefa_importante',
      campo_label: 'Observação importante',
      valor_anterior: tarefa.importante ? 'Sim' : 'Não',
      valor_novo: !tarefa.importante ? 'Sim' : 'Não',
      tipo: 'alteracao',
      alterado_por: user?.id || null,
      alterado_por_email: user?.email || null,
    } as never)
  }

  async function toggleResolvido(tarefa: Tarefa) {
    const novoResolvido = !tarefa.resolvido
    const resolvidoPor = novoResolvido ? (userName || userEmail?.split('@')[0] || null) : null
    const resolvidoEm = novoResolvido ? new Date().toISOString() : null
    await supabase.from('tarefas').update({ resolvido: novoResolvido, resolvido_por: resolvidoPor, resolvido_em: resolvidoEm } as never).eq('id', tarefa.id)
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, resolvido: novoResolvido, resolvido_por: resolvidoPor, resolvido_em: resolvidoEm } : t))

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('historico_alteracoes').insert({
      entidade: 'contratos',
      entidade_id: contratoId,
      entidade_nome: tarefa.descricao.slice(0, 50),
      campo: 'tarefa_resolvido',
      campo_label: 'Observação resolvida',
      valor_anterior: tarefa.resolvido ? 'Sim' : 'Não',
      valor_novo: !tarefa.resolvido ? 'Sim' : 'Não',
      tipo: 'alteracao',
      alterado_por: user?.id || null,
      alterado_por_email: user?.email || null,
    } as never)
  }

  function getBadge(tarefa: Tarefa) {
    const tipoNome = (tarefa.tipo as unknown as { nome: string })?.nome || ''
    if (tipoNome.includes('Ficha')) return { label: 'Ficha', bg: '#7c3aed', text: '#fff' }
    if (tipoNome.includes('Matriz')) return { label: 'MA', bg: '#f97316', text: '#fff' }
    // Unidade — usar sigla e cor
    const codigo = (tarefa.unidade as unknown as { codigo: string })?.codigo || '??'
    const bg = UNIT_COLORS[codigo] || '#6366f1'
    return { label: codigo, bg, text: codigo === 'SJ' ? '#334155' : '#fff' }
  }

  const temObs = tarefas.length > 0 || observacoesFicha

  return (
    <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700 md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-slate-400" />
          </div>
          <h2 className="font-semibold text-slate-200">Observações</h2>
          {tarefas.filter(t => t.importante && !t.resolvido).length > 0 && (
            <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded-full font-semibold">
              {tarefas.filter(t => t.importante && !t.resolvido).length} importante{tarefas.filter(t => t.importante && !t.resolvido).length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-4 text-slate-500 text-sm">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {/* Observação original da ficha (se existe e não foi migrada pra tarefas) */}
          {observacoesFicha && !tarefas.some(t => (t.tipo as unknown as { nome: string })?.nome?.includes('Ficha')) && (
            <div className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                style={{ background: '#7c3aed', color: '#fff' }}>FI</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{observacoesFicha}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Observação da ficha do tutor</p>
              </div>
            </div>
          )}

          {/* Tarefas/Observações */}
          {tarefas.map(tarefa => {
            const badge = getBadge(tarefa)
            return (
              <div key={tarefa.id} className={`flex gap-2 items-start p-2 rounded-lg transition-all ${
                tarefa.importante && !tarefa.resolvido ? 'bg-red-900/10 border border-red-500/20' :
                tarefa.resolvido ? 'opacity-50' : ''
              }`}>
                {/* Badge unidade/tipo */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ background: badge.bg, color: badge.text }}>
                  {badge.label}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-slate-300 whitespace-pre-wrap break-words ${tarefa.resolvido ? 'line-through' : ''}`}>
                    {tarefa.importante && !tarefa.resolvido && <span title="Importante">🚨 </span>}
                    {tarefa.descricao}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {tarefa.criado_por || 'Sistema'} · {new Date(tarefa.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {tarefa.resolvido && tarefa.resolvido_por && (
                      <span className="text-emerald-500"> · Resolvido por {tarefa.resolvido_por}{tarefa.resolvido_em ? ` em ${new Date(tarefa.resolvido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                    )}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleImportante(tarefa)} title={tarefa.importante ? 'Remover importância' : 'Marcar importante'}
                    className={`p-1 rounded transition-colors ${tarefa.importante ? 'text-red-400 hover:text-red-300' : 'text-slate-600 hover:text-slate-400'}`}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleResolvido(tarefa)} title={tarefa.resolvido ? 'Reabrir' : 'Resolver'}
                    className={`p-1 rounded transition-colors ${tarefa.resolvido ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}>
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}

          {!temObs && (
            <p className="text-sm text-slate-500 text-center py-2">Nenhuma observação</p>
          )}
        </div>
      )}

      {/* Adicionar nova observação */}
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={novaObs}
          onChange={e => setNovaObs(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && novaObs.trim()) adicionarObs() }}
          placeholder="Adicionar observação..."
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-500 outline-none focus:border-slate-500"
        />
        <button
          onClick={adicionarObs}
          disabled={salvando || !novaObs.trim()}
          className="px-3 py-2 rounded-lg bg-slate-600 text-slate-200 hover:bg-slate-500 transition-colors disabled:opacity-40 text-sm"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
