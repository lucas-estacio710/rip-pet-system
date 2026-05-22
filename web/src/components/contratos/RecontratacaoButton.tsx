'use client'

import { useState } from 'react'
import { Send, X, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useFieldPermission } from '@/hooks/useFieldPermission'

type Props = {
  tutorId: string
  tela: string           // 'tela_tutores' ou 'tela_contrato' (FLS)
  telefone?: string | null
  className?: string
}

// Botão "Enviar nova contratação": gera um link pré-preenchido pra o tutor
// cadastrar um novo pet (recontratação). Premium — controlado por FLS.
export default function RecontratacaoButton({ tutorId, tela, telefone, className }: Props) {
  const { isVisible } = useFieldPermission()
  const supabase = createClient()
  const [gerando, setGerando] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  if (!isVisible(tela, 'btn_recontratacao')) return null

  async function gerar() {
    setGerando(true)
    setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErro('Sessão expirada — faça login de novo.'); return }
      const res = await fetch('/api/recontratacao/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tutorId }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro ao gerar link'); return }
      setUrl(data.url)
    } catch {
      setErro('Erro ao gerar link')
    } finally {
      setGerando(false)
    }
  }

  function copiar() {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  function abrirWhatsApp() {
    if (!url) return
    let tel = (telefone || '').replace(/\D/g, '')
    if (tel.length === 10 || tel.length === 11) tel = '55' + tel
    const msg = encodeURIComponent(
      `Olá! Para registrar a contratação do seu novo pet, é só preencher a ficha por aqui — seus dados de cadastro já estão preenchidos:\n\n${url}`
    )
    window.open(tel ? `https://wa.me/${tel}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank')
  }

  function fechar() {
    setUrl(null)
    setErro('')
  }

  return (
    <>
      <button
        onClick={gerar}
        disabled={gerando}
        className={className || 'flex items-center gap-1.5 btn-secondary text-xs py-1.5 px-3 whitespace-nowrap disabled:opacity-50'}
        title="Gerar link pré-preenchido pro tutor cadastrar um novo pet"
      >
        <Send className="h-3.5 w-3.5" />
        {gerando ? 'Gerando…' : 'Enviar nova contratação'}
      </button>

      {(url || erro) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={fechar}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-200">Link de nova contratação</h3>
              <button onClick={fechar} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>

            {erro ? (
              <p className="text-sm text-red-400">{erro}</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-2">
                  Envie pro tutor. Os dados de cadastro dele já vêm preenchidos — ele só confirma e cadastra o novo pet. O link vale 7 dias.
                </p>
                <div className="text-[11px] text-slate-300 bg-slate-900/60 border border-slate-700 rounded-lg p-2 break-all mb-3 font-mono">
                  {url}
                </div>
                <div className="flex gap-2">
                  <button onClick={copiar} className="flex-1 flex items-center justify-center gap-1.5 btn-secondary text-sm py-2">
                    {copiado ? <><Check className="h-4 w-4 text-emerald-400" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar</>}
                  </button>
                  <button onClick={abrirWhatsApp} className="flex-1 flex items-center justify-center gap-1.5 text-sm py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                    <img src="/wts-icon.png" alt="" className="w-5 h-5 object-contain" /> WhatsApp
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
