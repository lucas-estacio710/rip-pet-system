import React from 'react'
import { ProtocoloData, formatarValor } from './protocolo-utils'

// Componente que renderiza 1 protocolo de entrega
// Usa inline styles para funcionar dentro de iframe de impressão (sem Tailwind)

const styles = {
  container: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '13px',
    lineHeight: '1.3',
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
    padding: '5px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 'bold' as const,
    fontSize: '13px',
    letterSpacing: '1px',
  },
  headerLogo: {
    height: '22px',
    width: 'auto',
    flexShrink: 0,
  },
  section: {
    padding: '5px 10px',
    borderBottom: '1px solid #ccc',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between' as const,
    marginBottom: '4px',
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
    fontSize: '12px',
  },
  th: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    padding: '3px 5px',
    fontWeight: 'bold' as const,
    textAlign: 'left' as const,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    color: '#555',
  },
  thRight: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    padding: '3px 5px',
    fontWeight: 'bold' as const,
    textAlign: 'right' as const,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    color: '#555',
  },
  thCenter: {
    background: '#f0f0f0',
    border: '1px solid #ccc',
    padding: '3px 5px',
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    color: '#555',
  },
  td: {
    border: '1px solid #ddd',
    padding: '2px 5px',
    verticalAlign: 'middle' as const,
  },
  tdRight: {
    border: '1px solid #ddd',
    padding: '2px 5px',
    textAlign: 'right' as const,
    verticalAlign: 'middle' as const,
  },
  tdCenter: {
    border: '1px solid #ddd',
    padding: '2px 5px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
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
    padding: '4px 10px',
    borderBottom: '1px solid #ccc',
    display: 'flex',
    justifyContent: 'space-between' as const,
    fontWeight: 'bold' as const,
    fontSize: '13px',
  },
  pagamento: {
    padding: '4px 10px',
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
    padding: '2px 4px',
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
    padding: '4px 10px',
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
    padding: '6px 10px 8px',
  },
  textoConfirmacao: {
    fontSize: '8px',
    color: '#666',
    fontStyle: 'italic' as const,
    marginBottom: '12px',
    lineHeight: '1.2',
  },
  linhaAssinatura: {
    borderTop: '1px solid #333',
    marginTop: '30px',
    paddingTop: '3px',
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
    height: '14px',
    border: '1px solid #ddd',
    background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, #d4d4d4 3px, #d4d4d4 4px)',
  },
}

export default function ProtocoloEntrega({ data }: { data: ProtocoloData }) {
  const MAX_LINHAS_PRODUTOS = 8
  const linhasVazias = Math.max(0, MAX_LINHAS_PRODUTOS - data.produtos.length)

  const enderecoCompleto = [
    data.tutorEndereco,
    data.tutorBairro,
  ].filter(Boolean).join(' - ')

  const cidadeEstado = [
    data.tutorCidade,
    data.tutorEstado,
  ].filter(Boolean).join('/')

  const temSaldo = data.saldo > 0

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <img src="/rippet_logo_horizontal.png" style={styles.headerLogo} alt="R.I.P. Pet" />
        <span>PROTOCOLO DE ENTREGA</span>
      </div>

      {/* Info do contrato */}
      <div style={styles.section}>
        <div style={styles.row}>
          <div>
            <span style={styles.label}>Tutor:</span>
            <span style={styles.value}>{data.tutorNome}</span>
          </div>
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
          <div>
            <span style={{ ...styles.label, fontSize: '9px', color: '#888' }}>#{data.codigo}</span>
          </div>
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div style={{ padding: '0', flex: 1, display: 'flex', flexDirection: 'column' as const }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.thCenter, width: '40px' }}>Sit.</th>
              <th style={styles.thCenter}>Produto</th>
              <th style={{ ...styles.thRight, width: '70px' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {/* Linha de cremação (sempre primeira) */}
            <tr>
              <td style={styles.tdCenter}>
                {(() => {
                  const crem = data.produtos.find(p => p.tipo === 'cremacao')
                  const status = crem?.pago || ''
                  if (!status) return null
                  return <span style={status === 'ok' ? styles.ok : styles.pendente}>{status === 'ok' ? 'Ok' : 'Pend'}</span>
                })()}
              </td>
              <td style={styles.tdCenter}>
                Crem. {data.tipoCremacao === 'individual' ? 'Individual' : 'Coletiva'}
              </td>
              <td style={styles.tdRight}>
                {(() => {
                  const crem = data.produtos.find(p => p.tipo === 'cremacao')
                  if (crem?.valorDisplay) return crem.valorDisplay
                  return formatarValor(crem?.valor || 0)
                })()}
              </td>
            </tr>

            {/* Produtos (excluindo cremação) */}
            {data.produtos
              .filter(p => p.tipo !== 'cremacao')
              .map((prod, idx) => (
                <tr key={idx}>
                  <td style={styles.tdCenter}>
                    {prod.pago ? (
                      <span style={prod.pago === 'ok' ? styles.ok : styles.pendente}>
                        {prod.pago === 'ok' ? 'Ok' : 'Pend'}
                      </span>
                    ) : null}
                  </td>
                  <td style={styles.tdCenter}>{prod.nomeRetorno}</td>
                  <td style={styles.tdRight}>
                    {prod.valorDisplay ? prod.valorDisplay : prod.valor === 0 ? 'Inclusa' : formatarValor(prod.valor)}
                  </td>
                </tr>
              ))}

            {/* Linhas vazias para completar */}
            {Array.from({ length: linhasVazias }).map((_, idx) => (
              <tr key={`empty-${idx}`}>
                <td style={styles.emptyRow}></td>
                <td style={styles.emptyRow}></td>
                <td style={styles.emptyRow}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totais */}
      <div style={styles.totais}>
        <div>Total: {formatarValor(data.totalAPagar)}</div>
        <div style={{ color: temSaldo ? '#dc2626' : '#16a34a' }}>
          Saldo: {temSaldo ? formatarValor(data.saldo) : 'Pago'}
        </div>
      </div>

      {/* Opções de pagamento (só se tem saldo e mostrarPagamento !== false) */}
      {temSaldo && data.mostrarPagamento !== false && (
        <div style={styles.pagamento}>
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
      <div style={styles.entregue}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#555', marginBottom: '3px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>
          Entregue:
        </div>
        <div style={styles.checkRow}>
          <div style={styles.checkItem}>
            <span style={styles.checkbox}></span>
            <span>Certificado</span>
          </div>
          <div style={styles.checkItem}>
            <span style={styles.checkbox}></span>
            <span>Pelinho</span>
          </div>
          <div style={styles.checkItem}>
            <span style={styles.checkbox}></span>
            <span>Urna c/ Cinzas</span>
          </div>
          <div style={styles.checkItem}>
            <span style={styles.checkbox}></span>
            <span>Recordações</span>
          </div>
        </div>
      </div>

      {/* Assinatura */}
      <div style={styles.assinatura}>
        <div style={styles.textoConfirmacao}>
          Confirmo que recebi os itens assinalados acima.
        </div>
        <div style={styles.linhaAssinatura as React.CSSProperties}>
          Assinatura
        </div>
        <div style={styles.dataAssinatura as React.CSSProperties}>
          Data: ____/____/________
        </div>
      </div>
    </div>
  )
}
