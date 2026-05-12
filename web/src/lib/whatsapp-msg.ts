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

/** Link com mensagem padrão de agendamento de despedida (texto pré-preenchido). */
export function linkAgendamentoDespedida(opts: {
  telefone: string | null | undefined
  tutorNome: string | null | undefined
  petNome: string | null | undefined
  petGenero: string | null | undefined
}): string {
  const fone = fonenum(opts.telefone)
  if (!fone) return ''
  const nomeTutor = primeiroNome(opts.tutorNome || '')
  const artigo = opts.petGenero === 'femea' ? 'da' : 'do'
  const nomePet = opts.petNome ? tituloNome(opts.petNome) : 'seu pet'
  const msg = `Olá, ${nomeTutor}! Aqui é ${NOME_OPERADOR} da R.I.P. Pet Crematório de Animais. Como você está? 🙏

Gostaria de agendar a despedida ${artigo} ${nomePet} e saber se você quer vir até nossa Matriz em Pindamonhangaba para se despedir. Caso prefira, existe a opção de gravarmos um vídeo ou fazermos o acompanhamento online.

Sinto muito pela sua perda e espero que nossa equipe consiga trazer um pouco de conforto e tornar esse momento um pouco mais leve. 💙`
  return `https://api.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(msg)}`
}
