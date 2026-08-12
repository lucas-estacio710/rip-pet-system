import Shell from '@/components/Shell'

/**
 * Layout das telas do dia a dia do parceiro (com barra inferior).
 * Fora deste grupo ficam de propósito: /entrar, /convite, /orcar (wizard em tela
 * cheia), /o (página do tutor) e /termos.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>
}
