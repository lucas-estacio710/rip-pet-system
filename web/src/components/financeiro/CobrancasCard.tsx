'use client'

// COBRANÇAS ENTRE UNIDADES — a caixa de entrada e a faixa de saldo.
//
// Fica no topo de Lançamentos porque é lá que o gerente já vai todo dia. Uma
// cobrança que ninguém vê não é cobrança: é uma linha esquecida numa tabela.
//
// O princípio (docs/COBRANCAS_ENTRE_UNIDADES.md): NINGUÉM ESCREVE NO LIVRO DO
// OUTRO. Quem compra por outra unidade emite um documento; a despesa só entra na
// DRE de quem consumiu quando essa unidade RECONHECE. Recusar é um direito, e
// devolve o custo para quem comprou.
//
// ⚠️ O aceite de uma compra gera DUAS pernas de uma vez:
//   · despesa no livro de quem aceita (o custo é dele — foi ele quem consumiu)
//   · receita de reembolso no livro de quem comprou (neutraliza a despesa lá)
// Nascem juntas de propósito. Se nascessem em momentos diferentes, o grupo teria
// um período contando o mesmo gasto duas vezes. Escrever no livro do emissor é
// legítimo aqui porque foi ele quem emitiu — o consentimento é o próprio ato.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, Check, X, ArrowRight, Inbox, Clock } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import Modal from '@/components/ui/Modal'
import { fmtBRL, fmtData } from '@/lib/financeiro'
import {
  TIPOS, STATUS, fraseDoSaldo, CONTA_ACERTO_RECEITA,
  type Cobranca, type SaldoComUnidade,
} from '@/lib/cobrancas'

type CobrancaCompleta = Cobranca & {
  credora?: { codigo: string; nome: string } | null
  devedora?: { codigo: string; nome: string } | null
  fin_categorias?: {
    nome: string
    fin_conta_id: string | null
    fin_contas?: { codigo: string; nome: string; natureza: string } | null
  } | null
}

