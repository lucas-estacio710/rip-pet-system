'use client'

import { useState, useEffect } from 'react'
import { type Theme, DEFAULT_THEME, getStoredTheme, setStoredTheme } from '@/lib/theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    setThemeState(getStoredTheme())
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    setStoredTheme(t)
  }

  return { theme, setTheme }
}
