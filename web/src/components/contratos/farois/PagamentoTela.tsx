'use client'

/**
 * 💵 Pagamento — 2º nível do popup de pendências (fase 2.11, item 25 de
 * docs/REDESENHO_CARDS_PIPELINE.md). É o Mega Pagamento do pipeline, sem cabeçalho próprio
 * (a Data desce pro corpo — regra dos popups secundários), com:
 *  - a conta de `lib/pagamento.ts`: pagamento = o que entrou, desconto vai pro CONTRATO
 *    (P-10, demanda 2026/109, B-08);
 *  - 📦 Plano fechado com o plano puro DIGITADO (P-08), atrás da chave FLS só do pipeline
 *    `btn_plano_fechado_pipeline` (P-09);
 *  - sem consultar `btn_mega_pagamento`/`pagamento_completo` (P-11: são do modal antigo);
 *  - seguradora à vista (P-25).
 *
 * "Cai em" e a taxa seguem as portas únicas de sempre: `destinoDoRecebimento` e
 * `taxaDaVenda` (lib/financeiro.ts), com as contas da unidade LOGADA (é onde o dinheiro cai).
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { hojeLocal } from '@/lib/date-local'
import { destinoDoRecebimento, taxaDaVenda, fmtBRL, type ContaEscolhivel } from '@/lib/financeiro'
import {
  calcularRecebimento, registrarRecebimento, cobrancaDeTerceiro, saldosDoContrato, proporcionalizar,
  type ContratoParaReceber, type FormRecebimento, type ResultadoRecebimento,
} from '@/lib/pagamento'

type Conta = ContaEscolhivel & { nome: string; legado: boolean | null }
type Metodo = 'pix' | 'cartao' | 'dinheiro'
const BANDEIRAS = ['master', 'visa', 'elo', 'amex', 'hiper'] as const

const PIX_PATH = 'M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6z'

type Props = {
  contrato: ContratoParaReceber & { tipo_cremacao?: string | null; seguradora?: string | null }
  unidadeLogadaId: string | null
  nomeUnidadeDoContrato?: string | null
  temFinanceiro: boolean
  podePlanoFechado: boolean
  atorNome: string
  onRegistrado: (r: ResultadoRecebimento) => void
  onCancelar: () => void
}

const inputNum = 'w-full min-w-0 flex-1 px-2 py-1 rounded-md border text-right text-[13px] font-semibold outline-none'

export default function PagamentoTela(p: Props) {
  const supabase = useMemo(() => createClient(), [])
  const saldoInicial = useMemo(() => saldosDoContrato(p.contrato), [p.contrato])

  const [f, setF] = useState<FormRecebimento>({
    valorPlano: saldoInicial.plano > 0 ? saldoInicial.plano.toFixed(2) : '',
    descontoPlano: '',
    valorAcessorio: saldoInicial.acessorios > 0 ? saldoInicial.acessorios.toFixed(2) : '',
    descontoAcessorio: '',
    planoFechado: false, pfTotal: '', pfPlanoPuro: '',
  })
  const [descPlanoOn, setDescPlanoOn] = useState(false)
  const [descAcessOn, setDescAcessOn] = useState(false)
  const [prop, setProp] = useState('')
  const [dataHoje, setDataHoje] = useState(true)
  const [data, setData] = useState('')
  const [metodo, setMetodo] = useState<Metodo>('pix')
  const [bandeira, setBandeira] = useState<string>('master')
  const [parcelas, setParcelas] = useState('')
  const [idTransacao, setIdTransacao] = useState('')
  const [contas, setContas] = useState<Conta[]>([])
  // Troca manual da conta: vale enquanto o método não mudar (senão volta a padrão do método).
  const [contaEscolhida, setContaEscolhida] = useState<{ metodo: string; id: string } | null>(null)
  const [taxaLida, setTaxaLida] = useState<{ chave: string; r: { percentual: number; cadastrada: boolean } } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroGravar, setErroGravar] = useState<string | null>(null)

  const metodoBanco = metodo === 'cartao' ? (parcelas === 'debito' ? 'debito' : 'credito') : metodo
  const nParcelas = parcelas && parcelas !== 'debito' ? parseInt(parcelas) || 1 : 1

  useEffect(() => {
    if (!p.unidadeLogadaId) return
    supabase.from('contas')
      .select('id, nome, entradas, preferencial_recebimento, produto, legado')
      .eq('ativo', true).eq('unidade_id', p.unidadeLogadaId).order('nome')
      .then(({ data }) => setContas((data || []) as unknown as Conta[]))
  }, [supabase, p.unidadeLogadaId])

  const destino = useMemo(() => destinoDoRecebimento(contas, metodoBanco, p.temFinanceiro), [contas, metodoBanco, p.temFinanceiro])
  const contaId = contaEscolhida && contaEscolhida.metodo === metodoBanco ? contaEscolhida.id : destino.contaId
  const setContaId = (id: string) => setContaEscolhida({ metodo: metodoBanco, id })

  // Taxa da maquininha (só cartão com parcela escolhida). Guardada com a "chave" do que foi
  // consultado — resposta de uma consulta velha não vale para a escolha de agora.
  const precisaTaxa = (metodoBanco === 'credito' || metodoBanco === 'debito') && !!parcelas
  const chaveTaxa = `${contaId}|${metodoBanco}|${nParcelas}|${bandeira}`
  const taxa = precisaTaxa && taxaLida?.chave === chaveTaxa ? taxaLida.r : null
  useEffect(() => {
    if (!precisaTaxa) return
    let cancelado = false
    void taxaDaVenda(supabase, contaId || null, metodoBanco, nParcelas, bandeira, p.temFinanceiro)
      .then(r => { if (!cancelado) setTaxaLida({ chave: chaveTaxa, r }) })
    return () => { cancelado = true }
  }, [supabase, precisaTaxa, chaveTaxa, contaId, metodoBanco, nParcelas, bandeira, p.temFinanceiro])

  const formEfetivo: FormRecebimento = {
    ...f,
    descontoPlano: descPlanoOn ? f.descontoPlano : '',
    descontoAcessorio: descAcessOn ? f.descontoAcessorio : '',
  }
  const calc = calcularRecebimento(formEfetivo, p.contrato, taxa?.percentual || 0)
  const outraUnidade = p.temFinanceiro && !!p.contrato.unidade_id && !!p.unidadeLogadaId && p.contrato.unidade_id !== p.unidadeLogadaId
  const faltaCartao = metodo === 'cartao' && (!bandeira || !parcelas || !idTransacao.trim())
  const faltaData = !dataHoje && !data
  const semConta = calc.linhas.length > 0 && !contaId
  const podeRegistrar = !calc.erro && !faltaCartao && !faltaData && !semConta && !salvando
  // Por que o ✅ está apagado — só depois que algo foi preenchido (tela nova não grita).
  const preencheu = f.planoFechado ? !!f.pfTotal : !!(f.valorPlano || f.valorAcessorio || f.descontoPlano || f.descontoAcessorio)
  const motivo = erroGravar || (!preencheu ? null
    : calc.erro || (faltaData ? 'Informe a data do pagamento'
      : faltaCartao ? 'Cartão: escolha bandeira, parcelas e informe o ID da transação'
      : semConta ? 'Nenhuma conta desta unidade recebe este método — cadastre em Financeiro › Contas'
      : null))

  async function registrar() {
    if (!podeRegistrar) return
    setSalvando(true)
    setErroGravar(null)
    try {
      const dataPagamento = dataHoje ? hojeLocal() : data
      const { data: { user } } = await supabase.auth.getUser()
      // A taxa é relida NA HORA de gravar (como o Mega antigo): a da tela pode ainda não ter
      // chegado, e gravar com 0% deixaria o líquido errado.
      const t = await taxaDaVenda(supabase, contaId || null, metodoBanco, nParcelas, metodo === 'cartao' ? bandeira : null, p.temFinanceiro)
      const calcFinal = calcularRecebimento(formEfetivo, p.contrato, t.percentual)
      const r = await registrarRecebimento(supabase, p.contrato.id, calcFinal, {
        metodo: metodoBanco, contaId: contaId || null, parcelas: nParcelas,
        bandeira: metodo === 'cartao' ? bandeira : null,
        idTransacao: idTransacao.trim() || null,
        dataPagamento, criadoPor: user?.id || null,
      })
      const cobranca = cobrancaDeTerceiro({
        contrato: p.contrato, unidadeLogadaId: p.unidadeLogadaId, temFinanceiro: p.temFinanceiro,
        total: calcFinal.total, dataPagamento, pagamentoId: r.pagamentos[0]?.id || null,
        contaId: contaId || null, criadoPorNome: p.atorNome || null,
      })
      if (cobranca) {
        // `fin_cobrancas` (mig 135) ainda não está em types/database.ts
        const { error } = await supabase.from('fin_cobrancas' as never).insert(cobranca as never)
        if (error) console.error('[PagamentoTela] acerto entre unidades não gravou:', error.message)
      }
      p.onRegistrado(r)
    } catch (e) {
      setErroGravar(e instanceof Error ? e.message : String(e))
      setSalvando(false)
    }
  }

  function mudarProp(v: string) {
    setProp(v)
    const r = proporcionalizar(parseFloat(v) || 0, parseFloat(f.valorPlano) || 0, parseFloat(f.valorAcessorio) || 0)
    if (r) setF(x => ({ ...x, descontoPlano: r.plano.toFixed(2), descontoAcessorio: r.acessorio.toFixed(2) }))
  }

  const cardValor = (cor: 'blue' | 'purple', emoji: string, rotulo: string, k: 'valorPlano' | 'valorAcessorio', dk: 'descontoPlano' | 'descontoAcessorio', on: boolean, setOn: (b: boolean) => void) => {
    const c = cor === 'blue' ? { bg: 'rgba(59,130,246,.15)', borda: '#1d4ed8', txt: '#3b82f6' } : { bg: 'rgba(168,85,247,.15)', borda: '#7e22ce', txt: '#a855f7' }
    return (
      <div className="rounded-[10px] p-2 min-w-0 overflow-hidden" style={{ background: c.bg }}>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-xs">{emoji}</span>
          <span className="flex-none text-xs font-semibold" style={{ color: c.txt }}>{rotulo}</span>
          <input type="number" step="0.01" inputMode="decimal" value={f[k]} placeholder="0.00"
            onChange={e => setF(x => ({ ...x, [k]: e.target.value }))}
            className={`${inputNum} ml-1`} style={{ borderColor: c.borda, background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
        </div>
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 cursor-pointer flex-none">
            <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); if (!e.target.checked) setF(x => ({ ...x, [dk]: '' })) }} className="w-3 h-3" />
            <span className="text-[10px]" style={{ color: c.txt }}>Desc</span>
          </label>
          {on && (
            <input type="number" step="0.01" inputMode="decimal" value={f[dk]} placeholder="-0.00"
              onChange={e => setF(x => ({ ...x, [dk]: e.target.value }))}
              className={inputNum} style={{ borderColor: c.borda, background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
          )}
        </div>
      </div>
    )
  }

  const pendAcess = saldoInicial.acessorios
  const pfTotal = parseFloat(f.pfTotal) || 0
  const pfPuro = parseFloat(f.pfPlanoPuro) || 0

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 pb-3">
        {/* Data (desceu do cabeçalho — regra dos popups secundários) */}
        <div className="flex items-center gap-2">
          <span className="flex-none text-xs font-medium" style={{ color: 'var(--surface-400)' }}>Data</span>
          <span className="flex-1" />
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ background: 'var(--surface-100)', borderColor: 'var(--surface-200)' }}>
            <button type="button" onClick={() => { setDataHoje(true); setData('') }}
              className="px-2.5 py-1 rounded-md text-xs font-semibold"
              style={dataHoje ? { background: '#16a34a', color: '#fff' } : { color: 'var(--surface-500)' }}>Hoje</button>
            {dataHoje ? (
              <button type="button" onClick={() => { setDataHoje(false); setData(hojeLocal()) }}
                className="px-2.5 py-1 rounded-md text-xs" style={{ color: 'var(--surface-500)' }}>Outra</button>
            ) : (
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="px-1.5 py-0.5 rounded-md text-xs outline-none" style={{ background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
            )}
          </div>
        </div>

        {p.contrato.seguradora && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(79,70,229,.10)', color: '#4f46e5' }}>
            <Shield className="h-4 w-4 flex-none" />
            <span>Seguradora: <b>{p.contrato.seguradora}</b></span>
          </div>
        )}

        {outraUnidade && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-amber-500/10 text-amber-600">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Contrato de {p.nomeUnidadeDoContrato || 'outra unidade'}. O dinheiro entra na conta desta unidade e um
              acerto é enviado para que a receita fique com a unidade dona do contrato.
            </span>
          </div>
        )}

        {p.podePlanoFechado && (
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer"
            style={f.planoFechado
              ? { background: 'rgba(245,158,11,.12)', borderColor: 'rgba(245,158,11,.5)' }
              : { background: 'var(--surface-100)', borderColor: 'var(--surface-200)' }}>
            <input type="checkbox" checked={f.planoFechado} onChange={e => setF(x => ({ ...x, planoFechado: e.target.checked }))} className="accent-amber-500" />
            <span className="text-xs font-semibold" style={{ color: '#d97706' }}>📦 Plano fechado (produtos embutidos no valor do contrato)</span>
          </label>
        )}

        {f.planoFechado ? (
          <div className="flex flex-col gap-2 p-2.5 rounded-[10px] border" style={{ borderColor: 'rgba(245,158,11,.4)', background: 'rgba(245,158,11,.09)' }}>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#d97706' }}>Total recebido</label>
              <input type="number" step="0.01" inputMode="decimal" value={f.pfTotal} placeholder="0.00"
                onChange={e => setF(x => ({ ...x, pfTotal: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-md border outline-none" style={{ borderColor: 'rgba(245,158,11,.5)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#d97706' }}>
                Desse total, quanto é de plano puro?
                <span className="ml-1 px-1.5 py-px rounded text-[10px] font-semibold whitespace-nowrap" style={{ background: 'rgba(245,158,11,.22)' }}>
                  {p.contrato.tipo_cremacao === 'coletiva' ? 'COL' : 'IND'}
                </span>
              </label>
              <input type="number" step="0.01" inputMode="decimal" value={f.pfPlanoPuro} placeholder="0.00"
                onChange={e => setF(x => ({ ...x, pfPlanoPuro: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-md border outline-none" style={{ borderColor: 'rgba(245,158,11,.5)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
            </div>
            {pfTotal > 0 && (
              <div className="flex flex-col gap-0.5 p-2 rounded-lg text-xs" style={{ background: 'var(--surface-50)' }}>
                {([
                  ['Plano (a registrar):', pfPuro],
                  ['Acessórios (sobra):', pfTotal - pfPuro],
                  ['Saldo acess. pendente:', pendAcess],
                ] as const).map(([a, v]) => (
                  <div key={a} className="flex justify-between"><span style={{ color: 'var(--surface-400)' }}>{a}</span><span className="font-mono" style={{ color: 'var(--surface-700)' }}>R$ {v.toFixed(2)}</span></div>
                ))}
                <div className="flex justify-between border-t pt-1 mt-1" style={{ borderColor: 'var(--surface-200)' }}>
                  <span className="font-semibold" style={{ color: '#d97706' }}>Desconto auto-aplicado:</span>
                  <span className="font-mono font-bold" style={{ color: '#d97706' }}>R$ {calc.descontoAcessorios.toFixed(2)}</span>
                </div>
                {calc.aviso && <div className="text-red-500 text-[10.5px] mt-1">⚠ {calc.aviso}</div>}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {cardValor('blue', '📋', 'Plano', 'valorPlano', 'descontoPlano', descPlanoOn, setDescPlanoOn)}
              {cardValor('purple', '🎀', 'Acess', 'valorAcessorio', 'descontoAcessorio', descAcessOn, setDescAcessOn)}
            </div>
            {descPlanoOn && descAcessOn && (
              <div className="flex items-center justify-center gap-2 px-2 py-1 rounded-md text-[10px]" style={{ background: 'var(--surface-100)', color: 'var(--surface-400)' }}>
                <span>Proporcionalizar:</span>
                <input type="number" step="0.01" inputMode="decimal" value={prop} placeholder="0.00" onChange={e => mudarProp(e.target.value)}
                  className="w-20 px-2 py-0.5 rounded border text-center outline-none" style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
              </div>
            )}
          </>
        )}

        {/* Método */}
        {metodo !== 'cartao' ? (
          <div className="flex items-center gap-2">
            <span className="flex-none text-xs font-medium" style={{ color: 'var(--surface-400)' }}>Método</span>
            <div className="flex-1 flex gap-1">
              {(['pix', 'cartao', 'dinheiro'] as const).map(k => (
                <button key={k} type="button"
                  onClick={() => { setMetodo(k); setParcelas(''); setIdTransacao(''); if (k === 'cartao') setBandeira('master') }}
                  className="flex-1 py-1.5 px-1.5 rounded-md text-xs font-medium"
                  style={metodo === k ? { background: '#16a34a', color: '#fff' } : { background: 'var(--surface-100)', color: 'var(--surface-400)' }}>
                  <span className="inline-flex items-center gap-0.5">
                    {k === 'pix'
                      ? <><svg viewBox="0 0 512 512" fill="currentColor" style={{ width: 14, height: 14, color: metodo === k ? '#fff' : '#32BCAD' }}><path d={PIX_PATH} /></svg>Pix</>
                      : k === 'cartao' ? '💳Cartão' : '💵Din'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center justify-center gap-2">
                {BANDEIRAS.map(b => (
                  <button key={b} type="button" onClick={() => { setBandeira(b); setParcelas('') }}
                    className="p-1 rounded-md transition-all"
                    style={bandeira === b ? { boxShadow: '0 0 0 2px #f97316', background: 'rgba(249,115,22,.12)', transform: 'scale(1.1)' } : { opacity: 0.5 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/bandeiras/${b === 'master' ? 'mastercard' : b}.png`} alt={b} style={{ height: 28, width: 'auto' }} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setMetodo('pix'); setParcelas(''); setIdTransacao('') }} className="text-[10px]" style={{ color: 'var(--surface-400)' }}>← voltar</button>
            </div>
            <div className="rounded-[10px] p-2" style={{ background: 'rgba(249,115,22,.12)' }}>
              <div className="flex flex-wrap justify-center gap-1">
                {[...(bandeira === 'amex' || bandeira === 'hiper' ? [] : ['debito']), ...Array.from({ length: 12 }, (_, i) => `${i + 1}x`)].map(pc => (
                  <button key={pc} type="button" onClick={() => setParcelas(pc)}
                    className="w-[34px] h-[34px] rounded-lg font-bold text-[13px] border"
                    style={parcelas === pc ? { background: '#f97316', color: '#fff', borderColor: '#f97316' } : { background: 'var(--surface-0)', color: '#fb923c', borderColor: '#c2410c' }}>
                    {pc === 'debito' ? 'D' : pc.replace('x', '')}
                  </button>
                ))}
              </div>
              {parcelas && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="flex-none text-xs" style={{ color: '#fb923c' }}>ID Trans.*</span>
                  <input type="text" value={idTransacao} onChange={e => setIdTransacao(e.target.value)} placeholder="Nº maquininha"
                    className="flex-1 min-w-0 px-2 py-1 rounded-md border outline-none" style={{ borderColor: '#c2410c', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }} />
                </div>
              )}
            </div>
          </>
        )}

        {taxa && (taxa.cadastrada ? (
          taxa.percentual > 0 && (
            <p className="text-xs" style={{ color: 'var(--surface-400)' }}>
              Taxa da maquininha: <b style={{ color: 'var(--surface-600)' }}>{String(taxa.percentual).replace('.', ',')}%</b>
              {' · '}entra <b style={{ color: 'var(--surface-600)' }}>{fmtBRL(calc.totalLiquido)}</b>
            </p>
          )
        ) : (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-amber-500/10 text-amber-600">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Esta maquininha ainda não tem tabela de taxas cadastrada — o valor será registrado cheio, sem desconto. Cadastre em Financeiro › Contas para o líquido ficar correto.</span>
          </div>
        ))}

        {/* Em que conta o dinheiro cai */}
        <div className="flex items-center gap-2">
          <span className="flex-none text-xs font-medium" style={{ color: 'var(--surface-400)' }}>Cai em</span>
          {destino.editavel ? (
            <select value={contaId} onChange={e => setContaId(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 rounded-md border outline-none" style={{ borderColor: 'var(--surface-300)', background: 'var(--surface-0)', color: 'var(--surface-700)', fontSize: 16 }}>
              {destino.opcoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          ) : (
            <span className="flex-1 min-w-0 flex items-center gap-1.5 truncate text-[13px]" style={{ color: 'var(--surface-600)' }}>
              {contas.find(c => c.id === contaId)?.nome || <span className="text-amber-600">nenhuma conta configurada</span>}
              {destino.legada && contaId && (
                <span className="flex-none px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--surface-100)', color: 'var(--surface-500)' }}
                  title="Esta unidade não tem o módulo financeiro, então o recebimento fica na conta de histórico dela.">histórico</span>
              )}
            </span>
          )}
        </div>

        {(calc.descontoPlano > 0 || (!f.planoFechado && calc.descontoAcessorios > 0)) && !calc.erro && (
          <p className="text-[11.5px]" style={{ color: 'var(--surface-500)' }}>
            O desconto ({fmtBRL(calc.descontoPlano + (f.planoFechado ? 0 : calc.descontoAcessorios))}) fica no contrato; o pagamento registra só o que entrou.
          </p>
        )}

        <div className="flex justify-between items-center rounded-[10px] px-2.5 py-2" style={{ background: '#059669' }}>
          <span className="text-xs" style={{ color: '#d1fae5' }}>Total:</span>
          <b className="text-lg text-white">{fmtBRL(calc.total)}</b>
        </div>

        {motivo && <p className="text-xs text-red-500">⚠ {motivo}</p>}
      </div>

      <div className="sticky bottom-0 flex gap-2 pt-2 pb-1" style={{ background: 'var(--surface-0)' }}>
        <button type="button" onClick={p.onCancelar} disabled={salvando}
          className="flex-1 py-2 rounded-[9px] border text-[13px]" style={{ borderColor: 'var(--surface-300)', color: 'var(--surface-500)', background: 'var(--surface-0)' }}>Cancelar</button>
        <button type="button" onClick={registrar} disabled={!podeRegistrar}
          className="flex-1 py-2 rounded-[9px] text-[13px] font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center gap-1.5" style={{ background: '#16a34a' }}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : '✅ Registrar'}
        </button>
      </div>
    </div>
  )
}
