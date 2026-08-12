'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Copy, Check, Wallet, ClipboardPaste, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

type Contrato = {
  id: string; codigo: string; pet_nome: string; tutor_nome: string
  tipo_cremacao: string; data_contrato: string; comissao_valor: number
}
type Linha = {
  parceiro: { id: string; nome: string; pix_chave: string | null; categoria_parceiro: string | null; whatsapp: string | null }
  total: number
  contratos: Contrato[]
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''

export default function PagamentosTab() {
  const supabase = createClient()
  const { currentUnit } = useUnit()

  const [fila, setFila] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [comprovante, setComprovante] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    if (!currentUnit) return
    setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/admin/parceiros/pagamentos?unidade_id=${currentUnit.id}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const json = await res.json()
    if (!res.ok) { setErro(json.error ?? 'Falha ao carregar.'); setFila([]) }
    else setFila(json.fila ?? [])
  }, [currentUnit, supabase])

  useEffect(() => { carregar() }, [carregar])

  // Colar o print do comprovante direto do banco (Ctrl+V), sem salvar arquivo antes.
  function aoColar(contatoId: string) {
    return (e: React.ClipboardEvent) => {
      const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => setComprovante(p => ({ ...p, [contatoId]: String(reader.result) }))
      reader.readAsDataURL(file)
    }
  }

  async function copiarPix(l: Linha) {
    if (!l.parceiro.pix_chave) return
    await navigator.clipboard.writeText(l.parceiro.pix_chave)
    setCopiado(l.parceiro.id)
    setTimeout(() => setCopiado(null), 2000)
  }

  async function marcarPago(l: Linha) {
    setPagando(l.parceiro.id); setErro(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/parceiros/pagamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        contato_id: l.parceiro.id,
        contrato_ids: l.contratos.map(c => c.id),
        comprovante_base64: comprovante[l.parceiro.id] ?? null,
      }),
    })
    const json = await res.json()
    setPagando(null)
    if (!res.ok) { setErro(json.error ?? 'Falha ao registrar.'); return }
    setComprovante(p => { const n = { ...p }; delete n[l.parceiro.id]; return n })
    setAberto(null)
    carregar()
  }

  if (fila === null) return <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>

  const totalGeral = fila.reduce((s, l) => s + l.total, 0)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--surface-700)]">A pagar</h2>
          <p className="text-xs text-[var(--surface-400)]">
            {fila.length} {fila.length === 1 ? 'parceiro' : 'parceiros'} · {brl(totalGeral)}
          </p>
        </div>
        <button onClick={carregar} className="flex items-center gap-1.5 text-xs text-[var(--surface-400)] hover:text-[var(--surface-600)]">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {erro && <p role="alert" className="mb-4 text-sm text-red-400">{erro}</p>}

      {fila.length === 0 ? (
        <EmptyState icon={Wallet} title="Nada a pagar"
          description="Quando uma indicação virar contrato, a comissão aparece aqui." />
      ) : (
        <ul className="space-y-3">
          {fila.map(l => {
            const expandido = aberto === l.parceiro.id
            return (
              <li key={l.parceiro.id} className="rounded-[var(--radius-lg)] bg-[var(--surface-0)] p-4 shadow-[var(--shadow-sm)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--surface-800)]">{l.parceiro.nome}</p>
                    <p className="mt-0.5 text-xs text-[var(--surface-400)]">
                      {l.contratos.length} {l.contratos.length === 1 ? 'indicação' : 'indicações'}
                      {l.parceiro.categoria_parceiro && ` · ${l.parceiro.categoria_parceiro}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-semibold text-[var(--surface-800)]">{brl(l.total)}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {l.parceiro.pix_chave ? (
                    <button onClick={() => copiarPix(l)}
                      className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--surface-200)] px-3 py-1.5 text-xs text-[var(--surface-600)] hover:bg-[var(--surface-50)]">
                      {copiado === l.parceiro.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiado === l.parceiro.id ? 'Pix copiado' : l.parceiro.pix_chave}
                    </button>
                  ) : (
                    <span className="text-xs text-amber-400">Sem chave pix cadastrada</span>
                  )}
                  <button onClick={() => setAberto(expandido ? null : l.parceiro.id)}
                    className="text-xs text-[var(--surface-400)] underline">
                    {expandido ? 'ocultar' : 'ver indicações'}
                  </button>
                </div>

                {expandido && (
                  <>
                    <ul className="mt-3 space-y-1 border-t border-[var(--surface-100)] pt-3 text-xs">
                      {l.contratos.map(c => (
                        <li key={c.id} className="flex justify-between gap-3 text-[var(--surface-500)]">
                          <span className="truncate">
                            {dataBR(c.data_contrato)} · {c.pet_nome} ({c.tipo_cremacao === 'individual' ? 'IND' : 'COL'})
                          </span>
                          <span className="shrink-0">{brl(Number(c.comissao_valor))}</span>
                        </li>
                      ))}
                    </ul>

                    <div
                      onPaste={aoColar(l.parceiro.id)}
                      tabIndex={0}
                      role="button"
                      className="mt-3 flex cursor-text items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--surface-300)] px-4 py-4 text-xs text-[var(--surface-400)] focus:border-[var(--brand-500)] focus:outline-none"
                    >
                      {comprovante[l.parceiro.id] ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-500" />
                          Comprovante colado
                        </>
                      ) : (
                        <>
                          <ClipboardPaste className="h-4 w-4" />
                          Clique aqui e cole o print do comprovante (Ctrl+V)
                        </>
                      )}
                    </div>

                    <button onClick={() => marcarPago(l)} disabled={pagando === l.parceiro.id}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand-700)] disabled:opacity-50">
                      {pagando === l.parceiro.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Marcar {brl(l.total)} como pago
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
