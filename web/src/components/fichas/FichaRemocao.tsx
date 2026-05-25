'use client'

import { forwardRef } from 'react'

/**
 * Ficha de Remoção — usa o template `/images/ficha-remocao-template.png` (398x512)
 * como fundo e posiciona os textos por X/Y absoluto em cima.
 *
 * Para preencher 100%, o chamador deve resolver antes de passar:
 *   - clinica_veterinaria: contratos.clinica_coleta OU estabelecimentos.nome via estabelecimento_id
 *   - colaborador_responsavel: funcionarios.nome via contratos.funcionario_id
 *   - certificado_nome_1..7: já existem no contrato
 */
export type FichaContratoData = {
  id?: string                          // UUID — usado no canto sup. direito como "Código interno de autenticação"
  codigo: string                       // mantido por compat (não usado no novo layout)
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
  certificado_nome_1?: string | null
  certificado_nome_2?: string | null
  certificado_nome_3?: string | null
  certificado_nome_4?: string | null
  certificado_nome_5?: string | null
  certificado_nome_6?: string | null
  certificado_nome_7?: string | null
  local_coleta?: string | null
  clinica_veterinaria?: string | null
  colaborador_responsavel?: string | null
  observacoes?: string | null
  // Compat com chamadores legados — não usado neste layout
  tutor_nome?: string | null
  tutor_bairro?: string | null
  tutor_cidade?: string | null
  tutor?: { nome?: string | null; bairro?: string | null; cidade?: string | null } | null
}

const TEMPLATE_W = 398
const TEMPLATE_H = 512
const TEMPLATE_URL = '/images/ficha-remocao-template.png'

function parteData(d?: string | null) {
  if (!d) return { dd: '', mm: '', yyyy: '', hh: '', min: '' }
  const dt = new Date(d)
  return {
    dd: String(dt.getDate()).padStart(2, '0'),
    mm: String(dt.getMonth() + 1).padStart(2, '0'),
    yyyy: String(dt.getFullYear()),
    hh: String(dt.getHours()).padStart(2, '0'),
    min: String(dt.getMinutes()).padStart(2, '0'),
  }
}

// Estilo base de cada campo (texto inserido sobre o template).
// IMPORTANTE: sem `overflow: hidden` — combinado com lineHeight baixo, estava cortando
// descenders (g, p, q, y) na metade horizontal. Width controla onde o texto pára.
const BASE_FIELD: React.CSSProperties = {
  position: 'absolute',
  fontFamily: 'Arial, sans-serif',
  fontSize: 11,
  color: '#1d4ed8',   // azul royal (Tailwind blue-700) — destaca dados preenchidos sobre o template P&B
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
}

