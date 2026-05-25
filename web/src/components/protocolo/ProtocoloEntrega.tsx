import React from 'react'
import { ProtocoloData, formatarValor } from './protocolo-utils'

// Formata telefone BR; aceita DDI 55 (12 ou 13 dígitos) e remove ele do exibido
function formatTel(t: string | null | undefined): string {
  if (!t) return ''
  let d = t.replace(/\D/g, '')
  // Remove DDI 55 se presente (12 ou 13 dígitos com 55 inicial)
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2) // 55 + DDD + 9 dígitos
  else if (d.length === 12 && d.startsWith('55')) d = d.slice(2) // 55 + DDD + 8 dígitos
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

// Componente que renderiza 1 protocolo de entrega
// Usa inline styles para funcionar dentro de iframe de impressão (sem Tailwind)

const styles = {
  container: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '12px',
    lineHeight: '1.2',
    color: '#1a1a1a',
    border: '2px solid #333',
    borderRadius: '4px',
    overflow: 'hidden',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    background: '#e0f2fe',
    color: '#1e3a5f',
    padding: '8px 10px',          // faixa mais grossa
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 'bold' as const,
    fontSize: '13px',             // título um pouco maior pra equilibrar com a logo
    letterSpacing: '1px',
  },
  headerLogo: {
    height: '28px',               // era 18px — logo maior
    width: 'auto',
    flexShrink: 0,
  },
  section: {
    padding: '6px 8px',         // era 3px 8px — preenche o espaço em branco vertical
    borderBottom: '1px solid #ccc',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    marginBottom: '5px',        // era 2px — espalha as linhas sem aumentar fonte
  },
  label: {
    fontWeight: 'bold' as const,
    color: '#444',
    marginRight: '4px',
  },
  value: {
    color: '#111',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '11px',
    tableLayout: 'fixed' as const,
  },
  th: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    padding: '4px 4px',
    fontWeight: 'bold' as const,
    textAlign: 'left' as const,
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    color: '#555',
  },
  thRight: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    padding: '4px 4px',
    fontWeight: 'bold' as const,
    textAlign: 'right' as const,
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    color: '#555',
  },
  thCenter: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    padding: '4px 4px',
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    color: '#555',
  },
  td: {
    border: '1px solid #ddd',
    padding: '4px 4px',
    verticalAlign: 'middle' as const,
    lineHeight: 1,                  // texto não infla a inline-box, centraliza certinho com vertical-align middle
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  tdRight: {
    border: '1px solid #ddd',
    padding: '4px 4px',
    textAlign: 'right' as const,
    verticalAlign: 'middle' as const,
    lineHeight: 1,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  tdCenter: {
    border: '1px solid #ddd',
    padding: '4px 4px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    lineHeight: 1,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  ok: {
    color: '#16a34a',
    fontWeight: 'bold' as const,
  },
  pendente: {
    color: '#dc2626',
    fontWeight: 'bold' as const,
  },
  totais: {
    padding: '3px 8px',
    borderBottom: '1px solid #ccc',
    display: 'flex',
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    fontWeight: 'bold' as const,
    fontSize: '12px',
  },
  pagamento: {
    padding: '3px 8px',
    borderBottom: '1px solid #ccc',
    fontSize: '10px',
  },
  pagamentoGrid: {
    display: 'flex',
    justifyContent: 'space-between' as const,
    gap: '4px',
  },
  pagamentoItem: {
    flex: 1,
    textAlign: 'center' as const,
    padding: '4px 4px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    background: '#f9fafb',
  },
  pagamentoLabel: {
    fontSize: '8px',
    color: '#666',
    textTransform: 'uppercase' as const,
    display: 'block',
  },
  pagamentoValor: {
    fontWeight: 'bold' as const,
    fontSize: '11px',
    color: '#111',
  },
  entregue: {
    padding: '3px 8px',
    borderBottom: '1px solid #ccc',
  },
  checkRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '2px',
    justifyContent: 'center',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: '3px',
    fontSize: '10px',
  },
  checkbox: {
    width: '11px',
    height: '11px',
    border: '1.5px solid #555',
    borderRadius: '2px',
    display: 'inline-block',
    flexShrink: 0,
  },
  assinatura: {
    padding: '4px 8px 6px',
  },
  textoConfirmacao: {
    fontSize: '8px',
    color: '#666',
    fontStyle: 'italic' as const,
    marginBottom: '6px',
    lineHeight: '1.2',
  },
  linhaAssinatura: {
    borderTop: '1px solid #333',
    marginTop: '20px',
    paddingTop: '2px',
    textAlign: 'center' as const,
    fontSize: '9px',
    color: '#555',
  },
  dataAssinatura: {
    textAlign: 'right' as const,
    fontSize: '9px',
    color: '#555',
    marginTop: '4px',
  },
  emptyRow: {
    height: '20px',                   // era 11px — linhas vazias maiores pra preencher melhor o slot
    border: '1px solid #ddd',
    background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, #d4d4d4 3px, #d4d4d4 4px)',
  },
}

