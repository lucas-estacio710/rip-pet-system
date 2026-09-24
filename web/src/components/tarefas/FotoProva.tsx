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
import { Camera, X, Loader2, Check, Maximize2 } from 'lucide-react'
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
  // Foto ampliada: a conferência continua a um toque, só deixou de custar 224px fixos.
  const [ampliada, setAmpliada] = useState(false)
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

      {/* 🔴 **Depois de fotografar, a prova é MINIATURA, não pôster.** Isto era um
          `<img className="w-full max-h-56">`: **224px** de altura fixa, mais rótulo e linha
          de meta — ~260px num modal que já passava de 1.100px e não cabia na tela do celular
          (foi o que deixou o "Concluir" inalcançável em 24/09/2026). Agora são ~68px.
          Quem acabou de fotografar precisa saber **que fotografou**, não admirar a foto — e a
          miniatura já mostra se pegou o pet ou o chão.
          ⚠️ A conferência de verdade **não foi removida**: toca na miniatura e abre em tela
          cheia. Mesmo princípio da ficha na `/gruposencaminhamentos`.
          ⚠️ *Trocar* e *remover* ficam em **44px de alvo de toque** (`min-h-11`) apesar da
          linha ser mais baixa: quem aperta isso está na rua, com a mão suja. Encolher alvo de
          toque pra ganhar pixel é trocar espaço por erro de operação. */}
      {previewUrl ? (
        <div className="flex items-center gap-2 p-1.5 rounded-lg border border-[var(--surface-200)] bg-[var(--surface-50)]">
          <button type="button" onClick={() => setAmpliada(true)} className="shrink-0 relative" title="Ver a foto em tamanho grande">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Foto de Conclusão" className="h-14 w-14 object-cover rounded-md border border-[var(--surface-200)]" />
            <span className="absolute bottom-0 right-0 p-0.5 rounded-tl-md bg-black/60 text-white">
              <Maximize2 className="h-2.5 w-2.5" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--surface-700)] flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />Foto anexada
            </p>
            <p className="text-[10px] text-[var(--surface-500)] truncate">
              {valor ? `${Math.round(valor.bytes / 1024)} KB · ${valor.largura}×${valor.altura}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 min-h-11 px-2 flex items-center text-[11px] font-semibold text-[var(--brand-600)]">
            Trocar
          </button>
          <button type="button" onClick={() => { onChange(null); setErro('') }} className="shrink-0 min-h-11 px-2 flex items-center text-[var(--surface-400)]" title="Remover foto">
            <X className="h-4 w-4" />
          </button>
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

      {/* Foto em tela cheia. `z-[70]` fica acima dos DOIS modais que hospedam este campo
          (`/tarefas` é `z-50`, `AtivacaoPVModal` é `z-[60]`). Renderiza DENTRO do card do
          modal de propósito: o card tem `stopPropagation`, então o clique aqui não vaza pro
          fundo e não fecha o modal por baixo. */}
      {ampliada && previewUrl && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setAmpliada(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Foto de Conclusão" className="max-w-full max-h-full object-contain rounded-lg" />
          <button
            type="button"
            onClick={() => setAmpliada(false)}
            className="absolute top-3 right-3 p-2.5 rounded-full bg-white/15 text-white"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

    </div>
  )
}
