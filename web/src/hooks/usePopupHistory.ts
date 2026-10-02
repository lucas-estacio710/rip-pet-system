/**
 * Botão voltar do celular fecha o popup (ou volta um nível), em vez de sair da tela.
 *
 * Níveis: 1 = popup aberto (ex.: lista de pendências), 2 = dentro dele (ex.: tela de um farol),
 * e assim por diante. Cada nível é UMA entrada no histórico.
 *
 * 🔴 Regras do Next 16 (app-router.js, conferido em 02/10/2026 — playbook §1.8):
 * - `window.history.pushState({pf, tok}, '')` SEM URL. O App Router intercepta o pushState e
 *   anexa o `__NA` dele; entrada SEM `__NA` no popstate faz `window.location.reload()`.
 *   Nunca usar o pushState "original" nem montar state com `_N` à mão.
 * - O listener do Next e o nosso disparam juntos no popstate: o nosso só muda o nível, não navega.
 * - Token POR ABERTURA: o `history.state` sobrevive ao reload; sem token, uma entrada velha
 *   seria tomada como do popup atual.
 * - `history.go(-n)` só se a entrada ATUAL ainda for nossa. Um `router.replace` (o /contratos
 *   sincroniza status/página/ordenação na URL) com popup aberto apaga a entrada; aí o go()
 *   tiraria a pessoa da tela. Por isso o hook expõe `ocupado`: quem sincroniza URL pausa
 *   enquanto `ocupado` for true.
 * - Antes de `router.push`/`<Link>` com popup aberto, chame `fechar()` — senão ficam entradas
 *   órfãs no histórico.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type EntradaPopup = { pf?: unknown; tok?: unknown }

function novoToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function usePopupHistory() {
  const [nivel, setNivelState] = useState(0)
  const nivelRef = useRef(0)
  const tokRef = useRef<string | null>(null)
  // Quantos popstate o PRÓPRIO hook provocou com history.go — esses não são "botão voltar".
  const ignorarRef = useRef(0)

  const setNivel = useCallback((n: number) => {
    nivelRef.current = n
    if (n === 0) tokRef.current = null
    setNivelState(n)
  }, [])

  /** Abre o popup (nível 1). Se já havia um aberto, recomeça do zero com token novo. */
  const abrir = useCallback(() => {
    const tok = novoToken()
    tokRef.current = tok
    window.history.pushState({ pf: 1, tok }, '')
    setNivel(1)
  }, [setNivel])

  /** Desce um nível dentro do popup aberto (ex.: da lista para a tela de um farol). */
  const entrar = useCallback(() => {
    const tok = tokRef.current
    if (!tok || nivelRef.current === 0) return
    const n = nivelRef.current + 1
    window.history.pushState({ pf: n, tok }, '')
    setNivel(n)
  }, [setNivel])

  const voltarPara = useCallback((alvo: number) => {
    const atual = nivelRef.current
    if (alvo >= atual) return
    const st = (window.history.state ?? null) as EntradaPopup | null
    const entradaEhNossa = !!st && st.tok === tokRef.current && st.pf === atual
    if (entradaEhNossa) {
      ignorarRef.current += 1
      window.history.go(alvo - atual)
    }
    // Entrada não é nossa (um replace apagou): só fecha o estado, sem mexer no histórico.
    setNivel(alvo)
  }, [setNivel])

  /** Sobe um nível (o "voltar" de dentro do popup). */
  const voltar = useCallback(() => voltarPara(nivelRef.current - 1), [voltarPara])

  /** Fecha o popup inteiro (X, clique fora, salvar). */
  const fechar = useCallback(() => voltarPara(0), [voltarPara])

  useEffect(() => {
    function aoVoltar(e: PopStateEvent) {
      if (ignorarRef.current > 0) { ignorarRef.current -= 1; return }
      if (nivelRef.current === 0) return
      const st = (e.state ?? null) as EntradaPopup | null
      if (st && st.tok === tokRef.current && typeof st.pf === 'number' && st.pf < nivelRef.current) {
        setNivel(st.pf)
      } else {
        setNivel(0)
      }
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [setNivel])

  return {
    /** 0 = fechado. */
    nivel,
    /** Há popup aberto — quem sincroniza a URL com `router.replace` deve pausar. */
    ocupado: nivel > 0,
    abrir,
    entrar,
    voltar,
    fechar,
  }
}
