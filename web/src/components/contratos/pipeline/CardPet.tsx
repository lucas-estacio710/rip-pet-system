'use client'

/**
 * Card de pet do pipeline REDESENHADO — ponto de troca do "estrangulador" (fase 1.3 do
 * docs/PLAYBOOK_REDESENHO_PIPELINE.md).
 *
 * O `/contratos` decide por contrato: `cardNovo` (chave obj_enc_pipeline) → este componente;
 * senão → o card antigo, intocado. Hoje este componente ainda DEVOLVE O CARD ANTIGO
 * (`renderAntigo`), então ligar a chave não muda nada no card. A partir do 2.2 o miolo
 * daqui é substituído pelo card novo, peça por peça, sem mexer no caminho de quem não migrou.
 *
 * Por que não copiar as ~800 linhas do card antigo pra cá agora: ele é uma closure dentro do
 * render do /contratos e depende de dezenas de estados e handlers da página. Copiar tudo pra
 * um componente com props seria refeito no 2.2 de qualquer jeito.
 */
import type { ReactNode } from 'react'

type Props = {
  /** O card antigo, já pronto — usado até o 2.2 entregar o desenho novo. */
  renderAntigo: () => ReactNode
}

export default function CardPet({ renderAntigo }: Props) {
  return <>{renderAntigo()}</>
}
