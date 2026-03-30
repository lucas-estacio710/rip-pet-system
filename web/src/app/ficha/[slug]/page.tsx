'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import FichaForm, { type FichaUnidadeConfig } from '@/components/ficha/FichaForm'

export default function FichaUnidade() {
  const params = useParams()
  const slug = params.slug as string
  const [config, setConfig] = useState<FichaUnidadeConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function loadUnit() {
      const supabase = createClient()
      const { data: rawData } = await supabase
        .from('unidades')
        .select('id, codigo, nome, cidade, estado, whatsapp, is_matriz')
        .eq('slug', slug)
        .eq('ativa', true)
        .single()

      const data = rawData as any
      if (!data || data.is_matriz) {
        setError(true)
        setLoading(false)
        return
      }

      setConfig({
        unidade_id: data.id,
        codigo: data.codigo,
        nome: data.nome,
        cidade: data.cidade || data.nome,
        estado: data.estado || 'SP',
        label: `Unidade ${data.nome}`,
        unidadeCompleta: `${data.nome} - ${data.estado || 'SP'}`,
      })
      setLoading(false)
    }

    loadUnit()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Carregando ficha...</p>
        </div>
      </div>
    )
  }

  if (error || !config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold text-slate-700 mb-2">Unidade não encontrada</h1>
          <p className="text-slate-500">A ficha para &quot;{slug}&quot; não está disponível.</p>
        </div>
      </div>
    )
  }

  return <FichaForm config={config} />
}
