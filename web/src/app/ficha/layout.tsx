import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ficha de Contratação - R.I.P. Pet',
}

export default function FichaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
