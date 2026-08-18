// Catálogo de ANOMALIAS de dados — alimenta a aba "Inputs de Anomalias" do
// /admin/tratamento-erros (super_admin).
//
// FILOSOFIA: o super_admin é o orquestrador. Ele olha a lista, clica no registro
// pra estudar, e copia uma mensagem pronta pro WhatsApp do gerente da unidade.
// O gerente NÃO acessa a tela — não tem rotina; quem decide quando cobrar é o admin.
//
// ⚠️ REGRA DE OURO DESTE ARQUIVO: só entra check com POUCO falso positivo.
// Uma lista cheia de ruído é ignorada na segunda semana e nunca mais olhada.
// Checks medidos no banco em 18/08/2026 e DESCARTADOS por serem falso positivo:
//   · Coletiva com certificado (460) — normal: 39% em COL vs 48% em IND
//   · GC 'disponivel' sem cinzas_prontas (629) — flag legada; o /gc usa `etapa`
//   · GC com etapa legada (0 casos) — a demanda 2026/92 não tem caso real hoje
//   · Finalizado com saldo em aberto (1.499) — 1.495 são contratos SEM nenhum
//     pagamento registrado (legado importado). Só 5 têm pagamento parcial real,
//     e é esse o check que ficou.
//   · Acolhimento antes de 2024 (134) — histórico legítimo importado do Sheets.
//
// Para adicionar um check: uma entrada no array ANOMALIAS. Nada mais.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Categoria = 'dinheiro' | 'fluxo' | 'impossivel' | 'cadastro' | 'duplicidade' | 'operacao'

export type Severidade = 'alta' | 'media' | 'baixa'

export type LinhaAnomalia = {
  id: string
  titulo: string            // o que aparece na lista (ex: código + pet)
  detalhe?: string          // linha secundária (tutor, data, valor…)
  link?: string             // pra onde clicar e estudar
  unidadeId?: string | null
}

export type ResultadoCheck = {
  total: number
  linhas: LinhaAnomalia[]
  truncado?: boolean
}

export type Check = {
  id: string
  categoria: Categoria
  titulo: string
  porque: string            // por que isso é um problema (aparece na tela)
  comoCorrigir: string      // instrução objetiva pro gerente
  severidade: Severidade
  buscar: (sb: SupabaseClient, unidadeId?: string | null) => Promise<ResultadoCheck>
}

export const CATEGORIAS: Record<Categoria, { label: string; cor: string; ordem: number }> = {
  dinheiro:    { label: 'Impacto financeiro', cor: 'text-emerald-400', ordem: 1 },
  fluxo:       { label: 'Fluxo travado',      cor: 'text-amber-400',   ordem: 2 },
  impossivel:  { label: 'Dado impossível',    cor: 'text-red-400',     ordem: 3 },
  duplicidade: { label: 'Duplicidade',        cor: 'text-purple-400',  ordem: 4 },
  cadastro:    { label: 'Cadastro incompleto', cor: 'text-blue-400',   ordem: 5 },
  operacao:    { label: 'Operação',           cor: 'text-cyan-400',    ordem: 6 },
}

const LIMITE = 400  // teto de linhas listadas por check (a contagem é sempre exata)

// ── helpers ────────────────────────────────────────────────────────────────

const fmtData = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
const fmtBRL = (v?: number | null) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Pagina de 1000 em 1000 — o Supabase corta o SELECT em 1000 linhas. */
async function buscarTudo<T>(
  sb: SupabaseClient,
  tabela: string,
  campos: string,
  aplicar: (q: any) => any,
  teto = 6000,
): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; off < teto; off += 1000) {
    const { data, error } = await aplicar(sb.from(tabela).select(campos)).range(off, off + 999)
    if (error || !data) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return out
}

type LinhaContrato = {
  id: string
  codigo: string | null
  pet_nome: string | null
  tutor_nome: string | null
  unidade_id: string | null
  [k: string]: unknown
}

