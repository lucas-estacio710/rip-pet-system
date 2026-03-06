export const THEMES = ['dark', 'white', 'half-white', 'half-dark'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'dark'
export const THEME_STORAGE_KEY = 'rippet-theme'

export const THEME_META: Record<Theme, { label: string; description: string }> = {
  dark: { label: 'Escuro', description: 'Tudo escuro' },
  white: { label: 'Claro', description: 'Tudo claro' },
  'half-white': { label: 'Meio-claro', description: 'Shell claro, conteúdo escuro' },
  'half-dark': { label: 'Meio-escuro', description: 'Shell escuro, conteúdo claro' },
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored && THEMES.includes(stored as Theme)) return stored as Theme
  return DEFAULT_THEME
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
}
