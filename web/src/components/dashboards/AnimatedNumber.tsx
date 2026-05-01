'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  duration?: number
  className?: string
}

export default function AnimatedNumber({ value, duration = 700, className }: Props) {
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)

  useEffect(() => {
    const from = displayRef.current
    const to = value
    if (from === to) return
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const elapsed = t - start
      const p = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      const next = Math.round(from + (to - from) * eased)
      displayRef.current = next
      setDisplay(next)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <span className={className}>{display.toLocaleString('pt-BR')}</span>
}
