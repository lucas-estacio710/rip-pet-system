/**
 * "Esta unidade já faz o encaminhamento pelo Pipeline?"
 *
 * Interruptor de ROLLOUT do fluxo novo — ver `docs/ENCAMINHAMENTO_NO_PIPELINE.md`.
 * A migration 142 seeda `obj_enc_pipeline = 'hidden'` para gerente+operador de todas as
 * unidades; **ligar uma unidade APAGA essas rows** (default permissivo = `edit`).
 *
 * 🔴 POR QUE NÃO USAR `useFieldPermission` AQUI
 *
 * O hook de FLS responde *"esta PESSOA pode ver?"*, e para super_admin ele devolve `edit`
 * por hardcode — o `flsPermissions` do UnitContext nem chega a ser carregado
 * (`UnitContext.tsx`: `if (... || isSuperAdmin) { setFlsPermissions(new Map()); return }`).
 *
 * A pergunta aqui é outra: *"esta UNIDADE migrou?"*. É estado da unidade, não permissão de
 * pessoa. Usar o hook de FLS faria a `/encaminhamentos` virar somente-leitura para o
 * super_admin em TODA unidade — inclusive nas que ainda estão no fluxo antigo, tirando
 * dele justamente a ferramenta de operar quem não migrou.
 *
 * Por isso lê `field_permissions` direto, sem filtrar por role: se QUALQUER role está
 * `hidden`, a unidade ainda não migrou.
 *
 * ⚠️ No Pipeline (`/contratos`) o gate continua sendo o `useFieldPermission` normal — lá a
 * pergunta certa é mesmo "esta pessoa vê o fluxo novo?", e o super_admin ver antes de
 * todo mundo é proposital: é como o Lucas testa antes de liberar.
 *
 * ⚠️ Este hook morre na etapa 12 (limpeza final), quando a última unidade migrar.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

export function useUnidadeNoPipeline(): boolean {
  const { currentUnit } = useUnit()
  // Guarda a unidade JUNTO da resposta: assim o valor de uma unidade nunca vaza para
  // outra durante a troca, e não é preciso um `setState` síncrono no effect só para
  // limpar (que dispara render em cascata).
  const [resposta, setResposta] = useState<{ unidadeId: string; migrada: boolean } | null>(null)

  useEffect(() => {
    const unidadeId = currentUnit?.id
    if (!unidadeId) return
    const supabase = createClient()
    let vivo = true
    supabase
      .from('field_permissions')
      .select('permissao')
      .eq('unidade_id', unidadeId)
      .eq('campo', 'obj_enc_pipeline')
      .then(({ data }) => {
        if (!vivo) return
        const rows = (data || []) as { permissao: string }[]
        setResposta({ unidadeId, migrada: !rows.some(r => r.permissao === 'hidden') })
      })
    return () => { vivo = false }
  }, [currentUnit?.id])

  // Enquanto a resposta não é da unidade atual, responde `false` — ou seja, **fluxo
  // antigo**. É o default conservador de propósito: na dúvida, a tela antiga continua
  // operável. O contrário (travar antes de saber) deixaria o operador sem caminho por
  // alguns instantes a cada troca de unidade.
  if (!resposta || !currentUnit?.id) return false
  return resposta.unidadeId === currentUnit.id && resposta.migrada
}
