'use client'

// "Inputs de Anomalias" — varredura de inconsistências de dados do CRM.
//
// O admin é o ORQUESTRADOR: roda a varredura, filtra por unidade, clica no
// registro pra estudar, e copia uma mensagem pronta pro WhatsApp do gerente.
// O gerente não acessa esta tela — quem decide quando cobrar é o admin.
//
// As regras vivem em `lib/anomalias.ts` (uma entrada por check).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  AlertTriangle, Loader2, RefreshCw, Copy, Check, ChevronDown, ChevronRight,
  ExternalLink, ShieldCheck, Filter,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import {
  ANOMALIAS, CATEGORIAS, montarMensagem,
  type Categoria, type LinhaAnomalia, type Severidade,
} from '@/lib/anomalias'

type Estado = {
  total: number
  linhas: LinhaAnomalia[]
  truncado?: boolean
  erro?: string
}

const SEV: Record<Severidade, { label: string; classe: string }> = {
  alta:  { label: 'Alta',  classe: 'bg-red-900/40 text-red-300 border-red-800/60' },
  media: { label: 'Média', classe: 'bg-amber-900/40 text-amber-300 border-amber-800/60' },
  baixa: { label: 'Baixa', classe: 'bg-[var(--surface-200)] text-[var(--surface-500)] border-[var(--surface-300)]' },
}

