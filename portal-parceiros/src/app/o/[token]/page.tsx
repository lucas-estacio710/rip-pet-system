'use client'

import { use, useEffect, useState } from 'react'
import { formatarBRL } from '@/lib/planos'
import { FORMAS_PAGAMENTO } from '@/lib/tipos'

type Item = { nome: string; grupo: string; modo: string; preco: number }
type Orcamento = {
  pet: { nome: string; especie: string | null; peso: number | null }
  tipoCremacao: 'individual' | 'coletiva'
  plano: { nome: string; preco: number }
  itens: Item[]
  desconto: { percentual: number; valor: number } | null
  cortesia: { nome: string; imagem_url: string | null } | null
  total: number
  maxParcelas: number
  unidade: string | null
  whatsapp: string | null
}

const inputCls =
  'w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--brand-400)]'

export default function OrcamentoPublicoPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [orc, setOrc] = useState<Orcamento | null>(null)
  const [indisponivel, setIndisponivel] = useState<{ motivo: string; whatsapp?: string } | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [f, setF] = useState({
    nomeCompleto: '', telefone: '', cpf: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '',
    localizacao: '', localizacaoOutra: '',
    pagamento: '', parcelas: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    fetch(`/api/publico/orcamento/${token}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok || !j.valido) { setIndisponivel({ motivo: j.motivo, whatsapp: j.whatsapp }); return }
        setOrc(j)
      })
      .catch(() => setIndisponivel({ motivo: 'erro' }))
  }, [token])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const res = await fetch(`/api/publico/orcamento/${token}/aceitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    const j = await res.json()
    setEnviando(false)
    if (!res.ok) { setErro(j.erro ?? 'Não consegui enviar.'); return }
    setEnviado(true)
  }

  if (indisponivel) {
    const zap = indisponivel.whatsapp?.replace(/\D/g, '')
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-[var(--surface-900)]">
            {indisponivel.motivo === 'ja_usado'
              ? 'Já recebemos sua solicitação'
              : 'Este link não está mais disponível'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--surface-500)]">
            {indisponivel.motivo === 'ja_usado'
              ? 'Nossa equipe já está com os dados e vai falar com você.'
              : 'Podemos preparar tudo de novo, sem problema nenhum. É só chamar.'}
          </p>
          {zap && (
            <a href={`https://wa.me/55${zap}`} target="_blank" rel="noreferrer"
              className="mt-8 inline-block w-full rounded-[var(--radius-md)] bg-[#25D366] px-5 py-3.5 text-sm font-semibold text-white">
              Falar com a RIP Pet
            </a>
          )}
        </div>
      </main>
    )
  }

  if (!orc) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6">
        <p className="text-sm text-[var(--surface-400)]">Abrindo…</p>
      </main>
    )
  }

  if (enviado) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-[var(--surface-900)]">
            Recebemos, obrigado.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--surface-500)]">
            Nossa equipe vai entrar em contato com você em instantes para combinar cada
            detalhe da despedida do {orc.pet.nome}. Sentimos muito pela sua perda.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <header className="text-center">
        <p className="text-sm text-[var(--surface-500)]">Uma despedida para</p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--surface-900)]">{orc.pet.nome}</h1>
      </header>

      <section className="mt-8 rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-md)]">
        <p className="font-medium text-[var(--surface-900)]">{orc.plano.nome}</p>
        <p className="mt-0.5 text-sm text-[var(--surface-500)]">
          Cremação {orc.tipoCremacao === 'individual' ? 'individual' : 'coletiva'}
          {orc.tipoCremacao === 'individual'
            ? ' — as cinzas retornam para você'
            : ' — as cinzas não retornam'}
        </p>

        {orc.itens.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-[var(--surface-100)] pt-4 text-sm">
            {orc.itens.map((i, n) => (
              <li key={n} className="flex justify-between gap-3">
                <span className="text-[var(--surface-600)]">{i.nome}</span>
                <span className="shrink-0 text-[var(--surface-400)]">
                  {i.modo === 'incluso' ? 'incluso' : formatarBRL(i.preco)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {orc.desconto && (
          <p className="mt-4 rounded-[var(--radius-md)] bg-[#ecfdf5] px-3 py-2.5 text-sm text-[var(--ok)]">
            Desconto de {orc.desconto.percentual}% aplicado — cortesia de quem indicou.
          </p>
        )}

        {orc.cortesia && (
          <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-50)] px-3 py-2.5 text-sm text-[var(--surface-600)]">
            Inclui <strong>{orc.cortesia.nome}</strong> como cortesia de quem indicou.
          </p>
        )}

        <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-[var(--surface-100)] pt-4">
          <span className="text-sm text-[var(--surface-500)]">Total</span>
          <span className="text-2xl font-semibold text-[var(--surface-900)]">
            {formatarBRL(orc.total)}
          </span>
        </div>
      </section>

      {!mostrarForm ? (
        <>
          <button onClick={() => setMostrarForm(true)}
            className="mt-6 w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-5 py-4 text-sm font-semibold text-white">
            Quero seguir com a RIP Pet
          </button>
          <p className="mt-4 text-center text-xs leading-relaxed text-[var(--surface-400)]">
            Sem compromisso agora. No próximo passo pedimos só seus dados de contato
            para nossa equipe falar com você.
          </p>
        </>
      ) : (
        <form onSubmit={enviar} className="mt-8 space-y-3">
          <h2 className="text-base font-medium text-[var(--surface-800)]">Seus dados</h2>

          <input required value={f.nomeCompleto} onChange={set('nomeCompleto')}
            placeholder="Seu nome completo" autoComplete="name" className={inputCls} />
          <input required type="tel" value={f.telefone} onChange={set('telefone')}
            placeholder="Telefone / WhatsApp" autoComplete="tel" className={inputCls} />
          <input value={f.cpf} onChange={set('cpf')} inputMode="numeric"
            placeholder="CPF (para o contrato)" className={inputCls} />

          <h2 className="pt-3 text-base font-medium text-[var(--surface-800)]">
            Onde está o {orc.pet.nome}?
          </h2>
          <select required value={f.localizacao} onChange={set('localizacao')} className={inputCls}>
            <option value="">Selecione…</option>
            <option value="Residência">Em casa</option>
            <option value="Hospital/Clínica Veterinária">Em uma clínica ou hospital</option>
            <option value="Outro">Outro lugar</option>
          </select>
          {(f.localizacao === 'Hospital/Clínica Veterinária' || f.localizacao === 'Outro') && (
            <input required value={f.localizacaoOutra} onChange={set('localizacaoOutra')}
              placeholder="Qual o nome do local?" className={inputCls} />
          )}

          <div className="grid grid-cols-3 gap-3">
            <input value={f.cep} onChange={set('cep')} inputMode="numeric"
              placeholder="CEP" className={inputCls} />
            <input value={f.endereco} onChange={set('endereco')}
              placeholder="Rua" className={inputCls + ' col-span-2'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input value={f.numero} onChange={set('numero')} placeholder="Nº" className={inputCls} />
            <input value={f.bairro} onChange={set('bairro')}
              placeholder="Bairro" className={inputCls + ' col-span-2'} />
          </div>
          <input value={f.cidade} onChange={set('cidade')} placeholder="Cidade" className={inputCls} />

          <h2 className="pt-3 text-base font-medium text-[var(--surface-800)]">
            Como prefere pagar?
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO.map((p) => {
              const on = f.pagamento === p.valor
              return (
                <button key={p.valor} type="button"
                  onClick={() => setF((prev) => ({
                    ...prev,
                    pagamento: p.valor,
                    parcelas: p.valor === 'Cartão Crédito' ? prev.parcelas : '',
                  }))}
                  className="rounded-[var(--radius-md)] border-2 bg-white px-4 py-3 text-sm transition"
                  style={{
                    borderColor: on ? 'var(--brand-500)' : 'var(--surface-200)',
                    color: on ? 'var(--surface-900)' : 'var(--surface-600)',
                  }}>
                  {p.label}
                </button>
              )
            })}
          </div>

          {f.pagamento === 'Cartão Crédito' && (
            <div>
              <select required value={f.parcelas} onChange={set('parcelas')} className={inputCls}>
                <option value="">Em quantas vezes?</option>
                {Array.from({ length: orc.maxParcelas }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={`${n}x`}>
                    {n === 1
                      ? `À vista — ${formatarBRL(orc.total)}`
                      : `${n}x de ${formatarBRL(orc.total / n)}`}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 px-1 text-xs leading-relaxed text-[var(--surface-400)]">
                Sem juros — o total continua {formatarBRL(orc.total)}.
              </p>
            </div>
          )}

          {erro && <p role="alert" className="text-sm text-[var(--erro)]">{erro}</p>}

          <button type="submit" disabled={enviando}
            className="w-full rounded-[var(--radius-md)] bg-[var(--brand-600)] px-5 py-4 text-sm font-semibold text-white disabled:opacity-60">
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
    </main>
  )
}
