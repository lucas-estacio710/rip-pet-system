import type { Metadata } from 'next'

const TITLE = 'Ficha de Contratação - R.I.P. Pet'
const DESCRIPTION = 'Preencha a ficha de contratação e translado do seu pet com a R.I.P. Pet.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function FichaLayout({ children }: { children: React.ReactNode }) {
  return children
}
