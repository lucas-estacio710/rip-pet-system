'use client'

import { useEffect, useState } from 'react'
import {
  precoDoPlano, temAdicionalDePorte, gruposOrdenados, formatarBRL, type Plano,
} from '@/lib/planos'

type Cortesia = { id: string; nome: string; imagem_url: string | null }
type Catalogo = {
  planos: Plano[]
  beneficios: { comissao: boolean; desconto: boolean; cortesia: boolean }
  descontoPercentual: number
  cortesias: { individual: Cortesia[]; coletiva: Cortesia[] }
}

const card =
  'w-full rounded-[var(--radius-lg)] border-2 bg-white p-4 text-left transition'
const inputCls =
  'w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--brand-400)]'

export default function OrcarPage() {
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [passo, setPasso] = useState(0)

  const [petNome, setPetNome] = useState('')
  const [especie, setEspecie] = useState('')
  const [peso, setPeso] = useState('')
  const [tipo, setTipo] = useState<'individual' | 'coletiva' | ''>('')
  const [planoId, setPlanoId] = useState('')
  const [itens, setItens] = useState<Record<string, string[]>>({})
  const [beneficio, setBeneficio] = useState<'comissao' | 'desconto' | 'cortesia' | ''>('')
  const [cortesiaId, setCortesiaId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState<{ url: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    fetch('/api/catalogo')
      .then(async (r) => {
        if (!r.ok) throw new Error()
        setCat(await r.json())
      })
      .catch(() => setErro('Não consegui carregar o catálogo.'))
  }, [])

  const pesoKg = peso ? parseFloat(peso.replace(',', '.')) : null
  const planosDoTipo = cat && tipo ? cat.planos.filter((p) => p.tipo_cremacao === tipo) : []
  const plano = planosDoTipo.find((p) => p.id === planoId) ?? null
  const grupos = plano ? gruposOrdenados(plano) : []
  const cortesias = cat && tipo ? cat.cortesias[tipo] ?? [] : []

  const idsEscolhidos = Object.values(itens).flat()
  const precoBase = plano ? precoDoPlano(plano, pesoKg) : 0
  const extras = grupos
    .flatMap((g) => g.plano_itens)
    .filter((i) => idsEscolhidos.includes(i.id) && i.modo === 'desconto')
    .reduce((s, i) => s + (i.preco_desconto ?? 0), 0)
  const desconto =
    beneficio === 'desconto' && cat ? (precoBase + extras) * (cat.descontoPercentual / 100) : 0
  const total = precoBase + extras - desconto

  function toggleItem(grupoId: string, itemId: string, max: number) {
    setItens((prev) => {
      const atual = prev[grupoId] ?? []
      if (atual.includes(itemId)) return { ...prev, [grupoId]: atual.filter((i) => i !== itemId) }
      if (max === 1) return { ...prev, [grupoId]: [itemId] }
      if (atual.length < max) return { ...prev, [grupoId]: [...atual, itemId] }
      return prev
    })
  }

  async function gerar() {
    setEnviando(true)
    setErro(null)
    const res = await fetch('/api/orcamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        petNome, petEspecie: especie || null, petPeso: pesoKg,
        tipoCremacao: tipo, planoId, itensIds: idsEscolhidos,
        beneficioTipo: beneficio,
        cortesiaProdutoId: beneficio === 'cortesia' ? cortesiaId : null,
      }),
    })
    const json = await res.json()
    setEnviando(false)
    if (!res.ok) { setErro(json.erro ?? 'Falha ao gerar o orçamento.'); return }
    setPronto({ url: json.url })
  }

  async function copiar() {
    if (!pronto) return
    await navigator.clipboard.writeText(pronto.url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (erro && !cat) {
    return <main className="p-6 text-center text-sm text-[var(--erro)]">{erro}</main>
  }
  if (!cat) {
    return <main className="p-6 text-center text-sm text-[var(--surface-400)]">Carregando…</main>
  }

  // ---------- resultado ----------
  if (pronto) {
    const zap = `Olá! Preparei as informações sobre a despedida do ${petNome}. É só abrir com calma: ${pronto.url}`
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10 text-center">
        <h1 className="text-xl font-semibold text-[var(--surface-900)]">Orçamento pronto</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--surface-500)]">
          Envie para o tutor. O valor fica garantido até o fim do dia de amanhã.
        </p>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(zap)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-8 block w-full rounded-[var(--radius-md)] bg-[#25D366] px-5 py-4 text-sm font-semibold text-white"
        >
          Enviar pelo WhatsApp
        </a>
        <button onClick={copiar}
          className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--surface-200)] bg-white px-5 py-4 text-sm font-medium text-[var(--surface-800)]">
          {copiado ? 'Link copiado' : 'Copiar link'}
        </button>
        <a href={pronto.url} target="_blank" rel="noreferrer"
          className="mt-3 block w-full rounded-[var(--radius-md)] px-5 py-4 text-sm font-medium text-[var(--surface-500)]">
          Preencher agora, aqui comigo
        </a>
        <a href="/" className="mt-6 inline-block text-sm text-[var(--surface-400)] underline">
          Voltar ao início
        </a>
      </main>
    )
  }

  const passos = [
    // 0 — pet
    {
      titulo: 'Sobre o pet',
      podeSeguir: petNome.trim().length > 0,
      conteudo: (
        <div className="space-y-3">
          <input value={petNome} onChange={(e) => setPetNome(e.target.value)}
            placeholder="Nome do pet" className={inputCls} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <select value={especie} onChange={(e) => setEspecie(e.target.value)} className={inputCls}>
              <option value="">Espécie</option>
              <option value="canina">Cão</option>
              <option value="felina">Gato</option>
              <option value="exotica">Outro</option>
            </select>
            <input value={peso} onChange={(e) => setPeso(e.target.value)}
              inputMode="decimal" placeholder="Peso (kg)" className={inputCls} />
          </div>
          <p className="px-1 text-xs leading-relaxed text-[var(--surface-400)]">
            O peso define se entra adicional de porte — informe antes de mostrar o valor.
          </p>
        </div>
      ),
    },
    // 1 — tipo
    {
      titulo: 'Tipo de cremação',
      podeSeguir: tipo !== '',
      conteudo: (
        <div className="space-y-3">
          {(['individual', 'coletiva'] as const).map((t) => (
            <button key={t} onClick={() => { setTipo(t); setPlanoId(''); setItens({}) }}
              className={card}
              style={{ borderColor: tipo === t ? 'var(--brand-500)' : 'var(--surface-200)' }}>
              <p className="font-medium text-[var(--surface-900)]">
                {t === 'individual' ? 'Individual' : 'Coletiva'}
              </p>
              <p className="mt-1 text-sm text-[var(--surface-500)]">
                {t === 'individual'
                  ? 'Cremação exclusiva — as cinzas voltam para o tutor.'
                  : 'Cremação coletiva — as cinzas não retornam.'}
              </p>
            </button>
          ))}
        </div>
      ),
    },
    // 2 — plano
    {
      titulo: 'Plano',
      podeSeguir: planoId !== '',
      conteudo: (
        <div className="space-y-3">
          {planosDoTipo.length === 0 && (
            <p className="text-sm text-[var(--surface-500)]">
              Nenhum plano cadastrado para este tipo. Fale com a equipe da RIP Pet.
            </p>
          )}
          {planosDoTipo.map((p) => (
            <button key={p.id} onClick={() => { setPlanoId(p.id); setItens({}) }}
              className={card}
              style={{ borderColor: planoId === p.id ? 'var(--brand-500)' : 'var(--surface-200)' }}>
              <div className="flex items-start gap-3">
                {p.imagem_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagem_url} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--surface-900)]">{p.nome}</p>
                  {p.descricao && (
                    <p className="mt-1 text-sm leading-relaxed text-[var(--surface-500)]">{p.descricao}</p>
                  )}
                  <p className="mt-2 font-semibold text-[var(--brand-600)]">
                    {formatarBRL(precoDoPlano(p, pesoKg))}
                  </p>
                  {temAdicionalDePorte(p, pesoKg) && (
                    <p className="mt-0.5 text-xs text-[var(--surface-400)]">
                      Inclui adicional de porte (acima de {p.adicional_peso_kg}kg)
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ),
    },
    // 3 — itens
    {
      titulo: 'O que acompanha',
      podeSeguir: grupos.every(
        (g) => (itens[g.id]?.length ?? 0) >= g.escolha_min
      ),
      conteudo: (
        <div className="space-y-6">
          {grupos.length === 0 && (
            <p className="text-sm text-[var(--surface-500)]">
              Este plano não tem itens para escolher — pode seguir.
            </p>
          )}
          {grupos.map((g) => (
            <section key={g.id}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-medium text-[var(--surface-800)]">{g.nome}</h3>
                <span className="text-xs text-[var(--surface-400)]">
                  {g.escolha_min > 0 ? 'obrigatório' : 'opcional'}
                  {g.escolha_max > 1 && ` · até ${g.escolha_max}`}
                </span>
              </div>
              <div className="space-y-2">
                {g.plano_itens.map((i) => {
                  const sel = (itens[g.id] ?? []).includes(i.id)
                  return (
                    <button key={i.id} onClick={() => toggleItem(g.id, i.id, g.escolha_max)}
                      className={card + ' flex items-center gap-3'}
                      style={{ borderColor: sel ? 'var(--brand-500)' : 'var(--surface-200)' }}>
                      {i.imagem_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.imagem_url} alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] object-cover" />
                      )}
                      <span className="min-w-0 flex-1 text-sm text-[var(--surface-800)]">{i.nome}</span>
                      <span className="shrink-0 text-sm font-medium text-[var(--surface-500)]">
                        {i.modo === 'incluso' ? 'incluso' : `+ ${formatarBRL(i.preco_desconto ?? 0)}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ),
    },
    // 4 — benefício
    {
      titulo: 'Seu benefício',
      podeSeguir: beneficio !== '' && (beneficio !== 'cortesia' || cortesiaId !== ''),
      conteudo: (
        <div className="space-y-3">
          <p className="mb-1 text-sm leading-relaxed text-[var(--surface-500)]">
            Você escolhe o que fazer com este atendimento.
          </p>

          {cat.beneficios.comissao && (
            <button onClick={() => setBeneficio('comissao')} className={card}
              style={{ borderColor: beneficio === 'comissao' ? 'var(--brand-500)' : 'var(--surface-200)' }}>
              <p className="font-medium text-[var(--surface-900)]">Receber minha comissão</p>
              <p className="mt-1 text-sm text-[var(--surface-500)]">
                Entra no seu extrato quando o contrato for fechado.
              </p>
            </button>
          )}

          {cat.beneficios.desconto && (
            <button onClick={() => setBeneficio('desconto')} className={card}
              style={{ borderColor: beneficio === 'desconto' ? 'var(--brand-500)' : 'var(--surface-200)' }}>
              <p className="font-medium text-[var(--surface-900)]">
                Dar {cat.descontoPercentual}% de desconto ao tutor
              </p>
              <p className="mt-1 text-sm text-[var(--surface-500)]">
                O tutor paga menos e vê o desconto no orçamento.
              </p>
            </button>
          )}

          {cat.beneficios.cortesia && cortesias.length > 0 && (
            <>
              <button onClick={() => setBeneficio('cortesia')} className={card}
                style={{ borderColor: beneficio === 'cortesia' ? 'var(--brand-500)' : 'var(--surface-200)' }}>
                <p className="font-medium text-[var(--surface-900)]">Oferecer uma recordação</p>
                <p className="mt-1 text-sm text-[var(--surface-500)]">
                  Um item de cortesia, por sua conta da casa.
                </p>
              </button>
              {beneficio === 'cortesia' && (
                <div className="ml-1 space-y-2 border-l-2 border-[var(--surface-200)] pl-4">
                  {cortesias.map((c) => (
                    <button key={c.id} onClick={() => setCortesiaId(c.id)}
                      className={card + ' flex items-center gap-3'}
                      style={{ borderColor: cortesiaId === c.id ? 'var(--brand-500)' : 'var(--surface-200)' }}>
                      {c.imagem_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imagem_url} alt="" className="h-10 w-10 rounded-[var(--radius-sm)] object-cover" />
                      )}
                      <span className="text-sm text-[var(--surface-800)]">{c.nome}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    // 5 — resumo
    {
      titulo: 'Confira',
      podeSeguir: true,
      conteudo: (
        <div className="rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-sm)]">
          <p className="text-lg font-semibold text-[var(--surface-900)]">{petNome}</p>
          <p className="text-sm text-[var(--surface-500)]">
            {tipo === 'individual' ? 'Cremação individual' : 'Cremação coletiva'}
            {pesoKg ? ` · ${peso}kg` : ''}
          </p>

          <div className="mt-4 space-y-1.5 border-t border-[var(--surface-100)] pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-[var(--surface-600)]">{plano?.nome}</span>
              <span className="shrink-0 text-[var(--surface-800)]">{formatarBRL(precoBase)}</span>
            </div>
            {grupos.flatMap((g) => g.plano_itens).filter((i) => idsEscolhidos.includes(i.id)).map((i) => (
              <div key={i.id} className="flex justify-between gap-3">
                <span className="text-[var(--surface-500)]">{i.nome}</span>
                <span className="shrink-0 text-[var(--surface-500)]">
                  {i.modo === 'incluso' ? 'incluso' : formatarBRL(i.preco_desconto ?? 0)}
                </span>
              </div>
            ))}
            {desconto > 0 && (
              <div className="flex justify-between gap-3 text-[var(--ok)]">
                <span>Desconto ({cat.descontoPercentual}%)</span>
                <span className="shrink-0">− {formatarBRL(desconto)}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--surface-100)] pt-4">
            <span className="text-sm text-[var(--surface-500)]">Total</span>
            <span className="text-xl font-semibold text-[var(--surface-900)]">
              {formatarBRL(total)}
            </span>
          </div>

          {beneficio === 'cortesia' && (
            <p className="mt-3 text-sm text-[var(--surface-500)]">
              + {cortesias.find((c) => c.id === cortesiaId)?.nome} como cortesia sua.
            </p>
          )}
        </div>
      ),
    },
  ]

  const atual = passos[passo]
  const ultimo = passo === passos.length - 1

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 pb-32">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[var(--surface-400)]">
          Passo {passo + 1} de {passos.length}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--surface-900)]">{atual.titulo}</h1>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-200)]">
          <div className="h-full rounded-full bg-[var(--brand-500)] transition-all"
            style={{ width: `${((passo + 1) / passos.length) * 100}%` }} />
        </div>
      </header>

      {atual.conteudo}

      {erro && <p role="alert" className="mt-4 text-sm text-[var(--erro)]">{erro}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--surface-200)] bg-white/95 px-5 py-4 backdrop-blur"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-md gap-3">
          {passo > 0 && (
            <button onClick={() => setPasso(passo - 1)}
              className="rounded-[var(--radius-md)] border border-[var(--surface-200)] px-5 py-3 text-sm font-medium text-[var(--surface-600)]">
              Voltar
            </button>
          )}
          <button
            onClick={() => (ultimo ? gerar() : setPasso(passo + 1))}
            disabled={!atual.podeSeguir || enviando}
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--brand-600)] px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {enviando ? 'Gerando…' : ultimo ? 'Gerar orçamento' : 'Continuar'}
          </button>
        </div>
      </div>
    </main>
  )
}
