/**
 * Hook de Field-Level Security (FLS)
 *
 * Usa o cache de permissões carregado pelo UnitContext.
 * - super_admin → sempre 'edit' (hardcoded)
 * - Sem row no banco → default 'edit' (permissivo)
 *
 * Uso:
 *   const { can, canEdit, isVisible } = useFieldPermission()
 *   if (!isVisible('tela_pipeline', 'obj_financeiro')) return null
 *   <input disabled={!canEdit('tela_pipeline', 'valor_plano')} />
 */

import { useCallback } from 'react'
import { useUnit } from '@/contexts/UnitContext'

export type PermissionLevel = 'edit' | 'read' | 'hidden'

export function useFieldPermission() {
  const { isSuperAdmin, flsPermissions } = useUnit()

  /** Retorna o nível de permissão para um campo */
  const can = useCallback((_tela: string, campo: string): PermissionLevel => {
    if (isSuperAdmin) return 'edit'
    const perm = flsPermissions.get(campo)
    return (perm as PermissionLevel) ?? 'edit'
  }, [isSuperAdmin, flsPermissions])

  /** Pode editar? */
  const canEdit = useCallback((_tela: string, campo: string): boolean => {
    return can(_tela, campo) === 'edit'
  }, [can])

  /** É visível? (não é hidden) */
  const isVisible = useCallback((_tela: string, campo: string): boolean => {
    return can(_tela, campo) !== 'hidden'
  }, [can])

  return { can, canEdit, isVisible, loading: false }
}

/** Invalida cache — agora é no-op pois UnitContext recarrega ao mudar unidade/role */
export function invalidateFieldPermissionCache() {
  // No-op: UnitContext refetch handles this
}