/** Check simples sobre `contratos`: filtro PostgREST + contagem exata. */
function checkContratos(
  cfg: Omit<Check, 'buscar'> & {
    filtro: (q: any) => any
    detalhe?: (c: LinhaContrato) => string
    campos?: string
  },
): Check {
  const { filtro, detalhe, campos, ...meta } = cfg
  return {
    ...meta,
    buscar: async (sb, unidadeId) => {
      let q = sb
        .from('contratos')
        .select(campos || 'id, codigo, pet_nome, tutor_nome, unidade_id', { count: 'exact' })
      q = filtro(q)
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { data, count } = await q.limit(LIMITE)
      const linhas = ((data || []) as unknown as LinhaContrato[]).map(c => ({
        id: c.id,
        titulo: `${c.codigo || 's/ código'} — ${c.pet_nome || 'pet sem nome'}`,
        detalhe: detalhe ? detalhe(c) : c.tutor_nome || undefined,
        link: `/contratos/${c.id}`,
        unidadeId: c.unidade_id,
      }))
      return { total: count ?? linhas.length, linhas, truncado: (count ?? 0) > LIMITE }
    },
  }
}

const hoje = () => new Date().toISOString().slice(0, 10)
const diasAtras = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

// ── o catálogo ─────────────────────────────────────────────────────────────

