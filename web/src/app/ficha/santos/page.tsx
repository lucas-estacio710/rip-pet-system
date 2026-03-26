'use client'

import FichaForm, { type FichaUnidadeConfig } from '@/components/ficha/FichaForm'

// Santos tem config chumbada (não precisa buscar do Supabase)
const SANTOS_CONFIG: FichaUnidadeConfig = {
  unidade_id: '94278414-ad10-4463-ba49-274474adb271',
  codigo: 'ST',
  nome: 'Santos',
  cidade: 'Santos',
  estado: 'SP',
  label: 'Unidade Santos',
  unidadeCompleta: 'Santos - SP',
}

export default function FichaSantos() {
  return <FichaForm config={SANTOS_CONFIG} />
}
