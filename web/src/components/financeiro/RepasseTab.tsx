'use client'

// Repasse de Cremações — a "planilha do dia 20", automática.
// A Matriz escolhe unidade + mês, confere os pets acolhidos, aplica deflator
// onde precisa (cortesia, pet exótico, desconto) e fecha. Ao fechar, grava o
// valor final em contratos.custo_cremacao — que é pra isso que o campo existe.
// Migration 104. Ver FLOW.md §4.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Receipt, Loader2, Copy, Check, Lock, ExternalLink, Shield, RefreshCw, AlertTriangle,
  FileSpreadsheet, Layers, Save,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useUnit } from '@/contexts/UnitContext'
import EmptyState from '@/components/ui/EmptyState'
import {
  calcularAbatimento, calcularValorFinal, totalAPagar, mensagemRepasse,
  planilhaRepasse, nomeArquivoRepasse,
  fmtBRL, fmtData, mesParaData, rotuloMes,
  type DeflatorTipo, type ItemRepasse, type Permuta,
} from '@/lib/repasse'
import { saveAs } from 'file-saver'

type Empresa = { id: string; apelido: string; cnpj: string }
type UnidadePagante = { id: string; nome: string; codigo: string }

/** Mesmo esquema de cores do GC / Visibilidade / Funcionários */
const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}

/**
 * Cor de TEXTO legível para a cor da unidade. Cores claras (SJ é cinza #cbd5e1)
 * ficam ilegíveis como texto no tema claro — nesses casos cai pra um slate escuro.
 * O GC resolve o mesmo problema chumbando `SJ ? '#334155'`; aqui é por luminância,
 * então qualquer cor clara nova já nasce legível.
 */
function corTexto(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.65 ? '#475569' : hex
}
type RepasseSalvo = {
  id: string
  status: string
  mes_referencia: string
  qtd_pets: number
  total_liquido: number
  empresa_id: string | null
  enviado_em: string | null
  pago_em: string | null
}

const mesAtual = () => new Date().toISOString().slice(0, 7)

