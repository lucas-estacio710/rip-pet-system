// Catálogo de raças mais comuns no Brasil para caninos e felinos.
// Lista de propósito prático (cobertura razoável, não exaustiva).
// Adicione/ajuste à medida que aparecerem casos novos.

export type EspeciePet = 'canina' | 'felina' | 'exotica'

export type Raca = {
  nome: string
  especie: EspeciePet
  /** Apelidos para casar buscas como "salsicha" → "Dachshund". Normalizados sem acento. */
  aliases?: string[]
}

export const RACAS_CANINAS: string[] = [
  'SRD', 'Vira-lata', 'Mestiço',
  'Affenpinscher', 'Afghan Hound', 'Airedale Terrier', 'Akita', 'Akita Inu', 'Alaskan Malamute',
  'American Bully', 'American Pit Bull Terrier', 'American Staffordshire Terrier',
  'Australian Cattle Dog', 'Australian Shepherd', 'Australian Silky Terrier',
  'Basenji', 'Basset Hound', 'Beagle', 'Bearded Collie', 'Bedlington Terrier',
  'Belga Malinois', 'Belga Tervueren', 'Bernese', 'Bichon Frisé', 'Bloodhound',
  'Bobtail', 'Boiadeiro Australiano', 'Boiadeiro Bernês', 'Border', 'Border Collie', 'Border Terrier',
  'Borzoi', 'Boston', 'Boston Terrier', 'Bouvier des Flandres', 'Boxer',
  'Briard', 'Buldogue Americano', 'Buldogue Campeiro', 'Buldogue Francês', 'Buldogue Inglês',
  'Bull Terrier', 'Bull Terrier Miniatura',
  'Cairn Terrier', 'Cane Corso', 'Cão d\'Água Português', 'Cavalier', 'Cavalier King Charles Spaniel',
  'Chesapeake Bay Retriever', 'Chihuahua', 'Chinese Crested', 'Chow Chow',
  'Clumber Spaniel', 'Cocker', 'Cocker Spaniel Americano', 'Cocker Spaniel Inglês',
  'Collie', 'Coton de Tuléar',
  'Dachshund', 'Dálmata', 'Dandie Dinmont Terrier', 'Doberman', 'Dogo Argentino',
  'Dogue Alemão', 'Dogue de Bordeaux',
  'English Setter', 'Eurasier',
  'Fila Brasileiro', 'Finnish Spitz', 'Fox Paulistinha', 'Fox Terrier', 'Foxhound Inglês',
  'Galgo Espanhol', 'Galgo Italiano', 'Golden Retriever', 'Goldendoodle',
  'Grand Basset Griffon Vendéen', 'Greyhound', 'Griffon Bruxelês',
  'Husky', 'Husky Siberiano',
  'Irish Setter', 'Irish Terrier', 'Irish Wolfhound',
  'Jack Russell Terrier', 'Japanese Chin',
  'Kerry Blue Terrier', 'Komondor', 'Kuvasz',
  'Labradoodle', 'Labrador Retriever', 'Lakeland Terrier', 'Leonberger', 'Lhasa Apso', 'Lobo Tcheco',
  'Maltês', 'Maltipoo', 'Mastim Inglês', 'Mastim Napolitano', 'Mastim Tibetano',
  'Malinois',
  'Norfolk Terrier', 'Norwegian Elkhound', 'Norwich Terrier',
  'Old English Sheepdog', 'Otterhound',
  'Papillon', 'Parson Russell Terrier',
  'Pastor Alemão', 'Pastor Australiano', 'Pastor Belga Malinois', 'Pastor Belga Tervueren',
  'Pastor Branco Suíço', 'Pastor de Beauce', 'Pastor de Shetland', 'Pastor Pirenaico',
  'Pequinês', 'Perdigueiro Português', 'Petit Basset Griffon Vendéen',
  'Pinscher', 'Pinscher Miniatura', 'Pit Bull', 'Pitbull', 'Plott Hound', 'Podengo Português',
  'Pointer Inglês', 'Poodle', 'Poodle Anão', 'Poodle Médio', 'Poodle Standard', 'Poodle Toy',
  'Pug', 'Puli', 'Pumi',
  'Rafeiro do Alentejo', 'Rat Terrier', 'Rhodesian Ridgeback', 'Rottweiler',
  'Saluki', 'Samoieda', 'Schipperke',
  'Schnauzer', 'Schnauzer Gigante', 'Schnauzer Médio', 'Schnauzer Miniatura',
  'Scottish Deerhound', 'Scottish Terrier', 'Sealyham Terrier',
  'Shar Pei', 'Shiba Inu', 'Shih Tzu', 'Shihtzu',
  'Silky Terrier', 'Skye Terrier', 'Sloughi', 'Soft Coated Wheaten Terrier',
  'Spinone Italiano',
  'Lulu da Pomerânia', 'Spitz Alemão Gigante', 'Spitz Alemão Médio', 'Spitz Alemão Toy',
  'Springer Spaniel Inglês',
  'Staffordshire Bull Terrier',
  'São Bernardo', 'Sussex Spaniel',
  'Terra Nova', 'Terrier Brasileiro', 'Tibetan Mastiff', 'Tosa Inu',
  'Vizsla',
  'Weimaraner', 'Welsh Corgi Cardigan', 'Welsh Corgi Pembroke', 'Welsh Springer Spaniel', 'Welsh Terrier',
  'West Highland White Terrier', 'Westie', 'Whippet',
  'Yorkshire Terrier',
]

