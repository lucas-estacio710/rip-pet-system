'use client'

// Modal editor do Protocolo de Entrega — compartilhado entre o pipeline (/contratos,
// botão DOC) e o detalhe do contrato (/contratos/[id]). A versão do pipeline é a
// fonte da verdade do comportamento; cada tela cuida do fetch/save e passa callbacks.

import { X, Plus, Printer } from 'lucide-react'
import ProtocoloEntrega from './ProtocoloEntrega'
import { printProtocolos } from './ProtocoloPrint'
import { formatarValor, type ProtocoloData } from './protocolo-utils'

type Props = {
  data: ProtocoloData
  onChange: (d: ProtocoloData) => void
  onSave: () => void
  salvando: boolean
  /** Descarta edições e remonta o protocolo do zero (cada tela busca seus dados) */
  onRegenerate: () => void
  regenerando?: boolean
  onClose: () => void
}

export default function ProtocoloEditorModal({ data: pe, onChange, onSave, salvando, onRegenerate, regenerando, onClose }: Props) {
  // Sem recálculo — pe já contém os valores editáveis
  const dadosImpressao = pe

  const editProd = (idx: number, campo: Partial<ProtocoloData['produtos'][0]>) => {
    const novosProdutos = [...pe.produtos]
    novosProdutos[idx] = { ...novosProdutos[idx], ...campo }
    onChange({ ...pe, produtos: novosProdutos })
  }

  const removeProd = (idx: number) => {
    onChange({ ...pe, produtos: pe.produtos.filter((_, i) => i !== idx) })
  }

  const addProd = () => {
    onChange({
      ...pe,
      produtos: [...pe.produtos, {
        nome: 'Item avulso',
        nomeRetorno: '',
        valor: 0,
        pago: '',
        tipo: 'acessorio',
      }]
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-auto border border-gray-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="text-base font-semibold text-gray-900">📄 Protocolo — {pe.petNome}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={salvando}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
            >
              {salvando ? '⏳ Salvando...' : '✅ Salvar'}
            </button>
            <button
              onClick={onRegenerate}
              disabled={regenerando}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm disabled:opacity-50"
              title="Descartar edições e regenerar do zero"
            >
              {regenerando ? '⏳' : '🔄'} Regenerar
            </button>
            <button
              onClick={() => printProtocolos([dadosImpressao])}
              className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="p-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Produtos</div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-xs text-gray-500 uppercase">
                  <th className="p-1.5 text-center w-14 border border-gray-200">Sit.</th>
                  <th className="p-1.5 text-left border border-gray-200">Nome (no protocolo)</th>
                  <th className="p-1.5 text-right w-32 border border-gray-200">Valor</th>
                  <th className="p-1.5 w-8 border border-gray-200"></th>
                </tr>
              </thead>
              <tbody>
                {pe.produtos.map((prod, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-1 text-center border border-gray-200">
                      <button
                        onClick={() => {
                          const next = prod.pago === 'pend' ? 'ok' : prod.pago === 'ok' ? '' : 'pend'
                          editProd(idx, { pago: next })
                        }}
                        className={`px-1.5 py-0.5 rounded text-xs font-bold min-w-[38px] ${
                          prod.pago === 'ok'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : prod.pago === 'pend'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {prod.pago === 'ok' ? 'Ok' : prod.pago === 'pend' ? 'Pend' : '—'}
                      </button>
                    </td>
                    <td className="p-1 border border-gray-200">
                      <input
                        type="text"
                        value={prod.nomeRetorno}
                        onChange={e => editProd(idx, { nomeRetorno: e.target.value })}
                        className="w-full bg-transparent border-0 p-0.5 text-sm text-gray-900 focus:outline-none focus:bg-blue-50 rounded"
                      />
                    </td>
                    <td className="p-1 border border-gray-200">
                      {(() => {
                        const modo = prod.valorDisplay === 'Incluso' ? 'incluso'
                          : prod.valorDisplay === 'Cortesia' ? 'cortesia'
                          : 'valor'
                        const cycleModo = () => {
                          const next = modo === 'valor' ? 'incluso' : modo === 'incluso' ? 'cortesia' : 'valor'
                          if (next === 'incluso') editProd(idx, { valor: 0, valorDisplay: 'Incluso' })
                          else if (next === 'cortesia') editProd(idx, { valor: 0, valorDisplay: 'Cortesia' })
                          else editProd(idx, { valor: 0, valorDisplay: undefined })
                        }
                        const btnStyle = modo === 'incluso'
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : modo === 'cortesia'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        const btnLabel = modo === 'incluso' ? 'INC' : modo === 'cortesia' ? 'CRT' : 'R$'
                        return (
                          <div className="flex items-center gap-1">
                            {modo === 'valor' ? (
                              <input
                                type="text"
                                value={prod.valorDisplay !== undefined ? prod.valorDisplay : (prod.valor || '')}
                                onChange={e => {
                                  const raw = e.target.value
                                  const num = parseFloat(raw.replace(',', '.'))
                                  if (!isNaN(num) && /^[\d.,]+$/.test(raw.trim())) {
                                    editProd(idx, { valor: num, valorDisplay: undefined })
                                  } else {
                                    editProd(idx, { valor: 0, valorDisplay: raw })
                                  }
                                }}
                                className="flex-1 min-w-0 bg-transparent border-0 p-0.5 text-sm text-gray-900 text-right focus:outline-none focus:bg-blue-50 rounded"
                                placeholder="0"
                              />
                            ) : (
                              <span className={`flex-1 text-right text-sm font-semibold ${modo === 'incluso' ? 'text-blue-600' : 'text-emerald-600'}`}>
                                {prod.valorDisplay}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={cycleModo}
                              title="Alternar: R$ / Incluso / Cortesia"
                              className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${btnStyle}`}
                            >
                              {btnLabel}
                            </button>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="p-1 border border-gray-200 text-center">
                      <button
                        onClick={() => removeProd(idx)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Remover"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Soma real-time dos itens + botão adicionar */}
            <div className="flex items-center justify-between mt-1.5">
              <button
                onClick={addProd}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar item
              </button>
              <div className="text-xs font-mono text-gray-500 pr-10">
                Soma itens: <span className="font-bold text-gray-800">{formatarValor(pe.produtos.reduce((acc, p) => acc + (p.valor || 0), 0))}</span>
              </div>
            </div>
          </div>

          {/* Resumo financeiro (editável) */}
          {(() => {
            const somaItens = Math.round(pe.produtos.reduce((acc, p) => acc + (p.valor || 0), 0) * 100) / 100
            const batendo = Math.abs((pe.totalPago + pe.saldo) - somaItens) < 0.01
            return (
              <div className={`flex items-center justify-between text-sm rounded-lg p-2 gap-2 border ${batendo ? 'bg-gray-100 border-transparent' : 'bg-red-50 border-red-300'}`}>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs">Total Contratado</span>
                  <input
                    type="number"
                    step="0.01"
                    value={pe.totalAPagar}
                    onChange={e => onChange({ ...pe, totalAPagar: parseFloat(e.target.value) || 0 })}
                    className="w-24 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-sm font-bold text-gray-900 text-right focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-[9px] text-gray-400 mt-0.5" title="Valor do plano + acessórios, descontados os abatimentos do contrato">Plano + Acess.</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs">Registro de Pagamento</span>
                  <input
                    type="number"
                    step="0.01"
                    value={pe.totalPago}
                    onChange={e => onChange({ ...pe, totalPago: parseFloat(e.target.value) || 0 })}
                    className="w-24 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-sm font-bold text-green-600 text-right focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-[9px] text-gray-400 mt-0.5" title="Soma dos pagamentos já lançados no contrato">Σ pagamentos</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs">Saldo no Contrato</span>
                  <input
                    type="number"
                    step="0.01"
                    value={pe.saldo}
                    onChange={e => onChange({ ...pe, saldo: parseFloat(e.target.value) || 0 })}
                    className={`w-24 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-sm font-bold text-right focus:outline-none focus:border-blue-400 ${pe.saldo > 0 ? 'text-red-500' : 'text-green-600'}`}
                  />
                  <span className="text-[9px] text-gray-400 mt-0.5" title="O que falta receber (Total − Pago)">Total − Pago</span>
                </div>
                {(() => {
                  const saldoProtocolo = Math.max(0, somaItens - pe.totalPago)
                  return (
                    <div className="flex flex-col">
                      <span className="text-gray-500 text-xs">Saldo Protocolo</span>
                      <div className={`w-24 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 text-sm font-bold text-right ${saldoProtocolo > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {saldoProtocolo.toFixed(2)}
                      </div>
                      <span className="text-[9px] text-gray-400 mt-0.5" title="Saldo recalculado com os valores do protocolo (Soma itens − Pago) — é esse valor que sai impresso no protocolo">Σ itens − Pago</span>
                    </div>
                  )
                })()}
                <div className="flex flex-col items-center justify-center" title={batendo ? 'Pago + Saldo = Soma Itens ✓' : `Soma itens: ${somaItens.toFixed(2)} | P+S: ${(pe.totalPago + pe.saldo).toFixed(2)}`}>
                  <span className="text-[10px] text-gray-400">P+S=Σ</span>
                  <span className={`text-sm ${batendo ? 'text-green-500' : 'text-red-500 animate-pulse'}`}>{batendo ? '✓' : '✗'}</span>
                </div>
              </div>
            )
          })()}

          {/* Toggle + Opções de pagamento (editáveis) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pe.mostrarPagamento !== false}
                onChange={e => onChange({ ...pe, mostrarPagamento: e.target.checked })}
                className="rounded"
              />
              Mostrar opções de pagamento no protocolo
            </label>
            {pe.mostrarPagamento !== false && (
              <div className="flex gap-2 text-xs">
                <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                  <div className="text-gray-500 uppercase text-[10px]">Pix/Dinheiro</div>
                  <input
                    type="number"
                    step="0.01"
                    value={pe.opcoesPagamento.pix || ''}
                    placeholder="R$ 0,00"
                    onChange={e => onChange({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, pix: parseFloat(e.target.value) || 0 } })}
                    className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-sm font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                  <div className="text-gray-500 uppercase text-[10px]">1-6x cartão</div>
                  <input
                    type="number"
                    step="0.01"
                    value={pe.opcoesPagamento.parcelado6 || ''}
                    placeholder="R$ 0,00"
                    onChange={e => onChange({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, parcelado6: parseFloat(e.target.value) || 0 } })}
                    className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-sm font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex-1 bg-gray-100 rounded p-2 text-center">
                  <div className="text-gray-500 uppercase text-[10px]">7-12x cartão</div>
                  <input
                    type="number"
                    step="0.01"
                    value={pe.opcoesPagamento.parcelado12 || ''}
                    placeholder="R$ 0,00"
                    onChange={e => onChange({ ...pe, opcoesPagamento: { ...pe.opcoesPagamento, parcelado12: parseFloat(e.target.value) || 0 } })}
                    className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-sm font-bold text-gray-900 text-center focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="border-t border-gray-200 pt-3">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Preview</div>
            <ProtocoloEntrega data={dadosImpressao} />
          </div>
        </div>
      </div>
    </div>
  )
}