export const ANOMALIAS: Check[] = [
  // ═══ DINHEIRO ═══
  checkContratos({
    id: 'sem-acolhimento-cremado',
    categoria: 'dinheiro',
    severidade: 'alta',
    titulo: 'Pet cremado sem data de acolhimento',
    porque:
      'O repasse mensal para a Matriz é montado pela data de acolhimento. Sem ela, o pet NÃO entra na cobrança — a Matriz simplesmente não fatura essa cremação.',
    comoCorrigir: 'Informar a data em que o pet foi acolhido (removido), no detalhe do contrato.',
    filtro: q => q.in('status', ['ativo', 'pinda', 'retorno', 'pendente', 'finalizado']).is('data_acolhimento', null),
  }),
  checkContratos({
    id: 'sem-valor',
    categoria: 'dinheiro',
    severidade: 'alta',
    titulo: 'Contrato sem valor do plano',
    porque: 'Some do faturamento e distorce o ticket médio da unidade nos Dashboards.',
    comoCorrigir: 'Preencher o valor do plano cobrado do tutor.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, valor_plano',
    filtro: q => q.or('valor_plano.is.null,valor_plano.eq.0'),
    detalhe: c => `${c.tutor_nome || ''} · valor ${fmtBRL(c.valor_plano as number)}`,
  }),
  {
    id: 'pago-maior-que-vendido',
    categoria: 'dinheiro',
    severidade: 'alta',
    titulo: 'Pagamento maior que o valor do contrato',
    porque:
      'O saldo fica negativo e o contrato aparece como se devolvesse dinheiro. Costuma ser desconto lançado no valor cheio (demanda 2026/109) ou pagamento digitado a mais.',
    comoCorrigir: 'Conferir os pagamentos lançados e o desconto aplicado no contrato.',
    buscar: async (sb, unidadeId) => {
      const dados = await buscarTudo<any>(
        sb,
        'contratos',
        'id, codigo, pet_nome, tutor_nome, unidade_id, valor_plano, valor_acessorios, desconto_plano_unificado, desconto_acessorios, desconto_acessorios_ajuste, pagamentos(valor)',
        q => (unidadeId ? q.eq('unidade_id', unidadeId) : q),
      )
      const n = (v: unknown) => Number(v || 0)
      const linhas = dados
        .map(c => {
          const vendido =
            n(c.valor_plano) - n(c.desconto_plano_unificado) +
            n(c.valor_acessorios) - n(c.desconto_acessorios) - n(c.desconto_acessorios_ajuste)
          const pago = (c.pagamentos || []).reduce((s: number, p: any) => s + n(p.valor), 0)
          return { c, vendido, pago, diff: pago - vendido }
        })
        .filter(x => x.diff > 0.01)
        .map(({ c, vendido, pago, diff }) => ({
          id: c.id,
          titulo: `${c.codigo || 's/ código'} — ${c.pet_nome || ''}`,
          detalhe: `vendido ${fmtBRL(vendido)} · pago ${fmtBRL(pago)} · sobra ${fmtBRL(diff)}`,
          link: `/contratos/${c.id}`,
          unidadeId: c.unidade_id,
        }))
      return { total: linhas.length, linhas: linhas.slice(0, LIMITE) }
    },
  },
  {
    id: 'finalizado-pago-parcial',
    categoria: 'dinheiro',
    severidade: 'alta',
    titulo: 'Finalizado com pagamento parcial',
    porque:
      'O atendimento foi encerrado mas o tutor pagou só uma parte — é cobrança perdida. (Contratos SEM nenhum pagamento registrado ficam de fora: são do legado importado.)',
    comoCorrigir: 'Verificar se falta lançar um pagamento ou se há saldo realmente a cobrar.',
    buscar: async (sb, unidadeId) => {
      const dados = await buscarTudo<any>(
        sb,
        'contratos',
        'id, codigo, pet_nome, tutor_nome, unidade_id, valor_plano, valor_acessorios, desconto_plano_unificado, desconto_acessorios, desconto_acessorios_ajuste, pagamentos(valor)',
        q => {
          const base = q.eq('status', 'finalizado')
          return unidadeId ? base.eq('unidade_id', unidadeId) : base
        },
      )
      const n = (v: unknown) => Number(v || 0)
      const linhas = dados
        .filter(c => (c.pagamentos || []).length > 0)   // sem pagamento nenhum = legado
        .map(c => {
          const vendido =
            n(c.valor_plano) - n(c.desconto_plano_unificado) +
            n(c.valor_acessorios) - n(c.desconto_acessorios) - n(c.desconto_acessorios_ajuste)
          const pago = (c.pagamentos || []).reduce((s: number, p: any) => s + n(p.valor), 0)
          return { c, falta: vendido - pago, vendido, pago }
        })
        .filter(x => x.falta > 0.01)
        .map(({ c, falta, pago, vendido }) => ({
          id: c.id,
          titulo: `${c.codigo || 's/ código'} — ${c.pet_nome || ''}`,
          detalhe: `vendido ${fmtBRL(vendido)} · pago ${fmtBRL(pago)} · falta ${fmtBRL(falta)}`,
          link: `/contratos/${c.id}`,
          unidadeId: c.unidade_id,
        }))
      return { total: linhas.length, linhas: linhas.slice(0, LIMITE) }
    },
  },
  checkContratos({
    id: 'comissao-paga-sem-valor',
    categoria: 'dinheiro',
    severidade: 'media',
    titulo: 'Comissão marcada como paga, sem valor',
    porque: 'Marcaram o pagamento da indicação mas não há quanto foi pago — o controle de bonificação fica cego.',
    comoCorrigir: 'Informar o valor pago ao indicador, ou desmarcar a comissão como paga.',
    filtro: q => q.eq('comissao_paga', true).is('comissao_valor', null),
  }),
  checkContratos({
    id: 'pv-parado',
    categoria: 'dinheiro',
    severidade: 'baixa',
    titulo: 'Preventivo parado há mais de 180 dias',
    porque: 'Plano vendido que nunca foi acionado. Pode ser normal (pet vivo), mas vale conferir se não faltou acionar.',
    comoCorrigir: 'Confirmar com o tutor se o pet segue vivo; se faleceu, acionar o PV.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, data_contrato',
    filtro: q => q.eq('status', 'preventivo').lt('data_contrato', diasAtras(180)),
    detalhe: c => `${c.tutor_nome || ''} · contrato de ${fmtData(c.data_contrato as string)}`,
  }),

  // ═══ FLUXO TRAVADO ═══
  checkContratos({
    id: 'retorno-com-cinzas-recebidas',
    categoria: 'fluxo',
    severidade: 'alta',
    titulo: 'Em "retorno" mas as cinzas já foram recebidas',
    porque:
      'O tutor já recebeu — o contrato deveria ter avançado para pendente/finalizado. Preso em retorno, ele polui a fila de entregas e as métricas de atendimento em aberto.',
    comoCorrigir: 'Concluir a entrega no contrato para avançar o status.',
    filtro: q => q.eq('status', 'retorno').eq('cinzas_recebidas', true),
  }),
  checkContratos({
    id: 'retorno-antigo',
    categoria: 'fluxo',
    severidade: 'media',
    titulo: 'Em "retorno" há mais de 60 dias',
    porque: 'Cinzas paradas na unidade há muito tempo — tutor não retirou ou a entrega não foi registrada.',
    comoCorrigir: 'Contatar o tutor para retirada/entrega, ou registrar a entrega já feita.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, data_retorno',
    filtro: q => q.eq('status', 'retorno').lt('data_retorno', diasAtras(60)),
    detalhe: c => `${c.tutor_nome || ''} · retorno em ${fmtData(c.data_retorno as string)}`,
  }),
  checkContratos({
    id: 'pinda-antigo',
    categoria: 'fluxo',
    severidade: 'media',
    titulo: 'Em "pinda" há mais de 60 dias',
    porque: 'O pet consta como no crematório há muito tempo. Ou a volta não foi registrada, ou o status ficou para trás.',
    comoCorrigir: 'Conferir se as cinzas já voltaram e finalizar o encaminhamento de volta.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, data_acolhimento',
    filtro: q => q.eq('status', 'pinda').lt('data_acolhimento', diasAtras(60)),
    detalhe: c => `${c.tutor_nome || ''} · acolhido em ${fmtData(c.data_acolhimento as string)}`,
  }),
  checkContratos({
    id: 'ativo-com-supinda',
    categoria: 'fluxo',
    severidade: 'media',
    titulo: 'Ainda "ativo" mas já vinculado a um encaminhamento',
    porque: 'O pet já embarcou para o crematório mas o contrato não avançou para pinda — some das telas certas.',
    comoCorrigir: 'Finalizar a ida do encaminhamento para o status avançar.',
    filtro: q => q.eq('status', 'ativo').not('supinda_id', 'is', null),
  }),
  checkContratos({
    id: 'pinda-sem-supinda',
    categoria: 'fluxo',
    severidade: 'media',
    titulo: 'Em "pinda" sem encaminhamento vinculado',
    porque: 'Contrato órfão: está no crematório sem constar em nenhuma supinda, então não volta em lote nenhum (demanda 2026/90).',
    comoCorrigir: 'Vincular ao encaminhamento correto ou corrigir o status.',
    filtro: q => q.eq('status', 'pinda').is('supinda_id', null),
  }),
  checkContratos({
    id: 'ativo-antigo',
    categoria: 'fluxo',
    severidade: 'media',
    titulo: 'Em "ativo" há mais de 90 dias',
    porque: 'Atendimento aberto há muito tempo sem seguir para o crematório.',
    comoCorrigir: 'Verificar o que travou e dar andamento, ou corrigir o status.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, data_acolhimento',
    filtro: q => q.eq('status', 'ativo').lt('data_acolhimento', diasAtras(90)),
    detalhe: c => `${c.tutor_nome || ''} · acolhido em ${fmtData(c.data_acolhimento as string)}`,
  }),

  // ═══ IMPOSSÍVEL ═══
  {
    id: 'datas-incoerentes',
    categoria: 'impossivel',
    severidade: 'alta',
    titulo: 'Datas fora de ordem (cremação/entrega antes do que deveria)',
    porque:
      'Sequência impossível: cremar antes de acolher, ou entregar antes de cremar. É erro de digitação e contamina qualquer relatório por data.',
    comoCorrigir: 'Corrigir a data digitada errada no contrato.',
    buscar: async (sb, unidadeId) => {
      const dados = await buscarTudo<any>(
        sb,
        'contratos',
        'id, codigo, pet_nome, tutor_nome, unidade_id, data_acolhimento, data_cremacao, data_entrega',
        q => {
          const base = q.not('data_cremacao', 'is', null)
          return unidadeId ? base.eq('unidade_id', unidadeId) : base
        },
      )
      const dia = (x?: string | null) => (x ? x.slice(0, 10) : null)
      const linhas = dados
        .map(c => {
          const ac = dia(c.data_acolhimento), cr = dia(c.data_cremacao), en = dia(c.data_entrega)
          const problemas: string[] = []
          if (ac && cr && cr < ac) problemas.push(`cremação ${fmtData(cr)} antes do acolhimento ${fmtData(ac)}`)
          if (cr && en && en < cr) problemas.push(`entrega ${fmtData(en)} antes da cremação ${fmtData(cr)}`)
          return { c, problemas }
        })
        .filter(x => x.problemas.length > 0)
        .map(({ c, problemas }) => ({
          id: c.id,
          titulo: `${c.codigo || 's/ código'} — ${c.pet_nome || ''}`,
          detalhe: problemas.join(' · '),
          link: `/contratos/${c.id}`,
          unidadeId: c.unidade_id,
        }))
      return { total: linhas.length, linhas: linhas.slice(0, LIMITE) }
    },
  },
  checkContratos({
    id: 'acolhimento-futuro',
    categoria: 'impossivel',
    severidade: 'alta',
    titulo: 'Data de acolhimento no futuro',
    porque: 'O pet consta como acolhido numa data que ainda não chegou — erro de digitação (ano trocado, quase sempre).',
    comoCorrigir: 'Corrigir a data de acolhimento.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, data_acolhimento',
    filtro: q => q.gt('data_acolhimento', hoje()),
    detalhe: c => `acolhimento em ${fmtData(c.data_acolhimento as string)}`,
  }),
  checkContratos({
    id: 'contrato-futuro',
    categoria: 'impossivel',
    severidade: 'media',
    titulo: 'Data do contrato no futuro',
    porque: 'Contrato datado à frente de hoje — erro de digitação.',
    comoCorrigir: 'Corrigir a data do contrato.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, data_contrato',
    filtro: q => q.gt('data_contrato', hoje()),
    detalhe: c => `contrato em ${fmtData(c.data_contrato as string)}`,
  }),
  checkContratos({
    id: 'coletiva-com-cinzas',
    categoria: 'impossivel',
    severidade: 'media',
    titulo: 'Cremação coletiva com cinzas entregues',
    porque: 'Na coletiva as cinzas NÃO voltam para o tutor. Ou o tipo de cremação está errado, ou a marcação de entrega está.',
    comoCorrigir: 'Conferir se era individual; se era coletiva mesmo, desmarcar as cinzas recebidas.',
    filtro: q => q.eq('tipo_cremacao', 'coletiva').eq('cinzas_recebidas', true),
  }),

  // ═══ DUPLICIDADE ═══
  {
    id: 'cpf-duplicado',
    categoria: 'duplicidade',
    severidade: 'alta',
    titulo: 'Mesmo CPF cadastrado em mais de um tutor',
    porque:
      'O histórico do cliente fica partido em dois cadastros: a recontratação vai pro lugar errado e o atendimento não enxerga os pets anteriores.',
    comoCorrigir: 'Unificar os cadastros, mantendo o mais completo.',
    buscar: async sb => {
      const tut = await buscarTudo<any>(sb, 'tutores', 'id, nome, cpf, telefone, unidade_id', q => q)
      const so = (s?: string | null) => (s || '').replace(/\D/g, '')
      const porCpf = new Map<string, any[]>()
      tut.forEach(t => {
        const c = so(t.cpf)
        if (!c) return
        porCpf.set(c, [...(porCpf.get(c) || []), t])
      })
      const linhas: LinhaAnomalia[] = []
      porCpf.forEach((lista, cpf) => {
        if (lista.length < 2) return
        lista.forEach(t =>
          linhas.push({
            id: t.id,
            titulo: t.nome || 'sem nome',
            detalhe: `CPF ${cpf} · ${lista.length} cadastros`,
            link: `/tutores/${t.id}`,
            unidadeId: t.unidade_id,
          }),
        )
      })
      return { total: linhas.length, linhas: linhas.slice(0, LIMITE) }
    },
  },
  {
    id: 'telefone-corrompido',
    categoria: 'duplicidade',
    severidade: 'media',
    titulo: 'Telefone com formato inválido',
    porque:
      'Número curto demais ou com texto no meio (ex.: a palavra "outro" gravada junto). O WhatsApp não abre e o tutor fica inalcançável.',
    comoCorrigir: 'Corrigir o telefone no cadastro do tutor.',
    buscar: async sb => {
      const tut = await buscarTudo<any>(sb, 'tutores', 'id, nome, telefone, telefone2, unidade_id', q => q)
      const so = (s?: string | null) => (s || '').replace(/\D/g, '')
      const ruim = (s?: string | null) => {
        if (!s) return false
        const d = so(s)
        return /[a-zA-Z]/.test(s) || (d.length > 0 && d.length < 10) || d.length > 13
      }
      const linhas = tut
        .filter(t => ruim(t.telefone) || ruim(t.telefone2))
        .map(t => ({
          id: t.id,
          titulo: t.nome || 'sem nome',
          detalhe: [t.telefone, t.telefone2].filter(Boolean).join(' / '),
          link: `/tutores/${t.id}`,
          unidadeId: t.unidade_id,
        }))
      return { total: linhas.length, linhas: linhas.slice(0, LIMITE) }
    },
  },
  {
    id: 'pet-repetido',
    categoria: 'duplicidade',
    severidade: 'media',
    titulo: 'Mesmo pet do mesmo tutor em mais de um contrato',
    porque: 'Provável contrato duplicado — o mesmo atendimento lançado duas vezes infla remoções e faturamento.',
    comoCorrigir: 'Conferir se são atendimentos distintos; se for duplicata, desfazer pelo Tratamento de Erros.',
    buscar: async (sb, unidadeId) => {
      const ct = await buscarTudo<any>(
        sb,
        'contratos',
        'id, codigo, pet_nome, tutor_id, tutor_nome, unidade_id, data_acolhimento',
        q => {
          const base = q.not('tutor_id', 'is', null)
          return unidadeId ? base.eq('unidade_id', unidadeId) : base
        },
      )
      const mapa = new Map<string, any[]>()
      ct.forEach(c => {
        if (!c.pet_nome) return
        const k = `${c.tutor_id}|${(c.pet_nome || '').trim().toUpperCase()}`
        mapa.set(k, [...(mapa.get(k) || []), c])
      })
      const linhas: LinhaAnomalia[] = []
      mapa.forEach(lista => {
        if (lista.length < 2) return
        lista.forEach(c =>
          linhas.push({
            id: c.id,
            titulo: `${c.codigo || 's/ código'} — ${c.pet_nome}`,
            detalhe: `${c.tutor_nome || ''} · ${lista.length} contratos · acolhido ${fmtData(c.data_acolhimento)}`,
            link: `/contratos/${c.id}`,
            unidadeId: c.unidade_id,
          }),
        )
      })
      return { total: linhas.length, linhas: linhas.slice(0, LIMITE) }
    },
  },

  // ═══ CADASTRO INCOMPLETO ═══
  checkContratos({
    id: 'sem-fonte',
    categoria: 'cadastro',
    severidade: 'media',
    titulo: 'Sem "como conheceu" preenchido',
    porque:
      'Sem a origem não dá para saber o que traz cliente — o investimento em marketing e em clínicas vira chute.',
    comoCorrigir: 'Perguntar ao tutor como conheceu a RIP Pet e registrar no contrato.',
    filtro: q => q.is('fonte_conhecimento_ids', null),
  }),
  checkContratos({
    id: 'fonte-outro',
    categoria: 'cadastro',
    severidade: 'baixa',
    titulo: 'Origem marcada como "Outro" (texto livre)',
    porque:
      'Texto livre não agrupa em relatório. Se o mesmo "outro" se repete, provavelmente merece virar uma opção fixa.',
    comoCorrigir: 'Reclassificar para uma origem existente, ou avisar para criarmos a opção nova.',
    campos: 'id, codigo, pet_nome, tutor_nome, unidade_id, fonte_outro_especificar',
    filtro: q => q.not('fonte_outro_especificar', 'is', null),
    detalhe: c => `informado: "${c.fonte_outro_especificar}"`,
  }),
  checkContratos({
    id: 'sem-funcionario',
    categoria: 'cadastro',
    severidade: 'media',
    titulo: 'Sem responsável pelo atendimento',
    porque: 'Sem funcionário vinculado, o contrato não entra no ranking de produtividade da equipe.',
    comoCorrigir: 'Informar quem atendeu.',
    filtro: q => q.is('funcionario_id', null),
  }),
  checkContratos({
    id: 'individual-sem-pelinho',
    categoria: 'cadastro',
    severidade: 'baixa',
    titulo: 'Individual sem definição de pelinho',
    porque: 'No individual o pelinho é padrão — em branco significa que ninguém perguntou ao tutor.',
    comoCorrigir: 'Confirmar com o tutor se deseja o pelinho e marcar sim/não.',
    filtro: q => q.eq('tipo_cremacao', 'individual').is('pelinho_quer', null),
  }),

  // ═══ OPERAÇÃO ═══
  {
    id: 'ficha-processada-sem-contrato',
    categoria: 'operacao',
    severidade: 'alta',
    titulo: 'Ficha processada que não gerou contrato',
    porque:
      'A ficha foi trabalhada (tem os dados do processamento preenchidos) mas não há contrato vinculado. O atendimento sumiu do fluxo e o trabalho do concierge se perdeu.',
    comoCorrigir: 'Investigar caso a caso — pode ser contrato apagado por fora ou falha na criação.',
    buscar: async (sb, unidadeId) => {
      let q = sb
        .from('fichas')
        .select('id, nome_pet, nome_completo, unidade, unidade_id, processada_em', { count: 'exact' })
        .eq('processada', true)
        .is('contrato_id', null)
        .order('processada_em', { ascending: false })
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { data, count } = await q.limit(LIMITE)
      const linhas = (data || []).map((f: any) => ({
        id: f.id,
        titulo: f.nome_pet || 'pet sem nome',
        detalhe: `${f.nome_completo || ''} · processada em ${fmtData(f.processada_em)}`,
        link: `/fichas`,
        unidadeId: f.unidade_id,
      }))
      return { total: count ?? linhas.length, linhas, truncado: (count ?? 0) > LIMITE }
    },
  },
  {
    id: 'ficha-parada',
    categoria: 'operacao',
    severidade: 'media',
    titulo: 'Ficha recebida há mais de 7 dias sem processar',
    porque: 'Ficha na fila sem virar contrato — atendimento em aberto que ninguém tocou.',
    comoCorrigir: 'Processar a ficha ou descartá-la se foi duplicada/desistência.',
    buscar: async (sb, unidadeId) => {
      let q = sb
        .from('fichas')
        .select('id, nome_pet, nome_completo, unidade_id, created_at', { count: 'exact' })
        .eq('processada', false)
        .lt('created_at', diasAtras(7))
        .order('created_at', { ascending: true })
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { data, count } = await q.limit(LIMITE)
      const linhas = (data || []).map((f: any) => ({
        id: f.id,
        titulo: f.nome_pet || 'pet sem nome',
        detalhe: `${f.nome_completo || ''} · recebida em ${fmtData(f.created_at)}`,
        link: `/fichas`,
        unidadeId: f.unidade_id,
      }))
      return { total: count ?? linhas.length, linhas, truncado: (count ?? 0) > LIMITE }
    },
  },
  {
    id: 'estoque-negativo',
    categoria: 'operacao',
    severidade: 'media',
    titulo: 'Estoque negativo',
    porque:
      'Saiu mais produto do que entrou. Indica entrada não lançada, baixa duplicada ou inventário atrasado.',
    comoCorrigir: 'Fazer a contagem física e acertar pelo botão Inventário, na tela de Estoque.',
    buscar: async (sb, unidadeId) => {
      let q = sb
        .from('produtos_estoque')
        .select('produto_id, unidade_id, estoque_atual, produtos(nome, codigo)', { count: 'exact' })
        .lt('estoque_atual', 0)
        .order('estoque_atual', { ascending: true })
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { data, count } = await q.limit(LIMITE)
      const linhas = (data || []).map((e: any) => ({
        id: e.produto_id,
        titulo: e.produtos?.nome || e.produto_id,
        detalhe: `saldo ${e.estoque_atual}`,
        link: `/estoque/${e.produto_id}`,
        unidadeId: e.unidade_id,
      }))
      return { total: count ?? linhas.length, linhas, truncado: (count ?? 0) > LIMITE }
    },
  },
]

// ── mensagem pronta pro WhatsApp ───────────────────────────────────────────

/**
 * Monta o texto que o admin cola no zap do gerente. Negrito de WhatsApp (*),
 * sem emoji de enfeite — o tom da ferramenta é profissional.
 */
export function montarMensagem(
  check: Check,
  linhas: LinhaAnomalia[],
  nomeUnidade?: string,
  limite = 25,
): string {
  const cab = nomeUnidade ? `*RIP Pet — ${nomeUnidade}*` : '*RIP Pet*'
  const corpo = linhas
    .slice(0, limite)
    .map(l => `• ${l.titulo}${l.detalhe ? ` (${l.detalhe})` : ''}`)
    .join('\n')
  const resto = linhas.length > limite ? `\n_...e mais ${linhas.length - limite}._` : ''
  return (
    `${cab}\n` +
    `*${check.titulo}* — ${linhas.length} ${linhas.length === 1 ? 'registro' : 'registros'}\n\n` +
    `${check.porque}\n\n` +
    `*O que fazer:* ${check.comoCorrigir}\n\n` +
    `${corpo}${resto}`
  )
}