export const RACAS_FELINAS: string[] = [
  'SRD', 'Vira-lata', 'Mestiço',
  'Abissínio', 'American Bobtail', 'American Curl', 'American Shorthair', 'American Wirehair',
  'Angorá Turco', 'Asian',
  'Balinês', 'Bengal', 'Birmanês', 'Bobtail Japonês', 'Bombaim', 'Bombay',
  'British Longhair', 'British Shorthair', 'Burmês', 'Burmilla',
  'Cartuxo', 'Ceylon', 'Chartreux', 'Chausie',
  'Cornish Rex', 'Cymric',
  'Devon Rex', 'Don Sphynx',
  'Egyptian Mau', 'Europeu de Pelo Curto', 'Exotic Shorthair',
  'German Rex', 'Gato dos Bosques da Noruega',
  'Havana Brown', 'Highland Fold', 'Himalaia',
  'Japanese Bobtail',
  'Khao Manee', 'Korat', 'Kurilian Bobtail',
  'LaPerm', 'Lykoi',
  'Maine', 'Maine Coon', 'Manx', 'Munchkin',
  'Nebelung', 'Norueguês da Floresta',
  'Ocicat', 'Oriental Longhair', 'Oriental Shorthair',
  'Persa', 'Peterbald', 'Pixie-Bob',
  'Ragamuffin', 'Ragdoll',
  'Sagrado da Birmânia', 'Savannah',
  'Scottish Fold', 'Scottish Straight', 'Selkirk Rex',
  'Siamês', 'Siberiano', 'Singapura', 'Snowshoe', 'Sokoke', 'Somali', 'Sphynx',
  'Thai', 'Tonquinês', 'Toyger', 'Turkish Van',
  'Ural Rex',
  'York Chocolate',
]

