'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import Link from 'next/link'
import 'leaflet/dist/leaflet.css'

// ============================================
// Fix de ícone padrão (Next.js não consegue resolver paths do leaflet)
// ============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Ícones coloridos por política
function iconePorPolitica(politica: string | null) {
  const cores: Record<string, string> = {
    parceiro_exclusivo_nosso: '#16a34a', // verde
    parceiro_exclusivo_outro: '#dc2626', // vermelho
    aberto_todos: '#3b82f6',             // azul
    seletivo: '#eab308',                 // amarelo
    nao_indica: '#64748b',               // cinza
  }
  const cor = (politica && cores[politica]) || '#06b6d4' // cyan default
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${cor};
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  })
}

// ============================================
// Tipos
// ============================================
type ClinicaNoMapa = {
  id: string
  nome: string
  tipo: string | null
  cidade: string | null
  bairro: string | null
  endereco: string | null
  latitude: number | null
  longitude: number | null
  politica_concorrencia: string | null
}

type Props = {
  clinicas: ClinicaNoMapa[]
  centro?: [number, number]
  zoom?: number
}

// ============================================
// Auto-fit pra mostrar todos os marcadores
// ============================================
function FitBounds({ clinicas }: { clinicas: ClinicaNoMapa[] }) {
  const map = useMap()
  useEffect(() => {
    const comCoords = clinicas.filter(c => c.latitude != null && c.longitude != null)
    if (comCoords.length === 0) return
    if (comCoords.length === 1) {
      const c = comCoords[0]
      map.setView([c.latitude!, c.longitude!], 14)
      return
    }
    const bounds = L.latLngBounds(comCoords.map(c => [c.latitude!, c.longitude!]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [clinicas, map])
  return null
}

// ============================================
// Componente principal
// ============================================
export default function MapaClinicas({ clinicas, centro, zoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const { semCoords, totalComCoords, centroDefault } = useMemo(() => {
    const comCoords = clinicas.filter(c => c.latitude != null && c.longitude != null)
    let centro: [number, number] = [-23.95, -46.33] // Santos default
    if (comCoords.length > 0) {
      const latAvg = comCoords.reduce((s, c) => s + (c.latitude || 0), 0) / comCoords.length
      const lngAvg = comCoords.reduce((s, c) => s + (c.longitude || 0), 0) / comCoords.length
      centro = [latAvg, lngAvg]
    }
    return {
      semCoords: clinicas.length - comCoords.length,
      totalComCoords: comCoords.length,
      centroDefault: centro,
    }
  }, [clinicas])

  return (
    <div className="space-y-3">
      {semCoords > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          ⚠️ {semCoords} clínica{semCoords === 1 ? '' : 's'} sem coordenadas geográficas (não aparece{semCoords === 1 ? '' : 'm'} no mapa).
          Edite a clínica para adicionar latitude/longitude — ou use o "Buscar no Google" no formulário.
        </div>
      )}

      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-[var(--surface-200)]"
        style={{ height: 'calc(100vh - 260px)', minHeight: 400 }}
      >
        <MapContainer
          center={centro || centroDefault}
          zoom={zoom ?? 12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {clinicas
            .filter(c => c.latitude != null && c.longitude != null)
            .map(c => (
              <Marker
                key={c.id}
                position={[c.latitude!, c.longitude!]}
                icon={iconePorPolitica(c.politica_concorrencia)}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold mb-1">{c.nome}</p>
                    {c.endereco && <p className="text-xs text-slate-600">{c.endereco}</p>}
                    {(c.bairro || c.cidade) && <p className="text-xs text-slate-500">{[c.bairro, c.cidade].filter(Boolean).join(', ')}</p>}
                    <Link
                      href={`/clinicas/${c.id}`}
                      className="inline-block mt-2 px-2 py-1 rounded bg-cyan-600 text-white text-[10px] font-semibold hover:bg-cyan-700"
                    >
                      Abrir clínica →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          <FitBounds clinicas={clinicas} />
        </MapContainer>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        <span className="text-[var(--surface-500)] font-semibold">{totalComCoords} no mapa</span>
        <Legenda cor="#16a34a" label="Exclusivo conosco" />
        <Legenda cor="#3b82f6" label="Aberto a todos" />
        <Legenda cor="#eab308" label="Seletivo" />
        <Legenda cor="#dc2626" label="Exclusivo com outro" />
        <Legenda cor="#64748b" label="Não indica" />
        <Legenda cor="#06b6d4" label="Sem política" />
      </div>
    </div>
  )
}

function Legenda({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--shell-text)]">
      <span style={{ background: cor, width: 10, height: 10, borderRadius: 999, display: 'inline-block' }} />
      {label}
    </span>
  )
}
