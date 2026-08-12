'use client'

import { useEffect, useState } from 'react'

type Dados = {
  ativo: boolean
  premio: { nome: string | null; descricao: string | null; imagem: string | null } | null
  meusBilhetes: { codigo: string; origem: string }[]
  proximoSorteioEm: string
  ultimo: {
    mes: string
    premio: string | null
    bilheteVencedor: string | null
    euGanhei: boolean
    euConcorri: boolean
  } | null
  regras: { porIndicacao: boolean; porMgm: boolean }
}

const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

export default function SorteioPage() {
  const [d, setD] = useState<Dados | null>(null)

  useEffect(() => {
    fetch('/api/sorteio').then(r => r.json()).then(setD).catch(() => setD(null))
  }, [])

  if (!d) return <main className="p-6 text-center text-sm text-[var(--surface-400)]">Carregando…</main>

  if (!d.ativo) {
    return (
      <main className="mx-auto max-w-md px-5 py-10 text-center">
        <p className="text-sm text-[var(--surface-500)]">
          O sorteio não está ativo na sua região no momento.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="mb-6 text-xl font-semibold text-[var(--surface-900)]">Sorteio</h1>

      {/* Resultado do último */}
      {d.ultimo && d.ultimo.bilheteVencedor && (
        <section
          className="mb-6 rounded-[var(--radius-lg)] p-5 text-center"
          style={{ background: d.ultimo.euGanhei ? '#ecfdf5' : 'var(--surface-100)' }}
        >
          <p className="text-xs uppercase tracking-wide text-[var(--surface-400)]">
            Sorteio de {dataBR(d.ultimo.mes).slice(3)}
          </p>
          <p className="mt-2 font-mono text-lg font-semibold text-[var(--surface-900)]">
            {d.ultimo.bilheteVencedor}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--surface-600)]">
            {d.ultimo.euGanhei ? (
              <strong className="text-[var(--ok)]">
                Esse bilhete é seu — você ganhou {d.ultimo.premio}! Vamos falar com você.
              </strong>
            ) : d.ultimo.euConcorri ? (
              'Não foi desta vez. Boa sorte no próximo mês!'
            ) : (
              'Você não tinha bilhetes neste mês.'
            )}
          </p>
        </section>
      )}

      {/* Prêmio do mês */}
      <section className="rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-md)]">
        <p className="text-xs uppercase tracking-wide text-[var(--surface-400)]">
          Prêmio deste mês
        </p>
        {d.premio?.nome ? (
          <>
            {d.premio.imagem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.premio.imagem} alt=""
                className="mt-3 w-full rounded-[var(--radius-md)] object-cover" />
            )}
            <p className="mt-3 text-lg font-semibold text-[var(--surface-900)]">{d.premio.nome}</p>
            {d.premio.descricao && (
              <p className="mt-1 text-sm leading-relaxed text-[var(--surface-500)]">
                {d.premio.descricao}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-[var(--surface-500)]">
            Estamos preparando a surpresa deste mês. Volte em breve!
          </p>
        )}
        <p className="mt-4 border-t border-[var(--surface-100)] pt-3 text-xs text-[var(--surface-400)]">
          Sorteio em {dataBR(d.proximoSorteioEm)}
        </p>
      </section>

      {/* Meus bilhetes */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--surface-700)]">
          Meus bilhetes deste mês
        </h2>
        {d.meusBilhetes.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] bg-white p-5 text-center shadow-[var(--shadow-sm)]">
            <p className="text-sm leading-relaxed text-[var(--surface-500)]">
              Você ainda não tem bilhetes este mês.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--surface-400)]">
              {d.regras.porIndicacao && 'Cada indicação que vira contrato dá 1 bilhete.'}
              {d.regras.porMgm && ' Cada colega que você convida e se cadastra dá 1 bilhete.'}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {d.meusBilhetes.map((b) => (
              <li key={b.codigo}
                className="rounded-[var(--radius-md)] border border-dashed border-[var(--brand-300)] bg-white px-3 py-3 text-center">
                <p className="font-mono text-sm font-semibold text-[var(--brand-700)]">{b.codigo}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--surface-400)]">
                  {b.origem === 'mgm' ? 'indicou colega' : 'indicação'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
