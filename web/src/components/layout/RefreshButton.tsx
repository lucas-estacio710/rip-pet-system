'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function RefreshButton() {
  const [spinning, setSpinning] = useState(false)

  function handleRefresh() {
    setSpinning(true)
    window.location.reload()
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={spinning}
      className="p-1.5 rounded-lg text-[var(--surface-500)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-100)] transition-colors disabled:opacity-60"
      title="Atualizar página (F5)"
      aria-label="Atualizar"
    >
      <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
    </button>
  )
}