// Apelidos populares / formas comuns no português → casam com a raça oficial
const ALIASES: Array<{ nome: string; especie: EspeciePet; aliases: string[] }> = [
  { nome: 'Dachshund', especie: 'canina', aliases: ['salsicha', 'cachorro salsicha', 'basset alemao', 'teckel'] },
  { nome: 'Buldogue Francês', especie: 'canina', aliases: ['frenchie', 'bulldog frances'] },
  { nome: 'Buldogue Inglês', especie: 'canina', aliases: ['bulldog ingles'] },
  { nome: 'Buldogue Americano', especie: 'canina', aliases: ['bulldog americano'] },
  { nome: 'Old English Sheepdog (Bobtail)', especie: 'canina', aliases: ['bobtail'] },
  { nome: 'Husky Siberiano', especie: 'canina', aliases: ['husky'] },
  { nome: 'Pastor Alemão', especie: 'canina', aliases: ['german shepherd', 'pastor alemao'] },
  { nome: 'Pinscher Miniatura', especie: 'canina', aliases: ['pinscher'] },
  { nome: 'Poodle', especie: 'canina', aliases: ['poodle padrao'] },
  { nome: 'Shih Tzu', especie: 'canina', aliases: ['shitsu', 'shitzu', 'shih-tzu', 'shi tzu'] },
  { nome: 'Yorkshire Terrier', especie: 'canina', aliases: ['york', 'yorkie'] },
  { nome: 'Maltês', especie: 'canina', aliases: ['maltes', 'bichon maltes'] },
  { nome: 'Lulu da Pomerânia', especie: 'canina', aliases: ['lulu', 'pomerania', 'pomeranian', 'pom', 'spitz alemao anao'] },
  { nome: 'Maine Coon', especie: 'felina', aliases: ['mainecoon', 'main coon'] },
  { nome: 'Persa', especie: 'felina', aliases: ['gato persa'] },
  { nome: 'Siamês', especie: 'felina', aliases: ['siames'] },
  { nome: 'British Shorthair', especie: 'felina', aliases: ['britanico de pelo curto', 'british'] },
  { nome: 'Sphynx', especie: 'felina', aliases: ['esfinge', 'sem pelo', 'gato pelado', 'careca'] },
  { nome: 'Ragdoll', especie: 'felina', aliases: ['rag doll'] },
  { nome: 'Cão d\'Água Português', especie: 'canina', aliases: ['cao dagua portugues', 'water dog'] },
  { nome: 'São Bernardo', especie: 'canina', aliases: ['saint bernard', 'sao bernardo'] },
]

/** Remove acentos e converte para lowercase para comparação. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export type RacaSugestao = {
  nome: string
  especie: EspeciePet
  /** Indica match por alias (apelido) em vez de nome oficial. */
  viaAlias?: string
}

/**
 * Busca raças por termo.
 * - Filtra por espécie quando informada (mas mantém matches da outra espécie no fim para fallback).
 * - Match por substring no nome oficial e nos aliases.
 * - Resultados priorizam: prefix match > substring > alias.
 */
export function buscarRacas(query: string, especie?: EspeciePet | null, limite = 8): RacaSugestao[] {
  const q = normalizar(query.trim())
  // Sem query: mostra as 8 primeiras da espécie correta (ou genéricas se sem espécie)
  if (!q) {
    const fonte = especie === 'felina' ? RACAS_FELINAS : especie === 'canina' ? RACAS_CANINAS : [...RACAS_CANINAS, ...RACAS_FELINAS]
    const esp: EspeciePet = especie === 'felina' ? 'felina' : especie === 'canina' ? 'canina' : 'canina'
    return fonte.slice(0, limite).map(nome => ({ nome, especie: esp }))
  }

  const canin = RACAS_CANINAS.map(nome => ({ nome, especie: 'canina' as EspeciePet }))
  const felin = RACAS_FELINAS.map(nome => ({ nome, especie: 'felina' as EspeciePet }))
  const todos = [...canin, ...felin]

  // Score: 0 = prefix match (melhor), 1 = substring, 2 = via alias, 9 = sem match
  type Scored = { nome: string; especie: EspeciePet; score: number; viaAlias?: string }
  const scored: Scored[] = todos.map(r => {
    const nomeN = normalizar(r.nome)
    if (nomeN.startsWith(q)) return { ...r, score: 0 }
    if (nomeN.includes(q)) return { ...r, score: 1 }
    const aliasHit = ALIASES.find(a => a.nome === r.nome && a.aliases.some(al => normalizar(al).includes(q)))
    if (aliasHit) return { ...r, score: 2, viaAlias: aliasHit.aliases.find(al => normalizar(al).includes(q)) }
    return { ...r, score: 9 }
  }).filter(r => r.score < 9)

  // Prioriza espécie correta
  scored.sort((a, b) => {
    const espA = especie && a.especie === especie ? 0 : especie ? 1 : 0
    const espB = especie && b.especie === especie ? 0 : especie ? 1 : 0
    if (espA !== espB) return espA - espB
    if (a.score !== b.score) return a.score - b.score
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })

  return scored.slice(0, limite).map(({ nome, especie, viaAlias }) => ({ nome, especie, viaAlias }))
}