export default function AnomaliasPanel() {
  const supabase = createClient()
  const { toast } = useToast()
  const { allUnidades } = useUnit()

  const [rodando, setRodando] = useState(false)
  const [resultados, setResultados] = useState<Record<string, Estado>>({})
  const [aberto, setAberto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [unidadeId, setUnidadeId] = useState<string | null>(null)
  const [rodouUmaVez, setRodouUmaVez] = useState(false)

  const listaUnidades = allUnidades || []
  const nomeUnidade = unidadeId
    ? listaUnidades.find(u => u.id === unidadeId)?.nome
    : undefined

  const rodar = useCallback(async () => {
    setRodando(true)
    setResultados({})
    // Sequencial de propósito: são muitas queries pesadas; em paralelo o
    // Supabase enfileira e a tela trava sem dar feedback de progresso.
    for (const check of ANOMALIAS) {
      try {
        const r = await check.buscar(supabase, unidadeId)
        setResultados(prev => ({ ...prev, [check.id]: r }))
      } catch (e) {
        setResultados(prev => ({
          ...prev,
          [check.id]: { total: 0, linhas: [], erro: e instanceof Error ? e.message : 'falhou' },
        }))
      }
    }
    setRodando(false)
    setRodouUmaVez(true)
  }, [supabase, unidadeId])

  // Roda ao abrir a aba (e ao trocar a unidade do filtro)
  useEffect(() => { void rodar() }, [rodar])

  const copiar = async (checkId: string) => {
    const check = ANOMALIAS.find(c => c.id === checkId)
    const r = resultados[checkId]
    if (!check || !r) return
    try {
      await navigator.clipboard.writeText(montarMensagem(check, r.linhas, nomeUnidade))
      setCopiado(checkId)
      setTimeout(() => setCopiado(null), 1500)
      toast('Mensagem copiada — cole no WhatsApp do gerente', 'success')
    } catch {
      toast('Não consegui copiar', 'error')
    }
  }

  const comProblema = ANOMALIAS.filter(c => (resultados[c.id]?.total ?? 0) > 0)
  const totalGeral = comProblema.reduce((s, c) => s + (resultados[c.id]?.total ?? 0), 0)
  const categoriasOrdenadas = (Object.keys(CATEGORIAS) as Categoria[])
    .sort((a, b) => CATEGORIAS[a].ordem - CATEGORIAS[b].ordem)
    .filter(cat => comProblema.some(c => c.categoria === cat))

  return (
    <div className="space-y-4">
      {/* Cabeçalho da aba */}
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--surface-800)] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Inputs de Anomalias
            </h2>
            <p className="text-sm text-[var(--surface-500)] mt-1 max-w-2xl">
              Varredura de inconsistências nos dados. Clique no registro para estudar o caso e
              use <span className="text-[var(--surface-700)]">Copiar</span> para mandar a
              cobrança pronta ao gerente da unidade.
            </p>
          </div>
          <button onClick={() => void rodar()} disabled={rodando} className="btn-secondary text-sm shrink-0">
            {rodando
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Varrendo…</>
              : <><RefreshCw className="h-4 w-4" /> Rodar de novo</>}
          </button>
        </div>

        {/* Filtro de unidade + placar */}
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-[var(--surface-200)]">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--surface-400)]" />
            <select
              value={unidadeId || ''}
              onChange={e => setUnidadeId(e.target.value || null)}
              className="input text-sm w-56"
              disabled={rodando}
            >
              <option value="">Todas as unidades</option>
              {listaUnidades.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
          {rodouUmaVez && !rodando && (
            <span className="text-sm text-[var(--surface-500)]">
              {comProblema.length === 0
                ? 'Nenhuma anomalia encontrada.'
                : <>
                    <span className="text-mono text-[var(--surface-800)]">{totalGeral}</span>{' '}
                    {totalGeral === 1 ? 'registro' : 'registros'} em{' '}
                    <span className="text-mono text-[var(--surface-800)]">{comProblema.length}</span>{' '}
                    {comProblema.length === 1 ? 'verificação' : 'verificações'}
                  </>}
            </span>
          )}
          {rodando && (
            <span className="text-sm text-[var(--surface-500)] flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {Object.keys(resultados).length}/{ANOMALIAS.length} verificações
            </span>
          )}
        </div>
      </div>

      {/* Tudo certo */}
      {rodouUmaVez && !rodando && comProblema.length === 0 && (
        <div className="card p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-[var(--surface-700)]">Nenhuma anomalia encontrada</p>
          <p className="text-sm text-[var(--surface-500)] mt-1">
            {nomeUnidade ? `A unidade ${nomeUnidade} está limpa.` : 'Todas as unidades estão limpas.'}
          </p>
        </div>
      )}

      {/* Resultados por categoria */}
      {categoriasOrdenadas.map(cat => (
        <div key={cat} className="space-y-2">
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${CATEGORIAS[cat].cor}`}>
            {CATEGORIAS[cat].label}
          </h3>

          {comProblema.filter(c => c.categoria === cat).map(check => {
            const r = resultados[check.id]
            const expandido = aberto === check.id
            return (
              <div key={check.id} className="card overflow-hidden">
                {/* Linha do check */}
                <button
                  onClick={() => setAberto(expandido ? null : check.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--surface-100)]/50 transition-colors"
                >
                  {expandido
                    ? <ChevronDown className="h-4 w-4 text-[var(--surface-400)] shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-[var(--surface-400)] shrink-0" />}
                  <span className="text-mono text-sm text-[var(--surface-800)] w-12 shrink-0">{r.total}</span>
                  <span className="flex-1 min-w-0 text-sm text-[var(--surface-700)] truncate">
                    {check.titulo}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${SEV[check.severidade].classe}`}>
                    {SEV[check.severidade].label}
                  </span>
                </button>

                {/* Detalhe */}
                {expandido && (
                  <div className="border-t border-[var(--surface-200)] p-4 space-y-4">
                    <div className="space-y-2 text-sm">
                      <p className="text-[var(--surface-600)]">{check.porque}</p>
                      <p className="text-[var(--surface-700)]">
                        <span className="text-[var(--surface-500)]">O que fazer: </span>
                        {check.comoCorrigir}
                      </p>
                    </div>

                    <button onClick={() => void copiar(check.id)} className="btn-secondary text-sm">
                      {copiado === check.id
                        ? <><Check className="h-4 w-4 text-emerald-400" /> Copiado</>
                        : <><Copy className="h-4 w-4" /> Copiar mensagem pro gerente</>}
                    </button>

                    {/* Lista clicável */}
                    <div className="max-h-96 overflow-y-auto border border-[var(--surface-200)] rounded-[var(--radius-md)] divide-y divide-[var(--surface-200)]">
                      {r.linhas.map(l => (
                        <div key={`${check.id}-${l.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-100)]/50">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--surface-800)] truncate">{l.titulo}</p>
                            {l.detalhe && (
                              <p className="text-xs text-[var(--surface-500)] truncate">{l.detalhe}</p>
                            )}
                          </div>
                          {l.link && (
                            <Link
                              href={l.link}
                              target="_blank"
                              className="text-[var(--brand-500)] hover:text-[var(--brand-400)] shrink-0"
                              title="Abrir em nova aba"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>

                    {r.truncado && (
                      <p className="text-xs text-[var(--surface-500)]">
                        Mostrando os primeiros {r.linhas.length} de {r.total}. Filtre por unidade para ver o resto.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Erros de execução */}
      {ANOMALIAS.filter(c => resultados[c.id]?.erro).map(c => (
        <div key={c.id} className="card p-3 border-red-800/40">
          <p className="text-sm text-red-300">
            <span className="text-[var(--surface-500)]">Falhou:</span> {c.titulo} — {resultados[c.id].erro}
          </p>
        </div>
      ))}
    </div>
  )
}
