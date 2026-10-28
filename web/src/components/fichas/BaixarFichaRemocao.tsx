'use client'

import { useRef, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import FichaRemocaoDoc, { DOC_W } from './FichaRemocaoDoc'
import type { FichaContratoData } from './FichaRemocao'
import { baixarFichaPdf, nomeDeArquivo, preCarregarDownload } from '@/lib/ficha-download'
import { CAMPOS_FICHA_CONTRATO, fichaDeContrato, type LinhaFichaContrato } from '@/lib/ficha-remocao-dados'

/**
 * "Baixar Ficha de Remoção" do popup de acolhimento do /tarefas (28/10/2026, pedido do Lucas):
 * a mesma folha da /gruposencaminhamentos (`FichaRemocaoDoc`), em PDF de MEIA A4 centralizada
 * numa A4 (`baixarFichaPdf(..., { meiaA4: true })`).
 *
 * O contrato é lido no CLIQUE e o nó de captura só existe enquanto gera — mesmo padrão do
 * `BotaoCompartilharFicha` de lá. Nó em escala 1:1, `visibility: hidden` e estilo inline: as
 * regras estão no `CapturaFicha` da /gruposencaminhamentos e no cabeçalho de lib/ficha-download.
 */
export default function BaixarFichaRemocao({ contratoId, colaborador }: { contratoId: string; colaborador?: string | null }) {
  const supabase = createClient()
  const capturaRef = useRef<HTMLDivElement>(null)
  const [ficha, setFicha] = useState<FichaContratoData | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function baixar() {
    if (gerando) return
    setGerando(true)
    setErro(null)
    preCarregarDownload()
    try {
      const { data, error } = await supabase.from('contratos').select(CAMPOS_FICHA_CONTRATO).eq('id', contratoId).maybeSingle()
      if (error || !data) throw error || new Error('contrato não encontrado')
      const f = fichaDeContrato(data as unknown as LinhaFichaContrato, { colaborador })
      setFicha(f)
      // 2 quadros: o nó montar e o spinner ser PINTADO antes do trabalho pesado.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const el = capturaRef.current
      if (!el) throw new Error('nó de captura não montou')
      await baixarFichaPdf(el, nomeDeArquivo('ficha', f.pet_nome, f.numero_lacre), { meiaA4: true })
    } catch (e) {
      console.error('Erro ao baixar a ficha de remoção:', e)
      setErro('Não deu pra gerar a ficha. Tente de novo.')
    } finally {
      setFicha(null)
      setGerando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={baixar}
        disabled={gerando}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[var(--surface-300)] bg-[var(--surface-100)] text-[var(--surface-700)] hover:bg-[var(--surface-200)] text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Baixar Ficha de Remoção
      </button>
      {erro && <p className="text-xs text-red-500 text-center">{erro}</p>}
      {ficha && (
        <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none' }}>
          <div
            ref={capturaRef}
            style={{ width: DOC_W + 24, boxSizing: 'border-box', padding: 12, background: '#fff', WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' }}
          >
            <FichaRemocaoDoc contrato={ficha} />
          </div>
        </div>
      )}
    </>
  )
}
