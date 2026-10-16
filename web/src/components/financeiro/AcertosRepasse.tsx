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
import { semReceitas } from '@/lib/categoria-receita'
import { criarIndice, sugerir } from '@/lib/similaridade'
import { reconhecerCobranca, ORIGEM_PERNA_COBRANCA } from '@/lib/reconhecer-cobranca'
import TrilhaCustoModal from './TrilhaCustoModal'

type Cat = {
  id: string; nome: string; parent_id: string | null; termos: string[] | null
  fin_conta_id: string | null; fin_contas?: { codigo: string; nome: string; natureza: string } | null
}
type Acerto = {
  id: string; tipo: string; descricao: string | null; valor: number; data: string; status: string
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
  // NATUREZA (08/10/2026): nem todo acerto é despesa. "Tutor da unidade pagou na
  // Matriz" é dinheiro da unidade que a Matriz segurou — a receita já está no
  // contrato. Lançar como despesa daria receita em DOBRO pra unidade e uma
  // despesa inexistente pra Matriz. Vira `recebimento_terceiro`: só abate/acresce
  // no repasse, sem perna na DRE (reconhecerCobranca não cria lançamento pra ele).
  const [natureza, setNatureza] = useState<'despesa' | 'recebimento'>('despesa')
  // EDITAR (08/10/2026 — "não consigo editar os lançamentos dos acertos"): o
  // acerto clicado carrega no formulário; salvar regrava o acerto E as pernas.
  const [editando, setEditando] = useState<Acerto | null>(null)
  const [trilhaId, setTrilhaId] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [catBusca, setCatBusca] = useState('')
  const [catId, setCatId] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(`${mes}-01`)
  // QUEM CONSUMIU (14/10/2026): no acerto em que a UNIDADE cobra da Matriz (abate), o custo
  // pode ser de outra(s) unidade(s) — a Matriz cobre a unidade no repasse e já repassa pra
  // quem consumiu, na mesma hora: no repasse daquela unidade ou cobrando agora (avulsa).
  // Pinda (sem repasse, conta corrente da Matriz) nasce reconhecida e baixada no papel.
  type Destino = { unidade: string; valor: string; modo: 'repasse' | 'agora' }
  const [outrasConsomem, setOutrasConsomem] = useState(false)
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [unidadesDest, setUnidadesDest] = useState<{ id: string; nome: string; codigo: string; temRepasse: boolean; contaDaMatriz: boolean }[]>([])

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
        .select('id, tipo, descricao, valor, data, status, unidade_credora, unidade_devedora, categoria_id, lancamento_aceite_id, lancamento_origem_id, repasse_id')
        .or(par).in('tipo', ['despesa_rateada', 'outro', 'recebimento_terceiro']).in('status', ['emitida', 'aceita', 'liquidada'])
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
    setCats(semReceitas((ct as unknown as Cat[] | null) || []))   // acerto é despesa: sem o ramo Receitas (mig 171)
    setHistorico((hs as { descricao: string; categoria_id: string; data: string }[] | null) || [])
    if (mz) setMatrizNome((mz as { nome: string }).nome)
    // as unidades que podem consumir: todas menos a Matriz e a do acerto. Quem tem repasse
    // (sem cremação local) e quem usa a MESMA conta corrente da Matriz (Pinda).
    const [{ data: us }, { data: contasMz }] = await Promise.all([
      supabase.from('unidades').select('id, nome, codigo, modulos_ativos').eq('ativa', true).order('nome'),
      supabase.from('contas').select('unidade_id, unidades_extras, produto, tipo').or(`unidade_id.eq.${matrizId},unidades_extras.cs.{${matrizId}}`).eq('ativo', true),
    ])
    const daMatriz = new Set<string>()
    for (const c of (contasMz as { unidade_id: string; unidades_extras: string[] | null; produto: string | null; tipo: string | null }[] | null) || []) {
      if (c.produto === 'maquininha' || c.tipo === 'cartao' || c.produto === 'cartao_credito') continue
      for (const u of [c.unidade_id, ...(c.unidades_extras || [])]) if (u) daMatriz.add(u)
    }
    setUnidadesDest(((us as { id: string; nome: string; codigo: string; modulos_ativos: string[] | null }[] | null) || [])
      .filter(u => u.id !== matrizId && u.id !== unidadeId)
      .map(u => ({ id: u.id, nome: u.nome, codigo: u.codigo, temRepasse: !(u.modulos_ativos || []).includes('cb_cremacao_local'), contaDaMatriz: daMatriz.has(u.id) })))
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
    if (natureza === 'despesa' && !catId) return toast('Escolha a categoria — é ela que diz onde a despesa cai na DRE', 'error')
    if (!v) return toast('Informe o valor', 'error')
    const repassa = outrasConsomem && !matrizCobra && natureza === 'despesa' && !editando
    if (repassa) {
      if (!destinos.length || destinos.some(d => !d.unidade)) return toast('Escolha a unidade de cada linha de "quem consumiu"', 'error')
      if (destinos.some(d => emNumero(d.valor) <= 0)) return toast('Cada unidade precisa de um valor', 'error')
      if (destinos.reduce((a, d) => a + emNumero(d.valor), 0) > v + 0.005) return toast('As unidades passam do valor do acerto', 'error')
    }
    setSalvando(true)
    try {
      const credora = matrizCobra ? matrizId : unidadeId
      const devedora = matrizCobra ? unidadeId : matrizId
      const { data: nova, error } = await supabase.from('fin_cobrancas').insert({
        unidade_credora: credora, unidade_devedora: devedora,
        tipo: natureza === 'despesa' ? 'despesa_rateada' : 'recebimento_terceiro',
        categoria_id: natureza === 'despesa' ? catId : null,
        valor: v, data, descricao: descricao.trim(),
        status: 'emitida', criado_por_nome: userName || null,
      }).select('id').single()
      if (error) throw new Error(error.message)
      const cat = natureza === 'despesa' ? porId.get(catId) : undefined
      // Já reconhecido: na despesa, as duas pernas na DRE nascem agora; no
      // recebimento de cliente, só o aceite (nenhuma perna — fora da DRE).
      const pernas = await reconhecerCobranca(supabase, {
        id: (nova as { id: string }).id, tipo: natureza === 'despesa' ? 'despesa_rateada' : 'recebimento_terceiro', valor: v, data,
        descricao: descricao.trim(), categoria_id: natureza === 'despesa' ? catId : null,
        unidade_credora: credora, unidade_devedora: devedora,
        credoraNome: matrizCobra ? matrizNome : unidadeNome,
        devedoraCodigo: matrizCobra ? unidadeCodigo : 'Matriz',
        fin_categorias: cat ? { fin_conta_id: cat.fin_conta_id, fin_contas: cat.fin_contas } : null,
      }, { userName: userName || null }, { guardarReembolsoEmOrigem: true })
      // PRESO AO REPASSE DA TELA (08/10/2026). Solto (`repasse_id` nulo), o acerto
      // só entrava no total quando alguém salvasse um repasse — o PRIMEIRO de
      // qualquer mês daquela unidade —, e a Quitação, que soma pelos acertos
      // presos, mostrava o a pagar sem ele (Correios de maio/ST: 14.334 em vez de
      // 14.375,29). Com o repasse já salvo, prende como o Salvar prende.
      if (repasseId) {
        const { error: e3 } = await supabase.from('fin_cobrancas')
          .update({ repasse_id: repasseId, status: 'liquidada' }).eq('id', (nova as { id: string }).id)
        if (e3) throw new Error(`Acerto lançado, mas não ficou preso ao repasse: ${e3.message}`)
      }
      // A CORRENTE: a Matriz cobriu a unidade; agora repassa o custo pra quem consumiu.
      // A cobrança nova sai da DESPESA que acabou de nascer na Matriz (lancamento_origem_id).
      if (repassa) {
        const cat = porId.get(catId)
        for (const d of destinos) {
          const alvo = unidadesDest.find(u => u.id === d.unidade)
          const vd = emNumero(d.valor)
          const { data: cb, error: ec } = await supabase.from('fin_cobrancas').insert({
            unidade_credora: matrizId, unidade_devedora: d.unidade, tipo: 'despesa_rateada',
            categoria_id: catId, valor: vd, data, descricao: descricao.trim(),
            status: 'emitida', lancamento_origem_id: pernas.despesaId, criado_por_nome: userName || null,
          }).select('id').single()
          if (ec) throw new Error(`${alvo?.nome || 'Unidade'}: ${ec.message}`)
          const cobId = (cb as { id: string }).id
          // no repasse dela, ou a conta é a mesma da Matriz → já nasce reconhecida
          if ((d.modo === 'repasse' && alvo?.temRepasse) || alvo?.contaDaMatriz) {
            await reconhecerCobranca(supabase, {
              id: cobId, tipo: 'despesa_rateada', valor: vd, data, descricao: descricao.trim(), categoria_id: catId,
              unidade_credora: matrizId, unidade_devedora: d.unidade, credoraNome: matrizNome, devedoraCodigo: alvo?.codigo || null,
              fin_categorias: cat ? { fin_conta_id: cat.fin_conta_id, fin_contas: cat.fin_contas } : null,
            }, { userName: userName || null })
            // mesma conta corrente: a dívida se baixa no papel, nenhum dinheiro anda
            if (alvo?.contaDaMatriz && d.modo === 'agora') await supabase.from('fin_cobrancas').update({ status: 'liquidada' }).eq('id', cobId)
          }
        }
      }
      toast(`Acerto lançado — ${matrizCobra ? 'acresce' : 'abate'} ${fmtBRL(v)}${repassa ? ` · repassado a ${destinos.length} ${destinos.length > 1 ? 'unidades' : 'unidade'}` : ''}`, 'success')
      setDescricao(''); setCatBusca(''); setCatId(''); setValor(''); setOutrasConsomem(false); setDestinos([])
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

  /** As pernas na DRE que NASCERAM deste acerto (ORIGEM_PERNA_COBRANCA). Numa
   *  compra externa, `lancamento_origem_id` é a compra original de quem pagou —
   *  essa não é do acerto e nunca entra aqui. `compraExterna` avisa esse caso. */
  async function pernasDe(a: Acerto): Promise<{ pernas: string[]; compraExterna: boolean }> {
    const ids = [a.lancamento_aceite_id, a.lancamento_origem_id].filter((x): x is string => !!x)
    const { data: ls } = ids.length
      ? await supabase.from('fin_lancamentos').select('id, origem').in('id', ids)
      : { data: [] }
    const lista = (ls as { id: string; origem: string }[] | null) || []
    return {
      pernas: lista.filter(l => l.origem === ORIGEM_PERNA_COBRANCA).map(l => l.id),
      compraExterna: lista.some(l => l.id === a.lancamento_origem_id && l.origem !== ORIGEM_PERNA_COBRANCA),
    }
  }

  async function abrirEdicao(a: Acerto) {
    if (travado) return
    const { compraExterna } = await pernasDe(a)
    if (compraExterna) {
      return toast('Este acerto nasceu de uma compra em Despesas ("Comprei para outras unidades") — ajuste pela compra', 'error')
    }
    setEditando(a)
    setMatrizCobra(a.unidade_credora === matrizId)
    setNatureza(a.tipo === 'recebimento_terceiro' ? 'recebimento' : 'despesa')
    setDescricao(a.descricao || '')
    setValor(String(Math.round(Number(a.valor) * 100)))
    setData(a.data.slice(0, 10))
    setCatId(a.categoria_id || ''); setCatBusca('')
  }
  function cancelarEdicao() {
    setEditando(null); setDescricao(''); setCatBusca(''); setCatId(''); setValor('')
  }

  /** Salvar a edição: regrava o acerto e REFAZ as pernas (apaga as antigas e
   *  reconhece de novo) — mudar sentido, natureza, valor, data ou categoria mexe
   *  nas duas DREs. Situação e repasse do acerto ficam como estavam. */
  async function salvarEdicao(a: Acerto) {
    const v = emNumero(valor)
    if (!descricao.trim()) return toast('Descreva o acerto', 'error')
    if (natureza === 'despesa' && !catId) return toast('Escolha a categoria — é ela que diz onde a despesa cai na DRE', 'error')
    if (!v) return toast('Informe o valor', 'error')
    setSalvando(true)
    try {
      const credora = matrizCobra ? matrizId : unidadeId
      const devedora = matrizCobra ? unidadeId : matrizId
      const tipo = natureza === 'despesa' ? 'despesa_rateada' : 'recebimento_terceiro'
      const { pernas } = await pernasDe(a)
      const { error } = await supabase.from('fin_cobrancas').update({
        unidade_credora: credora, unidade_devedora: devedora, tipo,
        categoria_id: natureza === 'despesa' ? catId : null,
        valor: v, data, descricao: descricao.trim(),
        lancamento_aceite_id: null, lancamento_origem_id: null,
      }).eq('id', a.id)
      if (error) throw new Error(error.message)
      if (pernas.length) {
        const { error: e2 } = await supabase.from('fin_lancamentos').delete().in('id', pernas)
        if (e2) throw new Error(`Acerto salvo, mas as pernas antigas não saíram: ${e2.message}`)
      }
      // Ainda esperando a unidade: só os campos, sem pernas.
      if (a.status !== 'emitida') {
        const cat = natureza === 'despesa' ? porId.get(catId) : undefined
        await reconhecerCobranca(supabase, {
          id: a.id, tipo, valor: v, data, descricao: descricao.trim(),
          categoria_id: natureza === 'despesa' ? catId : null,
          unidade_credora: credora, unidade_devedora: devedora,
          credoraNome: matrizCobra ? matrizNome : unidadeNome,
          devedoraCodigo: matrizCobra ? unidadeCodigo : 'Matriz',
          fin_categorias: cat ? { fin_conta_id: cat.fin_conta_id, fin_contas: cat.fin_contas } : null,
        }, { userName: userName || null }, { guardarReembolsoEmOrigem: true })
        // O reconhecer marca `aceita`; o acerto já preso a um repasse volta a `liquidada`.
        if (a.status !== 'aceita') {
          const { error: e3 } = await supabase.from('fin_cobrancas').update({ status: a.status }).eq('id', a.id)
          if (e3) throw new Error(e3.message)
        }
      }
      toast(`Acerto atualizado — ${matrizCobra ? 'acresce' : 'abate'} ${fmtBRL(v)}`, 'success')
      cancelarEdicao()
      void carregar(); onMudou()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao salvar o acerto', 'error')
    } finally {
      setSalvando(false)
    }
  }

  /** Apagar = ajustar. Leva as duas pernas da DRE junto. */
  async function apagar(a: Acerto) {
    try {
      const { pernas } = await pernasDe(a)
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
            <input value={descricao} onChange={e => setDescricao(e.target.value)}
                   placeholder={natureza === 'despesa'
                     ? (matrizCobra ? 'O que é (ex.: urnas compradas pela Matriz, sistema do mês)' : 'O que é (ex.: compra da Matriz paga pela unidade)')
                     : (matrizCobra ? 'O que é (ex.: cliente da Matriz pagou na unidade)' : 'O que é (ex.: tutor da unidade pagou na Matriz — pet REX)')}
                   className="input text-sm" />
            <input inputMode="numeric" value={valor ? emTexto(valor) : ''} placeholder="0,00"
                   onChange={e => setValor(soDigitos(e.target.value))}
                   onPaste={e => { const d = colarValorBR(e.clipboardData.getData('text')); if (d !== null) { e.preventDefault(); setValor(d) } }}
                   className="input text-sm text-mono text-right" />
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="input text-sm" title="Mês da DRE em que o acerto cai" />
          </div>

          {/* NATUREZA — despesa (DRE) × dinheiro de cliente (fora da DRE). */}
          <div className="flex flex-wrap gap-1.5">
            {([
              ['despesa', 'Despesa', 'compra feita por uma pela outra — entra na DRE'],
              ['recebimento', 'Dinheiro de cliente', 'tutor pagou na unidade errada — fora da DRE'],
            ] as const).map(([v, t, s]) => (
              <button key={v} type="button" onClick={() => setNatureza(v)}
                      className="text-left rounded-[var(--radius-md)] border px-2.5 py-1.5"
                      style={{ borderColor: natureza === v ? 'var(--brand-500)' : 'var(--surface-200)' }}>
                <span className="block text-xs font-medium text-[var(--surface-700)]">{t}</span>
                <span className="block text-[10px] text-[var(--surface-400)]">{s}</span>
              </button>
            ))}
          </div>
          {natureza === 'recebimento' && (
            <p className="text-[11px] text-[var(--surface-500)]">
              Só acerta o dinheiro no repasse. A receita já é da unidade dona do contrato — confira se o
              pagamento está lançado no contrato.
            </p>
          )}

          {natureza === 'despesa' && (<>
          {/* CATEGORIA — onde a despesa cai na DRE de quem deve. Busca de sempre
              + o que acertos parecidos usaram antes. */}
          <div className="space-y-1">
            <input value={catId ? caminhoDe(catId) : catBusca}
                   onChange={e => { setCatBusca(e.target.value); setCatId('') }}
                   placeholder="Categoria… (ex.: urnas, recordações, sistema, sacos)"
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

          {/* QUEM CONSUMIU — a corrente nasce aqui (só quando a UNIDADE cobra da Matriz) */}
          {!matrizCobra && !editando && (
            <div className="rounded-[var(--radius-md)] border border-[var(--surface-200)] p-2.5 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--surface-700)]">Quem consumiu?</span>
                {([[false, matrizNome], [true, 'Outra(s) unidade(s)']] as const).map(([vv, t]) => (
                  <button key={String(vv)} type="button"
                          onClick={() => { setOutrasConsomem(vv); if (vv && !destinos.length) setDestinos([{ unidade: '', valor: valor, modo: 'agora' }]) }}
                          className={`text-[12px] px-2.5 py-1 rounded-full border ${outrasConsomem === vv ? 'border-[var(--brand-500)] bg-[var(--brand-500)]/10 font-semibold text-[var(--surface-900)]' : 'border-[var(--surface-300)] text-[var(--surface-600)]'}`}>{t}</button>
                ))}
              </div>
              {outrasConsomem && (<>
                {destinos.map((d, i) => {
                  const alvo = unidadesDest.find(u => u.id === d.unidade)
                  const muda = (pt: Partial<Destino>) => setDestinos(ds => ds.map((x, k) => (k === i ? { ...x, ...pt } : x)))
                  const outras = destinos.reduce((a, x, k) => (k === i ? a : a + emNumero(x.valor)), 0)
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select value={d.unidade} onChange={e => { const u = unidadesDest.find(x => x.id === e.target.value); muda({ unidade: e.target.value, modo: u && !u.temRepasse ? 'agora' : d.modo }) }} className="input text-sm flex-1 min-w-[140px]">
                        <option value="">Unidade…</option>
                        {unidadesDest.map(u => <option key={u.id} value={u.id} disabled={u.id !== d.unidade && destinos.some(x => x.unidade === u.id)}>{u.nome}</option>)}
                      </select>
                      <input inputMode="numeric" value={d.valor ? emTexto(d.valor) : ''} onChange={e => muda({ valor: soDigitos(e.target.value) })} placeholder="0,00" className="input text-sm text-mono text-right w-28" />
                      <button type="button" title="Tudo o que falta" onClick={() => muda({ valor: String(Math.max(0, Math.round((emNumero(valor) - outras) * 100))) })}
                              className="text-[11px] font-semibold px-2 py-1 rounded-md border border-[var(--surface-300)] text-[var(--surface-600)]">o resto</button>
                      <span className="inline-flex rounded-full border border-[var(--surface-300)] p-0.5 text-[11px]">
                        {(['repasse', 'agora'] as const).map(m => {
                          const pode = m === 'agora' || !!alvo?.temRepasse
                          return (
                            <button key={m} type="button" disabled={!pode} onClick={() => muda({ modo: m })}
                                    title={m === 'repasse' ? (pode ? 'Entra no repasse desta unidade (já reconhecido)' : 'Esta unidade não tem repasse') : (alvo?.contaDaMatriz ? 'Mesma conta corrente da Matriz: nasce reconhecida e baixada' : 'Cobrança avulsa: a unidade reconhece em Acertos entre unidades')}
                                    className={`px-2 py-0.5 rounded-full ${d.modo === m ? 'bg-[var(--brand-500)] text-white' : 'text-[var(--surface-500)]'} disabled:opacity-30`}>
                              {m === 'repasse' ? 'no repasse' : 'cobrar agora'}
                            </button>
                          )
                        })}
                      </span>
                      {destinos.length > 1 && <button type="button" onClick={() => setDestinos(ds => ds.filter((_, k) => k !== i))} className="text-[var(--surface-400)] hover:text-red-400 px-1">✕</button>}
                    </div>
                  )
                })}
                <div className="flex items-center justify-between text-[11px]">
                  <button type="button" onClick={() => setDestinos(ds => [...ds, { unidade: '', valor: String(Math.max(0, Math.round((emNumero(valor) - ds.reduce((a, x) => a + emNumero(x.valor), 0)) * 100))), modo: 'agora' }])}
                          className="text-[var(--brand-500)] hover:underline">+ outra unidade</button>
                  <span className="text-[var(--surface-500)]">fica com {matrizNome}: {fmtBRL(Math.max(0, emNumero(valor) - destinos.reduce((a, x) => a + emNumero(x.valor), 0)))}</span>
                </div>
              </>)}
            </div>
          )}
          </>)}

          <div className="flex items-center justify-end gap-2">
            {editando && (
              <>
                <span className="text-[11px] text-amber-500 mr-auto">Editando “{editando.descricao || 'Acerto'}” — as pernas na DRE são refeitas ao salvar</span>
                <button onClick={cancelarEdicao} disabled={salvando} className="btn-secondary text-sm">Cancelar</button>
              </>
            )}
            <button onClick={() => void (editando ? salvarEdicao(editando) : lancar())} disabled={salvando} className="btn-primary text-sm">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editando ? 'Salvar alterações' : 'Lançar acerto'}
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
                <div key={a.id} onClick={() => void abrirEdicao(a)}
                     className={`flex items-center gap-2 py-2 -mx-1 px-1 rounded-[var(--radius-sm)] ${travado ? '' : 'cursor-pointer hover:bg-[var(--surface-50)]'}`}
                     style={editando?.id === a.id ? { background: 'rgba(245,158,11,0.10)' } : undefined}
                     title={travado ? undefined : 'Editar acerto'}>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: matrizCobrou ? 'rgba(59,130,246,0.14)' : 'rgba(16,185,129,0.14)', color: matrizCobrou ? '#3b82f6' : '#10b981' }}>
                    {matrizCobrou ? 'acresce' : 'abate'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--surface-800)] truncate">{a.descricao || 'Acerto'}</p>
                    <p className="text-[11px] text-[var(--surface-400)] truncate">
                      {fmtData(a.data)} · {a.tipo === 'recebimento_terceiro'
                        ? <span className="text-[var(--surface-500)]">dinheiro de cliente · fora da DRE</span>
                        : a.categoria_id ? caminhoDe(a.categoria_id) : <span className="text-amber-500">sem categoria — a despesa cai sem classificação na DRE</span>}
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
                  {(a.lancamento_aceite_id || a.lancamento_origem_id) && (
                    <button onClick={e => { e.stopPropagation(); setTrilhaId(a.lancamento_aceite_id || a.lancamento_origem_id) }}
                            title="Trilha do custo — com quem ficou" className="text-[11px] text-[var(--brand-500)] hover:underline shrink-0">trilha</button>
                  )}
                  {!travado && (
                    <button onClick={e => { e.stopPropagation(); void apagar(a) }} title="Apagar (leva as duas pernas da DRE)"
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
      <TrilhaCustoModal lancamentoId={trilhaId} onClose={() => setTrilhaId(null)} />
    </div>
  )
}
