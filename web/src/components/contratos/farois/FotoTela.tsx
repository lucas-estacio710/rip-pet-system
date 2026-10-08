'use client'

/**
 * 📷 Foto — 2º nível do popup de pendências (fase 2.7 do docs/PLAYBOOK_REDESENHO_PIPELINE.md;
 * itens 34 e 38 de docs/REDESENHO_CARDS_PIPELINE.md).
 *
 * Sempre abre aqui, com 1 ou N fotos (item 38: o atalho de 1 foto direto na lista perdia o check
 * animado e não dizia qual produto era). Um cartão por `contrato_produto` com
 * `produto.precisa_foto`: imagem do produto (56px, contain, fundo branco), nome e o estado; à
 * direita um círculo tracejado que, ao tocar, vira o ✓ desenhado a lápis — anima só no item
 * recém-marcado. Grava `contrato_produtos.foto_recebida` (sem coluna nova). OK no fim é
 * decorativo (item 34): cada toque já gravou; ele só volta pra lista.
 */
import { useState } from 'react'

export type ProdutoFoto = { id: string; nome: string; imagemUrl: string | null; recebida: boolean }

type Props = {
  produtos: ProdutoFoto[]
  /** Grava o novo valor; devolve false se falhou (o cartão não muda). */
  onMarcar: (cpId: string, recebida: boolean) => Promise<boolean>
  onOk: () => void
}

export default function FotoTela({ produtos, onMarcar, onOk }: Props) {
  const [recemMarcado, setRecemMarcado] = useState<string | null>(null)
  const [gravando, setGravando] = useState<string | null>(null)

  async function alternar(p: ProdutoFoto) {
    if (gravando) return
    setGravando(p.id)
    const ok = await onMarcar(p.id, !p.recebida)
    setGravando(null)
    if (ok) setRecemMarcado(!p.recebida ? p.id : null)
  }

  if (produtos.length === 0) {
    return <p className="text-sm text-center py-4" style={{ color: 'var(--surface-400)' }}>Nenhum produto deste contrato pede foto.</p>
  }

  return (
    <div className="space-y-2">
      {produtos.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => alternar(p)}
          disabled={gravando === p.id}
          className="w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-colors disabled:opacity-60"
          style={p.recebida
            ? { background: 'rgba(16,185,129,.10)', borderColor: 'rgba(16,185,129,.45)' }
            : { background: 'var(--surface-0)', borderColor: 'var(--surface-200)' }}
        >
          <span className="flex-none w-14 h-14 rounded-lg bg-white border flex items-center justify-center overflow-hidden" style={{ borderColor: 'var(--surface-200)' }}>
            {p.imagemUrl
              ? <img src={p.imagemUrl} alt="" className="w-full h-full" style={{ objectFit: 'contain' }} />
              : <span className="text-xl">📦</span>}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--surface-800)' }}>{p.nome}</span>
            <span className="block text-[12px]" style={{ color: p.recebida ? '#059669' : 'var(--surface-500)' }}>
              {p.recebida ? 'foto recebida' : 'aguardando foto'}
            </span>
          </span>
          {p.recebida ? (
            <span className={`pl-ok${recemMarcado === p.id ? ' anim' : ''}`} style={{ '--d': '0ms', width: 30, height: 30 } as React.CSSProperties} aria-label="Foto recebida">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
          ) : (
            <span className="flex-none w-[30px] h-[30px] rounded-full border-2 border-dashed" style={{ borderColor: 'var(--surface-300)' }} aria-label="Aguardando foto" />
          )}
        </button>
      ))}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onOk}
          className="h-9 px-6 rounded-lg text-[13px] font-bold text-white"
          style={{ background: '#7c3aed' }}
        >
          OK
        </button>
      </div>
    </div>
  )
}
