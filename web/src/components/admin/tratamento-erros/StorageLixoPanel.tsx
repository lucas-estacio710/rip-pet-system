'use client'

// Limpeza do lixo de Storage (migration 147). O Postgres não alcança o bucket: quando uma tarefa
// é deletada (o "Desatribuir" de /tarefas deleta a linha), a foto some do banco por CASCADE e o
// ARQUIVO fica — pago e invisível. O trigger enfileira o path em `storage_lixo`; esta tela é
// quem esvazia, por uma rota com service_role (o bucket não tem DELETE para usuário logado).

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trash2, Loader2, CheckCircle2, AlertTriangle, HardDrive } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type Resumo = {
  pendentes: number
  apagaveis: number
  aindaEmUso: number
  amostra: { id: string; bucket: string; path: string; motivo: string | null; registrado_em: string }[]
}

export default function StorageLixoPanel() {
  const supabase = createClient()
  const { toast } = useToast()
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [limpando, setLimpando] = useState(false)
  const [consumo, setConsumo] = useState<{ fotos: number; bytes: number } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/storage-lixo', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar')
      setResumo(json)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar', 'error')
    } finally {
      setCarregando(false)
    }
  }, [supabase, toast])

  // Consumo real das fotos de tarefa — sai de SUM(bytes), sem varrer o bucket (é pra isso que a
  // coluna existe). Paginado: o teto do PostgREST é 1000 linhas.
  const carregarConsumo = useCallback(async () => {
    let de = 0
    let total = 0
    let bytes = 0
    for (;;) {
      const { data } = await supabase
        .from('tarefa_fotos')
        .select('bytes, path')
        .range(de, de + 999) as { data: { bytes: number; path: string }[] | null }
      if (!data || data.length === 0) break
      // Um lote ×N tem N linhas com o MESMO path e 1 objeto só no bucket — contar as N
      // inflaria o consumo. Conta objeto, não linha.
      const vistos = new Set<string>()
      for (const f of data) {
        if (vistos.has(f.path)) continue
        vistos.add(f.path)
        total += 1
        bytes += f.bytes
      }
      if (data.length < 1000) break
      de += 1000
    }
    setConsumo({ fotos: total, bytes })
  }, [supabase])

  useEffect(() => { carregar(); carregarConsumo() }, [carregar, carregarConsumo])

  async function limpar() {
    setLimpando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/storage-lixo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao limpar')
      toast(
        `${json.apagados} arquivo(s) apagado(s)` +
        (json.mantidos ? ` · ${json.mantidos} mantido(s) (ainda em uso pelo lote)` : '') +
        (json.falhas ? ` · ${json.falhas} falha(s)` : ''),
        json.falhas ? 'error' : 'success',
      )
      await carregar()
      await carregarConsumo()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao limpar', 'error')
    } finally {
      setLimpando(false)
    }
  }

  const mb = (b: number) => (b / 1048576).toFixed(1)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--surface-800)]">Limpeza de arquivos órfãos</h2>
        <p className="text-sm text-[var(--surface-500)]">
          Fotos de tarefa cujo registro sumiu do banco (tarefa deletada ou desatribuída). O arquivo continua
          ocupando espaço até ser apagado aqui.
        </p>
      </div>

      {/* Consumo — o número que justifica a feature inteira existir do jeito que existe. */}
      <div className="p-3 rounded-lg border border-[var(--surface-200)] bg-[var(--surface-50)]">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--surface-500)] mb-1">
          <HardDrive className="h-3.5 w-3.5" /> Fotos de tarefa hoje
        </p>
        {consumo ? (
          <p className="text-sm text-[var(--surface-700)]">
            <strong>{consumo.fotos}</strong> foto(s) · <strong>{mb(consumo.bytes)} MB</strong>
            {consumo.fotos > 0 && (
              <span className="text-[var(--surface-500)]"> · média de {Math.round(consumo.bytes / consumo.fotos / 1024)} KB</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-[var(--surface-400)]">Calculando...</p>
        )}
        <p className="text-[10px] text-[var(--surface-500)] mt-1">
          Alvo por foto: ~150 KB. Média muito acima disso significa que a compressão parou de funcionar em
          algum aparelho — é o sinal de alerta que faz a conta crescer.
        </p>
      </div>

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--surface-500)]"><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</p>
      ) : !resumo ? null : resumo.pendentes === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-500">
          <CheckCircle2 className="h-4 w-4" /> Nenhum arquivo órfão. Nada a limpar.
        </p>
      ) : (
        <>
          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-500">
              <AlertTriangle className="h-4 w-4" /> {resumo.pendentes} arquivo(s) na fila
            </p>
            <p className="text-xs text-[var(--surface-600)] mt-1">
              {resumo.apagaveis} podem ser apagados agora.
              {resumo.aindaEmUso > 0 && (
                <> {resumo.aindaEmUso} <strong>não</strong> — o arquivo ainda pertence a outra tarefa do mesmo
                lote (um rescaldo ×N divide uma foto só). Esses saem da fila sem ser apagados.</>
              )}
            </p>
          </div>

          {resumo.amostra.length > 0 && (
            <div className="rounded-lg border border-[var(--surface-200)] divide-y divide-[var(--surface-200)]">
              {resumo.amostra.map(l => (
                <div key={l.id} className="px-3 py-2">
                  <p className="text-xs font-mono text-[var(--surface-700)] truncate">{l.bucket}/{l.path}</p>
                  <p className="text-[10px] text-[var(--surface-500)]">
                    {new Date(l.registrado_em).toLocaleString('pt-BR')}{l.motivo ? ` · ${l.motivo}` : ''}
                  </p>
                </div>
              ))}
              {resumo.apagaveis > resumo.amostra.length && (
                <p className="px-3 py-2 text-[10px] text-[var(--surface-500)]">
                  ... e mais {resumo.apagaveis - resumo.amostra.length}. A limpeza processa até 500 por vez.
                </p>
              )}
            </div>
          )}

          <button
            onClick={limpar}
            disabled={limpando}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 disabled:opacity-50"
          >
            {limpando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {limpando ? 'Limpando...' : 'Apagar arquivos órfãos'}
          </button>
        </>
      )}
    </div>
  )
}
