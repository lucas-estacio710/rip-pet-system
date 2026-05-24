'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X, MapPin, Phone, Globe } from 'lucide-react'

export type PlaceResult = {
  place_id: string
  nome: string
  endereco_completo: string
  endereco: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  latitude: number | null
  longitude: number | null
  types: string[]
  telefone: string | null
  website: string | null
}

type Props = {
  // Onde centralizar a busca (opcional — usa coords da unidade se disponível)
  centerLat?: number | null
  centerLng?: number | null
  onSelect: (place: PlaceResult) => void
}

export default function GooglePlacesSearch({ centerLat, centerLng, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (query.trim().length < 3) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setErro(null)
      try {
        const params = new URLSearchParams({ q: query })
        if (centerLat != null && centerLng != null) {
          params.set('lat', String(centerLat))
          params.set('lng', String(centerLng))
        }
        const r = await fetch(`/api/places/search?${params}`)
        const data = await r.json()
        if (!r.ok) {
          setErro(data.error || 'Erro ao buscar')
          setResults([])
        } else {
          setResults(data.results || [])
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro de rede')
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [query, open, centerLat, centerLng])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 inline-flex items-center gap-1 font-medium"
      >
        <Search className="h-3 w-3" /> Buscar no Google
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 p-4 bg-black/50 animate-fade-in" onClick={() => setOpen(false)}>
          <div
            className="bg-[var(--surface-0)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-[var(--surface-200)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[var(--surface-200)] flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--shell-text)] flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-500" />
                Buscar no Google Places
              </h2>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-[var(--surface-100)] text-[var(--surface-500)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder='Ex: "Clínica veterinária Saúde Pet, Santos"'
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-50)] border border-[var(--surface-200)] focus:outline-none focus:border-blue-500 text-[var(--shell-text)]"
              />
              {erro && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700">
                  {erro}
                </div>
              )}
              {centerLat != null && centerLng != null && (
                <p className="text-[10px] text-[var(--surface-400)]">
                  Resultados priorizados na região da unidade ativa.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
              {loading && <p className="text-center text-xs text-[var(--surface-400)] py-4">Buscando…</p>}
              {!loading && query.length >= 3 && results.length === 0 && !erro && (
                <p className="text-center text-xs text-[var(--surface-400)] py-4">Nenhum resultado.</p>
              )}
              {results.map(p => (
                <button
                  key={p.place_id}
                  type="button"
                  onClick={() => { onSelect(p); setOpen(false) }}
                  className="w-full text-left p-3 rounded-lg border border-[var(--surface-200)] hover:border-blue-500 hover:bg-blue-500/5 transition-colors"
                >
                  <p className="font-semibold text-sm text-[var(--shell-text)]">{p.nome}</p>
                  <div className="mt-1 space-y-0.5 text-xs text-[var(--surface-500)]">
                    {p.endereco_completo && (
                      <p className="inline-flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{p.endereco_completo}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 items-center mt-1">
                      {p.telefone && (
                        <span className="inline-flex items-center gap-0.5"><Phone className="h-3 w-3" /> {p.telefone}</span>
                      )}
                      {p.website && (
                        <span className="inline-flex items-center gap-0.5"><Globe className="h-3 w-3" /> Website</span>
                      )}
                      {p.latitude != null && p.longitude != null && (
                        <span className="text-[10px] text-[var(--surface-400)]">📍 lat/lng disponíveis</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-[var(--surface-200)] bg-[var(--surface-50)]">
              <p className="text-[10px] text-[var(--surface-400)]">
                Powered by Google Places API. Requer chave configurada em <code>GOOGLE_PLACES_API_KEY</code>.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
