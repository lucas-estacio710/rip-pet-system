import { Resend } from 'resend'
import { NextResponse, NextRequest } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

// Email de destino do operador
// TODO: trocar para 'rippetsantos@gmail.com' quando domínio rippet.com.br verificar no Resend
const OPERADOR_EMAIL = 'lucasmestacio@gmail.com'

type FichaPayload = {
  unidade: string
  nome_completo: string
  cpf: string
  telefone: string
  email: string | null
  cep: string
  estado: string
  cidade: string
  endereco: string
  numero: string
  complemento: string | null
  bairro: string
  nome_pet: string
  idade: string | null
  especie: string
  genero: string
  raca: string | null
  cor: string
  peso: string | null
  localizacao: string
  localizacao_outra: string | null
  cremacao: string
  pagamento: string
  parcelas: string | null
  velorio: string
  acompanhamento: string
  outros_tutores: string[]
  como_conheceu: string[]
  veterinario_especificar: string | null
  outro_especificar: string | null
  observacoes: string | null
  fallback?: boolean
}

function buildEmailHTML(data: FichaPayload): string {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const isFallback = data.fallback === true

  const row = (label: string, value: string | null | undefined) =>
    value ? `<tr><td style="padding:6px 12px;font-weight:600;color:#475569;white-space:nowrap;vertical-align:top;font-size:14px;">${label}</td><td style="padding:6px 12px;color:#1e293b;font-size:14px;">${value}</td></tr>` : ''

  const sectionHeader = (title: string, emoji: string) =>
    `<tr><td colspan="2" style="padding:16px 12px 8px;font-size:16px;font-weight:700;color:#1e5a96;border-bottom:2px solid #e2e8f0;">${emoji} ${title}</td></tr>`

  const conheceuText = data.como_conheceu.join(', ')
    + (data.veterinario_especificar ? ` (Vet: ${data.veterinario_especificar})` : '')
    + (data.outro_especificar ? ` (Outro: ${data.outro_especificar})` : '')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e5a96,#2d7bb8);border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;">R.I.P. Pet</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Nova Ficha de Entrada</p>
    </div>

    ${isFallback ? `
    <!-- Fallback Alert -->
    <div style="background:#fef2f2;border:2px solid #fca5a5;padding:12px 16px;font-size:13px;color:#991b1b;">
      <strong>FALLBACK:</strong> O Supabase estava indisponivel. Dados NAO foram salvos no banco. Copie para o CRM manualmente.
    </div>
    ` : ''}

    <!-- Body -->
    <div style="background:#fff;padding:0;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
      <table style="width:100%;border-collapse:collapse;">

        ${sectionHeader('Tutor', '👤')}
        ${row('Nome', data.nome_completo)}
        ${data.outros_tutores.length > 0 ? row('Outros nomes', data.outros_tutores.join(', ')) : ''}
        ${row('CPF', data.cpf)}
        ${row('Telefone', data.telefone)}
        ${row('E-mail', data.email)}
        ${row('CEP', data.cep)}
        ${row('Endereco', `${data.endereco}, ${data.numero}${data.complemento ? ` - ${data.complemento}` : ''}`)}
        ${row('Bairro', data.bairro)}
        ${row('Cidade/UF', `${data.cidade} - ${data.estado}`)}

        ${sectionHeader('Pet', '🐾')}
        ${row('Nome', data.nome_pet)}
        ${row('Idade', data.idade ? `${data.idade} anos` : null)}
        ${row('Especie', data.especie)}
        ${row('Genero', data.genero)}
        ${row('Raca', data.raca)}
        ${row('Cor', data.cor)}
        ${row('Peso', data.peso ? `${data.peso} kg` : null)}
        ${row('Localizacao', data.localizacao + (data.localizacao_outra ? ` (${data.localizacao_outra})` : ''))}

        ${sectionHeader('Servico', '⚱️')}
        ${row('Cremacao', data.cremacao)}
        ${row('Pagamento', data.pagamento + (data.parcelas ? ` (${data.parcelas})` : ''))}
        ${row('Velorio', data.velorio)}
        ${row('Acompanhamento', data.acompanhamento)}

        ${sectionHeader('Extras', '📋')}
        ${row('Como conheceu', conheceuText)}
        ${row('Observacoes', data.observacoes)}

      </table>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;font-size:12px;color:#94a3b8;">
      ${isFallback ? '⚠️ Email de fallback (Supabase indisponivel)' : '✅ Notificacao de nova ficha'}
      &middot; ${data.unidade} &middot; ${now}
    </div>

  </div>
</body>
</html>`
}

export async function POST(request: NextRequest) {
  try {
    const data: FichaPayload = await request.json()

    // Validacao basica
    if (!data.nome_completo || !data.cpf || !data.nome_pet) {
      return NextResponse.json(
        { error: 'Dados minimos ausentes (nome, cpf, pet)' },
        { status: 400 }
      )
    }

    const { error } = await resend.emails.send({
      from: 'R.I.P. Pet <onboarding@resend.dev>',  // TODO: trocar para ficha@rippet.com.br quando domínio verificar
      to: [OPERADOR_EMAIL],
      subject: `Nova Ficha: ${data.nome_pet} (${data.nome_completo}) - ${data.unidade}${data.fallback ? ' [FALLBACK]' : ''}`,
      html: buildEmailHTML(data),
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Email route error:', err)
    return NextResponse.json(
      { error: 'Erro ao enviar email' },
      { status: 500 }
    )
  }
}
