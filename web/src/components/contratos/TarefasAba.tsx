'use client'

/**
 * Aba "Tarefas" do detalhe do contrato (docs/PLAYBOOK_CONTRATO_ID.md, item 18): as tarefas
 * operacionais daquele pet, com a foto-prova de cada uma. Somente leitura — atribuir, concluir e
 * reatribuir continuam no /tarefas (porta única: lib/atribuir-tarefa.ts).
 *
 * - Rótulo, ícone e cor = os do /tarefas (TIPO_INFO). ×N = N linhas físicas do mesmo rescaldo
 *   (mesmo tipo, status e responsável), como lá.
 * - Status: pendente | concluida | cancelada (mig 161: o item foi excluído com a tarefa ainda na
 *   fila). Item excluído (`item_excluido_em`) = a tarefa FICA, com alerta ⚠️ e a foto-prova.
 * - "Concluída por" = quem estava atribuído (não há
 *   coluna concluido_por); em posição (dispositivo compartilhado), o colaborador que assinou.
 * - Foto: bucket PRIVADO `tarefas` → URL assinada (lib/foto-tarefa). Nunca URL pública.
 * - Ordem: em andamento primeiro; depois as concluídas, a mais recente primeiro.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HandHeart, PackageCheck, PawPrint, Fingerprint, Scissors, Feather, ClipboardList, ListChecks, ImageIcon, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listarFotosDasTarefas, urlAssinadaFoto } from '@/lib/foto-tarefa'
import { nomesDePerfis } from '@/lib/cache-pessoas'
import { useVoltarFecha } from '@/hooks/usePopupHistory'

export type TarefaDoContrato = {
  id: string
  tipo: string
  status: string
  atribuido_a: string | null
  atribuido_por: string | null
  atribuido_em: string | null
  concluido_em: string | null
  created_at: string
  observacao_atribuicao: string | null
  anotacao_conclusao: string | null
  executado_por_funcionario_id: string | null
  lacre: string | null
  /** Mig 161 — o produto da tarefa foi excluído do contrato. */
  item_nome?: string | null
  item_excluido_em?: string | null
  item_excluido_por?: string | null
}

// `*` de propósito: as colunas da mig 161 entram sem a tela quebrar antes/depois de rodá-la.
export const SELECT_TAREFAS_DO_CONTRATO = '*'

const TIPO_INFO: Record<string, { label: string; icon: typeof HandHeart; cor: string }> = {
  remocao: { label: 'Acolhimento', icon: HandHeart, cor: '#ef4444' },
  entrega: { label: 'Realizar Entrega', icon: PackageCheck, cor: '#0ea5e9' },
  molde_patinha: { label: 'Tirar Molde', icon: PawPrint, cor: '#a855f7' },
  carimbo: { label: 'Tirar Carimbo', icon: Fingerprint, cor: '#f59e0b' },
  pelo_extra: { label: 'Tirar Pelo Extra', icon: Scissors, cor: '#ec4899' },
  pelinho: { label: 'Tirar Pelinho', icon: Feather, cor: '#14b8a6' },
  ativacao_pv: { label: 'Acolhimento de Preventivo', icon: ClipboardList, cor: '#ec4899' },
}
const AGRUPA = new Set(['molde_patinha', 'carimbo', 'pelo_extra', 'pelinho'])

function dataHora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type Grupo = TarefaDoContrato & { n: number; ids: string[] }

