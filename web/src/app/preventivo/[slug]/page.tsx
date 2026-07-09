'use client'

// Link público de CONTRATAÇÃO PREVENTIVA (pet vivo), paralelo a /ficha/[slug] (remoção).
// Reusa o FichaForm em modoPreventivo (esconde campos de óbito, grava tipo_plano='preventivo').
import { useParams } from 'next/navigation'
import FichaForm from '@/components/ficha/FichaForm'
import { FICHA_UNIDADES } from '@/lib/ficha-unidades'

export default function PreventivoUnidade() {
  const params = useParams()
  const slug = params.slug as string
  const config = FICHA_UNIDADES[slug]

  if (!config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold text-slate-700 mb-2">Unidade não encontrada</h1>
          <p className="text-slate-500">A contratação para &quot;{slug}&quot; não está disponível.</p>
        </div>
      </div>
    )
  }

  return <FichaForm config={config} modoPreventivo />
}
