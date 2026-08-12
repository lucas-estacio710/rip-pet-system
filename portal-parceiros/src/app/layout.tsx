import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RIP Pet Parceiros',
  description:
    'Portal de parceiros da RIP Pet — orçamento na hora, indicação rastreada e comissão transparente.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'RIP Pet Parceiros', statusBarStyle: 'default' },
  // Mesmos ícones do CRM (copiados de web/public em 30/07/2026)
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#1a1614',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={dmSans.variable}>{children}</body>
    </html>
  )
}
