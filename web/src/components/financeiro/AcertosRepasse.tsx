'use client'

// ACERTOS DO REPASSE — a aba 2 da tela de Repasse (02/10/2026).
//
// Acerto = o que a Matriz e a unidade compensam entre si no repasse do mês
// (o sistema que a unidade paga, o tráfego pago rateado, um material...). Mão
// dupla: a Matriz cobra da unidade (ACRESCE ao que ela paga) ou deve a ela
// (ABATE).
//
// 🔴 SEM "RECONHECER" (decisão do Lucas, 02/10/2026): "o pagamento é o próprio
// reconhecimento... se o valor estiver errado a unidade não paga, eles discutem
// no zap até a Matriz ajustar no repasse... já tá tudo reconhecido." Então o
// acerto lançado aqui JÁ conta: nasce `aceita` e cria na hora as duas pernas na
// DRE (lib/reconhecer-cobranca) — despesa de quem deve, reembolso de quem cobra,
// sem `data_caixa` porque nenhum dinheiro andou. O dinheiro anda uma vez só,
// líquido, quando a unidade quita o repasse em Lançamentos especiais.
// ⚠️ Isto é uma exceção consciente ao princípio "ninguém escreve no livro do
// outro" (FLOW_FINANCEIRO §9.5), restrita aos acertos do repasse — a compra
// externa ("Comprei para outra unidade") segue com o Reconhecer.
//
// A Matriz AJUSTA apagando e relançando: apagar leva as duas pernas juntas
// (despesa em `lancamento_aceite_id`, reembolso em `lancamento_origem_id`).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Loader2, Plus, Trash2, ArrowRight, ArrowLeft } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import { fmtBRL, fmtData, colarValorBR } from '@/lib/financeiro'
import { buscarCategorias } from '@/lib/busca-categoria'
import { criarIndice, sugerir } from '@/lib/similaridade'
import { reconhecerCobranca, ORIGEM_PERNA_COBRANCA } from '@/lib/reconhecer-cobranca'

type Cat = {
  id: string; nome: string; parent_id: string | null; termos: string[] | null
  fin_conta_id: string | null; fin_contas?: { codigo: string; nome: string; natureza: string } | null
}
type Acerto = {
  id: string; descricao: string | null; valor: number; data: string; status: string
  unidade_credora: string; unidade_devedora: string; categoria_id: string | null
  lancamento_aceite_id: string | null; lancamento_origem_id: string | null; repasse_id: string | null
}

