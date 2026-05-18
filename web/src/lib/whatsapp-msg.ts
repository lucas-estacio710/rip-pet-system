// Helpers para montar links de WhatsApp (chat direto e mensagens prontas) de forma consistente.
import { primeiroNome } from '@/lib/nome-tutor'
import { tituloNome } from '@/lib/certificado-pdf'

const NOME_OPERADOR = 'Angela'

function fonenum(tel: string | null | undefined): string {
  return (tel || '').replace(/\D/g, '')
}

/** Link para abrir conversa direta (sem mensagem pré-preenchida). */
export function linkChatDireto(tel: string | null | undefined): string {
  const fone = fonenum(tel)
  if (!fone) return ''
  return `https://api.whatsapp.com/send?phone=${fone}`
}

/** Link com mensagem padrão de agendamento de despedida (texto pré-preenchido).
 *  Telefone e nome no "Olá" seguem o "principal" da ficha (tutor_telefone_principal).
 *  Nome: apelido do telefone ativo > primeiro nome do tutor (fallback).
 */
export function linkAgendamentoDespedida(opts: {
  // Telefone 1 (canônico — vem da ficha do tutor)
  telefone: string | null | undefined
  telefoneApelido?: string | null | undefined
  // Telefone 2 (opcional — adicionado pelo concierge)
  telefone2?: string | null | undefined
  telefone2Apelido?: string | null | undefined
  // Qual é o principal (1 = telefone, 2 = telefone2). Default = 1.
  telefonePrincipal?: number | null | undefined
  // Fallback caso o apelido do principal esteja vazio
  tutorNome: string | null | undefined
  petNome: string | null | undefined
  petGenero: string | null | undefined
}): string {
  // Decide telefone + apelido baseado em qual é o principal
  const usaSecundario = opts.telefonePrincipal === 2 && !!opts.telefone2
  const telAtivo = usaSecundario ? opts.telefone2 : opts.telefone
  const apelidoAtivo = usaSecundario ? opts.telefone2Apelido : opts.telefoneApelido

  const fone = fonenum(telAtivo)
  if (!fone) return ''

  // Nome no Olá: apelido do telefone ativo > primeiro nome do tutor
  const nomeTutor = (apelidoAtivo && apelidoAtivo.trim())
    ? primeiroNome(apelidoAtivo.trim())
    : primeiroNome(opts.tutorNome || '')

  const artigo = opts.petGenero === 'femea' ? 'da' : 'do'
  const nomePet = opts.petNome ? tituloNome(opts.petNome) : 'seu pet'
  const msg = `Olá, ${nomeTutor}! Aqui é ${NOME_OPERADOR} da R.I.P. Pet Crematório de Animais. Como você está? 🙏

Gostaria de agendar a despedida ${artigo} ${nomePet} e saber se você quer vir até nossa Matriz em Pindamonhangaba para se despedir. Caso prefira, existe a opção de gravarmos um vídeo ou fazermos o acompanhamento online.

Sinto muito pela sua perda e espero que nossa equipe consiga trazer um pouco de conforto e tornar esse momento um pouco mais leve. 💙`
  return `https://api.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(msg)}`
}
