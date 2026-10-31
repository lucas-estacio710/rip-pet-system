'use client'

/**
 * 📋 Protocolo de Entrega — 2º nível do popup de pendências, faixa OPCIONAIS (31/10/2026).
 * Mão dupla com o DOC: é o MESMO editor (`ProtocoloEditorModal`, modo embutido) e grava o
 * mesmo `protocolo_data`, sempre por `salvarProtocolo` (carimbo de data/hora + assinatura do
 * contrato — é o que deixa o editor avisar "depois houve alterações").
 *
 * Salvo → abre o salvo. Não salvo → monta do banco na hora.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ProtocoloEditorModal from '@/components/protocolo/ProtocoloEditorModal'
import { normalizarProtocoloData, type ProtocoloData } from '@/components/protocolo/protocolo-utils'
import { protocoloDoContratoAgora, salvarProtocolo } from '@/lib/protocolo-contrato'

type Props = {
  contratoId: string
  /** `contratos.protocolo_data` como a página tem agora (null = nunca salvo). */
  salvo: unknown | null
  /** Gravou: a página guarda o protocolo novo (o ✓ da lista sai daqui) e volta pra lista. */
  onSalvo: (gravado: ProtocoloData) => void
}

export default function ProtocoloTela({ contratoId, salvo, onSalvo }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [dados, setDados] = useState<ProtocoloData | null>(salvo ? normalizarProtocoloData(salvo) : null)
  const [montando, setMontando] = useState(!salvo)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function montar() {
    setMontando(true); setErro(null)
    try { setDados(await protocoloDoContratoAgora(supabase, contratoId)) }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
    setMontando(false)
  }

  // Nunca salvo: monta do banco ao abrir.
  useEffect(() => {
    if (salvo) return
    let vivo = true
    protocoloDoContratoAgora(supabase, contratoId)
      .then(d => { if (vivo) setDados(d) })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (vivo) setMontando(false) })
    return () => { vivo = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!dados) {
    return erro
      ? <div className="py-6 text-center space-y-2"><p className="text-sm text-red-500">⚠ {erro}</p>
          <button type="button" onClick={() => void montar()} className="text-sm font-semibold underline" style={{ color: 'var(--surface-600)' }}>Tentar de novo</button></div>
      : <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--surface-400)' }} /></div>
  }

  return (
    <div className="space-y-2">
      {erro && <p className="text-xs text-red-500">⚠ {erro}</p>}
      <ProtocoloEditorModal
        embutido
        contratoId={contratoId}
        data={dados}
        onChange={setDados}
        salvando={salvando}
        onSave={async () => {
          setSalvando(true); setErro(null)
          try {
            const gravado = await salvarProtocolo(supabase, contratoId, dados)
            setSalvando(false)
            onSalvo(gravado)
          } catch (e) {
            setErro(e instanceof Error ? e.message : String(e))
            setSalvando(false)
          }
        }}
        onRegenerate={() => void montar()}
        regenerando={montando}
        onClose={() => {}}
      />
    </div>
  )
}