export default function TarefasAba({ tarefas, carregando }: { tarefas: TarefaDoContrato[]; carregando: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [funcionarios, setFuncionarios] = useState<Record<string, string>>({})
  const [fotoUrl, setFotoUrl] = useState<Record<string, string>>({}) // por tarefa_id
  const [ampliada, setAmpliada] = useState<{ url: string; legenda: string } | null>(null)
  useVoltarFecha(!!ampliada, () => setAmpliada(null))

  // Agrupa os rescaldos ×N (mesmo tipo, status e responsável) — igual ao /tarefas.
  const grupos = useMemo<Grupo[]>(() => {
    const out: Grupo[] = []
    for (const t of tarefas) {
      const g = AGRUPA.has(t.tipo) ? out.find(x => x.tipo === t.tipo && x.status === t.status && x.atribuido_a === t.atribuido_a
        && !x.item_excluido_em && !t.item_excluido_em) : undefined
      if (g) { g.n++; g.ids.push(t.id) } else out.push({ ...t, n: 1, ids: [t.id] })
    }
    const quando = (g: Grupo) => (g.status === 'cancelada' ? g.item_excluido_em : g.concluido_em) || ''
    const pend = out.filter(g => g.status === 'pendente')
    const feitas = out.filter(g => g.status !== 'pendente').sort((a, b) => quando(b).localeCompare(quando(a)))
    return [...pend, ...feitas]
  }, [tarefas])

  useEffect(() => {
    if (tarefas.length === 0) return
    let vivo = true
    const pessoas = [...new Set(tarefas.flatMap(t => [t.atribuido_a, t.atribuido_por, t.item_excluido_por]).filter(Boolean) as string[])]
    nomesDePerfis(supabase, pessoas).then(n => { if (vivo) setNomes(n) })
    const funcs = [...new Set(tarefas.map(t => t.executado_por_funcionario_id).filter(Boolean) as string[])]
    if (funcs.length) {
      supabase.from('funcionarios').select('id, nome').in('id', funcs)
        .then(({ data }) => { if (vivo) setFuncionarios(Object.fromEntries(((data || []) as { id: string; nome: string }[]).map(f => [f.id, f.nome]))) })
    }
    listarFotosDasTarefas(supabase, tarefas.map(t => t.id)).then(async porTarefa => {
      const urls: Record<string, string> = {}
      await Promise.all(Object.entries(porTarefa).map(async ([tid, fotos]) => {
        if (fotos[0]) { const u = await urlAssinadaFoto(supabase, fotos[0].path); if (u) urls[tid] = u }
      }))
      if (vivo) setFotoUrl(urls)
    })
    return () => { vivo = false }
  }, [tarefas, supabase])

  const nPend = grupos.filter(g => g.status === 'pendente').length

  return (
    <div className="bg-slate-800 rounded-xl shadow-md p-5 border border-slate-700">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,211,238,.12)' }}>
          <ListChecks className="h-4 w-4" style={{ color: '#22d3ee' }} />
        </div>
        <h2 className="font-semibold text-slate-200">Tarefas</h2>
        <span className="text-sm text-slate-400">({grupos.length})</span>
        {grupos.length > 0 && (nPend > 0
          ? <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">{nPend} em andamento</span>
          : <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">tudo concluído</span>)}
        <Link href="/tarefas" className="ml-auto text-xs text-purple-400 hover:underline whitespace-nowrap">
          <span className="sm:hidden">/tarefas ↗</span><span className="hidden sm:inline">Abrir no /tarefas ↗</span>
        </Link>
      </div>

      {carregando ? (
        <div className="text-center py-4 text-slate-400 text-sm">Carregando…</div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-4 text-slate-500 text-sm">Nenhuma tarefa operacional neste contrato.</div>
      ) : (
        <div>
          {grupos.map(g => {
            const info = TIPO_INFO[g.tipo] || { label: g.tipo, icon: ClipboardList, cor: '#94a3b8' }
            const Icone = info.icon
            const pendente = g.status === 'pendente'
            const cancelada = g.status === 'cancelada'
            const excluiu = g.item_excluido_por ? (nomes[g.item_excluido_por] || '…') : null
            const quem = g.atribuido_a ? (nomes[g.atribuido_a] || '…') : null
            const porQuem = g.atribuido_por ? (nomes[g.atribuido_por] || '…') : null
            const executou = g.executado_por_funcionario_id ? funcionarios[g.executado_por_funcionario_id] : null
            const url = g.ids.map(id => fotoUrl[id]).find(Boolean)
            return (
              <div key={g.id} className="flex gap-3 items-start py-2.5 border-b border-slate-700/60 last:border-b-0"
                style={{ boxShadow: `inset 3px 0 0 ${info.cor}`, paddingLeft: 10 }}>
                {url ? (
                  <button type="button" onClick={() => setAmpliada({ url, legenda: `${info.label}${quem ? ` · ${executou || quem}` : ''}` })}
                    className="w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden flex-none border border-slate-600" title="Ver foto">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, efêmera */}
                    <img src={url} alt={`Foto: ${info.label}`} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <span className="w-14 h-14 md:w-16 md:h-16 rounded-lg flex-none flex items-center justify-center border border-dashed border-slate-600"
                    title={pendente ? 'A foto entra na conclusão' : cancelada ? 'Cancelada antes de ser feita' : 'Concluída sem foto'}>
                    <Icone className="h-6 w-6" style={{ color: info.cor }} />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icone className="h-4 w-4 flex-none" style={{ color: info.cor }} />
                    <span className="text-sm font-semibold text-slate-200">{info.label}</span>
                    {g.n > 1 && <span className="text-[11px] font-bold text-slate-400">×{g.n}</span>}
                    {g.lacre && <span className="text-[10px] font-bold px-1.5 rounded bg-blue-600 text-white">{String(g.lacre).replace(/\.0$/, '')}</span>}
                    <span className="sm:ml-auto">
                      {cancelada
                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 whitespace-nowrap">⊘ cancelada</span>
                        : pendente
                        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 whitespace-nowrap">⏱ {quem ? `com ${quem}` : 'sem responsável'}</span>
                        : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 whitespace-nowrap">✓ concluída</span>}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {cancelada
                      ? <>Estava com <b className="text-slate-300 font-medium">{quem || '—'}</b>{g.atribuido_em ? ` desde ${dataHora(g.atribuido_em)}` : ''} — não chegou a ser feita</>
                      : pendente
                      ? <>{porQuem ? `${porQuem} atribuiu a ` : 'Atribuída a '}<b className="text-slate-300 font-medium">{quem || '—'}</b>{g.atribuido_em ? ` · ${dataHora(g.atribuido_em)}` : ''}</>
                      : <>Concluída por <b className="text-slate-300 font-medium">{quem || '—'}</b>{executou ? <> · 🚗 executado por <b className="text-slate-300 font-medium">{executou}</b></> : null}{g.concluido_em ? ` · ${dataHora(g.concluido_em)}` : ''}
                          {porQuem && g.atribuido_em && <span className="text-slate-600"> · atribuída por {porQuem} em {dataHora(g.atribuido_em)}</span>}</>}
                  </div>
                  {g.item_excluido_em && (
                    <div className="mt-1.5 text-xs text-red-300 bg-red-900/20 border-l-2 border-red-500/70 px-2 py-1 rounded-r">
                      ⚠️ Item excluído do contrato{g.item_nome ? <>: <b className="font-semibold">{g.item_nome}</b></> : null} · {dataHora(g.item_excluido_em)}{excluiu ? ` por ${excluiu}` : ''}
                    </div>
                  )}
                  {g.observacao_atribuicao && (
                    <div className="mt-1.5 text-xs text-amber-200/90 bg-amber-900/15 border-l-2 border-amber-500/60 px-2 py-1 rounded-r">📝 {g.observacao_atribuicao}</div>
                  )}
                  {g.anotacao_conclusao && (
                    <div className="mt-1.5 text-xs text-slate-300 bg-slate-700/30 border-l-2 border-slate-500 px-2 py-1 rounded-r">💬 {g.anotacao_conclusao}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ampliada && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4" onClick={() => setAmpliada(null)}>
          <button type="button" aria-label="Fechar" className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center" onClick={() => setAmpliada(null)}>
            <X className="h-5 w-5" />
          </button>
          <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, efêmera */}
            <img src={ampliada.url} alt={ampliada.legenda} className="w-full max-h-[80dvh] object-contain rounded-lg" />
            <div className="mt-2 text-sm text-slate-200 flex items-center gap-1.5"><ImageIcon className="h-4 w-4" />{ampliada.legenda}</div>
          </div>
        </div>
      )}
    </div>
  )
}
