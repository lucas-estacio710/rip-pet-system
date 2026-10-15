'use client'

// A CONTA NA LINHA (15/10/2026, Lucas: "uma bolinha com a cor da conta logo depois da data e a
// conta traz pra depois da bolinha"). Vai logo depois da data nas linhas do Livro-Caixa e dos
// lançamentos. Conta sem cor → bolinha vazada, pra a coluna não pular.

import { CORES_CONTA, type CorConta } from '@/lib/cor-conta'

export function ContaComBolinha({ cor, nome, className = '' }: { cor: CorConta | undefined; nome: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 max-w-[40%] shrink-0 align-middle ${className}`} title={nome}>
      <span className="h-2 w-2 rounded-full shrink-0"
            style={cor ? { background: CORES_CONTA[cor].hex } : { border: '1px solid var(--surface-400)' }} />
      <span className="truncate text-[var(--surface-600)]">{nome}</span>
    </span>
  )
}
