'use client'
import ModuleGuard from '@/components/layout/ModuleGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleGuard module="tela_fichas">{children}</ModuleGuard>
}
