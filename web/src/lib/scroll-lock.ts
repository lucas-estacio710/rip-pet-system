// ============================================================================
// Trava a rolagem do fundo enquanto houver QUALQUER overlay aberto — com contador.
//
// 🔴 POR QUE CONTADOR: o Modal e o MobileDrawer gravavam `body.style.overflow` direto, e o
// efeito de quem FECHAVA (ou de um modal montado fechado) gravava `''`, destravando o fundo com
// outro modal ainda aberto por cima. No pipeline redesenhado é rotina: a confirmação "Tirar
// LUNA?" abre sobre o "Editar encaminhamento" (docs/playbook_redesenho/07_layout_infra.md §2.1).
// Aqui cada overlay pede a trava e devolve a SUA; o fundo só destrava quando o último sai.
//
// O valor inline anterior é guardado e devolvido — `body` tem `overflow-x: hidden` no CSS
// global (rede anti-estouro, demanda 2026/110), que mora na folha de estilo e não é tocado.
// ============================================================================

import { useEffect } from 'react'

let travas = 0
let overflowAntes = ''

/** Pede a trava. Devolve a função que a solta (idempotente — soltar 2× não desconta 2×). */
export function travarRolagem(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (travas === 0) {
    overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  travas += 1
  let solta = false
  return () => {
    if (solta) return
    solta = true
    travas = Math.max(0, travas - 1)
    if (travas === 0) document.body.style.overflow = overflowAntes
  }
}

/** Trava enquanto `ativo` for true; solta ao desligar ou desmontar. */
export function useTravarRolagem(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return
    return travarRolagem()
  }, [ativo])
}
