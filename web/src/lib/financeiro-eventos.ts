'use client'

// "O FINANCEIRO MUDOU" (15/10/2026, Lucas: "as coisas não tão se atualizando após lançamentos,
// exclusões, edições… precisa ser dinâmico").
//
// Em vez de lembrar de avisar em cada um dos ~70 pontos que gravam (e o próximo esquecer), a
// VIGIA fica no próprio cliente do Supabase — que no navegador é UM só (createBrowserClient é
// singleton): todo insert/update/delete/upsert que DER CERTO numa tabela do financeiro dispara
// o evento. Cada bloco da tela escuta com `useFinanceiroVersao()` e recarrega.
// Também recarrega quando a aba volta a ficar visível (mudança feita em outra aba/pessoa).

import { useEffect, useState } from 'react'

export const EVENTO_FINANCEIRO = 'financeiro:mudou'
const vigiada = (t: string) => t.startsWith('fin_') || t === 'pagamentos' || t === 'contas'

let timer: ReturnType<typeof setTimeout> | null = null
/** Avisa a tela (agrupa rajadas: um import de 50 linhas vira 1 recarga). */
export function avisarFinanceiroMudou() {
  if (typeof window === 'undefined') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; window.dispatchEvent(new Event(EVENTO_FINANCEIRO)) }, 250)
}

/** Número que sobe a cada mudança — ponha nas dependências do efeito que carrega. */
export function useFinanceiroVersao(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const sobe = () => setV(x => x + 1)
    const aoVoltar = () => { if (document.visibilityState === 'visible') sobe() }
    window.addEventListener(EVENTO_FINANCEIRO, sobe)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.removeEventListener(EVENTO_FINANCEIRO, sobe); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [])
  return v
}

type Thenable = { then: (ok?: (r: unknown) => unknown, err?: (e: unknown) => unknown) => unknown }
const vigiados = new WeakSet<object>()

/** Liga a vigia no cliente (uma vez por instância). Não muda nenhum resultado: só observa. */
export function vigiarEscritasFinanceiro<C extends object>(client: C): C {
  if (vigiados.has(client)) return client
  vigiados.add(client)
  const c = client as unknown as { from: (t: string) => Record<string, unknown> }
  const fromOrig = c.from.bind(client)
  c.from = (tabela: string) => {
    const qb = fromOrig(tabela)
    if (!vigiada(tabela)) return qb
    for (const m of ['insert', 'update', 'delete', 'upsert']) {
      const orig = qb[m] as ((...a: unknown[]) => Thenable) | undefined
      if (typeof orig !== 'function') continue
      qb[m] = (...args: unknown[]) => {
        const fb = orig.apply(qb, args)
        // os filtros (.eq, .select, .single…) devolvem o MESMO objeto — o then trocado vale até o fim
        const thenOrig = fb.then.bind(fb)
        fb.then = (ok, err) => thenOrig((r: unknown) => {
          if (!(r as { error?: unknown } | null)?.error) avisarFinanceiroMudou()
          return ok ? ok(r) : r
        }, err)
        return fb
      }
    }
    return qb
  }
  return client
}
