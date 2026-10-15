import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { vigiarEscritasFinanceiro } from '@/lib/financeiro-eventos'

export function createClient() {
  // vigiarEscritasFinanceiro (15/10/2026): toda gravação que der certo numa tabela do financeiro
  // avisa a tela pra recarregar (lib/financeiro-eventos). Só observa — não muda resultado nenhum.
  return vigiarEscritasFinanceiro(createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))
}
