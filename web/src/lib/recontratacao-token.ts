// Token assinado (HMAC-SHA256) para links de recontratação.
// SERVER-ONLY — usa o secret e nunca deve ser importado em componentes client.
//
// O link é da forma /ficha/[slug]?rt=<token>. O token carrega o tutor_id, o slug
// da unidade e uma validade embutida, assinados. Não há tabela: não é revogável,
// só expira. Por isso a validade curta (default 7 dias).
import crypto from 'crypto'

const SECRET = process.env.RECONTRATACAO_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

type TokenPayload = { t: string; u: string; exp: number } // tutorId, slug, expiração (unix ms)

export type TokenResult =
  | { ok: true; tutorId: string; slug: string }
  | { ok: false; erro: 'invalido' | 'expirado' }

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  let t = s.replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4) t += '='
  return Buffer.from(t, 'base64')
}

function assinar(payloadB64: string): string {
  return b64url(crypto.createHmac('sha256', SECRET).update(payloadB64).digest())
}

export function gerarTokenRecontratacao(tutorId: string, slug: string, validadeDias = 7): string {
  const payload: TokenPayload = { t: tutorId, u: slug, exp: Date.now() + validadeDias * 86400000 }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)))
  return `${payloadB64}.${assinar(payloadB64)}`
}

export function verificarTokenRecontratacao(token: string): TokenResult {
  if (!SECRET || !token) return { ok: false, erro: 'invalido' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, erro: 'invalido' }
  const [payloadB64, sig] = parts

  const esperado = assinar(payloadB64)
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, erro: 'invalido' }

  let payload: TokenPayload
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, erro: 'invalido' }
  }
  if (!payload.t || !payload.u || !payload.exp) return { ok: false, erro: 'invalido' }
  if (Date.now() > payload.exp) return { ok: false, erro: 'expirado' }
  return { ok: true, tutorId: payload.t, slug: payload.u }
}
