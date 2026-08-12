'use client'

import { useEffect, useState } from 'react'
import { formatarBRL } from '@/lib/planos'
import { ROTULO_CATEGORIA } from '@/lib/categoria'

type Extrato = {
  resumo: { aReceber: number; recebido: number; totalIndicacoes: number }
  categoria: {
    atual: 'bronze' | 'prata' | 'ouro'
    proxima: 'prata' | 'ouro' | null
    faltam: number | null
    indicacoesNaJanela: number
    janelaDesde: string
    saindoDaJanela: { pet: string; saiEm: string }[]
  }
  indicacoes: {
    id: string; pet: string; tutor: string; tipo: string
    data: string; valor: number; situacao: 'paga' | 'a_receber' | 'sem_comissao'
  }[]
  pagamentos: { id: string; valor_total: number; pago_em: string; comprovante_url: string | null }[]
  serie: { mes: string; indicacoes: number; valor: number }[]
}

function dataBR(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const SITUACAO = {
  paga: { texto: 'Paga', cor: '#059669' },
  a_receber: { texto: 'A receber', cor: '#b45309' },
  sem_comissao: { texto: '—', cor: '#a8a29a' },
}

export default function ExtratoPage() {
  const [d, setD] = useState<Extrato | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    fetch('/api/extrato')
      .then(async (r) => { if (!r.ok) throw new Error(); setD(await r.json()) })
      .catch(() => setErro(true))
  }, [])

  if (erro) return <main className="p-6 text-center text-sm text-[var(--erro)]">Não consegui carregar seu extrato.</main>
  if (!d) return <main className="p-6 text-center text-sm text-[var(--surface-400)]">Carregando…</main>

  const maxValor = Math.max(...d.serie.map((s) => s.valor), 1)

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="mb-6 text-xl font-semibold text-[var(--surface-900)]">Meu extrato</h1>

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs text-[var(--surface-400)]">A receber</p>
          <p className="mt-1 text-xl font-semibold text-[var(--alerta)]">
            {formatarBRL(d.resumo.aReceber)}
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs text-[var(--surface-400)]">Já recebido</p>
          <p className="mt-1 text-xl font-semibold text-[var(--ok)]">
            {formatarBRL(d.resumo.recebido)}
          </p>
        </div>
      </section>

      {/* Categoria com a conta explícita */}
      <section className="mt-4 rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-[var(--surface-400)]">Categoria</span>
          <span className="font-semibold" style={{ color: `var(--cat-${d.categoria.atual})` }}>
            {ROTULO_CATEGORIA[d.categoria.atual]}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--surface-600)]">
          <strong className="text-[var(--surface-900)]">
            {d.categoria.indicacoesNaJanela}{' '}
            {d.categoria.indicacoesNaJanela === 1 ? 'pet indicado' : 'pets indicados'}
          </strong>{' '}
          desde {dataBR(d.categoria.janelaDesde)}.
          {d.categoria.proxima && d.categoria.faltam !== null && (
            <> Faltam {d.categoria.faltam} para {ROTULO_CATEGORIA[d.categoria.proxima]}.</>
          )}
        </p>

        {d.categoria.saindoDaJanela.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--surface-400)]">
              Como essa conta funciona
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-[var(--surface-500)]">
              Contam as indicações dos últimos 12 meses. Cada uma sai da conta um ano
              depois:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-[var(--surface-500)]">
              {d.categoria.saindoDaJanela.map((s, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{s.pet}</span>
                  <span className="text-[var(--surface-400)]">sai em {dataBR(s.saiEm)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Série mensal */}
      <section className="mt-4 rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <p className="mb-4 text-xs uppercase tracking-wide text-[var(--surface-400)]">
          Últimos 12 meses
        </p>
        <div className="flex items-end gap-1" style={{ height: 96 }}>
          {d.serie.map((s) => (
            <div key={s.mes} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-[3px] bg-[var(--brand-400)]"
                style={{ height: `${Math.max(2, (s.valor / maxValor) * 76)}px` }}
                title={`${s.mes}: ${s.indicacoes} indicações · ${formatarBRL(s.valor)}`}
              />
              <span className="text-[9px] text-[var(--surface-400)]">{s.mes.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Indicações */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--surface-700)]">Minhas indicações</h2>
        {d.indicacoes.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-white p-5 text-center text-sm text-[var(--surface-500)] shadow-[var(--shadow-sm)]">
            Suas indicações aparecem aqui assim que virarem contrato.
          </p>
        ) : (
          <ul className="space-y-2">
            {d.indicacoes.map((i) => {
              const s = SITUACAO[i.situacao]
              return (
                <li key={i.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--surface-800)]">{i.pet}</p>
                    <p className="text-xs text-[var(--surface-400)]">
                      {i.data && dataBR(i.data)} · {i.tipo === 'individual' ? 'Individual' : 'Coletiva'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-[var(--surface-800)]">
                      {i.valor > 0 ? formatarBRL(i.valor) : '—'}
                    </p>
                    <p className="text-xs" style={{ color: s.cor }}>{s.texto}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Pagamentos recebidos */}
      {d.pagamentos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--surface-700)]">Pagamentos recebidos</h2>
          <ul className="space-y-2">
            {d.pagamentos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--ok)]">{formatarBRL(Number(p.valor_total))}</p>
                  <p className="text-xs text-[var(--surface-400)]">{dataBR(p.pago_em)}</p>
                </div>
                {p.comprovante_url && (
                  <a href={p.comprovante_url} target="_blank" rel="noreferrer"
                    className="shrink-0 text-xs font-medium text-[var(--brand-600)]">
                    Comprovante
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
