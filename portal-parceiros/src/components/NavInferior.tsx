'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, Calculator, Wallet, Gift, FileText } from 'lucide-react'

/**
 * Barra inferior fixa — o parceiro usa isto de pé, no celular, muitas vezes com uma
 * mão só. Os itens somem conforme a configuração da unidade (decisão #34), então quem
 * está numa unidade sem sorteio simplesmente não vê a aba.
 */
export default function NavInferior({
  features,
}: {
  features: { sorteio: boolean; materiais: boolean }
}) {
  const path = usePathname()

  const itens = [
    { href: '/', label: 'Início', icone: Home, on: true },
    { href: '/orcar', label: 'Orçar', icone: Calculator, on: true },
    { href: '/extrato', label: 'Extrato', icone: Wallet, on: true },
    { href: '/sorteio', label: 'Sorteio', icone: Gift, on: features.sorteio },
    { href: '/materiais', label: 'Materiais', icone: FileText, on: features.materiais },
  ].filter(i => i.on)

  // O wizard e a página do tutor ocupam a tela toda — barra atrapalharia.
  if (path.startsWith('/orcar') || path.startsWith('/o/') || path.startsWith('/convite/')) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--surface-200)] bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegação principal"
    >
      <ul className="mx-auto flex max-w-md">
        {itens.map(i => {
          const Icone = i.icone
          const ativo = i.href === '/' ? path === '/' : path.startsWith(i.href)
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href}
                aria-current={ativo ? 'page' : undefined}
                className="flex flex-col items-center gap-0.5 py-2.5 text-[10px]"
                style={{ color: ativo ? 'var(--brand-600)' : 'var(--surface-400)' }}>
                <Icone className="h-5 w-5" />
                {i.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
