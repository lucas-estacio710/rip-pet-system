import { NextRequest, NextResponse } from 'next/server'

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

export async function GET(req: NextRequest) {
  if (!PLACES_API_KEY) {
    return NextResponse.json({
      error: 'GOOGLE_PLACES_API_KEY não configurada no servidor.',
      hint: 'Adicione a chave em web/.env.local: GOOGLE_PLACES_API_KEY="..." e reinicie o dev server',
    }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!query || query.trim().length < 3) {
    return NextResponse.json({ results: [] })
  }

  // Google Places API v1 (Text Search) — endpoint moderno
  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    maxResultCount: 8,
  }
  if (lat && lng) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: 30000, // 30km
      },
    }
  }

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri',
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const txt = await r.text()
      return NextResponse.json({ error: 'Google Places retornou erro', detail: txt }, { status: 502 })
    }
    const data = await r.json()
    type AddressComponent = { longText?: string; shortText?: string; types?: string[] }
    function comp(addr: AddressComponent[] | undefined, type: string, useShort = false): string | null {
      const c = addr?.find(a => a.types?.includes(type))
      if (!c) return null
      return useShort ? (c.shortText || c.longText || null) : (c.longText || c.shortText || null)
    }

    const results = (data.places || []).map((p: {
      id: string
      displayName?: { text?: string }
      formattedAddress?: string
      addressComponents?: AddressComponent[]
      location?: { latitude?: number; longitude?: number }
      types?: string[]
      nationalPhoneNumber?: string
      internationalPhoneNumber?: string
      websiteUri?: string
    }) => {
      const ac = p.addressComponents
      const rua = comp(ac, 'route')
      const numero = comp(ac, 'street_number')
      const endereco = [rua, numero].filter(Boolean).join(', ') || null
      return {
        place_id: p.id,
        nome: p.displayName?.text || '',
        endereco_completo: p.formattedAddress || '',
        endereco,
        bairro: comp(ac, 'sublocality_level_1') || comp(ac, 'sublocality') || comp(ac, 'political'),
        cidade: comp(ac, 'administrative_area_level_2') || comp(ac, 'locality'),
        estado: comp(ac, 'administrative_area_level_1', true),
        cep: comp(ac, 'postal_code'),
        latitude: p.location?.latitude ?? null,
        longitude: p.location?.longitude ?? null,
        types: p.types || [],
        telefone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        website: p.websiteUri || null,
      }
    })
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: 'Erro na chamada externa', detail: String(e) }, { status: 502 })
  }
}
