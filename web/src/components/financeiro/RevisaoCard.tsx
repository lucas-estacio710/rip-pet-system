'use client'

// FILA DE REVISÃO — o que ainda ninguém conferiu.
//
// A fase 1 do doc previa "revisora confere na fila (ou aprova em lote)" e isso
// nunca foi construído: `status` nascia `pendente` e morria `pendente`, com
// `aprovado_por` nulo em 10 de 10 lançamentos. A coluna existia e não havia tela.
//
// ⚠️ O QUE CADA AÇÃO MUDA DE VERDADE — e é aqui que a fila deixa de ser teatro:
//
//   Conferir  → status 'aprovado'. **Não muda número nenhum.** O gasto já contava.
//   Rejeitar  → status 'rejeitado'. **SAI da DRE e do Caixa na hora**, porque as
//               duas views filtram `status in ('pendente','aprovado')`.
//
// A assimetria é proposital. O gasto ACONTECEU independentemente de alguém
// clicar; tirá-lo da DRE por falta de conferência subestimaria a despesa e
// inflaria o lucro — o mesmo erro conceitual que a mig 114 corrigiu no custo de
// cremação. Quem sai do resultado é o lançamento ERRADO, não o não-revisado.
//
// Por isso a fila não é um portão: é uma lista de trabalho. O valor dela não está
// em barrar, está em alguém OLHAR — a maior parte dos erros aqui não é de valor,
// é de categoria, e categoria errada faz a DRE mentir sem que nenhum total mude.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as Icons from 'lucide-react'
import { Loader2, Check, X, ClipboardCheck } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import Modal from '@/components/ui/Modal'
import { fmtBRL, fmtData } from '@/lib/financeiro'

type Pendente = {
  id: string
  descricao: string | null
  valor: number
  data_competencia: string
  fornecedor_nome: string | null
  criado_por_nome: string | null
  created_at: string
  origem: string
  fin_categorias?: { nome: string; icone: string | null } | null
  /** Horas de espera, medidas UMA VEZ no carregamento. Ler o relógio durante o
   *  render é impuro — o React Compiler barra, e com razão: dois renders do
   *  mesmo estado dariam telas diferentes. */
  horas: number
}

/** Há quanto tempo espera. Cor pelo mesmo critério de `/tarefas`. */
function idade(h: number): { texto: string; cor: string | null } {
  if (h < 24) return { texto: `há ${Math.max(1, Math.round(h))}h`, cor: null }
  const d = Math.round(h / 24)
  return { texto: `há ${d}d`, cor: h >= 168 ? '#ef4444' : '#f59e0b' }
}

function IconeCat({ nome, className }: { nome?: string | null; className?: string }) {
  const C = (nome && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nome]) || Icons.Tag
  return <C className={className} />
}