const soDigitos = (t: string) => t.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12)
const emNumero = (d: string) => Number(d || '0') / 100
const emTexto = (d: string) => emNumero(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AcertosRepasse({
  matrizId, unidadeId, unidadeNome, unidadeCodigo, repasseId, mes, travado, onMudou,
}: {
  matrizId: string
  unidadeId: string
  unidadeNome: string
  unidadeCodigo: string
  repasseId: string | null      // repasse vivo do mês, se já salvo
  mes: string                   // YYYY-MM do repasse — data padrão do acerto
  travado: boolean              // pago, ou a unidade só consultando
  onMudou: () => void           // recarrega o repasse (o total muda)
}) {
  const supabase = createClient() as unknown as SupabaseClient
  const { toast } = useToast()
  const { userName } = useUnit()

  const [acertos, setAcertos] = useState<Acerto[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [historico, setHistorico] = useState<{ descricao: string; categoria_id: string; data: string }[]>([])
  const [matrizNome, setMatrizNome] = useState('Matriz')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // formulário
  const [matrizCobra, setMatrizCobra] = useState(true)   // true = acresce · false = abate
  const [descricao, setDescricao] = useState('')
  const [catBusca, setCatBusca] = useState('')
  const [catId, setCatId] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(`${mes}-01`)

  useEffect(() => { setData(`${mes}-01`) }, [mes])

  const porId = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])
  const caminhoDe = useCallback((id: string) => {
    const partes: string[] = []
    let c = porId.get(id)
    while (c) { partes.unshift(c.nome); c = c.parent_id ? porId.get(c.parent_id) : undefined }
    return partes.join(' › ')
  }, [porId])
  const folhas = useMemo(() => cats.filter(c => !cats.some(k => k.parent_id === c.id)), [cats])

  const carregar = useCallback(async () => {
    if (!matrizId || !unidadeId) return
    setCarregando(true)
    const par = `and(unidade_credora.eq.${matrizId},unidade_devedora.eq.${unidadeId}),` +
                `and(unidade_credora.eq.${unidadeId},unidade_devedora.eq.${matrizId})`
    const [{ data: cs }, { data: ct }, { data: hs }, { data: mz }] = await Promise.all([
      supabase.from('fin_cobrancas')
        .select('id, descricao, valor, data, status, unidade_credora, unidade_devedora, categoria_id, lancamento_aceite_id, lancamento_origem_id, repasse_id')
        .or(par).in('tipo', ['despesa_rateada', 'outro']).in('status', ['emitida', 'aceita', 'liquidada'])
        .order('data'),
      supabase.from('fin_categorias')
        .select('id, nome, parent_id, termos, fin_conta_id, fin_contas(codigo, nome, natureza)')
        .eq('ativo', true).order('nivel').order('ordem'),
      // A MEMÓRIA: acertos anteriores (de qualquer unidade) — descrição → categoria.
      supabase.from('fin_cobrancas').select('descricao, categoria_id, data')
        .not('categoria_id', 'is', null).not('descricao', 'is', null)
        .order('created_at', { ascending: false }).limit(1000),
      supabase.from('unidades').select('nome').eq('id', matrizId).maybeSingle(),
    ])
    // Deste repasse: os já embutidos nele, e os soltos que ainda vão entrar.
    setAcertos(((cs as Acerto[] | null) || []).filter(a => a.repasse_id === null || a.repasse_id === repasseId))
    setCats((ct as unknown as Cat[] | null) || [])
    setHistorico((hs as { descricao: string; categoria_id: string; data: string }[] | null) || [])
    if (mz) setMatrizNome((mz as { nome: string }).nome)
    setCarregando(false)
  }, [supabase, matrizId, unidadeId, repasseId])

  useEffect(() => { void carregar() }, [carregar])

  // categoria: a busca de sempre (nome + caminho + sinônimo)...
  const achados = !catId && catBusca.trim().length >= 2 ? buscarCategorias(folhas, caminhoDe, catBusca, 6) : []
  // ...e a sugestão pelo HISTÓRICO, a partir da descrição digitada.
  const indice = useMemo(() => criarIndice(historico.map(h => ({
    texto: h.descricao, decisao: h.categoria_id, chave: h.categoria_id, data: (h.data || '').slice(0, 10),
  }))), [historico])
  const sugestoes = !catId && descricao.trim().length >= 3 ? sugerir(indice, descricao, undefined, { max: 3 }).sugestoes : []

  async function lancar() {
    const v = emNumero(valor)
    if (!descricao.trim()) return toast('Descreva o acerto', 'error')
    if (!catId) return toast('Escolha a categoria — é ela que diz onde a despesa cai na DRE', 'error')
    if (!v) return toast('Informe o valor', 'error')
    setSalvando(true)
    try {
      const credora = matrizCobra ? matrizId : unidadeId
      const devedora = matrizCobra ? unidadeId : matrizId
      const { data: nova, error } = await supabase.from('fin_cobrancas').insert({
        unidade_credora: credora, unidade_devedora: devedora,
        tipo: 'despesa_rateada', categoria_id: catId,
        valor: v, data, descricao: descricao.trim(),
        status: 'emitida', criado_por_nome: userName || null,
      }).select('id').single()
      if (error) throw new Error(error.message)
      const cat = porId.get(catId)
      // Já reconhecido: as duas pernas na DRE nascem agora.
      await reconhecerCobranca(supabase, {
        id: (nova as { id: string }).id, tipo: 'despesa_rateada', valor: v, data,
        descricao: descricao.trim(), categoria_id: catId,
        unidade_credora: credora, unidade_devedora: devedora,
        credoraNome: matrizCobra ? matrizNome : unidadeNome,
        devedoraCodigo: matrizCobra ? unidadeCodigo : 'Matriz',
        fin_categorias: cat ? { fin_conta_id: cat.fin_conta_id, fin_contas: cat.fin_contas } : null,
      }, { userName: userName || null }, { guardarReembolsoEmOrigem: true })
      toast(`Acerto lançado — ${matrizCobra ? 'acresce' : 'abate'} ${fmtBRL(v)}`, 'success')
      setDescricao(''); setCatBusca(''); setCatId(''); setValor('')
      void carregar(); onMudou()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao lançar o acerto', 'error')
    } finally {
      setSalvando(false)
    }
  }

  // O "contar" SAIU (02/10/2026): deixava a Matriz pular o aceite de uma cobrança
  // lançada como "cobrar agora". O que vai pelo repasse já nasce contando; o que é
  // `emitida` aqui espera a unidade reconhecer em Acertos entre unidades.

  /** Apagar = ajustar. Leva as duas pernas da DRE junto. */
  async function apagar(a: Acerto) {
    try {
      // Só apaga lançamento que NASCEU da cobrança (ORIGEM_PERNA_COBRANCA). Numa
      // compra externa, `lancamento_origem_id` é a compra original de quem
      // pagou — essa não é deste acerto e não pode sumir.
      const ids = [a.lancamento_aceite_id, a.lancamento_origem_id].filter((x): x is string => !!x)
      const { data: ls } = ids.length
        ? await supabase.from('fin_lancamentos').select('id, origem').in('id', ids)
        : { data: [] }
      const pernas = ((ls as { id: string; origem: string }[] | null) || []).filter(l => l.origem === ORIGEM_PERNA_COBRANCA).map(l => l.id)
      const { error } = await supabase.from('fin_cobrancas').delete().eq('id', a.id)
      if (error) throw new Error(error.message)
      if (pernas.length) {
        const { error: e2 } = await supabase.from('fin_lancamentos').delete().in('id', pernas)
        if (e2) throw new Error(`O acerto saiu, mas as pernas na DRE não: ${e2.message}`)
      }
      toast('Acerto apagado — e as duas pernas na DRE', 'success')
      void carregar(); onMudou()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao apagar', 'error')
    }
  }

  const acresce = acertos.filter(a => a.unidade_credora === matrizId && a.status !== 'emitida').reduce((s, a) => s + Number(a.valor), 0)
  const abate = acertos.filter(a => a.unidade_credora === unidadeId && a.status !== 'emitida').reduce((s, a) => s + Number(a.valor), 0)

  return (
    <div className="space-y-3">
      {!travado && (
        <div className="card p-3 space-y-3">
          {/* MÃO DUPLA — quem cobra de quem, com o efeito no repasse à vista. */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, t: `${matrizNome} cobra de ${unidadeNome}`, s: 'acresce no repasse · despesa da unidade', Icon: ArrowRight, cor: '#3b82f6' },
              { v: false, t: `${unidadeNome} cobra da ${matrizNome}`, s: 'abate no repasse · despesa da Matriz', Icon: ArrowLeft, cor: '#10b981' },
            ].map(op => {
              const on = matrizCobra === op.v
              return (
                <button key={String(op.v)} type="button" onClick={() => setMatrizCobra(op.v)}
                        className="text-left rounded-[var(--radius-md)] border px-3 py-2 transition-colors"
                        style={{ borderColor: on ? op.cor : 'var(--surface-200)', background: on ? `${op.cor}14` : 'transparent' }}>
                  <span className="flex items-center gap-1.5 text-sm" style={{ color: on ? op.cor : 'var(--surface-700)' }}>
                    <op.Icon className="h-4 w-4 shrink-0" /> {op.t}
                  </span>
                  <span className="block text-[11px] text-[var(--surface-400)]">{op.s}</span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-2">
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="O que é (ex.: Sistema de abril, tráfego pago)"
                   className="input text-sm" />
            <input inputMode="numeric" value={valor ? emTexto(valor) : ''} placeholder="0,00"
                   onChange={e => setValor(soDigitos(e.target.value))}
                   onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); setValor(d) } }}
                   className="input text-sm text-mono text-right" />
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm" title="Mês da DRE em que o acerto cai" />
          </div>

          {/* CATEGORIA — onde a despesa cai na DRE de quem deve. Busca de sempre
              + o que acertos parecidos usaram antes. */}
          <div className="space-y-1">
            <input value={catId ? caminhoDe(catId) : catBusca}
                   onChange={e => { setCatBusca(e.target.value); setCatId('') }}
                   placeholder="Categoria… (ex.: sistema, tráfego, sacos)"
                   className="input text-sm w-full" style={!catId ? { borderColor: '#f59e0b' } : undefined} />
            {sugestoes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sugestoes.map(s => (
                  <button key={s.chave} type="button" onClick={() => { setCatId(s.decisao); setCatBusca('') }}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--surface-300)] text-[var(--surface-500)] hover:border-sky-500 hover:text-sky-500"
                          title={`Acertos parecidos usaram — ${s.vezes}×`}>
                    {caminhoDe(s.decisao)} — {s.vezes}×
                  </button>
                ))}
              </div>
            )}
            {achados.length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] divide-y divide-[var(--surface-200)]">
                {achados.map(({ c, termoBatido, forte }) => (
                  <button key={c.id} type="button" onClick={() => { setCatId(c.id); setCatBusca('') }}
                          className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--surface-50)] flex gap-2">
                    <span className="flex-1 truncate">{caminhoDe(c.id)}</span>
                    {!forte && termoBatido && <span className="text-[10px] text-[var(--surface-400)]">“{termoBatido}”</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={() => void lancar()} disabled={salvando} className="btn-primary text-sm">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Lançar acerto
            </button>
          </div>
        </div>
      )}

      <div className="card p-3">
        <div className="flex items-center gap-3 mb-2 text-xs">
          <span className="font-semibold text-[var(--surface-600)] uppercase tracking-wide">Acertos do mês</span>
          {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--surface-400)]" />}
          <span className="ml-auto text-[var(--surface-500)]">
            acresce <span className="text-mono text-blue-400">+{fmtBRL(acresce)}</span>
            {' · '}abate <span className="text-mono text-emerald-400">−{fmtBRL(abate)}</span>
          </span>
        </div>
        {!acertos.length ? (
          <p className="text-xs text-[var(--surface-400)] py-3 text-center">Nenhum acerto neste repasse.</p>
        ) : (
          <div className="divide-y divide-[var(--surface-200)]">
            {acertos.map(a => {
              const matrizCobrou = a.unidade_credora === matrizId
              return (
                <div key={a.id} className="flex items-center gap-2 py-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: matrizCobrou ? 'rgba(59,130,246,0.14)' : 'rgba(16,185,129,0.14)', color: matrizCobrou ? '#3b82f6' : '#10b981' }}>
                    {matrizCobrou ? 'acresce' : 'abate'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--surface-800)] truncate">{a.descricao || 'Acerto'}</p>
                    <p className="text-[11px] text-[var(--surface-400)] truncate">
                      {fmtData(a.data)} · {a.categoria_id ? caminhoDe(a.categoria_id) : <span className="text-amber-500">sem categoria — a despesa cai sem classificação na DRE</span>}
                    </p>
                  </div>
                  <span className="text-mono text-sm shrink-0" style={{ color: matrizCobrou ? '#3b82f6' : '#10b981' }}>
                    {matrizCobrou ? '+' : '−'}{fmtBRL(Number(a.valor))}
                  </span>
                  {a.status === 'emitida' && (
                    <span className="text-[11px] text-amber-500 shrink-0" title="Não conta no total até a unidade reconhecer em Acertos entre unidades">
                      aguardando a unidade
                    </span>
                  )}
                  {!travado && (
                    <button onClick={() => void apagar(a)} title="Apagar (leva as duas pernas da DRE)"
                            className="text-[var(--surface-400)] hover:text-red-400 shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