export default function RepasseTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const supabaseTipado = createClient()
  // As tabelas fin_* (migrations 103/104) ainda não estão em types/database.ts,
  // então o client tipado infere `never`. Client destipado só para elas.
  const supabase = supabaseTipado as unknown as SupabaseClient
  const { toast } = useToast()
  const { userName } = useUnit()

  const [unidadeId, setUnidadeId] = useState('')
  const [mes, setMes] = useState(mesAtual())
  const [empresaId, setEmpresaId] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [itens, setItens] = useState<ItemRepasse[]>([])
  const [carregando, setCarregando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [existente, setExistente] = useState<RepasseSalvo | null>(null)
  const [buscou, setBuscou] = useState(false)
  // Permutas — o encontro de contas (mig 106). Só depois de fechado.
  const [permutas, setPermutas] = useState<Permuta[]>([])
  const [permDesc, setPermDesc] = useState('')
  const [permValor, setPermValor] = useState('')
  const [permDirecao, setPermDirecao] = useState<'abate' | 'acresce'>('abate')
  const descRef = useRef<HTMLInputElement>(null)   // volta o foco pra encadear lançamentos
  // Resumo do mês por unidade — alimenta o valor que aparece em cada aba
  const [resumo, setResumo] = useState<Map<string, { qtd: number; valor: number; fechado: boolean }>>(new Map())

  // BYPASS DELIBERADO do UnitContext: `allUnidades` só traz as unidades em que o
  // usuário TEM PERFIL (UnitContext.tsx:176-180), e quem opera o repasse é a
  // Matriz — que precisa cobrar de TODAS as filiais, inclusive onde não tem perfil.
  // Por isso a lista vem direto do banco, e SÓ nesta tela (não mexer no contexto
  // global, senão vaza unidade em telas que devem continuar escopadas).
  const [unidadesPagantes, setUnidadesPagantes] = useState<UnidadePagante[]>([])
  // A Matriz é a contraparte de todo acerto — é ela que recebe ou deve.
  const [matrizId, setMatrizId] = useState('')
  const nomeUnidade = unidadesPagantes.find(u => u.id === unidadeId)?.nome || ''

  useEffect(() => {
    supabase
      .from('unidades')
      .select('id, nome, codigo, is_matriz, ativa, modulos_ativos')
      .eq('ativa', true)
      .order('ordem')   // mesma ordem do GC
      .order('nome')
      .then(({ data }) => {
        type U = { id: string; nome: string; codigo: string; is_matriz: boolean; modulos_ativos: string[] | null }
        setMatrizId(((data as U[]) || []).find(u => u.is_matriz)?.id || '')
        setUnidadesPagantes(
          ((data as U[]) || [])
            // Matriz não cobra de si mesma.
            .filter(u => !u.is_matriz)
            // Unidade co-localizada com o crematório (hoje só a PI) também fica de
            // fora: o pet não viaja, então não há repasse a cobrar. Filtro pelo
            // MÓDULO e não pelo código — se outra unidade virar co-localizada,
            // já sai daqui sozinha.
            .filter(u => !(u.modulos_ativos || []).includes('cb_cremacao_local'))
            .map(({ id, nome, codigo }) => ({ id, nome, codigo })),
        )
      })
  }, [supabase])

  useEffect(() => {
    supabase.from('fin_empresas').select('id, apelido, cnpj').eq('ativa', true).order('ordem')
      .then(({ data }) => {
        setEmpresas((data as Empresa[]) || [])
        if (data?.length && !empresaId) setEmpresaId(data[0].id)
      })
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resumo do mês inteiro (todas as unidades) — o número que cada aba mostra.
  // Fechado: usa `vw_repasse_totais`, que JÁ desconta/soma as permutas.
  // Em aberto: prévia pela tabela de preços.
  const carregarResumo = useCallback(async () => {
    if (!mes) return
    const alvo = mesParaData(mes)
    const eleg: { unidade_id: string; valor_tabela: number }[] = []
    for (let off = 0; off < 6000; off += 1000) {
      const { data } = await supabase
        .from('vw_repasse_elegivel')
        .select('unidade_id, valor_tabela')
        .eq('mes_referencia', alvo)
        .range(off, off + 999)
      const page = (data as { unidade_id: string; valor_tabela: number }[]) || []
      eleg.push(...page)
      if (page.length < 1000) break
    }
    const { data: fech } = await supabase
      .from('vw_repasse_totais')
      .select('unidade_id, qtd_pets, total_a_pagar, status')
      .eq('mes_referencia', alvo)
      .neq('status', 'cancelado')

    const m = new Map<string, { qtd: number; valor: number; fechado: boolean }>()
    eleg.forEach(e => {
      const cur = m.get(e.unidade_id) || { qtd: 0, valor: 0, fechado: false }
      m.set(e.unidade_id, { qtd: cur.qtd + 1, valor: cur.valor + Number(e.valor_tabela || 0), fechado: false })
    })
    ;((fech as { unidade_id: string; total_a_pagar: number; qtd_pets: number }[]) || []).forEach(f => {
      m.set(f.unidade_id, { qtd: f.qtd_pets, valor: Number(f.total_a_pagar || 0), fechado: true })
    })
    setResumo(m)
  }, [mes, supabase])

  useEffect(() => { void carregarResumo() }, [carregarResumo])

  const buscar = useCallback(async () => {
    if (!unidadeId || !mes) return
    setCarregando(true)
    setItens([])
    setExistente(null)
    setPermutas([])

    // Já existe fechamento vivo desse mês?
    const { data: jaTem } = await supabase
      .from('fin_repasses')
      .select('id, status, mes_referencia, qtd_pets, total_liquido, empresa_id, enviado_em, pago_em')
      .eq('unidade_id', unidadeId)
      .eq('mes_referencia', mesParaData(mes))
      .neq('status', 'cancelado')
      .maybeSingle()

    if (jaTem) {
      setExistente(jaTem as RepasseSalvo)
      const { data: its } = await supabase
        .from('fin_repasse_itens')
        .select('contrato_id, contrato_codigo, pet_nome, tutor_nome, numero_lacre, data_acolhimento, tipo_cremacao, valor_base, deflator_tipo, deflator_valor, deflator_motivo')
        .eq('repasse_id', (jaTem as RepasseSalvo).id)
        .order('data_acolhimento')
      setItens(((its as ItemRepasse[]) || []))

      const { data: perms } = await supabase
        .from('fin_repasse_permutas')
        .select('id, descricao, valor, direcao, lancamento_receita_id, lancamento_despesa_id')
        .eq('repasse_id', (jaTem as RepasseSalvo).id)
        .order('created_at')
      setPermutas(((perms as Permuta[]) || []))
    } else {
      const { data: eleg, error } = await supabase
        .from('vw_repasse_elegivel')
        .select('contrato_id, contrato_codigo, pet_nome, tutor_nome, numero_lacre, data_acolhimento, tipo_cremacao, valor_tabela')
        .eq('unidade_id', unidadeId)
        .eq('mes_referencia', mesParaData(mes))
        .order('data_acolhimento')
      if (error) toast('Falha ao buscar — as migrations 103/104 já rodaram?', 'error')
      setItens(
        ((eleg as Record<string, unknown>[]) || []).map(e => ({
          contrato_id: e.contrato_id as string,
          contrato_codigo: e.contrato_codigo as string | null,
          pet_nome: e.pet_nome as string | null,
          tutor_nome: e.tutor_nome as string | null,
          numero_lacre: e.numero_lacre as string | null,
          data_acolhimento: e.data_acolhimento as string | null,
          tipo_cremacao: e.tipo_cremacao as 'individual' | 'coletiva' | null,
          valor_base: Number(e.valor_tabela || 0),
          deflator_tipo: 'nenhum' as DeflatorTipo,
          deflator_valor: 0,
          deflator_motivo: null,
        })),
      )
    }
    setCarregando(false)
    setBuscou(true)
  }, [supabase, unidadeId, mes, toast])

  // Trocar de aba (ou de mês) já carrega — sem botão intermediário
  useEffect(() => {
    if (unidadeId) void buscar()
    else { setItens([]); setExistente(null); setPermutas([]); setBuscou(false) }
  }, [unidadeId, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  const totais = totalAPagar(itens, permutas)
  // Trava SÓ quando já foi pago — antes disso tudo é editável e regravável.
  // (Antes travava assim que salvava, o que obrigava a fechar cada unidade antes
  //  de trocar de aba e impedia corrigir um valor depois.)
  // `travado` = nada mais pode ser editado. Duas origens: o repasse já foi PAGO,
  // ou a unidade está só consultando (a cobrança é ato da Matriz — FLS
  // `btn_repasse_editar`). Os inputs de deflator, o Ajuste em lote e o Salvar já
  // olham para esta flag, então o modo leitura herda tudo sem duplicar condição.
  const travado = existente?.status === 'pago' || somenteLeitura
  const salvo = !!existente

  const alterar = (i: number, campo: keyof ItemRepasse, valor: unknown) =>
    setItens(prev => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)))

  // "Preço do mês": chumba um valor para TODOS os pets de um tipo.
  // É preço negociado do mês (ex: unidade em mês fraco), não desconto por pet —
  // por isso mexe no valor cobrado e deixa o deflator livre pra cortesia pontual.
  const [loteAberto, setLoteAberto] = useState(false)
  const [valorInd, setValorInd] = useState('')
  const [valorCol, setValorCol] = useState('')
  const qtdInd = itens.filter(i => i.tipo_cremacao === 'individual').length
  const qtdCol = itens.filter(i => i.tipo_cremacao === 'coletiva').length

  /** Aplica de uma vez os valores preenchidos (um deles ou os dois). */
  function aplicarLote() {
    const vi = valorInd === '' ? null : Number(valorInd)
    const vc = valorCol === '' ? null : Number(valorCol)
    if (vi === null && vc === null) return toast('Preencha ao menos um valor', 'error')
    if ((vi !== null && (Number.isNaN(vi) || vi < 0)) || (vc !== null && (Number.isNaN(vc) || vc < 0))) {
      return toast('Valor inválido', 'error')
    }
    setItens(prev =>
      prev.map(it => {
        if (it.tipo_cremacao === 'individual' && vi !== null) return { ...it, valor_base: vi }
        if (it.tipo_cremacao === 'coletiva' && vc !== null) return { ...it, valor_base: vc }
        return it
      }),
    )
    const partes: string[] = []
    if (vi !== null) partes.push(`${qtdInd} ind. a ${fmtBRL(vi)}`)
    if (vc !== null) partes.push(`${qtdCol} col. a ${fmtBRL(vc)}`)
    toast(partes.join(' · '), 'success')
    setValorInd(''); setValorCol(''); setLoteAberto(false)
  }

  function cancelarLote() {
    setValorInd(''); setValorCol(''); setLoteAberto(false)
  }

  /**
   * Salva (cria ou regrava) o repasse do mês. Pode ser chamado quantas vezes for
   * preciso enquanto não estiver pago — é o que permite ajustar depois e trocar
   * de unidade sem perder nada.
   * Retorna o id do repasse.
   */
  async function salvar(silencioso = false): Promise<string | null> {
    if (!itens.length || !unidadeId) return null
    setFechando(true)
    try {
      let repasseId = existente?.id || null

      if (repasseId) {
        const { error } = await supabase
          .from('fin_repasses')
          .update({
            qtd_pets: totais.qtd,
            total_bruto: totais.bruto,
            total_deflator: totais.deflator,
            total_liquido: totais.liquido,
          })
          .eq('id', repasseId)
        if (error) throw new Error(error.message)
        // Regrava os itens do zero — mais simples e seguro que diferenciar linha a linha
        await supabase.from('fin_repasse_itens').delete().eq('repasse_id', repasseId)
      } else {
        const { data: rep, error: e1 } = await supabase
          .from('fin_repasses')
          .insert({
            unidade_id: unidadeId,
            // CNPJ NÃO é escolhido aqui: quem recebe se define depois, na hora de
            // concretizar os lançamentos (ver "permutas" no doc de requisitos).
            empresa_id: null,
            mes_referencia: mesParaData(mes),
            status: 'aberto',
            qtd_pets: totais.qtd,
            total_bruto: totais.bruto,
            total_deflator: totais.deflator,
            total_liquido: totais.liquido,
          })
          .select('id')
          .single()
        if (e1 || !rep) throw new Error(e1?.message || 'falha ao salvar')
        repasseId = (rep as { id: string }).id
      }

      const { error: e2 } = await supabase.from('fin_repasse_itens').insert(
        itens.map((i, idx) => ({
          repasse_id: repasseId,
          contrato_id: i.contrato_id,
          contrato_codigo: i.contrato_codigo,
          pet_nome: i.pet_nome,
          tutor_nome: i.tutor_nome,
          numero_lacre: i.numero_lacre,
          data_acolhimento: i.data_acolhimento,
          tipo_cremacao: i.tipo_cremacao,
          valor_base: i.valor_base,
          deflator_tipo: i.deflator_tipo,
          deflator_valor: i.deflator_valor,
          deflator_motivo: i.deflator_motivo,
          valor_final: calcularValorFinal(i),
          ordem: idx,
        })),
      )
      if (e2) throw new Error(e2.message)

      // Acertos ainda em memória (lançados antes de existir repasse) vão junto agora.
      const pendentes = permutas.filter(p => p.id?.startsWith('tmp-'))
      if (pendentes.length) {
        await supabase.from('fin_repasse_permutas').insert(
          pendentes.map(p => ({
            repasse_id: repasseId,
            descricao: p.descricao,
            valor: p.valor,
            direcao: p.direcao,
          })),
        )
      }

      // O custo real da cremação volta pro contrato — é pra isso que o campo existe.
      await Promise.all(
        itens.map(i =>
          supabase.from('contratos')
            .update({ custo_cremacao: calcularValorFinal(i) })
            .eq('id', i.contrato_id),
        ),
      )

      if (!silencioso) toast(`Salvo: ${totais.qtd} pets · ${fmtBRL(totais.aPagar)}`, 'success')
      await buscar()
      void carregarResumo()
      return repasseId
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao salvar', 'error')
      return null
    } finally {
      setFechando(false)
    }
  }

  // Acertos podem ser lançados ANTES de fechar: enquanto não há repasse gravado,
  // ficam em memória (id temporário `tmp-…`) e vão pro banco junto no fechamento.
  async function addPermuta() {
    const v = Number(permValor)
    if (!permDesc.trim() || !v || v <= 0) return toast('Informe descrição e valor', 'error')

    // Sem repasse ainda? Salva o repasse primeiro — assim o acerto já nasce
    // gravado e trocar de aba não perde nada.
    let repasseId = existente?.id
    if (!repasseId) {
      const novo = await salvar(true)
      if (!novo) return toast('Salve o repasse antes (sem pets no mês?)', 'error')
      repasseId = novo
    }

    const { data, error } = await supabase
      .from('fin_repasse_permutas')
      .insert({ repasse_id: repasseId, descricao: permDesc.trim(), valor: v, direcao: permDirecao })
      .select('id, descricao, valor, direcao')
      .single()
    if (error) return toast(error.message, 'error')
    setPermutas(p => [...p, data as unknown as Permuta])
    setPermDesc(''); setPermValor('')
    descRef.current?.focus()   // pronto pro próximo, sem tirar a mão do teclado
    void carregarResumo()   // a aba precisa refletir o acerto na hora
    toast('Acerto lançado', 'success')
  }

  /**
   * TRANSFORMA O ACERTO EM LANÇAMENTO — as duas pernas.
   *
   * Um encontro de contas entre as duas empresas é DESPESA de um lado e RECEITA
   * do outro. Enquanto isso não é gerado, o acerto só mexe no total cobrado e o
   * valor não existe na DRE de ninguém — some do resultado do grupo.
   *
   *   abate   → a Matriz DEVE à unidade: despesa na Matriz, receita na unidade
   *   acresce → a unidade deve mais:     despesa na unidade, receita na Matriz
   *
   * Os ids gravados são a trava contra gerar duas vezes.
   */
  async function gerarLancamentos(p: Permuta) {
    if (!p.id || p.id.startsWith('tmp-')) return toast('Salve o repasse antes', 'error')
    if (p.lancamento_receita_id && p.lancamento_despesa_id) return toast('Já foi gerado', 'error')
    if (!matrizId) return toast('Matriz não encontrada', 'error')

    // 'abate' = a Matriz deve à unidade, então a despesa é da Matriz.
    const abate = p.direcao === 'abate'
    const unidadeDespesa = abate ? matrizId : unidadeId
    const unidadeReceita = abate ? unidadeId : matrizId
    const quando = mesParaData(mes)
    const texto = `Acerto ${rotuloMes(quando)} · ${p.descricao}`

    const base = {
      valor: Number(p.valor),
      data_competencia: quando,
      data_caixa: null,          // o dinheiro anda no encontro de contas, não agora
      status: 'pendente',
      origem: 'sistema',
      descricao: texto,
      criado_por_nome: userName || null,
    }

    const { data, error } = await supabase.from('fin_lancamentos').insert([
      { ...base, unidade_id: unidadeDespesa, conta_nome: 'Acerto de repasse (despesa)' },
      { ...base, unidade_id: unidadeReceita, conta_nome: 'Acerto de repasse (receita)' },
    ]).select('id')
    if (error) return toast(error.message, 'error')

    const ids = (data as { id: string }[]) || []
    const { error: e2 } = await supabase.from('fin_repasse_permutas').update({
      lancamento_despesa_id: ids[0]?.id || null,
      lancamento_receita_id: ids[1]?.id || null,
    }).eq('id', p.id)
    if (e2) return toast(e2.message, 'error')

    setPermutas(ps => ps.map(x => x.id === p.id
      ? { ...x, lancamento_despesa_id: ids[0]?.id, lancamento_receita_id: ids[1]?.id } : x))
    toast('Acerto virou lançamento nas duas empresas', 'success')
  }

  async function removerPermuta(id?: string) {
    if (!id) return
    if (id.startsWith('tmp-')) return setPermutas(p => p.filter(x => x.id !== id))
    const { error } = await supabase.from('fin_repasse_permutas').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setPermutas(p => p.filter(x => x.id !== id))
    void carregarResumo()
  }

  async function definirEmpresa(id: string) {
    if (!existente) return
    const { error } = await supabase
      .from('fin_repasses')
      .update({ empresa_id: id || null })
      .eq('id', existente.id)
    if (error) return toast(error.message, 'error')
    setExistente({ ...existente, empresa_id: id || null })
    toast(id ? 'CNPJ definido' : 'CNPJ removido', 'success')
  }

  async function marcar(campo: 'enviado_em' | 'pago_em') {
    if (!existente) return
    const novoStatus = campo === 'enviado_em' ? 'enviado' : 'pago'
    const { error } = await supabase
      .from('fin_repasses')
      .update({ [campo]: new Date().toISOString(), status: novoStatus })
      .eq('id', existente.id)
    if (error) return toast(error.message, 'error')
    toast(campo === 'enviado_em' ? 'Marcado como enviado' : 'Marcado como pago', 'success')
    void buscar()
  }

  function baixarPlanilha() {
    const csv = planilhaRepasse(nomeUnidade, mesParaData(mes), itens, permutas)
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nomeArquivoRepasse(nomeUnidade, mes))
    toast('Planilha gerada', 'success')
  }

  const copiar = async () => {
    await navigator.clipboard.writeText(mensagemRepasse(nomeUnidade, mesParaData(mes), itens, permutas))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
    toast('Cobrança copiada', 'success')
  }

  return (
    <div className="animate-fade-in space-y-2">
      {/* Cabeçalho: título + mês + consolidado, tudo numa linha */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="input text-sm w-36 py-1"
        />
        <span className="text-xs text-[var(--surface-500)]">
          <span className="text-mono text-[var(--surface-700)]">
            {fmtBRL([...resumo.values()].reduce((s, r) => s + r.valor, 0))}
          </span>{' '}
          · {[...resumo.values()].reduce((s, r) => s + r.qtd, 0)} pets
        </span>
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-[var(--surface-400)]" />}
      </div>

      {/* Abas tipo Chrome — uma por unidade, com o valor do repasse */}
      <div className="flex items-end gap-1 overflow-x-auto pb-0.5">
        {unidadesPagantes.map(u => {
          const isActive = unidadeId === u.id
          const cor = UNIT_COLORS[u.codigo] || '#6366f1'
          const r = resumo.get(u.id)
          return (
            <button
              key={u.id}
              onClick={() => setUnidadeId(isActive ? '' : u.id)}
              className="flex items-center gap-2 transition-all duration-300 ease-out rounded-t-xl border border-b-0 shrink-0"
              style={{
                padding: '8px 12px 10px',
                background: isActive ? 'var(--surface-0)' : 'var(--surface-50)',
                borderColor: isActive ? 'var(--surface-200)' : 'var(--surface-100)',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: cor, color: u.codigo === 'SJ' ? '#334155' : '#fff' }}
              >
                {u.codigo}
              </div>
              <div
                className="overflow-hidden transition-all duration-300 ease-out"
                style={{ maxWidth: isActive ? 170 : 0, opacity: isActive ? 1 : 0 }}
              >
                <span className="text-sm font-semibold text-[var(--surface-700)] whitespace-nowrap">{u.nome}</span>
              </div>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 text-mono flex items-center gap-1"
                style={{ background: cor + '33', color: corTexto(cor) }}
              >
                {r?.fechado && <Lock className="h-2.5 w-2.5 shrink-0" />}
                {r ? (
                  <span className="flex flex-col items-center leading-tight">
                    {/* "pets" só no desktop; no mobile fica só o número */}
                    <span className="opacity-60 text-[9px]">
                      {r.qtd}<span className="hidden sm:inline"> pets</span>
                    </span>
                    <span>{fmtBRL(r.valor)}</span>
                  </span>
                ) : '—'}
              </span>
            </button>
          )
        })}
      </div>
      <div className="border-b border-[var(--surface-200)] -mt-4 mb-2" />

      {!unidadeId && (
        <div className="card p-4 text-center text-sm text-[var(--surface-500)]">
          Escolha uma unidade acima.
        </div>
      )}

      {buscou && !carregando && unidadeId && itens.length === 0 && (
        <div className="card p-4 text-center text-sm text-[var(--surface-600)]">
          Nenhum pet acolhido nesse mês.{' '}
          <span className="text-[var(--surface-500)]">
            Pets sem data de acolhimento não entram — veja em Tratamento de Erros → Inputs de Anomalias.
          </span>
        </div>
      )}

      {itens.length > 0 && (
        <>
          {/* Barra de comando: unidade, números e ações numa linha só */}
          <div className="card px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium text-[var(--surface-800)]">{nomeUnidade}</span>
            <button
              onClick={() => void buscar()} disabled={carregando}
              title="Recarregar" className="text-[var(--surface-400)] hover:text-[var(--surface-700)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            </button>

            <span className="text-[var(--surface-500)]">
              <span className="text-mono text-[var(--surface-800)]">{totais.qtd}</span> pets
            </span>
            <span className="text-[var(--surface-500)]">
              cremações <span className="text-mono text-[var(--surface-800)]">{fmtBRL(totais.liquido)}</span>
            </span>
            {totais.deflator > 0 && (
              <span className="text-[var(--surface-500)]">
                desc. <span className="text-mono text-amber-400">-{fmtBRL(totais.deflator)}</span>
              </span>
            )}
            {permutas.length > 0 && (
              /* Saldo LÍQUIDO dos acertos (acresce − abate), não um número por
                 lançamento. Com 18 acertos continua sendo um valor só. */
              <span className="text-[var(--surface-500)]">
                acertos ({permutas.length}){' '}
                {/* saldo positivo = a receber (azul) · negativo = a pagar (vermelho) */}
                <span className={`text-mono ${totais.acresce - totais.abate >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                  {totais.acresce - totais.abate >= 0 ? '+' : '−'}
                  {fmtBRL(Math.abs(totais.acresce - totais.abate))}
                </span>
              </span>
            )}
            {/* Esta tela é da MATRIZ, que recebe. Na planilha que vai pra unidade
                o mesmo número aparece como "a pagar" — é o valor visto das duas pontas. */}
            <span className="text-[var(--surface-500)]">
              a receber <span className="text-mono text-base font-semibold text-emerald-400">{fmtBRL(totais.aPagar)}</span>
            </span>

            {existente && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--surface-500)]">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                {existente.status}
                {existente.enviado_em && ` · env ${fmtData(existente.enviado_em)}`}
                {existente.pago_em && ` · pago ${fmtData(existente.pago_em)}`}
                <select
                  value={existente.empresa_id || ''}
                  onChange={e => void definirEmpresa(e.target.value)}
                  disabled={somenteLeitura}
                  className="input text-xs w-24 py-0.5 ml-1 disabled:opacity-70"
                  title="CNPJ que recebe"
                >
                  <option value="">CNPJ…</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.apelido}</option>)}
                </select>
                {existente.status === 'aberto' && !somenteLeitura && (
                  <button onClick={() => void marcar('enviado_em')} className="underline hover:text-[var(--surface-700)]">enviado</button>
                )}
                {existente.status !== 'pago' && !somenteLeitura && (
                  <button onClick={() => void marcar('pago_em')} className="underline hover:text-[var(--surface-700)]">pago</button>
                )}
              </span>
            )}

            <div className="ml-auto flex gap-2">
              {!travado && (
                <button onClick={() => setLoteAberto(true)} className="btn-secondary text-xs py-1">
                  <Layers className="h-3.5 w-3.5" /> Ajuste em lote
                </button>
              )}
              <button onClick={baixarPlanilha} title="Baixar planilha" className="btn-secondary text-xs py-1">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Planilha
              </button>
              {!somenteLeitura && (
                <button onClick={() => void copiar()} title="Copiar cobrança" className="btn-secondary text-xs py-1">
                  {copiado ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
              {!travado && (
                <button onClick={() => void salvar()} disabled={fechando} className="btn-primary text-xs py-1">
                  {fechando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {salvo ? 'Salvar alterações' : 'Salvar'}
                </button>
              )}
            </div>
          </div>

          {/* Acertos — o encontro de contas. Pode lançar antes de fechar. */}
          <div className="card p-3 space-y-2">
              <h3 className="text-xs font-semibold text-[var(--surface-600)] uppercase tracking-wide">Acertos</h3>

              {permutas.length > 0 && (
                <div className="border border-[var(--surface-200)] rounded-[var(--radius-md)] divide-y divide-[var(--surface-200)]">
                  {permutas.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1">
                      <span className={`text-[10px] font-medium w-16 shrink-0 ${p.direcao === 'abate' ? 'text-red-400' : 'text-blue-400'}`}>
                        {p.direcao === 'abate' ? 'A pagar' : 'A receber'}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-[var(--surface-800)] truncate">
                        {p.descricao}
                        {p.id?.startsWith('tmp-') && (
                          <span className="text-[10px] text-[var(--surface-400)] ml-1">(grava ao fechar)</span>
                        )}
                      </span>
                      <span className="text-mono text-sm text-[var(--surface-700)]">{fmtBRL(p.valor)}</span>
                      {!somenteLeitura && (
                        p.lancamento_receita_id && p.lancamento_despesa_id ? (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}
                            title="Já virou despesa numa empresa e receita na outra"
                          >
                            lançado
                          </span>
                        ) : (
                          <button
                            onClick={() => void gerarLancamentos(p)}
                            title="Gera a despesa numa empresa e a receita na outra — sem isso o valor não entra em DRE nenhuma"
                            className="text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 text-[var(--brand-500)]"
                            style={{ borderColor: 'var(--surface-300)' }}
                          >
                            gerar lançamento
                          </button>
                        )
                      )}
                      {!somenteLeitura && !p.lancamento_receita_id && (
                        <button onClick={() => void removerPermuta(p.id)} className="text-[var(--surface-400)] hover:text-red-400 text-xs px-1">
                          remover
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {somenteLeitura ? (
                permutas.length === 0 && (
                  <p className="text-xs text-[var(--surface-500)] py-2">Nenhum acerto neste mês.</p>
                )
              ) : (
                <>
                <div className="flex flex-wrap items-center gap-2">
                  {/* 'abate' = a Matriz deve à unidade (diminui o que ela cobra)
                      'acresce' = a unidade deve mais (aumenta a cobrança).
                      Dois botões em vez de select: um clique em vez de abrir dropdown,
                      e a cor já diz o que vai acontecer com o total. */}
                  <div className="flex rounded-[var(--radius-md)] overflow-hidden border border-[var(--surface-300)] shrink-0">
                    {([
                      { v: 'abate' as const, label: 'A pagar', cor: '#f87171' },
                      { v: 'acresce' as const, label: 'A receber', cor: '#60a5fa' },
                    ]).map(op => {
                      const on = permDirecao === op.v
                      return (
                        <button
                          key={op.v}
                          type="button"
                          onClick={() => setPermDirecao(op.v)}
                          className="text-xs font-medium px-2.5 py-1.5 transition-colors"
                          style={{
                            background: on ? op.cor + '26' : 'transparent',
                            color: on ? op.cor : 'var(--surface-500)',
                          }}
                        >
                          {op.label}
                        </button>
                      )
                    })}
                  </div>

                  <input
                    ref={descRef}
                    type="text" value={permDesc} onChange={e => setPermDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void addPermuta() }}
                    placeholder="Do que se trata? Ex.: Correios remessa 12/07"
                    className="input text-sm flex-1 min-w-[180px] py-1.5"
                  />

                  <div className="flex items-center rounded-[var(--radius-md)] border overflow-hidden shrink-0"
                       style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}>
                    <span className="text-xs text-[var(--surface-400)] pl-2">R$</span>
                    <input
                      type="number" min={0} step="0.01" value={permValor}
                      onChange={e => setPermValor(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void addPermuta() }}
                      placeholder="0,00"
                      className="w-24 bg-transparent border-0 outline-none text-sm text-mono px-1.5 py-1.5 text-[var(--surface-800)]"
                    />
                  </div>

                  <button
                    onClick={() => void addPermuta()}
                    disabled={!permDesc.trim() || !Number(permValor)}
                    className="btn-secondary text-sm"
                  >
                    Lançar
                  </button>
                </div>
                </>
              )}
            </div>

          {/* Ajuste em lote — popup discreto. Um Aplicar só, pros dois tipos. */}
          <Modal
            isOpen={loteAberto}
            onClose={cancelarLote}
            title="Ajuste em lote"
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <button onClick={cancelarLote} className="btn-secondary text-sm">Cancelar</button>
                <button
                  onClick={aplicarLote}
                  disabled={!valorInd && !valorCol}
                  className="btn-primary text-sm"
                >
                  Aplicar
                </button>
              </div>
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-[var(--surface-500)]">
                Substitui o valor cobrado de todos os pets do tipo. Preencha um ou os dois.
              </p>

              {/* Individual — verde, mesma cor da linha na tabela */}
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 bg-emerald-500/10">
                <span className="shrink-0 leading-tight flex-1">
                  <span className="block text-sm font-medium text-emerald-400">Individual</span>
                  <span className="block text-[10px] text-mono text-[var(--surface-500)]">({qtdInd})</span>
                </span>
                <input
                  type="number" min={0} step="0.01" value={valorInd}
                  onChange={e => setValorInd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') aplicarLote() }}
                  disabled={!qtdInd}
                  placeholder="valor"
                  className="input text-sm text-mono w-28 py-1"
                />
              </div>

              {/* Coletiva — roxo, mesma cor da linha na tabela */}
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 bg-purple-500/10">
                <span className="shrink-0 leading-tight flex-1">
                  <span className="block text-sm font-medium text-purple-400">Coletiva</span>
                  <span className="block text-[10px] text-mono text-[var(--surface-500)]">({qtdCol})</span>
                </span>
                <input
                  type="number" min={0} step="0.01" value={valorCol}
                  onChange={e => setValorCol(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') aplicarLote() }}
                  disabled={!qtdCol}
                  placeholder="valor"
                  className="input text-sm text-mono w-28 py-1"
                />
              </div>
            </div>
          </Modal>

          {/* Tabela */}
          <div className="card p-3 space-y-2">
            <h3 className="text-xs font-semibold text-[var(--surface-600)] uppercase tracking-wide">
              Cremações <span className="text-[var(--surface-400)] normal-case font-normal">({totais.qtd})</span>
            </h3>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-[var(--surface-500)] border-b border-[var(--surface-200)]">
                  <th className="text-left font-medium px-3 py-2">Acolhimento</th>
                  <th className="text-left font-medium px-3 py-2">Lacre</th>
                  <th className="text-left font-medium px-3 py-2">Pet</th>
                  <th className="text-left font-medium px-3 py-2">Tipo</th>
                  <th className="text-right font-medium px-3 py-2">Tabela</th>
                  <th className="text-left font-medium px-3 py-2">Deflator</th>
                  <th className="text-right font-medium px-3 py-2">Final</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--surface-200)]">
                {itens.map((it, i) => (
                  <tr
                    key={it.contrato_id}
                    // Individual = verde · Coletiva = roxo (leitura rápida em lista longa)
                    className={
                      it.tipo_cremacao === 'individual'
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20'
                        : 'bg-purple-500/10 hover:bg-purple-500/20'
                    }
                  >
                    <td className="px-3 py-2 text-mono text-xs text-[var(--surface-600)]">{fmtData(it.data_acolhimento)}</td>
                    <td className="px-3 py-2 text-mono text-xs text-[var(--surface-700)]">{it.numero_lacre || '—'}</td>
                    <td className="px-3 py-2">
                      <p className="text-[var(--surface-800)]">{it.pet_nome || '—'}</p>
                      <p className="text-xs text-[var(--surface-500)]">{it.tutor_nome || ''}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--surface-600)]">
                      {it.tipo_cremacao === 'individual' ? 'Individual' : 'Coletiva'}
                    </td>
                    <td className="px-3 py-2 text-right text-mono text-[var(--surface-600)]">{fmtBRL(it.valor_base)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Manual: valor + unidade (R$ / %) num controle só */}
                        <div
                          className="flex items-center rounded-[var(--radius-sm)] border overflow-hidden"
                          style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)' }}
                        >
                          <input
                            type="number" min={0} step="0.01"
                            value={it.deflator_valor || ''}
                            onChange={e => {
                              const v = Number(e.target.value)
                              alterar(i, 'deflator_valor', v)
                              // digitou = manual: se estava sem tipo, assume o do seletor
                              if (v > 0 && it.deflator_tipo === 'nenhum') alterar(i, 'deflator_tipo', 'percentual')
                              if (!v) alterar(i, 'deflator_tipo', 'nenhum')
                            }}
                            disabled={travado}
                            placeholder="0"
                            className="w-14 bg-transparent border-0 outline-none text-xs text-mono px-1.5 py-1 text-[var(--surface-800)]"
                          />
                          <select
                            value={it.deflator_tipo === 'valor' ? 'valor' : 'percentual'}
                            onChange={e => alterar(i, 'deflator_tipo', it.deflator_valor ? e.target.value : 'nenhum')}
                            disabled={travado}
                            className="bg-transparent border-0 outline-none text-xs text-[var(--surface-600)] pr-1 py-1 cursor-pointer"
                          >
                            <option value="percentual">%</option>
                            <option value="valor">R$</option>
                          </select>
                        </div>

                        {/* Sugestões rápidas — clicar de novo desmarca */}
                        {[10, 25, 30, 50, 100].map(p => {
                          const ativo = it.deflator_tipo === 'percentual' && Number(it.deflator_valor) === p
                          return (
                            <button
                              key={p}
                              type="button"
                              disabled={travado}
                              onClick={() => {
                                if (ativo) {
                                  alterar(i, 'deflator_tipo', 'nenhum')
                                  alterar(i, 'deflator_valor', 0)
                                } else {
                                  alterar(i, 'deflator_tipo', 'percentual')
                                  alterar(i, 'deflator_valor', p)
                                }
                              }}
                              className="text-[10px] font-medium px-1.5 py-1 rounded-[var(--radius-sm)] border transition-colors disabled:opacity-40"
                              style={{
                                background: ativo ? 'rgba(245,158,11,0.18)' : 'transparent',
                                borderColor: ativo ? '#f59e0b' : 'var(--surface-300)',
                                color: ativo ? '#f59e0b' : 'var(--surface-500)',
                              }}
                            >
                              {p}%
                            </button>
                          )
                        })}

                        {calcularAbatimento(it) > 0 && (
                          <input
                            type="text" placeholder="motivo" value={it.deflator_motivo || ''}
                            onChange={e => alterar(i, 'deflator_motivo', e.target.value)}
                            disabled={travado}
                            className="input text-xs w-28 py-1"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-mono">
                      <span className={calcularAbatimento(it) > 0 ? 'text-amber-400' : 'text-[var(--surface-800)]'}>
                        {fmtBRL(calcularValorFinal(it))}
                      </span>
                    </td>
                    <td className="px-2">
                      <Link href={`/contratos/${it.contrato_id}`} target="_blank" className="text-[var(--brand-500)]" title="Abrir contrato">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <p className="text-xs text-[var(--surface-500)]">
            Referência: <span className="text-[var(--surface-700)]">{rotuloMes(mesParaData(mes))}</span> ·
            corte pela data de acolhimento. Ao fechar, o valor final de cada pet é gravado no contrato
            como custo real da cremação.
          </p>
        </>
      )}
    </div>
  )
}
