'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'

/**
 * Bolinha flutuante estilo WhatsApp no canto inferior direito.
 * Mostra contadores de pets no "carrinho" (supinda planejada).
 * Vermelho = ida (ativo → pinda), Amarelo = volta (cinzas voltando).
 * Clica → vai pra /supindas (checkout).
 */
export default function CarrinhoEncaminhamento() {
  const supabase = createClient()
  const router = useRouter()
  const { currentUnit } = useUnit()

  const [countIda, setCountIda] = useState(0)
  const [countVolta, setCountVolta] = useState(0)
  const [supindaId, setSupindaId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentUnit?.id) return
    carregarCarrinho()

    // Realtime: escuta mudanças em contratos e supindas
    const channel = supabase
      .channel('carrinho-enc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contratos' }, () => carregarCarrinho())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supindas' }, () => carregarCarrinho())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUnit?.id])

  async function carregarCarrinho() {
    if (!currentUnit?.id) return

    // Buscar supinda planejada da unidade (carrinho aberto)
    const { data: supinda } = await supabase
      .from('supindas')
      .select('id')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'planejada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { id: string } | null }

    if (!supinda) {
      setSupindaId(null)
      setCountIda(0)
      setCountVolta(0)
      return
    }

    setSupindaId(supinda.id)

    // Contar contratos vinculados por direção
    const { data: contratos } = await supabase
      .from('contratos')
      .select('supinda_direcao')
      .eq('supinda_id', supinda.id) as { data: { supinda_direcao: string | null }[] | null }

    const ida = (contratos || []).filter(c => c.supinda_direcao === 'ida' || !c.supinda_direcao).length
    const volta = (contratos || []).filter(c => c.supinda_direcao === 'volta').length
    setCountIda(ida)
    setCountVolta(volta)
  }

  const total = countIda + countVolta
  if (total === 0) return null

  return (
    <button
      onClick={() => router.push('/supindas')}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95"
      style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}
      title="Ver encaminhamento — clique pra fechar"
    >
      <span className="text-xl">🚐</span>
      <div className="flex items-center gap-1.5">
        {countIda > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
            {countIda}
          </span>
        )}
        {countVolta > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-amber-900 text-[11px] font-bold">
            {countVolta}
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Adiciona contrato ao carrinho (supinda planejada).
 * Se não existe supinda planejada, cria uma.
 * Retorna o ID da supinda.
 */
export async function adicionarAoCarrinho(
  supabase: ReturnType<typeof createClient>,
  contratoId: string,
  direcao: 'ida' | 'volta',
  unidadeId: string,
  unidadeCodigo: string
): Promise<string | null> {
  try {
    // Buscar supinda planejada existente
    let { data: supinda } = await supabase
      .from('supindas')
      .select('id')
      .eq('unidade_id', unidadeId)
      .eq('status', 'planejada')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { id: string } | null }

    // Se não tem, criar
    if (!supinda) {
      const prefixo = unidadeCodigo || 'XX'
      const { data: existentes } = await supabase
        .from('supindas')
        .select('numero')
        .like('numero', `${prefixo}%`)

      const maxNum = (existentes || []).reduce((max: number, s: any) => {
        const num = parseInt(s.numero.replace(prefixo, ''), 10)
        return isNaN(num) ? max : Math.max(max, num)
      }, 0)

      const { data: nova, error } = await supabase
        .from('supindas')
        .insert({
          numero: `${prefixo}${maxNum + 1}`,
          data: new Date().toISOString().split('T')[0],
          status: 'planejada',
          quantidade_pets: 0,
          peso_total: 0,
          unidade_id: unidadeId,
        } as never)
        .select('id')
        .single()

      if (error || !nova) return null
      supinda = nova as { id: string }
    }

    // Vincular contrato à supinda
    await supabase
      .from('contratos')
      .update({
        supinda_id: supinda.id,
        supinda_direcao: direcao,
      } as never)
      .eq('id', contratoId)

    // Recalcular estatísticas
    const { data: vinculados } = await supabase
      .from('contratos')
      .select('pet_peso')
      .eq('supinda_id', supinda.id) as { data: { pet_peso: number | null }[] | null }

    const qtd = (vinculados || []).length
    const peso = (vinculados || []).reduce((s, c) => s + (c.pet_peso || 0), 0)

    await supabase
      .from('supindas')
      .update({ quantidade_pets: qtd, peso_total: peso } as never)
      .eq('id', supinda.id)

    return supinda.id
  } catch (err) {
    console.error('Erro ao adicionar ao carrinho:', err)
    return null
  }
}

/**
 * Remove contrato do carrinho (desvincula da supinda).
 */
export async function removerDoCarrinho(
  supabase: ReturnType<typeof createClient>,
  contratoId: string,
  supindaId: string
): Promise<void> {
  await supabase
    .from('contratos')
    .update({ supinda_id: null, supinda_direcao: null } as never)
    .eq('id', contratoId)

  // Recalcular
  const { data: vinculados } = await supabase
    .from('contratos')
    .select('pet_peso')
    .eq('supinda_id', supindaId) as { data: { pet_peso: number | null }[] | null }

  const qtd = (vinculados || []).length
  const peso = (vinculados || []).reduce((s, c) => s + (c.pet_peso || 0), 0)

  await supabase
    .from('supindas')
    .update({ quantidade_pets: qtd, peso_total: peso } as never)
    .eq('id', supindaId)

  // Se ficou vazio, deletar a supinda
  if (qtd === 0) {
    await supabase.from('supindas').delete().eq('id', supindaId).eq('status', 'planejada')
  }
}
