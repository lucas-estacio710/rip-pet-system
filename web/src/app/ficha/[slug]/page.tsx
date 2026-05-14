'use client'

import { useParams } from 'next/navigation'
import FichaForm, { type FichaUnidadeConfig } from '@/components/ficha/FichaForm'

// Mapa estático de unidades — não depende de query no banco (RLS bloqueia anon)
const UNIDADES: Record<string, FichaUnidadeConfig> = {
  santos: {
    unidade_id: '94278414-ad10-4463-ba49-274474adb271',
    codigo: 'ST',
    nome: 'Santos',
    cidade: 'Santos',
    estado: 'SP',
    label: 'Unidade Santos',
    unidadeCompleta: 'Santos - SP',
    maxParcelas: 12,
  },
  'sao-paulo': {
    unidade_id: 'd2a2b491-036a-4091-a5b5-e3d31f103337',
    codigo: 'SP',
    nome: 'São Paulo',
    cidade: 'São Paulo',
    estado: 'SP',
    label: 'Unidade São Paulo',
    unidadeCompleta: 'São Paulo - SP',
    maxParcelas: 12,
  },
  campinas: {
    unidade_id: '4c737cfd-6ee6-4919-af54-7bbbd4ded38d',
    codigo: 'CP',
    nome: 'Campinas',
    cidade: 'Campinas',
    estado: 'SP',
    label: 'Unidade Campinas',
    unidadeCompleta: 'Campinas - SP',
    maxParcelas: 10,
  },
  sjc: {
    unidade_id: '883bcc04-7885-4c46-93ee-696f452cc07c',
    codigo: 'SJ',
    nome: 'São José dos Campos',
    cidade: 'São José dos Campos',
    estado: 'SP',
    label: 'Unidade São José dos Campos',
    unidadeCompleta: 'São José dos Campos - SP',
    maxParcelas: 8,
  },
  pinda: {
    unidade_id: '69c5ed84-0aaa-424b-90c5-34221774e47b',
    codigo: 'PI',
    nome: 'Pindamonhangaba',
    cidade: 'Pindamonhangaba',
    estado: 'SP',
    label: 'Unidade Pindamonhangaba',
    unidadeCompleta: 'Pindamonhangaba - SP',
    maxParcelas: 8,
  },
  'pouso-alegre': {
    unidade_id: '0064285f-82f1-4146-971a-2a60b1350605',
    codigo: 'PA',
    nome: 'Pouso Alegre',
    cidade: 'Pouso Alegre',
    estado: 'MG',
    label: 'Unidade Pouso Alegre',
    unidadeCompleta: 'Pouso Alegre - MG',
    maxParcelas: 10,
  },
  resende: {
    unidade_id: '74bb7f77-3e68-480b-8b29-4b52f37c2e47',
    codigo: 'RS',
    nome: 'Resende',
    cidade: 'Resende',
    estado: 'RJ',
    label: 'Unidade Resende',
    unidadeCompleta: 'Resende - RJ',
    maxParcelas: 10,
  },
}

export default function FichaUnidade() {
  const params = useParams()
  const slug = params.slug as string
  const config = UNIDADES[slug]

  if (!config) {
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
