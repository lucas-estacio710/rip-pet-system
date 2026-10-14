/**
 * Destino de navegação de uma clínica CADASTRADA (`estabelecimentos`).
 *
 * Por que existe (14/10/2026): o popup da remoção e o da Ativação de PV mandavam o NOME da
 * clínica pro Waze/Maps. "CV Martins Fontes" (São Vicente) caía na "Livraria Martins Fontes".
 * O cadastro tem endereço e, quase sempre, latitude/longitude (vêm da busca do Google Places).
 * Com coordenada, o link vai no ponto exato; sem, vai pelo endereço por extenso.
 */

/** Colunas de `estabelecimentos` que este arquivo usa — `select` delas e nada mais. */
export const COLUNAS_ENDERECO_CLINICA = 'nome, endereco, bairro, cidade, estado, latitude, longitude'

export type EnderecoClinica = {
  nome: string
  endereco: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  latitude: number | null
  longitude: number | null
}

/** "Avenida Quintino Bocaiúva, 883 - Centro, São Vicente/SP" — vazio se não há endereço. */
export function textoEnderecoClinica(e: EnderecoClinica): string {
  const rua = e.endereco?.trim()
  if (!rua) return ''
  const cidade = [e.cidade?.trim(), e.estado?.trim()].filter(Boolean).join('/')
  return [rua, e.bairro?.trim(), cidade].filter(Boolean).join(' - ')
}

/** Waze e Maps: pela coordenada quando existe, senão pelo texto. */
export function linksDestino(texto: string, lat?: number | null, lng?: number | null): { waze: string; maps: string } | null {
  if (typeof lat === 'number' && typeof lng === 'number') {
    return {
      waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
      maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    }
  }
  if (!texto) return null
  const q = encodeURIComponent(texto)
  return {
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    maps: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  }
}
