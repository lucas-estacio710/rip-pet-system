// ============================================================================
// Cores do /dashboard-pipeline — UM lugar só.
//
// Estavam copiadas em 4 componentes (TipoCremacaoKPI, EspecieKPI, ComoConheceuKPI e a
// EvolucaoTab, que repetia as três com comentário "mesmas do X"). O pipeline redesenhado usa as
// mesmas cores nos gráficos do card de viagem (identidade com os Dashboards — decisão do Lucas),
// então a fonte da verdade sobe pra cá. Mudar uma cor aqui muda nos dois lugares.
// ============================================================================

export const COLOR_IND = '#10b981' // verde
export const COLOR_COL = '#a855f7' // roxo

export type EspecieKey = 'canina' | 'felina' | 'exotica'

export const ESPECIE_CORES: Record<EspecieKey, string> = {
  canina: '#ca8a04',
  felina: '#ec4899',
  exotica: '#6366f1',
}

export const ESPECIE_LABELS: Record<EspecieKey, string> = {
  canina: 'Canina',
  felina: 'Felina',
  exotica: 'Exótica',
}

// Config visual por fonte de conhecimento (chave = nome em minúsculas; busca por getFonteConfig).
export type FonteConfig = { color: string; img?: string; icon?: string }

export const FONTE_CONFIG: Record<string, FonteConfig> = {
  'google':                { color: '#3b82f6', img: '/icons/google.svg' },     // azul
  'instagram/facebook':    { color: '#f97316', img: '/icons/meta.svg' },       // laranja
  'indicação em clínica':  { color: '#10b981', img: '/icons/hospital.svg' },   // verde
  'cliente':               { color: '#7c3aed', icon: '🔄' },                   // roxo
  'parente/amigo':         { color: '#a78bfa', icon: '👥' },                   // lilás
  'seguradora':            { color: '#4338ca', icon: '🛡️' },                   // índigo
  'ponto':                 { color: '#dc2626', icon: '📍' },
  'ia':                    { color: '#ec4899', icon: '🤖' },                   // magenta
  'outro':                 { color: '#64748b', icon: '📝' },                   // cinza
}

export const FONTE_FALLBACK: FonteConfig = { color: 'var(--surface-400)' }

/** "Outras" — o balde das fontes fora do top nos gráficos. */
export const COLOR_OUTRAS = '#94a3b8'

export function getFonteConfig(nome: string): FonteConfig {
  return FONTE_CONFIG[nome.toLowerCase().trim()] ?? FONTE_FALLBACK
}