const FichaRemocao = forwardRef<HTMLDivElement, { contrato: FichaContratoData }>(
  function FichaRemocao({ contrato }, ref) {
    const isCol = contrato.tipo_cremacao === 'coletiva'
    const isInd = contrato.tipo_cremacao === 'individual'
    const d = parteData(contrato.data_acolhimento)
    const nomes = [
      contrato.certificado_nome_1, contrato.certificado_nome_2, contrato.certificado_nome_3,
      contrato.certificado_nome_4, contrato.certificado_nome_5, contrato.certificado_nome_6,
      contrato.certificado_nome_7,
    ]

    return (
      <div
        ref={ref}
        style={{
          position: 'relative',
          width: TEMPLATE_W,
          height: TEMPLATE_H,
          background: '#fff',
        }}
      >
        {/* Template como fundo */}
        <img
          src={TEMPLATE_URL}
          alt="Template"
          width={TEMPLATE_W}
          height={TEMPLATE_H}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', userSelect: 'none', pointerEvents: 'none' }}
        />

        {/* Código interno de autenticação — UUID do contrato (cara de código de banco) */}
        <div style={{ ...BASE_FIELD, top: 23, right: 22, textAlign: 'right', fontWeight: 600, fontSize: 9, fontFamily: 'monospace' }}>
          {contrato.id || contrato.codigo}
        </div>

        {/* N° do Lacre */}
        <div style={{ ...BASE_FIELD, top: 71, left: 227, width: 100, fontWeight: 700, fontSize: 14 }}>
          {contrato.numero_lacre || ''}
        </div>

        {/* Tipo de Cremação — X dentro do parêntese */}
        <div style={{ ...BASE_FIELD, top: 97, left: 182, fontWeight: 700, fontSize: 12 }}>
          {isCol ? 'X' : ''}
        </div>
        <div style={{ ...BASE_FIELD, top: 97, left: 268, fontWeight: 700, fontSize: 12 }}>
          {isInd ? 'X' : ''}
        </div>

        {/* Data/hora de Acolhimento */}
        <div style={{ ...BASE_FIELD, top: 117, left: 183, width: 22, textAlign: 'center' }}>{d.dd}</div>
        <div style={{ ...BASE_FIELD, top: 117, left: 222, width: 22, textAlign: 'center' }}>{d.mm}</div>
        <div style={{ ...BASE_FIELD, top: 117, left: 259, width: 38, textAlign: 'center' }}>{d.yyyy}</div>
        <div style={{ ...BASE_FIELD, top: 117, left: 315, width: 22, textAlign: 'center' }}>{d.hh}</div>
        <div style={{ ...BASE_FIELD, top: 117, left: 345, width: 22, textAlign: 'center' }}>{d.min}</div>

        {/* Nome do Animal */}
        <div style={{ ...BASE_FIELD, top: 152, left: 118, width: 257 }}>{contrato.pet_nome}</div>

        {/* Espécie / Raça / Cor */}
        <div style={{ ...BASE_FIELD, top: 171, left: 70, width: 55 }}>{contrato.pet_especie || ''}</div>
        <div style={{ ...BASE_FIELD, top: 171, left: 146, width: 90 }}>{contrato.pet_raca || ''}</div>
        <div style={{ ...BASE_FIELD, top: 173, left: 290, width: 90, fontSize: 9 }}>{contrato.pet_cor || ''}</div>

        {/* Idade / Peso / Sexo */}
        <div style={{ ...BASE_FIELD, top: 190, left: 61, width: 50 }}>
          {contrato.pet_idade_anos ? `${contrato.pet_idade_anos} anos` : ''}
        </div>
        <div style={{ ...BASE_FIELD, top: 190, left: 199, width: 80 }}>
          {contrato.pet_peso ? `${contrato.pet_peso} kg` : ''}
        </div>
        <div style={{ ...BASE_FIELD, top: 189, left: 315, width: 70 }}>
          {contrato.pet_genero === 'macho' ? 'Macho' : contrato.pet_genero === 'femea' ? 'Fêmea' : ''}
        </div>

        {/* Tutor(es) — 7 nomes. Step 20px (18 + 2px de compensação acumulada por linha) */}
        {nomes.map((n, i) => (
          <div key={i} style={{ ...BASE_FIELD, top: 215 + i * 20, left: 74, width: 306 }}>
            {n || ''}
          </div>
        ))}

        {/* Clínica Veterinária */}
        <div style={{ ...BASE_FIELD, top: 364, left: 128, width: 247 }}>
          {contrato.clinica_veterinaria || contrato.local_coleta || ''}
        </div>

        {/* Colaborador resp. acolhimento — vem de contratos.funcionario.nome */}
        <div style={{ ...BASE_FIELD, top: 391, left: 203, width: 177 }}>
          {contrato.colaborador_responsavel || ''}
        </div>

        {/* Observações especiais (pode ocupar mais de 1 linha) */}
        <div style={{ ...BASE_FIELD, top: 457, left: 20, width: 360, whiteSpace: 'normal', fontSize: 9 }}>
          {contrato.observacoes || ''}
        </div>
      </div>
    )
  }
)

export default FichaRemocao
