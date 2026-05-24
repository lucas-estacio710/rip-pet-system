'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import EstabelecimentoForm, { EstabelecimentoFormData } from '@/components/clinicas/EstabelecimentoForm'

export default function EditarClinicaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { hasModule } = useUnit()
  const supabase = createClient()

  const [initial, setInitial] = useState<EstabelecimentoFormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('estabelecimentos')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelado) return
      if (error) {
        setErro(error.message)
      } else if (!data) {
        setErro('Clínica não encontrada')
      } else {
        const d = data as Record<string, unknown>
        setInitial({
          id: d.id as string,
          unidade_id: (d.unidade_id as string | null) ?? null,
          nome: (d.nome as string) ?? '',
          tipo: (d.tipo as string | null) ?? null,
          endereco: (d.endereco as string | null) ?? null,
          bairro: (d.bairro as string | null) ?? null,
          cidade: (d.cidade as string | null) ?? null,
          estado: (d.estado as string | null) ?? null,
          cep: (d.cep as string | null) ?? null,
          telefone: (d.telefone as string | null) ?? null,
          whatsapp: (d.whatsapp as string | null) ?? null,
          email: (d.email as string | null) ?? null,
          website: (d.website as string | null) ?? null,
          instagram: (d.instagram as string | null) ?? null,
          horario_funcionamento: (d.horario_funcionamento as string | null) ?? null,
          latitude: (d.latitude as number | null) ?? null,
          longitude: (d.longitude as number | null) ?? null,
          observacoes: (d.observacoes as string | null) ?? null,
          fotos: (d.fotos as string[] | null) ?? [],
          porte_equipe: (d.porte_equipe as string | null) ?? null,
          veterinarios_fixos: (d.veterinarios_fixos as number | null) ?? null,
          veterinarios_volantes: (d.veterinarios_volantes as number | null) ?? null,
          ilha_de_exibicao: (d.ilha_de_exibicao as string[] | null) ?? [],
          politica_concorrencia: (d.politica_concorrencia as string | null) ?? null,
          concorrentes_presentes: (d.concorrentes_presentes as string[] | null) ?? [],
          qtde_media_obitos_mensal: (d.qtde_media_obitos_mensal as number | null) ?? null,
          percentual_prefeitura: (d.percentual_prefeitura as number | null) ?? null,
          valor_prefeitura_10kg: (d.valor_prefeitura_10kg as number | null) ?? null,
          modelo_gratificacao: (d.modelo_gratificacao as string | null) ?? null,
          estrategia: (d.estrategia as string | null) ?? null,
        })
      }
      setLoading(false)
    }
    load()
    return () => { cancelado = true }
  }, [id, supabase])

  if (!hasModule('tela_clinicas')) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--surface-500)]">Esta tela não está habilitada para sua unidade.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-3"></div>
          <p className="text-[var(--surface-400)] text-sm">Carregando…</p>
        </div>
      </div>
    )
  }

  if (erro || !initial) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">⚠️</div>
        <h1 className="text-xl font-bold mb-2 text-[var(--shell-text)]">Erro</h1>
        <p className="text-sm text-[var(--surface-500)] mb-3">{erro || 'Não foi possível carregar a clínica.'}</p>
        <Link href="/clinicas" className="text-cyan-500 hover:underline">← Voltar</Link>
      </div>
    )
  }

  return <EstabelecimentoForm modo="editar" initial={initial} />
}