export default function CobrancasCard({ onMudou }: { onMudou?: () => void }) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { currentUnit, userName } = useUnit()

  const [aReceber, setAReceber] = useState<CobrancaCompleta[]>([])   // esperando MINHA resposta
  const [emitidas, setEmitidas] = useState<CobrancaCompleta[]>([])   // EU emiti, esperando o outro
  const [saldos, setSaldos] = useState<SaldoComUnidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)

  // recusa: exige motivo, porque quem emitiu vai receber o custo de volta e
  // precisa saber por quê.
  const [recusando, setRecusando] = useState<CobrancaCompleta | null>(null)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    if (!currentUnit?.id) return
    setCarregando(true)

    const campos =
      'id, unidade_credora, unidade_devedora, tipo, valor, data, descricao, categoria_id, ' +
      'status, lancamento_origem_id, lancamento_aceite_id, pagamento_id, conta_id, repasse_id, ' +
      'criado_por_nome, recusa_motivo, created_at, ' +
      'credora:unidades!fin_cobrancas_unidade_credora_fkey(codigo, nome), ' +
      'devedora:unidades!fin_cobrancas_unidade_devedora_fkey(codigo, nome), ' +
      'fin_categorias(nome, fin_conta_id, fin_contas(codigo, nome, natureza))'

    const [entrada, saida, saldo] = await Promise.all([
      supabase.from('fin_cobrancas').select(campos)
        .eq('unidade_devedora', currentUnit.id).eq('status', 'emitida')
        .order('data', { ascending: false }),
      supabase.from('fin_cobrancas').select(campos)
        .eq('unidade_credora', currentUnit.id).in('status', ['emitida', 'recusada'])
        .order('data', { ascending: false }),
      supabase.from('vw_saldo_entre_unidades')
        .select('contraparte_id, contraparte_codigo, contraparte_nome, a_receber, a_pagar, saldo')
        .eq('unidade_id', currentUnit.id),
    ])

    setAReceber((entrada.data as unknown as CobrancaCompleta[]) || [])
    setEmitidas((saida.data as unknown as CobrancaCompleta[]) || [])
    setSaldos((saldo.data as unknown as SaldoComUnidade[]) || [])
    setCarregando(false)
  }, [supabase, currentUnit?.id])

  useEffect(() => { void carregar() }, [carregar])

  /** Reconhece a cobrança — e é aqui que o custo entra na DRE de quem aceita. */
  async function aceitar(c: CobrancaCompleta) {
    if (!currentUnit?.id) return
    setProcessando(c.id)
    try {
      let lancamentoAceiteId: string | null = null

      // Recebimento de cliente alheio NÃO gera lançamento: a receita já é lida
      // de `contratos`, na unidade dona do contrato. O que a cobrança cria é o
      // direito a receber o dinheiro que ficou na conta da outra unidade.
      if (c.tipo === 'despesa_rateada' || c.tipo === 'outro') {
        const conta = c.fin_categorias?.fin_contas
        const { data: { user } } = await supabase.auth.getUser()
        // As duas pernas nascem conferidas por quem RECONHECEU a cobrança.
        const marca = {
          status: 'aprovado',
          aprovado_por: user?.id || null,
          aprovado_por_nome: userName || null,
          aprovado_em: new Date().toISOString(),
        }

        // 1) a despesa, no livro de quem aceita — foi ele quem consumiu.
        //    Sem `data_caixa`: o dinheiro não saiu da conta dele. Vai sair
        //    quando o saldo entre as empresas for liquidado.
        const { data: desp, error: e1 } = await supabase
          .from('fin_lancamentos')
          .insert({
            unidade_id: currentUnit.id,
            categoria_id: c.categoria_id,
            conta_id: c.fin_categorias?.fin_conta_id || null,
            conta_codigo: conta?.codigo || null,      // SNAPSHOT da DRE histórica
            conta_nome: conta?.nome || null,
            natureza: conta?.natureza || 'opex',
            valor: c.valor,
            data_competencia: c.data,
            data_caixa: null,
            descricao: c.descricao || 'Compra por outra unidade',
            fornecedor_nome: c.credora?.nome || null,
            // RECONHECER JÁ É A CONFERÊNCIA — é a única do módulo (24/09/2026).
            // Nascer `pendente` pedia uma segunda conferência do mesmo gasto.
            ...marca,
            origem: 'cobranca',
            criado_por_nome: userName || null,
            rateio_meses: 1,
          })
          .select('id').single()
        if (e1) throw new Error(e1.message)
        lancamentoAceiteId = (desp as { id: string }).id

        // 2) o reembolso, no livro de quem comprou — neutraliza a despesa lá.
        //    Nasce junto de propósito: separadas no tempo, o grupo contaria o
        //    mesmo gasto duas vezes no intervalo.
        const { data: ctaReemb } = await supabase
          .from('fin_contas').select('id, codigo, nome')
          .eq('codigo', CONTA_ACERTO_RECEITA).maybeSingle()
        const cr = ctaReemb as { id: string; codigo: string; nome: string } | null

        await supabase.from('fin_lancamentos').insert({
          unidade_id: c.unidade_credora,
          conta_id: cr?.id || null,
          conta_codigo: cr?.codigo || null,
          conta_nome: cr?.nome || null,
          natureza: 'opex',
          valor: c.valor,
          data_competencia: c.data,
          data_caixa: null,
          descricao: `Reembolso — ${c.descricao || 'compra'} (${currentUnit.codigo})`,
          ...marca,
          origem: 'cobranca',
          criado_por_nome: userName || null,
          rateio_meses: 1,
        })
      }

      const { error } = await supabase.from('fin_cobrancas').update({
        status: 'aceita',
        aceita_em: new Date().toISOString(),
        lancamento_aceite_id: lancamentoAceiteId,
      }).eq('id', c.id)
      if (error) throw new Error(error.message)

      toast(`Reconhecido — ${fmtBRL(c.valor)}`, 'success')
      void carregar()
      onMudou?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao reconhecer', 'error')
    } finally {
      setProcessando(null)
    }
  }

  async function recusar() {
    if (!recusando) return
    if (!motivo.trim()) return toast('Explique o motivo', 'error')
    setProcessando(recusando.id)
    const { error } = await supabase.from('fin_cobrancas').update({
      status: 'recusada',
      recusa_motivo: motivo.trim(),
      aceita_em: new Date().toISOString(),
    }).eq('id', recusando.id)
    setProcessando(null)
    if (error) return toast(error.message, 'error')
    toast('Cobrança devolvida a quem emitiu', 'success')
    setRecusando(null); setMotivo('')
    void carregar()
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--surface-400)] px-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> conferindo acertos…
      </div>
    )
  }

  const recusadasMinhas = emitidas.filter(c => c.status === 'recusada')
  const aguardando = emitidas.filter(c => c.status === 'emitida')
  if (!aReceber.length && !emitidas.length && !saldos.length) return null

  return (
    <div className="space-y-3">
      {/* ── FAIXA DE SALDO ────────────────────────────────────────────────────
          "Você deve R$ X à Matriz." Uma linha por contraparte. Não é caixa:
          é o combinado entre as empresas, e por isso fica fora do Caixa. */}
      {saldos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saldos.map(s => {
            const aFavor = s.saldo > 0
            return (
              <div
                key={s.contraparte_id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] border text-xs"
                style={{
                  borderColor: aFavor ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)',
                  background: aFavor ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                }}
              >
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: aFavor ? '#10b981' : '#f59e0b',
                           transform: aFavor ? undefined : 'rotate(180deg)' }}
                />
                <span style={{ color: aFavor ? '#10b981' : '#f59e0b' }}>{fraseDoSaldo(s)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── CAIXA DE ENTRADA: esperando MINHA resposta ───────────────────── */}
      {aReceber.length > 0 && (
        <div className="card p-3 space-y-2" style={{ borderColor: 'rgba(245,158,11,0.35)' }}>
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              Acertos aguardando você
            </h3>
            <span className="ml-auto text-mono text-sm text-[var(--surface-700)]">
              {fmtBRL(aReceber.reduce((s, c) => s + Number(c.valor), 0))}
            </span>
          </div>

          <p className="text-[11px] text-[var(--surface-500)]">
            Ao reconhecer, o valor entra como despesa desta unidade. Se não for
            seu, recuse — o custo volta para quem lançou.
          </p>

          <div className="divide-y divide-[var(--surface-200)]">
            {aReceber.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--surface-800)] truncate">
                    {c.descricao || TIPOS[c.tipo].rotulo}
                  </p>
                  <p className="text-xs text-[var(--surface-500)] truncate">
                    {TIPOS[c.tipo].frase(c.credora?.nome || 'Outra unidade')}
                    {' · '}{fmtData(c.data)}
                    {c.fin_categorias?.nome && ` · ${c.fin_categorias.nome}`}
                    {c.criado_por_nome && ` · por ${c.criado_por_nome}`}
                  </p>
                </div>
                <span className="text-mono text-sm text-[var(--surface-800)]">{fmtBRL(c.valor)}</span>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => void aceitar(c)}
                    disabled={processando === c.id}
                    className="btn-primary text-xs px-3 py-1"
                  >
                    {processando === c.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><Check className="h-3.5 w-3.5" /> Reconhecer</>}
                  </button>
                  <button
                    onClick={() => { setRecusando(c); setMotivo('') }}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    <X className="h-3.5 w-3.5" /> Não é meu
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── O QUE EU EMITI: acompanhamento ────────────────────────────────── */}
      {(aguardando.length > 0 || recusadasMinhas.length > 0) && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--surface-400)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--surface-600)]">
              Acertos que você lançou
            </h3>
          </div>
          <div className="divide-y divide-[var(--surface-200)]">
            {[...aguardando, ...recusadasMinhas].map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--surface-800)] truncate">
                    {c.descricao || TIPOS[c.tipo].rotulo}
                    <span className="text-[var(--surface-500)]"> · {c.devedora?.nome}</span>
                  </p>
                  <p className="text-xs truncate" style={{ color: STATUS[c.status].cor }}>
                    {STATUS[c.status].rotulo}
                    {c.recusa_motivo && ` — ${c.recusa_motivo}`}
                  </p>
                </div>
                <span className="text-mono text-sm text-[var(--surface-700)]">{fmtBRL(c.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recusa: motivo obrigatório — quem emitiu vai receber o custo de volta */}
      <Modal
        isOpen={!!recusando}
        onClose={() => { setRecusando(null); setMotivo('') }}
        title="Devolver este acerto"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => { setRecusando(null); setMotivo('') }} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button onClick={() => void recusar()} disabled={!!processando} className="btn-primary text-sm">
              <X className="h-4 w-4" /> Devolver
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--surface-600)]">
            {recusando && (
              <>
                {fmtBRL(recusando.valor)} lançado por {recusando.credora?.nome}
                {recusando.descricao && ` — ${recusando.descricao}`}.
                O custo volta para quem lançou.
              </>
            )}
          </p>
          <div>
            <label className="text-xs text-[var(--surface-500)] block mb-1">Motivo</label>
            <input
              autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: essa compra foi para a Matriz, não para cá"
              className="input text-sm w-full"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
