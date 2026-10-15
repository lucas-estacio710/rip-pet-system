'use client'

// CAIXA CONJUNTO (15/10/2026, decisão do Lucas): unidades que DIVIDEM conta corrente — hoje
// Matriz e Pinda — trabalham num Livro-Caixa só. Cada lançamento continua pertencendo a UMA
// unidade (é o `unidade_id` de sempre, que a DRE já separa), e todo formulário pergunta
// "De quem é? [Matriz | Pinda]" em vez de dividir/repassar depois. Todo mundo das duas vê as
// duas (decisão 1a).
//
// Quem é "irmã" sai das próprias contas: conta corrente/dinheiro (não maquininha, não cartão)
// da unidade atual compartilhada com outra (`unidades_extras`) ou de outra compartilhada com
// ela. Se amanhã outra dupla dividir conta, entra sozinha — sem cadastro novo.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useUnit } from '@/contexts/UnitContext'

export type Irma = { id: string; codigo: string; nome: string; isMatriz: boolean }
export type CaixaConjunto = {
  /** a unidade atual + as que dividem conta com ela (a atual primeiro) */
  ids: string[]
  irmas: Irma[]
  /** true quando há mais de uma unidade no mesmo caixa */
  conjunto: boolean
  /** "M" / "P" — a etiqueta do lançamento */
  letra: (unidadeId: string | null | undefined) => string
  nome: (unidadeId: string | null | undefined) => string
  /** a Matriz da dupla (pra onde vão repasse e outras receitas), se houver */
  matrizId: string | null
}

const cache = new Map<string, string[]>()   // unidade → ids do caixa (1 busca por unidade na sessão)

export function useCaixaConjunto(): CaixaConjunto {
  const { currentUnit, allUnidades } = useUnit()
  const sb = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const uid = currentUnit?.id
  // a lista mora no cache do módulo; o estado só avisa que ela chegou (sem setState síncrono no efeito)
  const [versao, setVersao] = useState(0)
  // estável entre renderizações: quem usa `ids` em dependência de efeito não pode recarregar à toa
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => (uid && cache.get(uid)) || (uid ? [uid] : []), [uid, versao])

  useEffect(() => {
    if (!uid) return
    if (cache.has(uid)) return
    let vivo = true
    void sb.from('contas').select('unidade_id, unidades_extras, produto, tipo')
      .or(`unidade_id.eq.${uid},unidades_extras.cs.{${uid}}`).eq('ativo', true).eq('legado', false)
      .then(({ data }) => {
        const s = new Set<string>([uid])
        for (const c of (data as { unidade_id: string; unidades_extras: string[] | null; produto: string | null; tipo: string | null }[] | null) || []) {
          if (c.produto === 'maquininha' || c.tipo === 'cartao' || c.produto === 'cartao_credito') continue
          for (const u of [c.unidade_id, ...(c.unidades_extras || [])]) if (u) s.add(u)
        }
        const lista = [uid, ...[...s].filter(x => x !== uid)]
        cache.set(uid, lista)
        if (vivo) setVersao(v => v + 1)
      })
    return () => { vivo = false }
  }, [uid, sb])

  return useMemo(() => {
    const atual = uid ? ids : []
    const irmas: Irma[] = atual.map(id => {
      const u = allUnidades.find(x => x.id === id)
      return { id, codigo: u?.codigo || '?', nome: u?.nome || 'Unidade', isMatriz: !!u?.is_matriz }
    })
    const porId = new Map(irmas.map(i => [i.id, i]))
    return {
      ids: atual, irmas, conjunto: irmas.length > 1,
      letra: id => (id && porId.get(id) ? (porId.get(id)!.isMatriz ? 'M' : porId.get(id)!.nome.charAt(0).toUpperCase()) : ''),
      nome: id => (id && porId.get(id)?.nome) || '',
      matrizId: irmas.find(i => i.isMatriz)?.id || null,
    }
  }, [ids, uid, allUnidades])
}

/** Filtro `.or()` das contas do caixa: as de cada unidade + as compartilhadas com cada uma. */
export function filtroContasDe(ids: string[]): string {
  return ids.flatMap(id => [`unidade_id.eq.${id}`, `unidades_extras.cs.{${id}}`]).join(',')
}
