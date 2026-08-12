import { redirect } from 'next/navigation'
import { getParceiroSessao, SessaoInvalida } from '@/lib/sessao'
import { createAdminClient } from '@/lib/supabase/admin'
import { inicioJanela, progressoCategoria, ROTULO_CATEGORIA } from '@/lib/categoria'

export const dynamic = 'force-dynamic'

const COR_CATEGORIA = {
  bronze: 'var(--cat-bronze)',
  prata: 'var(--cat-prata)',
  ouro: 'var(--cat-ouro)',
} as const

function formatarData(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default async function HomePage() {
  let sessao
  try {
    sessao = await getParceiroSessao()
  } catch (e) {
    if (e instanceof SessaoInvalida) {
      if (e.motivo === 'sem_login') redirect('/entrar')
      redirect(`/sem-acesso?motivo=${e.motivo}`)
    }
    throw e
  }

  const admin = createAdminClient()
  const desde = inicioJanela()
  const { count } = await admin
    .from('contratos')
    .select('id', { count: 'exact', head: true })
    .eq('contato_id', sessao.contatoId)
    .gte('data_contrato', desde.toISOString().slice(0, 10))

  const qtd = count ?? 0
  const { atual, proxima, faltam } = progressoCategoria(qtd, sessao.config.faixas)
  const primeiroNome = sessao.nome.split(' ')[0]

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--surface-500)]">Olá,</p>
        <h1 className="text-2xl font-semibold text-[var(--surface-900)]">
          {primeiroNome}
        </h1>
      </header>

      {/* Card de categoria — a CONTA fica visível (decisão #12) */}
      <section
        className="rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-md)]"
        aria-label="Sua categoria no programa"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-[var(--surface-400)]">
            Sua categoria
          </span>
          <span
            className="text-lg font-semibold"
            style={{ color: COR_CATEGORIA[atual] }}
          >
            {ROTULO_CATEGORIA[atual]}
          </span>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-[var(--surface-600)]">
          <strong className="text-[var(--surface-900)]">
            {qtd} {qtd === 1 ? 'pet indicado' : 'pets indicados'}
          </strong>{' '}
          desde {formatarData(desde.toISOString().slice(0, 10))}.
        </p>

        {proxima && faltam !== null && (
          <p className="mt-1 text-sm text-[var(--surface-500)]">
            {faltam === 1
              ? `Falta 1 indicação para ${ROTULO_CATEGORIA[proxima]}.`
              : `Faltam ${faltam} indicações para ${ROTULO_CATEGORIA[proxima]}.`}
          </p>
        )}
      </section>

      {!sessao.pixChave && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-[#fffbeb] px-4 py-3 text-sm text-[var(--alerta)]">
          Você ainda não cadastrou sua chave pix — sem ela não conseguimos pagar
          suas comissões.
        </p>
      )}

      <nav className="mt-6 grid gap-3">
        <a
          href="/orcar"
          className="rounded-[var(--radius-md)] bg-[var(--brand-600)] px-4 py-4 text-center text-sm font-medium text-white"
        >
          Fazer um orçamento
        </a>
        <div className="grid grid-cols-2 gap-3">
          <a href="/orcamentos"
            className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-4 text-center text-sm font-medium text-[var(--surface-800)]">
            Meus orçamentos
          </a>
          <a href="/extrato"
            className="rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-4 text-center text-sm font-medium text-[var(--surface-800)]">
            Meu extrato
          </a>
        </div>
        {sessao.config.mgm_ativo && (
          <a href="/convidar"
            className="rounded-[var(--radius-md)] border border-dashed border-[var(--brand-300)] bg-white px-4 py-4 text-center text-sm font-medium text-[var(--brand-700)]">
            Indicar um colega
          </a>
        )}
      </nav>
    </main>
  )
}
