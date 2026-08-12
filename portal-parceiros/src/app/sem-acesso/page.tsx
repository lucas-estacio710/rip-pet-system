const MENSAGEM: Record<string, { titulo: string; texto: string }> = {
  nao_e_parceiro: {
    titulo: 'Conta sem cadastro no programa',
    texto:
      'Seu login funcionou, mas este e-mail ainda não está vinculado a um cadastro de parceiro. O acesso é por convite — fale com a equipe da RIP Pet que visita sua clínica.',
  },
  portal_inativo: {
    titulo: 'Cadastro pausado',
    texto:
      'Seu cadastro de parceiro está temporariamente inativo. Fale com a equipe da RIP Pet para reativar.',
  },
  modulo_desligado: {
    titulo: 'Programa indisponível na sua região',
    texto:
      'O programa de parceiros ainda não está ativo para a sua unidade. Assim que estiver, avisamos você.',
  },
}

export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>
}) {
  const { motivo } = await searchParams
  const msg = MENSAGEM[motivo ?? ''] ?? MENSAGEM.nao_e_parceiro

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-[var(--surface-900)]">{msg.titulo}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--surface-500)]">
          {msg.texto}
        </p>
        <a
          href="/entrar"
          className="mt-8 inline-block rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-5 py-3 text-sm font-medium text-[var(--surface-800)]"
        >
          Voltar
        </a>
      </div>
    </main>
  )
}
