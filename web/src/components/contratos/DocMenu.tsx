'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Menu, FileEdit, FileText, ClipboardList, Receipt, Printer, Loader2, ChevronDown } from 'lucide-react'

type Props = {
  contratoId: string
  onEditarContrato: () => void | Promise<void>
  onImprimirContrato: () => void | Promise<void>
  onEditarFicha: () => void | Promise<void>
  onImprimirFicha: () => void | Promise<void>
  /** Opcional: callback do Protocolo de Entrega. Se omitido junto com hideProtocolo, o item some. */
  onProtocolo?: () => void | Promise<void>
  /** Esconde o item Protocolo de Entrega (pipeline e detalhe usam o mesmo ProtocoloEditorModal) */
  hideProtocolo?: boolean
  /** Loading global do botão (ex: capturando ficha) — desabilita o trigger */
  loading?: boolean
}

const POP_WIDTH = 224 // w-56 (14rem * 16px)

/**
 * Botão "DOC" (hambúrguer + label) que abre popover com os 4 documentos do contrato:
 * Contrato (PDF), Ficha de Remoção (PNG), Protocolo de Entrega (modal), Impressão de Documentos (link).
 *
 * Popover usa React Portal + position:fixed para escapar de overflow/stacking-context dos cards do pipeline.
 */
export default function DocMenu({ contratoId, onEditarContrato, onImprimirContrato, onEditarFicha, onImprimirFicha, onProtocolo, hideProtocolo, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [contratoExpanded, setContratoExpanded] = useState(false)
  const [fichaExpanded, setFichaExpanded] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Reseta as expansões dos submenus quando o popover fecha
  useEffect(() => {
    if (!open) {
      setContratoExpanded(false)
      setFichaExpanded(false)
    }
  }, [open])

  // Posiciona o popover quando abre, e reposiciona em scroll/resize
  useLayoutEffect(() => {
    if (!open) return
    function updatePos() {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      // Default: à direita do botão. Se estourar, à esquerda.
      const right = rect.right + 4
      const left = right + POP_WIDTH > window.innerWidth ? Math.max(8, rect.left - POP_WIDTH - 4) : right
      setPos({ top: rect.top, left })
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  // Click outside + Esc fecham
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (
        btnRef.current && !btnRef.current.contains(t) &&
        popRef.current && !popRef.current.contains(t)
      ) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function pickAndClose(fn: () => void | Promise<void>) {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      void fn()
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={loading}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v) }}
        className="flex flex-col items-center gap-0 px-0.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors text-slate-300 disabled:opacity-50"
        title="Documentos do contrato"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Menu className="h-3.5 w-3.5" />}
        <span className="text-[8px] font-bold leading-none">DOC</span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          className="fixed z-[9999] rounded-lg shadow-2xl py-1"
          style={{
            top: pos.top,
            left: pos.left,
            width: POP_WIDTH,
            background: '#1e293b',
            border: '1px solid #334155',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Menu pai: Contrato (expansível em árvore) */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setContratoExpanded(v => !v) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
            aria-expanded={contratoExpanded}
          >
            <FileText className="h-4 w-4 text-blue-400" />
            <span className="flex-1 text-left">Contrato</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${contratoExpanded ? 'rotate-180' : ''}`} />
          </button>
          {contratoExpanded && (
            <div style={{ background: 'rgba(15,23,42,0.4)', borderLeft: '2px solid #334155', marginLeft: '14px' }}>
              <button
                onClick={pickAndClose(onEditarContrato)}
                className="w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-[13px] text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <FileEdit className="h-3.5 w-3.5 text-blue-300" />
                Editar
              </button>
              <button
                onClick={pickAndClose(onImprimirContrato)}
                className="w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-[13px] text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Printer className="h-3.5 w-3.5 text-blue-300" />
                Imprimir
              </button>
            </div>
          )}
          {/* Menu pai: Ficha de Remoção (expansível em árvore) */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFichaExpanded(v => !v) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
            aria-expanded={fichaExpanded}
          >
            <ClipboardList className="h-4 w-4 text-amber-400" />
            <span className="flex-1 text-left">Ficha de Remoção</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${fichaExpanded ? 'rotate-180' : ''}`} />
          </button>
          {fichaExpanded && (
            <div style={{ background: 'rgba(15,23,42,0.4)', borderLeft: '2px solid #334155', marginLeft: '14px' }}>
              <button
                onClick={pickAndClose(onEditarFicha)}
                className="w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-[13px] text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <FileEdit className="h-3.5 w-3.5 text-amber-300" />
                Editar
              </button>
              <button
                onClick={pickAndClose(onImprimirFicha)}
                className="w-full flex items-center gap-2 pl-3 pr-3 py-1.5 text-[13px] text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Printer className="h-3.5 w-3.5 text-amber-300" />
                Imprimir
              </button>
            </div>
          )}
          {!hideProtocolo && onProtocolo && (
            <button
              onClick={pickAndClose(onProtocolo)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Receipt className="h-4 w-4 text-green-400" />
              Protocolo de Entrega
            </button>
          )}
          <div className="border-t my-1" style={{ borderColor: '#334155' }} />
          <Link
            href={`/impressao-documentos?contratoId=${contratoId}`}
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Printer className="h-4 w-4 text-purple-400" />
            Impressão de Documentos
          </Link>
        </div>,
        document.body
      )}
    </>
  )
}
