/**
 * Endereço de remoção do contrato (`contratos.remocao_endereco/bairro/cidade/cep`) a partir do
 * LOCAL escolhido no início do fluxo — UMA regra pros dois caminhos que iniciam o acolhimento:
 * a Tratativa (`criar-contrato-de-ficha.ts`) e o Ativar Preventivo (`AtivarModal.tsx`).
 *
 * Item 2 dos ajustes finos (09/10/2026): só a Tratativa gravava isso; o Ativar Preventivo gravava
 * o local em `local_coleta`/`clinica_coleta` e deixava `remocao_*` com a casa do tutor de quando o
 * PV foi criado — o card "Em Acolhimento" mostrava o endereço errado.
 *
 * Puro (sem import de runtime) pro `npm test`.
 */

export type LocalColeta = 'residencia' | 'clinica' | 'outro' | 'unidade' | ''

export type EnderecoPartes = {
  endereco?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  cep?: string | null
}

export type EnderecoRemocao = {
  remocao_endereco: string | null
  remocao_bairro: string | null
  remocao_cidade: string | null
  remocao_cep: string | null
}

const t = (v: string | null | undefined) => (v || '').trim() || null

export function enderecoDeRemocao(local: LocalColeta, f: {
  /** Residência: o endereço da casa (ficha ou cadastro do tutor). */
  residencia?: EnderecoPartes | null
  /** Clínica: o endereço do estabelecimento; sem ele, o nome da clínica. */
  clinica?: (EnderecoPartes & { nome?: string | null }) | null
  /** Outro: o texto digitado. */
  outro?: string | null
  /** Unidade: o endereço da unidade. */
  unidade?: EnderecoPartes | null
}): EnderecoRemocao {
  const vazio: EnderecoRemocao = { remocao_endereco: null, remocao_bairro: null, remocao_cidade: null, remocao_cep: null }
  if (local === 'residencia') {
    const r = f.residencia
    const rua = t(r?.endereco)
    return {
      remocao_endereco: rua ? [rua, t(r?.numero)].filter(Boolean).join(', ') : null,
      remocao_bairro: t(r?.bairro), remocao_cidade: t(r?.cidade), remocao_cep: t(r?.cep),
    }
  }
  if (local === 'clinica') {
    const c = f.clinica
    return {
      remocao_endereco: t(c?.endereco) || t(c?.nome),
      remocao_bairro: t(c?.bairro), remocao_cidade: t(c?.cidade), remocao_cep: t(c?.cep),
    }
  }
  if (local === 'outro') return { ...vazio, remocao_endereco: t(f.outro) }
  if (local === 'unidade') return { ...vazio, remocao_endereco: t(f.unidade?.endereco), remocao_cidade: t(f.unidade?.cidade) }
  return vazio
}
