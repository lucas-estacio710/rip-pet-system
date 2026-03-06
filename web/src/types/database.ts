// Tipos gerados automaticamente pelo Supabase CLI
// Para gerar: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts

export type Database = {
  public: {
    Tables: {
      tutores: {
        Row: {
          id: string
          nome: string
          cpf: string | null
          telefone: string | null
          telefone2: string | null
          email: string | null
          cep: string | null
          endereco: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          cidade: string | null
          estado: string | null
          observacoes: string | null
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tutores']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tutores']['Insert']>
      }
      contratos: {
        Row: {
          id: string
          codigo: string
          status: 'preventivo' | 'ativo' | 'pinda' | 'retorno' | 'pendente' | 'finalizado'
          tipo_cremacao: 'individual' | 'coletiva'
          tipo_plano: 'emergencial' | 'preventivo'
          pet_nome: string
          pet_especie: 'canina' | 'felina' | 'exotica'
          pet_raca: string | null
          pet_genero: 'macho' | 'femea' | null
          pet_peso: number | null
          pet_idade_anos: number | null
          pet_cor: string | null
          tutor_id: string | null  // NOVO: referência à tabela tutores
          // Campos legados mantidos para compatibilidade
          tutor_nome: string
          tutor_cpf: string | null
          tutor_email: string | null
          tutor_telefone: string | null
          tutor_telefone2: string | null
          tutor_cidade: string | null
          tutor_bairro: string | null
          tutor_endereco: string | null
          tutor_cep: string | null
          tutor_numero: string | null
          tutor_complemento: string | null
          tutor_estado: string | null
          local_coleta: string | null
          indicador_id: string | null
          fonte_conhecimento_id: string | null
          funcionario_id: string | null
          data_contrato: string | null
          data_acolhimento: string | null
          data_leva_pinda: string | null
          data_cremacao: string | null
          data_retorno: string | null
          data_entrega: string | null
          supinda_id: string | null
          valor_plano: number | null
          desconto_plano: number
          valor_acessorios: number
          desconto_acessorios: number
          custo_cremacao: number | null
          numero_lacre: string | null
          velorio_deseja: boolean | null
          velorio_agendado_para: string | null
          velorio_realizado: boolean
          acompanhamento_online: boolean
          acompanhamento_presencial: boolean
          tutor_vet_segmento: boolean
          observacoes: string | null
          latitude: number | null
          longitude: number | null
          // Campos do pelinho (rescaldo padrão)
          pelinho_quer: boolean | null  // null=não definido, true=quer, false=não quer
          pelinho_feito: boolean
          pelinho_quantidade: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contratos']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contratos']['Insert']>
      }
      // ... outras tabelas serão geradas pelo Supabase CLI
    }
    Enums: {
      status_atendimento: 'preventivo' | 'ativo' | 'pinda' | 'retorno' | 'pendente' | 'finalizado'
      tipo_cremacao: 'individual' | 'coletiva'
      tipo_plano: 'emergencial' | 'preventivo'
      especie_pet: 'canina' | 'felina' | 'exotica'
      genero_pet: 'macho' | 'femea'
      tipo_produto: 'urna' | 'acessorio' | 'incluso'
      metodo_pagamento: 'pix' | 'dinheiro' | 'credito' | 'debito'
      tipo_rescaldo: 'molde_patinha' | 'pelinho' | 'pelo_extra' | 'carimbo'
      status_rescaldo: 'nao_pediu' | 'pendente' | 'feito'
      destino_item_pessoal: 'doar' | 'descartar' | 'retornar' | 'cremar_junto'
      status_rota: 'planejada' | 'em_andamento' | 'concluida' | 'cancelada'
      periodo_dia: 'manha' | 'tarde' | 'dia_todo'
      dia_semana: 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado'
      direcao_emprestimo: 'emprestamos' | 'tomamos_emprestado'
    }
  }
}

// Tipos auxiliares para facilitar o uso
export type Tutor = Database['public']['Tables']['tutores']['Row']
export type TutorInsert = Database['public']['Tables']['tutores']['Insert']
export type TutorUpdate = Database['public']['Tables']['tutores']['Update']

export type Contrato = Database['public']['Tables']['contratos']['Row']
export type ContratoInsert = Database['public']['Tables']['contratos']['Insert']
export type ContratoUpdate = Database['public']['Tables']['contratos']['Update']

// Contrato com tutor expandido (para queries com join)
export type ContratoComTutor = Contrato & {
  tutor?: Tutor | null
}

export type StatusAtendimento = Database['public']['Enums']['status_atendimento']
export type TipoCremacao = Database['public']['Enums']['tipo_cremacao']
export type TipoPlano = Database['public']['Enums']['tipo_plano']
