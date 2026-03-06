'use client'

import { forwardRef } from 'react'

export type FichaContratoData = {
  codigo: string
  numero_lacre?: string | null
  tipo_cremacao: 'individual' | 'coletiva'
  data_acolhimento?: string | null
  pet_nome: string
  pet_especie?: string | null
  pet_raca?: string | null
  pet_cor?: string | null
  pet_idade_anos?: number | null
  pet_peso?: number | null
  pet_genero?: string | null
  tutor_nome?: string | null
  tutor_bairro?: string | null
  tutor_cidade?: string | null
  local_coleta?: string | null
  observacoes?: string | null
  tutor?: {
    nome?: string | null
    bairro?: string | null
    cidade?: string | null
  } | null
}

function formatarDataFicha(data: string | null | undefined): string {
  if (!data) return '__/__/____'
  const d = new Date(data)
  return d.toLocaleDateString('pt-BR')
}

function formatarHoraFicha(data: string | null | undefined): string {
  if (!data) return '__:__'
  const d = new Date(data)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Cores em hex para compatibilidade com html2canvas (Tailwind v4 usa lab/oklch que html2canvas nao suporta)
const C = {
  white: '#ffffff',
  black: '#000000',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  yellow50: '#fefce8',
  purple200: '#e9d5ff',
  purple300: '#d8b4fe',
  purple400: '#c084fc',
  purple600: '#9333ea',
  purple800: '#6b21a8',
  purple900: '#581c87',
  purpleBg: '#faf5ff',
  blue200: '#bfdbfe',
  blue300: '#93c5fd',
  blue800: '#1e40af',
  blueBg: '#eff6ff',
}

const FichaRemocao = forwardRef<HTMLDivElement, { contrato: FichaContratoData }>(
  function FichaRemocao({ contrato }, ref) {
    const isColetiva = contrato.tipo_cremacao === 'coletiva'
    const isIndividual = contrato.tipo_cremacao === 'individual'

    return (
      <div
        ref={ref}
        style={{
          fontFamily: 'Arial, sans-serif',
          width: 480,
          background: C.white,
          border: `2px solid ${C.gray800}`,
          borderRadius: 8,
          overflow: 'hidden',
          color: C.black,
          fontSize: 14,
          lineHeight: 1.4,
        }}
      >
        {/* Cabecalho */}
        <div style={{ background: `linear-gradient(to right, ${C.purple600}, ${C.purple800})`, color: C.white, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, background: C.white, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 24 }}>&#x1F43E;</span>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>R.I.P. PET</div>
                <div style={{ color: C.purple200, fontSize: 12 }}>Crematorio de Animais</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 14 }}>
              <div style={{ fontWeight: 700 }}>&#x1F4DE; (13) 99602-0550</div>
              <div style={{ color: C.purple200 }}>24h</div>
            </div>
          </div>
        </div>

        {/* Titulo */}
        <div style={{ background: C.gray100, padding: '8px 0', textAlign: 'center', borderBottom: `2px solid ${C.gray800}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.gray800, letterSpacing: 4 }}>FICHA DE REMOCAO</div>
        </div>

        {/* Conteudo */}
        <div style={{ padding: 16 }}>
          {/* Lacre e Codigo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: C.gray700 }}>N Lacre:</span>
              <span style={{ flex: 1, borderBottom: `1px solid ${C.gray400}`, padding: '4px 8px', background: C.yellow50, fontFamily: 'monospace' }}>
                {contrato.numero_lacre || '_____________'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: C.gray700 }}>Codigo:</span>
              <span style={{ flex: 1, borderBottom: `1px solid ${C.gray400}`, padding: '4px 8px', background: C.gray50, fontFamily: 'monospace' }}>
                {contrato.codigo}
              </span>
            </div>
          </div>

          {/* Tipo de Cremacao */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 12px', border: `1px solid ${C.gray300}`, borderRadius: 8, background: C.gray50, marginBottom: 12 }}>
            <span style={{ fontWeight: 700, color: C.gray700 }}>Cremacao:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isColetiva ? C.purple600 : C.gray400}`,
                background: isColetiva ? C.purple600 : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isColetiva && <span style={{ color: C.white, fontSize: 12 }}>&#x2713;</span>}
              </span>
              <span style={{ fontWeight: isColetiva ? 700 : 400 }}>Coletiva</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isIndividual ? C.purple600 : C.gray400}`,
                background: isIndividual ? C.purple600 : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isIndividual && <span style={{ color: C.white, fontSize: 12 }}>&#x2713;</span>}
              </span>
              <span style={{ fontWeight: isIndividual ? 700 : 400 }}>Individual</span>
            </label>
          </div>

          {/* Data e Hora */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: C.gray700 }}>&#x1F4C5; Data:</span>
              <span style={{ flex: 1, borderBottom: `1px solid ${C.gray400}`, padding: '4px 8px', background: C.gray50 }}>
                {formatarDataFicha(contrato.data_acolhimento)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, color: C.gray700 }}>&#x1F550; Hora:</span>
              <span style={{ flex: 1, borderBottom: `1px solid ${C.gray400}`, padding: '4px 8px', background: C.gray50 }}>
                {formatarHoraFicha(contrato.data_acolhimento)}
              </span>
            </div>
          </div>

          {/* Divisoria */}
          <div style={{ borderTop: `2px dashed ${C.gray300}`, margin: '8px 0' }} />

          {/* Dados do Animal */}
          <div style={{ background: C.purpleBg, borderRadius: 8, padding: 12, border: `1px solid ${C.purple200}`, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: C.purple800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              &#x1F43E; DADOS DO ANIMAL
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: C.gray700, width: 96 }}>Nome:</span>
                <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '4px 8px', background: C.white, fontWeight: 600, color: C.purple900 }}>
                  {contrato.pet_nome}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Especie:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.pet_especie || '___'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Raca:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.pet_raca || '___'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Cor:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.pet_cor || '___'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Idade:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.pet_idade_anos ? `${contrato.pet_idade_anos} anos` : '___'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Peso:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.pet_peso ? `${contrato.pet_peso} kg` : '___'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Sexo:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.purple300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.pet_genero === 'macho' ? 'M' : contrato.pet_genero === 'femea' ? 'F' : '___'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Dados do Tutor */}
          <div style={{ background: C.blueBg, borderRadius: 8, padding: 12, border: `1px solid ${C.blue200}`, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: C.blue800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              &#x1F464; DADOS DO TUTOR
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: C.gray700, width: 64 }}>Nome:</span>
                <span style={{ flex: 1, borderBottom: `1px solid ${C.blue300}`, padding: '4px 8px', background: C.white }}>
                  {contrato.tutor?.nome || contrato.tutor_nome}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Bairro:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.blue300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.tutor?.bairro || contrato.tutor_bairro || '___'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700, color: C.gray700, fontSize: 12 }}>Cidade:</span>
                  <span style={{ flex: 1, borderBottom: `1px solid ${C.blue300}`, padding: '0 4px', background: C.white, fontSize: 12 }}>
                    {contrato.tutor?.cidade || contrato.tutor_cidade || '___'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Local de Coleta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontWeight: 700, color: C.gray700 }}>&#x1F4CD; Local da Coleta:</span>
            <span style={{ flex: 1, borderBottom: `1px solid ${C.gray400}`, padding: '4px 8px', background: C.gray50 }}>
              {contrato.local_coleta || '___________________________'}
            </span>
          </div>

          {/* Observacoes */}
          <div>
            <span style={{ fontWeight: 700, color: C.gray700, display: 'block', marginBottom: 4 }}>&#x1F4DD; Observacoes:</span>
            <div style={{ border: `1px solid ${C.gray300}`, borderRadius: 8, padding: 8, background: C.gray50, minHeight: 60, fontSize: 12 }}>
              {contrato.observacoes || 'Sem observacoes'}
            </div>
          </div>
        </div>

        {/* Rodape */}
        <div style={{ background: C.gray100, padding: 12, textAlign: 'center', fontSize: 12, color: C.gray600, borderTop: `1px solid ${C.gray300}` }}>
          <div>Av. Coronel Joaquim Montenegro, 334 - Ponta da Praia, Santos/SP</div>
          <div style={{ fontWeight: 600, color: C.purple400 }}>www.rippet.com.br</div>
        </div>
      </div>
    )
  }
)

export default FichaRemocao
