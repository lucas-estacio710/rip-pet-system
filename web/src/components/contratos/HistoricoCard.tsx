'use client'

import { useState, useEffect } from 'react'
import { History, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type LogEntry = {
  id: string
  campo_label: string
  valor_anterior: string | null
  valor_novo: string | null
  tipo: string
  criado_em: string
  alterado_por_email: string | null
  nota: string | null
}

type Props = {
  contratoId: string
}

export default function HistoricoCard({ contratoId }: Props) {
  const supabase = createClient()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState(false)

  useEffect(() => {
    carregarLogs()
  }, [contratoId])

  async function carregarLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('historico_alteracoes')
      .select('id, campo_label, valor_anterior, valor_novo, tipo, criado_em, alterado_por_email, nota')
      .eq('entidade', 'contratos')
      .eq('entidade_id', contratoId)
      .order('criado_em', { ascending: false })
      .limit(50)

    setLogs((data || []) as LogEntry[])
    setLoading(false)
  }

  if (loading) return null
  if (logs.length === 0) return null

  return (
    <div className="bg-slate-800 rounded-xl shadow-md border border-slate-700 md:col-span-2 overflow-hidden">
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-300">Histórico de alterações</span>
          <span className="text-xs text-slate-500">({logs.length})</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandido ? 'rotate-180' : ''}`} />
      </button>

      {expandido && (
        <div className="border-t border-slate-700 divide-y divide-slate-700/50 max-h-60 overflow-y-auto">
          {logs.map(log => (
            <div key={log.id} className="px-5 py-2.5 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[9px] font-bold text-purple-400">
                    {(log.alterado_por_email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-slate-400">{log.alterado_por_email || 'Sistema'}</span>
                </div>
                <span className="text-slate-500">
                  {new Date(log.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400">{log.campo_label}:</span>
                {log.valor_anterior && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-900/30 text-red-400">
                    − {log.valor_anterior}
                  </span>
                )}
                {log.valor_novo && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/30 text-emerald-400">
                    + {log.valor_novo}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