export default function RevisaoCard({ onMudou }: { onMudou?: () => void }) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [itens, setItens] = useState<Pendente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)     // a lista abre fechada
  const [rejeitando, setRejeitando] = useState<Pendente | null>(null)
  const [motivo, setMotivo] = useState('')

  // Extraído antes do callback de propósito: com `currentUnit?.id` direto na
  // lista de dependências, o React Compiler infere `currentUnit` inteiro, não
  // bate com o que foi declarado e desiste de otimizar o componente.
  const unidadeId = currentUnit?.id

  const carregar = useCallback(async () => {
    if (!unidadeId) return
    // Sem `setCarregando(true)` aqui: o estado já nasce carregando, e marcá-lo
    // de novo dentro do efeito dispara um render em cascata. Nos recarregamentos
    // (depois de conferir ou rejeitar) o feedback já vem do botão, que vira
    // spinner por conta do `processando`.
    // ⚠️ SEM filtro de mês, de propósito: a fila é uma lista de trabalho, não um
    // relatório de período. Um lançamento de junho que ninguém olhou precisa
    // continuar aparecendo em setembro — filtrar pelo mês da tela o esconderia
    // exatamente quando ele já está atrasado.
    const { data } = await supabase
      .from('fin_lancamentos')
      .select('id, descricao, valor, data_competencia, fornecedor_nome, criado_por_nome, created_at, origem, fin_categorias(nome, icone)')
      .eq('unidade_id', unidadeId)
      .eq('status', 'pendente')
      .order('data_competencia', { ascending: true })   // mais antigo primeiro
      .limit(500)
    const agora = Date.now()
    setItens(((data as unknown as Pendente[]) || []).map(l => ({
      ...l, horas: (agora - new Date(l.created_at).getTime()) / 36e5,
    })))
    setCarregando(false)
  }, [supabase, unidadeId])

  useEffect(() => { void carregar() }, [carregar])

  /** Campos de quem revisou — valem para os DOIS desfechos, não só a aprovação.
   *  Numa rejeição, saber quem decidiu é ainda mais importante. */
  async function marcaDeRevisao() {
    const { data: { user } } = await supabase.auth.getUser()
    return {
      aprovado_por: user?.id || null,
      aprovado_por_nome: userName || null,
      aprovado_em: new Date().toISOString(),
    }
  }

  async function conferir(ids: string[]) {
    if (!ids.length) return
    setProcessando(ids.length === 1 ? ids[0] : 'lote')
    const { error } = await supabase.from('fin_lancamentos')
      .update({ status: 'aprovado', ...(await marcaDeRevisao()) })
      .in('id', ids)
    setProcessando(null)
    if (error) return toast(error.message, 'error')
    toast(ids.length === 1 ? 'Conferido' : `${ids.length} lançamentos conferidos`, 'success')
    void carregar()
    onMudou?.()
  }

  async function rejeitar() {
    if (!rejeitando) return
    if (!motivo.trim()) return toast('Explique o que está errado', 'error')
    setProcessando(rejeitando.id)
    const { error } = await supabase.from('fin_lancamentos')
      .update({
        status: 'rejeitado',
        observacoes: motivo.trim(),
        ...(await marcaDeRevisao()),
      })
      .eq('id', rejeitando.id)
    setProcessando(null)
    if (error) return toast(error.message, 'error')
    toast('Rejeitado — saiu da DRE e do caixa', 'success')
    setRejeitando(null); setMotivo('')
    void carregar()
    onMudou?.()
  }

  if (carregando || itens.length === 0) return null

  const total = itens.reduce((s, l) => s + Number(l.valor || 0), 0)
  const atrasados = itens.filter(l => l.horas >= 168)

  return (
    <>
      <div className="card p-3 space-y-2">
        <button
          onClick={() => setAberto(a => !a)}
          className="w-full flex items-center gap-2 text-left"
        >
          <ClipboardCheck className="h-4 w-4 text-[var(--surface-500)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--surface-600)]">
            Aguardando conferência
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--surface-100)', color: 'var(--surface-500)' }}>
            {itens.length}
          </span>
          {atrasados.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}>
              {atrasados.length} há mais de uma semana
            </span>
          )}
          <span className="ml-auto text-mono text-sm text-[var(--surface-700)]">{fmtBRL(total)}</span>
          <Icons.ChevronDown
            className={`h-4 w-4 text-[var(--surface-400)] transition-transform ${aberto ? 'rotate-180' : ''}`}
          />
        </button>

        {aberto && (
          <>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-[var(--surface-500)] flex-1">
                Conferir não muda valor nenhum — o gasto já conta na DRE. Rejeitar
                tira o lançamento do resultado e do caixa.
              </p>
              <button
                onClick={() => void conferir(itens.map(i => i.id))}
                disabled={processando === 'lote'}
                className="btn-secondary text-xs py-1 shrink-0"
              >
                {processando === 'lote'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                Conferir todos
              </button>
            </div>

            <div className="divide-y divide-[var(--surface-200)]">
              {itens.map(l => {
                const t = idade(l.horas)
                return (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-100)] flex items-center justify-center shrink-0">
                      <IconeCat nome={l.fin_categorias?.icone} className="h-4 w-4 text-[var(--surface-500)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--surface-800)] truncate">
                        {l.fin_categorias?.nome || 'Sem categoria'}
                        {l.fornecedor_nome && <span className="text-[var(--surface-500)]"> · {l.fornecedor_nome}</span>}
                      </p>
                      <p className="text-xs text-[var(--surface-500)] truncate">
                        {fmtData(l.data_competencia)}
                        {l.descricao && ` · ${l.descricao}`}
                        {/* Quem lançou fica à vista. Numa unidade pequena a mesma
                            pessoa lança e confere, e bloquear isso travaria a
                            operação — mostrar resolve sem impedir. */}
                        {l.criado_por_nome && ` · por ${l.criado_por_nome}`}
                        <span style={{ color: t.cor || undefined }}> · {t.texto}</span>
                      </p>
                    </div>
                    <span className="text-mono text-sm text-[var(--surface-800)]">{fmtBRL(l.valor)}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => void conferir([l.id])}
                        disabled={processando === l.id}
                        className="btn-primary text-xs px-3 py-1"
                      >
                        {processando === l.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><Check className="h-3.5 w-3.5" /> Conferir</>}
                      </button>
                      <button
                        onClick={() => { setRejeitando(l); setMotivo('') }}
                        className="btn-secondary text-xs px-3 py-1"
                      >
                        <X className="h-3.5 w-3.5" /> Rejeitar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Rejeitar exige motivo: é a única ação aqui que muda número, e quem
          lançou precisa saber o que corrigir. */}
      <Modal
        isOpen={!!rejeitando}
        onClose={() => { setRejeitando(null); setMotivo('') }}
        title="Rejeitar este lançamento"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => { setRejeitando(null); setMotivo('') }} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button onClick={() => void rejeitar()} disabled={!!processando} className="btn-primary text-sm">
              <X className="h-4 w-4" /> Rejeitar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--surface-600)]">
            {rejeitando && (
              <>
                {fmtBRL(rejeitando.valor)} em {rejeitando.fin_categorias?.nome || 'sem categoria'}
                {rejeitando.criado_por_nome && `, lançado por ${rejeitando.criado_por_nome}`}.
                {' '}Sai da DRE e do caixa; o registro continua existindo, com o motivo.
              </>
            )}
          </p>
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">O que está errado</label>
            <input
              autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: duplicado — já lançado no dia 12"
              className="input text-sm w-full"
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