export default function ProtocoloEntrega({ data, blank, print }: { data?: ProtocoloData; blank?: boolean; print?: boolean }) {
  if (blank) return <ProtocoloEmBranco print={print} />

  if (!data) return null

  // Em print: a td tem altura fixa (height + line-height controlado) + padding 0; o conteúdo é
  // envolto em <CellWrap> com flex (centraliza de verdade — html2canvas honra display:flex+
  // align-items em div interno; ignora vertical-align em td).
  // Truque: `height: 1px` na td força o filho `height: 100%` a ocupar a célula inteira.
  const tdC: React.CSSProperties = print
    ? { ...styles.tdCenter, padding: 0, lineHeight: 1, whiteSpace: 'normal' as const, height: '22px' }
    : styles.tdCenter
  const tdR: React.CSSProperties = print
    ? { ...styles.tdRight, padding: 0, lineHeight: 1, whiteSpace: 'normal' as const, height: '22px' }
    : styles.tdRight

  // Wrapper interno: flex centralizado vertical/horizontal, ocupando 100% da td.
  // Em modo modal (não print), pass-through.
  const CellWrap = ({ children, align = 'center' }: { children: React.ReactNode; align?: 'center' | 'right' }) => {
    if (!print) return <>{children}</>
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'center',
        height: '100%',
        minHeight: '22px',
        lineHeight: 1.2,
        padding: '0 4px',
        boxSizing: 'border-box',
      }}>{children}</div>
    )
  }
  const thC: React.CSSProperties = print
    ? { ...styles.thCenter, padding: '4px 4px 16px 4px', lineHeight: 1, verticalAlign: 'top' as const }
    : styles.thCenter
  const thR: React.CSSProperties = print
    ? { ...styles.thRight, padding: '4px 4px 16px 4px', lineHeight: 1, verticalAlign: 'top' as const }
    : styles.thRight
  const checkItemStyle: React.CSSProperties = print
    ? { ...styles.checkItem, lineHeight: 1 }
    : styles.checkItem
  // Checkbox sobe 2px pra alinhar com o centro visual do label (compensa border + altura)
  const checkboxStyle: React.CSSProperties = print
    ? { ...styles.checkbox, position: 'relative', top: '6px' }
    : styles.checkbox

  const enderecoCompleto = [
    data.tutorEndereco,
    data.tutorBairro,
  ].filter(Boolean).join(' - ')

  const cidadeEstado = [
    data.tutorCidade,
    data.tutorEstado,
  ].filter(Boolean).join('/')

  // Saldo Protocolo = soma dos itens do protocolo - pagamentos registrados.
  // É esse o saldo que aparece impresso (não o data.saldo do contrato, que é snapshot).
  const somaItensProtocolo = data.produtos.reduce((acc, p) => acc + (p.valor || 0), 0)
  const saldoProtocolo = Math.max(0, somaItensProtocolo - data.totalPago)
  const temSaldo = saldoProtocolo > 0

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <img src="/rippet_logo_horizontal.png" style={styles.headerLogo} alt="R.I.P. Pet" />
        <span style={print ? { position: 'relative', top: '-4px', left: '5px' } : undefined}>PROTOCOLO DE ENTREGA</span>
      </div>

      {/* Info do contrato */}
      <div style={styles.section}>
        {/* Tutor — ESTRUTURA IDÊNTICA às outras rows (Pet, Endereço): 2 <div> filhos do styles.row,
            que tem justify-content:space-between. Tutor vai à esquerda, telefone à direita. */}
        <div style={styles.row}>
          <div>
            <span style={styles.label}>Tutor:</span>
            <span style={styles.value}>{data.tutorNome}</span>
          </div>
          {data.tutorTelefone && (
            <div>
              <span style={styles.value}>{formatTel(data.tutorTelefone)}</span>
            </div>
          )}
        </div>
        <div style={styles.row}>
          <div>
            <span style={styles.label}>Pet:</span>
            <span style={styles.value}>
              {data.petNome}
              {(() => {
                const detalhes = [
                  data.numeroLacre ? `Lacre: ${String(data.numeroLacre).replace(/\.0$/, '')}` : '',
                  data.petRaca || '',
                  data.petCor || '',
                  data.petPeso ? `${data.petPeso}kg` : '',
                ].filter(Boolean)
                return detalhes.length > 0 ? ` (${detalhes.join(' - ')})` : ''
              })()}
            </span>
          </div>
        </div>
        {enderecoCompleto && (
          <div style={styles.row}>
            <div>
              <span style={styles.label}>Endereço:</span>
              <span style={styles.value}>{enderecoCompleto}</span>
            </div>
          </div>
        )}
        {(cidadeEstado || data.tutorCep) && (
          <div style={styles.row}>
            {cidadeEstado && (
              <div>
                <span style={styles.label}>Cidade:</span>
                <span style={styles.value}>{cidadeEstado}</span>
              </div>
            )}
            {data.tutorCep && (
              <div>
                <span style={styles.label}>CEP:</span>
                <span style={styles.value}>{data.tutorCep}</span>
              </div>
            )}
          </div>
        )}
        {/* Acolhimento + Tipo — Tipo sempre tem; row sempre aparece */}
        <div style={styles.row}>
          {data.dataAcolhimento && (
            <div>
              <span style={styles.label}>Acolhimento:</span>
              <span style={styles.value}>
                {new Date(data.dataAcolhimento).toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}
          <div>
            <span style={styles.label}>Tipo:</span>
            <span style={styles.value}>
              {data.tipoCremacao === 'individual' ? 'Individual' : 'Coletiva'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div style={{ padding: '0', flex: 1, display: 'flex', flexDirection: 'column' as const }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...thC, width: '32px' }}>Sit.</th>
              <th style={thC}>Produto</th>
              <th style={{ ...thR, width: '76px' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {/* Linha de cremação (sempre primeira) */}
            <tr>
              <td style={tdC}>
                <CellWrap>
                  {(() => {
                    const crem = data.produtos.find(p => p.tipo === 'cremacao')
                    const status = crem?.pago || ''
                    if (!status) return null
                    return (
                      <span style={status === 'ok' ? styles.ok : styles.pendente}>{status === 'ok' ? 'Ok' : 'Pend'}</span>
                    )
                  })()}
                </CellWrap>
              </td>
              <td style={tdC}>
                <CellWrap>
                  {(() => {
                    const crem = data.produtos.find(p => p.tipo === 'cremacao')
                    const fallback = `Crem. ${data.tipoCremacao === 'individual' ? 'Individual' : 'Coletiva'}`
                    return crem?.nomeRetorno?.trim() || fallback
                  })()}
                </CellWrap>
              </td>
              <td style={tdR}>
                <CellWrap align="right">
                  {(() => {
                    const crem = data.produtos.find(p => p.tipo === 'cremacao')
                    if (crem?.valorDisplay) return crem.valorDisplay
                    return formatarValor(crem?.valor || 0)
                  })()}
                </CellWrap>
              </td>
            </tr>

            {/* Produtos (excluindo cremação) */}
            {data.produtos
              .filter(p => p.tipo !== 'cremacao')
              .map((prod, idx) => (
                <tr key={idx}>
                  <td style={tdC}>
                    <CellWrap>
                      {prod.pago ? (
                        <span style={prod.pago === 'ok' ? styles.ok : styles.pendente}>
                          {prod.pago === 'ok' ? 'Ok' : 'Pend'}
                        </span>
                      ) : null}
                    </CellWrap>
                  </td>
                  <td style={tdC}><CellWrap>{prod.nomeRetorno}</CellWrap></td>
                  <td style={tdR}>
                    <CellWrap align="right">
                      {prod.valorDisplay ? prod.valorDisplay : prod.valor === 0 ? 'Inclusa' : formatarValor(prod.valor)}
                    </CellWrap>
                  </td>
                </tr>
              ))}

            {/* (linhas vazias removidas — tabela mostra só os produtos reais) */}
          </tbody>
        </table>
      </div>

      {/* Totais — sobe 20px na impressão */}
      <div style={print ? { ...styles.totais, padding: '0 8px 6px 8px', position: 'relative', top: '-20px' } : styles.totais}>
        <div>Total: {formatarValor(data.totalAPagar)}</div>
        <div style={{ color: temSaldo ? '#dc2626' : '#16a34a' }}>
          Saldo: {temSaldo ? formatarValor(saldoProtocolo) : 'Pago'}
        </div>
      </div>

      {/* Wrapper que sobe 10px todo o bloco após o Total — só no PDF impresso */}
      <div style={print ? { marginTop: '-10px' } : undefined}>
      {/* Opções de pagamento — operador controla via checkbox no modal (mostrarPagamento) */}
      {data.mostrarPagamento !== false && (
        <div style={print ? { ...styles.pagamento, borderBottom: 'none' } : styles.pagamento}>
          <div style={styles.pagamentoGrid}>
            <div style={styles.pagamentoItem}>
              <span style={styles.pagamentoLabel as React.CSSProperties}>Pix/Dinheiro</span>
              <span style={styles.pagamentoValor}>{formatarValor(data.opcoesPagamento.pix)}</span>
            </div>
            <div style={styles.pagamentoItem}>
              <span style={styles.pagamentoLabel as React.CSSProperties}>1-6x cartão</span>
              <span style={styles.pagamentoValor}>{formatarValor(data.opcoesPagamento.parcelado6)}</span>
            </div>
            <div style={styles.pagamentoItem}>
              <span style={styles.pagamentoLabel as React.CSSProperties}>7-12x cartão</span>
              <span style={styles.pagamentoValor}>{formatarValor(data.opcoesPagamento.parcelado12)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Checklist de entrega */}
      <div style={print ? { ...styles.entregue, borderBottom: 'none' } : styles.entregue}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#555', marginBottom: '3px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>
          Entregue:
        </div>
        <div style={styles.checkRow}>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Certificado</span>
          </div>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Pelinho</span>
          </div>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Urna c/ Cinzas</span>
          </div>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Recordações</span>
          </div>
        </div>
      </div>

      {/* Assinatura */}
      <div style={styles.assinatura}>
        <div style={styles.textoConfirmacao}>
          Confirmo que recebi os itens assinalados acima.
        </div>
        <div style={{ ...styles.linhaAssinatura, ...(print ? { marginTop: '40px' } : {}) } as React.CSSProperties}>
          Assinatura
        </div>
        <div style={styles.dataAssinatura as React.CSSProperties}>
          Data: ____/____/________
        </div>
      </div>
      </div>{/* fecha wrapper marginTop:-10 */}
    </div>
  )
}

/** Protocolo em branco para preencher à mão */
function ProtocoloEmBranco({ print }: { print?: boolean }) {
  // Mesmos overrides do preenchido — pra ficarem idênticos no PDF.
  const thC: React.CSSProperties = print
    ? { ...styles.thCenter, padding: '4px 4px 16px 4px', lineHeight: 1, verticalAlign: 'top' as const }
    : styles.thCenter
  const thR: React.CSSProperties = print
    ? { ...styles.thRight, padding: '4px 4px 16px 4px', lineHeight: 1, verticalAlign: 'top' as const }
    : styles.thRight
  const checkItemStyle: React.CSSProperties = print
    ? { ...styles.checkItem, lineHeight: 1 }
    : styles.checkItem
  const checkboxStyle: React.CSSProperties = print
    ? { ...styles.checkbox, position: 'relative', top: '6px' }
    : styles.checkbox
  const linhaVazia = { height: '16px', borderBottom: '1px dotted #bbb' }
  // marginBottom 5px — mesmo espaçamento da styles.row (versão preenchida)
  const labelLinha = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '5px' }}>
      <span style={{ ...styles.label, fontSize: '11px', whiteSpace: 'nowrap' as const, marginRight: '4px' }}>{label}:</span>
      <div style={{ flex: 1, ...linhaVazia }} />
    </div>
  )

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <img src="/rippet_logo_horizontal.png" style={styles.headerLogo} alt="R.I.P. Pet" />
        <span style={print ? { position: 'relative', top: '-4px', left: '5px' } : undefined}>PROTOCOLO DE ENTREGA</span>
      </div>

      {/* Campos em branco — mesmo padding (8px) da versão preenchida pra alinhar */}
      <div style={styles.section}>
        {labelLinha('Tutor')}
        {labelLinha('Pet')}
        {labelLinha('Endereço')}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 2 }}>{labelLinha('Cidade')}</div>
          <div style={{ flex: 1 }}>{labelLinha('CEP')}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>{labelLinha('Data')}</div>
          <div style={{ flex: 1 }}>{labelLinha('Tipo')}</div>
          <div style={{ flex: 1 }}>{labelLinha('Código')}</div>
        </div>
      </div>

      {/* Tabela de Produtos vazia */}
      <div style={{ padding: '0', flex: 1, display: 'flex', flexDirection: 'column' as const }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...thC, width: '32px' }}>Sit.</th>
              <th style={thC}>Produto</th>
              <th style={{ ...thR, width: '76px' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, idx) => (
              <tr key={idx}>
                <td style={styles.emptyRow}></td>
                <td style={styles.emptyRow}></td>
                <td style={styles.emptyRow}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totais em branco */}
      <div style={styles.totais}>
        <div>Total: ____________</div>
        <div>Saldo: ____________</div>
      </div>

      {/* Checklist de entrega */}
      <div style={print ? { ...styles.entregue, borderBottom: 'none' } : styles.entregue}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#555', marginBottom: '3px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>
          Entregue:
        </div>
        <div style={styles.checkRow}>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Certificado</span>
          </div>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Pelinho</span>
          </div>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Urna c/ Cinzas</span>
          </div>
          <div style={checkItemStyle}>
            <span style={checkboxStyle}></span>
            <span>Recordações</span>
          </div>
        </div>
      </div>

      {/* Assinatura */}
      <div style={styles.assinatura}>
        <div style={styles.textoConfirmacao}>
          Confirmo que recebi os itens assinalados acima.
        </div>
        <div style={{ ...styles.linhaAssinatura, ...(print ? { marginTop: '40px' } : {}) } as React.CSSProperties}>
          Assinatura
        </div>
        <div style={styles.dataAssinatura as React.CSSProperties}>
          Data: ____/____/________
        </div>
      </div>
    </div>
  )
}
