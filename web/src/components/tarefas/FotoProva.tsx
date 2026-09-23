'use client'

// ============================================================================
// Campo de foto-prova no popup de conclusão de tarefa (migration 147).
//
// Escolher a foto NÃO sobe nada: comprime, mostra o preview e devolve o blob pro pai, que sobe
// só quando a conclusão é confirmada (ver lib/foto-tarefa.ts). Assim, abrir o popup, tirar foto
// e desistir não deixa arquivo pago no bucket.
//
// `capture="environment"` abre a câmera traseira direto no celular, sem passar pela galeria —
// que é o gesto que o executor faz na rua. No desktop vira seletor de arquivo normal.
// ============================================================================

import { useRef, useState, useEffect } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { comprimirImagem, ImagemInvalidaError, type FotoComprimida } from '@/lib/comprimir-imagem'

export default function FotoProva({
  valor,
  onChange,
  obrigatoria,
  aviso,
}: {
  valor: FotoComprimida | null
  onChange: (f: FotoComprimida | null) => void
  /** Só controla o asterisco vermelho. Quem pode concluir SEM a foto obrigatória é decidido
   *  fora daqui: no `disabled` do botão de concluir e no trigger `tarefa_exige_foto_ao_concluir`
   *  (mig 147) — o campo não opina sobre isso, e não avisa nada a quem pode dispensar. */
  obrigatoria: boolean
  /** Texto extra abaixo do campo — o que a foto precisa mostrar. Aceita JSX pra destacar a
   *  palavra que importa (ex.: <strong>lacre</strong>). */
  aviso?: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // URL de blob é recurso do browser: sem o revoke, cada troca de foto vaza memória na aba —
  // e o Operacional deixa a tela aberta o dia inteiro.
  useEffect(() => {
    if (!valor) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(valor.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [valor])

  async function selecionar(file: File | undefined) {
    if (!file) return
    setErro('')
    setProcessando(true)
    try {
      onChange(await comprimirImagem(file))
    } catch (e) {
      onChange(null)
      setErro(e instanceof ImagemInvalidaError ? e.message : 'Não consegui preparar a foto. Tente de novo.')
    } finally {
      setProcessando(false)
      // Limpa o input: sem isso, escolher O MESMO arquivo de novo não dispara onChange.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">
        Foto de Conclusão {obrigatoria && <span className="text-red-400">*</span>}
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => selecionar(e.target.files?.[0])}
      />

      {previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Foto de Conclusão" className="w-full max-h-56 object-cover rounded-lg border border-[var(--surface-200)]" />
          <button
            type="button"
            onClick={() => { onChange(null); setErro('') }}
            className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white"
            title="Remover foto"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-[var(--surface-500)]">
              {valor ? `${Math.round(valor.bytes / 1024)} KB · ${valor.largura}×${valor.altura}` : ''}
            </span>
            <button type="button" onClick={() => inputRef.current?.click()} className="text-[11px] font-semibold text-[var(--brand-600)]">
              Trocar foto
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processando}
          className="w-full flex items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-[var(--surface-300)] text-sm font-semibold text-[var(--surface-600)] disabled:opacity-60"
        >
          {processando
            ? (<><Loader2 className="h-4 w-4 animate-spin" /> Carregando foto...</>)
            : (<><Camera className="h-5 w-5" /> Tirar foto</>)}
        </button>
      )}

      {erro && <p className="text-xs text-red-400 mt-1">{erro}</p>}

      {!erro && aviso && !previewUrl && (
        <p className="text-[10px] text-[var(--surface-500)] mt-1">{aviso}</p>
      )}

    </div>
  )
}
