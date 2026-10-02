/**
 * "Esta pessoa, nesta unidade, vê o pipeline redesenhado?"
 *
 * Duas travas, as duas pela chave FLS `obj_enc_pipeline` (rollout por unidade, mig 142):
 * - `cardNovo`    → card/faróis/popups novos. Vale também na unidade de cremação local (PI).
 * - `encPipeline` → viagem, Nicho e despacho pelo pipeline. NÃO vale com `cb_cremacao_local`,
 *                   que não encaminha (mesma regra do `contratos/page.tsx`).
 *
 * 🔴 `pronto` antes de tudo: o FLS chega DEPOIS da tela, e antes disso o Map vazio responde
 * `edit` pra qualquer key. Quem consome tem que mostrar skeleton e NÃO carregar nada enquanto
 * `!pronto` — tratar "carregando" como desligado faz a unidade migrada piscar o card antigo e
 * carregar 2×. Erro na carga do FLS = desligado (fluxo antigo), nunca ligado.
 *
 * super_admin é `edit` por hardcode: vê o fluxo novo em qualquer unidade. Validar como
 * gerente/concierge pelo "Logar como". Ver docs/PLAYBOOK_REDESENHO_PIPELINE.md §1.
 */
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'

export function useCardNovo(): { cardNovo: boolean; encPipeline: boolean; fluxoLocal: boolean; pronto: boolean } {
  const { currentUnit, flsStatus } = useUnit()
  const { isVisible } = useFieldPermission()

  // Lido direto de modulos_ativos: hasModule() é FLS-only e sempre true pro super_admin.
  const fluxoLocal = !!currentUnit?.modulos_ativos?.includes('cb_cremacao_local')
  const cardNovo = flsStatus === 'pronto' && isVisible('tela_pipeline', 'obj_enc_pipeline')

  return {
    cardNovo,
    encPipeline: cardNovo && !fluxoLocal,
    fluxoLocal,
    pronto: flsStatus !== 'carregando',
  }
}
