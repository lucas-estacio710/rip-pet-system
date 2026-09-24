'use client'

/**
 * GRUPOS DE ENCAMINHAMENTO — o espelho dos 7 grupos de WhatsApp.
 *
 * POR QUE ESTA TELA EXISTE (Lucas, 15/09/2026)
 * Hoje a operação roda em 7 grupos de WhatsApp, um por unidade. A unidade tira **foto de
 * celular da ficha de remoção em papel** (bloco impresso, coisa de 1980) e manda no grupo,
 * seguida do **contato do tutor**, pra Matriz agendar a despedida. A gerente da Matriz é
 * analógica — imprime até a ficha digital.
 *
 * A transição precisa ser amigável: em vez de dar a ela uma tela de CRM, esta tela **desenha
 * o WhatsApp que ela já usa** — calendário → dia → "grupo" → conversa com as fichas e os
 * contatos anexados, na mesma ordem em que chegam no zap hoje. Com o chão igual, dá pra ir
 * tirando os atritos um a um.
 *
 * 🔴 STACK DE MENOR CONSUMO (pedido explícito): a "mini imagem" da ficha **não é imagem
 * nenhuma**. Usa o `FichaRemocaoDoc` — a ficha redesenhada em HTML+CSS, sem o PNG de template
 * de 398x512 e sem campo posicionado por coordenada (ver o cabeçalho dele). A miniatura é
 * `transform: scale()` nesse DOM:
 *   • zero imagem baixada   • zero upload pro Storage   • zero PNG gerado por ficha pra exibir
 * `html2canvas`/`jspdf` entram só por `import()` dinâmico, quando alguém clica em baixar
 * (`lib/ficha-download.ts`) — quem só olha a ficha não paga esse JS.
 *
 * ⚠️ O irmão `FichaRemocao.tsx` (o de coordenadas sobre PNG) **continua vivo e em produção**:
 * pipeline (PDF A4 com 2 cópias), detalhe do contrato e `lib/impressao-unificada.ts`. Os dois
 * layouts convivem até o Lucas aprovar o novo e mandar trocar lá também. O que de fato é código
 * morto é só o `components/supindas/FichasBatchModal.tsx` (html2canvas → Storage): nenhum
 * arquivo o importa e o bucket `fichas` não tem UMA pasta `encaminhamento_*` (conferido em
 * 15/09/2026). Não ressuscitar esse.
 *
 * GATE — `obj_enc_pipeline` (mig 142), o mesmo interruptor de rollout do fluxo novo:
 * chave ligada → esta tela substitui a `/encaminhamentos` no menu. Usa
 * `useFieldPermission` (não o `useUnidadeNoPipeline`) de propósito: a pergunta aqui é
 * "esta pessoa vê o fluxo novo?", e o super_admin ser `edit` por hardcode é justamente
 * como o Lucas testa antes de liberar unidade. A `/encaminhamentos` continua acessível
 * pela URL — e operável nas unidades não migradas, porque o gate DELA é o outro hook.
 *
 * ⚠️ **Quase somente leitura, e a exceção é UMA.** A tela nasceu sem gravar nada de propósito
 * (dois caminhos de escrita pro mesmo encaminhamento foi o que causou o incidente SP47), e
 * isso continua valendo pro fluxo: **montar, despachar e trazer de volta é só no Pipeline**
 * (`/contratos`). O único ponto de escrita aqui são as **observações por ficha** (o botão
 * 🚨), pedido do Lucas em 23/09/2026 — e mesmo elas não gravam num campo desta tela: são
 * linhas de `tarefas`, a mesma tabela do card "Observações" de `/contratos/[id]`. Ver
 * `salvarObservacao` e `BlocoObservacoes`. Nada de status, vínculo de pet ou data de viagem
 * é tocado por aqui. Ver `docs/ENCAMINHAMENTO_NO_PIPELINE.md`.
 *
 * 🔴 TIPOGRAFIA — segue as diretrizes fechadas no §9.1 do plano, que nasceram da reclamação
 * do Lucas na primeira versão do card do pipeline (*"to achando pequenas as letras.. e sem
 * figurinhas"*). Esta tela nasceu repetindo o mesmo erro; corrigido em 23/09/2026.
 *
 *   • **Piso de 12px (`text-xs`) em tudo que carrega DADO** — nome, lacre, hora, telefone,
 *     número da viagem, dia da semana, chips IND/COL, status. Nada de 9–11px aqui.
 *   • **Nome do pet em 15px**; nome de agenda e número da viagem em 13px (são títulos de card).
 *   • **Exceção: MARCADOR pode ser menor** — o overline "HOJE" do calendário (9px), o
 *     "(sua unidade)" e o divisor de data da conversa (11px). Não são dado, são rótulo de
 *     orientação. Não subir nem descer sem motivo.
 *   • **Ícones em `lucide-react`, NUNCA emoji.** ⚠️ O §9.1 abre UMA exceção — o ícone do pet
 *     como emoji de espécie/porte — que **esta tela não usa**, por decisão do Lucas em
 *     23/09/2026: a ficha logo acima já traz espécie, raça e porte escritos, então o emoji era
 *     redundância ocupando a linha. A legenda é **lacre (azul) · nome do pet**, e o lacre vem
 *     primeiro porque é por ele que a operação identifica o pet.
 *   • **Cor de unidade só no badge**, card neutro. ⚠️ A sigla da unidade APARECE aqui, ao
 *     contrário do §9.1 ("sem a sigla") — e é proposital: lá a visão é de uma unidade só, aqui
 *     são os 7 grupos na mesma lista, então a sigla é justamente o que distingue as conversas.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, ArrowLeft, Users, MessageCircle, X,
  Phone, FileText, CheckCheck, Info, Download, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { useFieldPermission } from '@/hooks/useFieldPermission'
import { dataLocal } from '@/lib/date-local'
import { nomeParaAgenda, nomeDoContatoAtivo } from '@/lib/nome-agenda'
import { linkChatDireto } from '@/lib/whatsapp-msg'
import { fmtTelefone, type FichaContratoData } from '@/components/fichas/FichaRemocao'
import FichaRemocaoDoc, { DOC_W, DOC_MIN_H } from '@/components/fichas/FichaRemocaoDoc'
import { baixarFichaPng, baixarFichaPdf, nomeDeArquivo } from '@/lib/ficha-download'

// Mesmas cores de unidade da /encaminhamentos — o badge do calendário tem que ser
// reconhecível entre as duas telas durante a convivência dos dois fluxos.
const UNIT_COLORS: Record<string, string> = {
  ST: '#7c3aed', SP: '#ef4444', CP: '#22c55e', SJ: '#cbd5e1',
  RS: '#f59e0b', PA: '#ec4899', PI: '#06b6d4', MA: '#f97316',
}
const textoSobreUnidade = (codigo: string) => (codigo === 'SJ' ? '#334155' : '#fff')

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Largura de projeto da ficha-documento. A ALTURA é livre (o HTML cresce com o conteúdo), por
// isso quem exibe mede o nó real — ver `FichaEscalada`. `DOC_MIN_H` serve só de palpite inicial.
const FICHA_W = DOC_W

const STATUS_ENC: Record<string, { rotulo: string; classe: string }> = {
  planejada: { rotulo: 'Montando', classe: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  embarcada_ida: { rotulo: 'Na estrada', classe: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ida_finalizada: { rotulo: 'Na Matriz', classe: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  finalizada: { rotulo: 'Concluído', classe: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
}

// ============================================
// Types
// ============================================
type EncGrupo = {
  id: string
  numero: string
  data: string
  codigo_unidade: string
  unidade_nome: string
  responsavel: string | null
  quantidade_pets: number
  peso_total: number
  status: string
  observacoes: string | null
}

/** Uma ficha na conversa: o que o FichaRemocao precisa + o que o card de contato precisa. */
type FichaMsg = {
  ficha: FichaContratoData
  contratoId: string
  petNome: string
  lacre: string | null
  tipoCremacao: string | null
  nomeAgenda: string
  /** Nome de quem atende o telefone ATIVO — é este o contato do card, não o titular. */
  contatoNome: string
  /** Só pra resolver o colaborador do acolhimento por RPC — ver `resolverColaboradores`. */
  responsavelUserId: string | null
  telefone: string | null
  hora: string
  /**
   * Primeira etapa do GC: a Matriz já falou com o tutor?
   * `null` = ainda não · `'contatado'` = ligou, esperando resposta · `'agendado'` = já marcou.
   * ⚠️ Pro indicador, o que importa é **ter ou não contato** — `agendado` também conta, e é
   * 97% da base (3.550 de 3.646). Mostrar só `contatado` deixaria a bandeirinha fora de
   * quase toda ficha e a unidade concluiria que ninguém liga.
   */
  contatoStatus: string | null
  contatoEm: string | null
}

/**
 * Uma observação IMPORTANTE da ficha, mostrada como mensagem de sirene na conversa.
 * É uma linha de `tarefas` — a mesma tabela do card "Observações" de `/contratos/[id]`.
 */
type ObsMsg = {
  id: string
  texto: string
  autor: string | null
  criadoEm: string
}

// ============================================
// Helpers
// ============================================
function formatDia(d: Date): string {
  const dia = d.getDate().toString().padStart(2, '0')
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${dia}/${mes}`
}

function isMesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** `date` YYYY-MM-DD → "sexta, 19 de setembro" sem instanciar Date (evita o off-by-one de fuso). */
function diaExtenso(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m) return data
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

/** "23/09 14:32" — pro tooltip do indicador de contato. */
function dataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function horaDoAcolhimento(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Iniciais pro avatar do contato. Saem do nome do CONTATO ATIVO (quem atende o telefone), nunca
// do nome de agenda: o nome de agenda começa com a data e termina em IND/COL, então
// primeira+última palavra dele davam coisas como "2C" (de "26set14 … COL") — avatar que não
// identifica ninguém. Era o nome do TUTOR até 23/09/2026; passou a ser o do contato ativo junto
// com o nome de agenda, senão o avatar e o nome do mesmo card apontariam pessoas diferentes.
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

const fmtPeso = (kg: number) => `${(kg || 0).toFixed(1).replace('.', ',')} kg`

// Campos que a ficha consome. `clinica_veterinaria` e `colaborador_responsavel` NÃO são
// colunas: o componente exige que o chamador resolva (ver o cabeçalho dele).
//
// 🔴 O colaborador do acolhimento vem de TRÊS lugares diferentes, e cada unidade usa um:
//   1. `executado_por_funcionario_id` — "quem fez de verdade" (mig 137, login "posição")
//   2. `funcionario_id` — o caminho clássico (SJ e CP usam este)
//   3. `responsavel_user_id` — unidade com `cb_operacional` (mig 123)
// Medido em 15/09/2026: em **Santos o `funcionario_id` está vazio em 100% dos pets** (ST171 e
// ST172 varridos), porque ela é a única com `cb_operacional` — o responsável mora em
// `responsavel_user_id`. Ler só `funcionario_id`, como eu fazia, deixava o campo em branco
// justamente na unidade que o Lucas estava olhando. O (3) não dá JOIN aqui: `perfis` só
// devolve o PRÓPRIO perfil por RLS, então precisa da RPC — ver `resolverColaboradores`.
const CAMPOS_FICHA = `
  id, codigo, numero_lacre, tipo_cremacao, tipo_plano, data_contrato, data_acolhimento, status,
  pet_nome, pet_especie, pet_raca, pet_cor, pet_idade_anos, pet_peso, pet_genero,
  certificado_nome_1, certificado_nome_2, certificado_nome_3, certificado_nome_4,
  certificado_nome_5, certificado_nome_6, certificado_nome_7,
  local_coleta, clinica_coleta, observacoes, remocao_cidade, responsavel_user_id,
  tutor_nome, tutor_telefone, tutor_telefone2, tutor_telefone_nome, tutor_telefone2_nome,
  tutor_telefone_principal, tutor_endereco, tutor_bairro, tutor_cidade, tutor_cep,
  tutor:tutor_id ( nome, telefone, telefone2, telefone_principal, telefone_nome,
                   endereco, numero, complemento, bairro, cidade, estado, cep ),
  contrato_gc ( contato_status, contato_tutor_em ),
  estabelecimento:estabelecimento_id ( nome ),
  funcionario:funcionario_id ( nome ),
  executor:executado_por_funcionario_id ( nome )
`

type LinhaContrato = {
  id: string
  codigo: string
  numero_lacre: string | null
  tipo_cremacao: string | null
  tipo_plano: string | null
  data_contrato: string | null
  data_acolhimento: string | null
  status: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  pet_idade_anos: number | null
  pet_peso: number | null
  pet_genero: string | null
  certificado_nome_1: string | null
  certificado_nome_2: string | null
  certificado_nome_3: string | null
  certificado_nome_4: string | null
  certificado_nome_5: string | null
  certificado_nome_6: string | null
  certificado_nome_7: string | null
  local_coleta: string | null
  clinica_coleta: string | null
  observacoes: string | null
  remocao_cidade: string | null
  tutor_nome: string | null
  tutor_telefone: string | null
  tutor_telefone2: string | null
  tutor_telefone_nome: string | null
  tutor_telefone2_nome: string | null
  tutor_telefone_principal: number | null
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  tutor_cep: string | null
  responsavel_user_id: string | null
  tutor: {
    nome: string | null; telefone: string | null; telefone2: string | null
    telefone_principal: number | null; telefone_nome: string | null
    endereco: string | null; numero: string | null; complemento: string | null
    bairro: string | null; cidade: string | null; estado: string | null; cep: string | null
  } | null
  estabelecimento: { nome: string | null } | null
  funcionario: { nome: string | null } | null
  executor: { nome: string | null } | null
  // Embed 1-1, mas o PostgREST devolve ARRAY quando não há constraint de unicidade declarada.
  contrato_gc: { contato_status: string | null; contato_tutor_em: string | null }[] | { contato_status: string | null; contato_tutor_em: string | null } | null
}

/** O embed 1-1 do PostgREST às vezes vem array, às vezes objeto. Normaliza. */
function gcDe(c: LinhaContrato) {
  const gc = c.contrato_gc
  return Array.isArray(gc) ? (gc[0] ?? null) : gc
}

function montarFicha(c: LinhaContrato): FichaMsg {
  // Cadastro do tutor na frente, snapshot do contrato como fallback — mesma precedência
  // que o resto do sistema usa (o snapshot envelhece; o cadastro é editável em /tutores).
  const tel1 = c.tutor?.telefone || c.tutor_telefone || null
  const tel2 = c.tutor?.telefone2 || c.tutor_telefone2 || null
  const principal = c.tutor?.telefone_principal ?? c.tutor_telefone_principal ?? 1
  const telAtivo = principal === 2 ? tel2 : tel1

  const ficha: FichaContratoData = {
    id: c.id,
    codigo: c.codigo,
    numero_lacre: c.numero_lacre,
    tipo_cremacao: c.tipo_cremacao === 'coletiva' ? 'coletiva' : 'individual',
    data_acolhimento: c.data_acolhimento,
    pet_nome: c.pet_nome,
    pet_especie: c.pet_especie,
    pet_raca: c.pet_raca,
    pet_cor: c.pet_cor,
    pet_idade_anos: c.pet_idade_anos,
    pet_peso: c.pet_peso,
    pet_genero: c.pet_genero,
    certificado_nome_1: c.certificado_nome_1,
    certificado_nome_2: c.certificado_nome_2,
    certificado_nome_3: c.certificado_nome_3,
    certificado_nome_4: c.certificado_nome_4,
    certificado_nome_5: c.certificado_nome_5,
    certificado_nome_6: c.certificado_nome_6,
    certificado_nome_7: c.certificado_nome_7,
    local_coleta: c.local_coleta,
    clinica_veterinaria: c.clinica_coleta || c.estabelecimento?.nome || null,
    // "Quem fez de verdade" na frente, depois o funcionário clássico. O 3º caminho
    // (`responsavel_user_id`, unidade com `cb_operacional`) só existe via RPC e é costurado
    // depois, em `resolverColaboradores` — aqui fica null de propósito.
    colaborador_responsavel: c.executor?.nome || c.funcionario?.nome || null,
    observacoes: c.observacoes,
    tutor_telefone: tel1,
    tutor_telefone2: tel2,
    tutor_telefone_nome: c.tutor?.telefone_nome || c.tutor_telefone_nome,
    tutor_telefone2_nome: c.tutor_telefone2_nome,
    tutor_telefone_principal: principal,
    remocao_cidade: c.remocao_cidade,
    tutor_nome: c.tutor?.nome || c.tutor_nome,
    // Endereço: o componente aplica a precedência cadastro › snapshot, então os dois vão.
    tutor_endereco: c.tutor_endereco,
    tutor_bairro: c.tutor_bairro,
    tutor_cidade: c.tutor_cidade,
    tutor_cep: c.tutor_cep,
    tutor: c.tutor,
  }

  return {
    ficha,
    contratoId: c.id,
    petNome: c.pet_nome,
    lacre: c.numero_lacre,
    tipoCremacao: c.tipo_cremacao,
    nomeAgenda: nomeParaAgenda(c),
    contatoNome: nomeDoContatoAtivo(c),
    responsavelUserId: c.responsavel_user_id,
    telefone: telAtivo,
    hora: horaDoAcolhimento(c.data_acolhimento),
    contatoStatus: gcDe(c)?.contato_status ?? null,
    contatoEm: gcDe(c)?.contato_tutor_em ?? null,
  }
}

/**
 * Preenche `colaborador_responsavel` nas fichas em que ele veio de `responsavel_user_id`
 * (unidade com `cb_operacional`, mig 123) — em Santos isso é **todas**.
 *
 * 🔴 **Não dá para fazer JOIN em `perfis`.** A policy `perfis_select` promete que super_admin
 * lê todo mundo, mas o `EXISTS` auto-referente nunca resolve: na prática **todo login só
 * enxerga o PRÓPRIO perfil**, e o `SELECT` volta vazio SEM ERRO — o campo simplesmente
 * aparece em branco. Por isso vai pela RPC `resolver_nomes_perfis` (mig 139,
 * `SECURITY DEFINER`), que é feita exatamente pra isso. ⚠️ O parâmetro é **`p_user_ids`**
 * (o CLAUDE.md dizia `user_ids`, que devolve `PGRST202`).
 *
 * Uma chamada só pro lote, e só com os IDs que faltam — se nenhuma ficha precisar, não chama.
 * Falhar aqui é aceitável: a ficha volta sem o colaborador, não quebra a conversa.
 */
async function resolverColaboradores(
  supabase: ReturnType<typeof createClient>,
  fichas: FichaMsg[],
): Promise<FichaMsg[]> {
  const faltando = fichas.filter(f => !f.ficha.colaborador_responsavel && f.responsavelUserId)
  if (faltando.length === 0) return fichas

  const ids = Array.from(new Set(faltando.map(f => f.responsavelUserId as string)))
  try {
    const { data } = await supabase.rpc('resolver_nomes_perfis' as never, { p_user_ids: ids } as never) as
      { data: { user_id: string; nome: string | null }[] | null }
    const porId = new Map((data || []).map(p => [p.user_id, p.nome]))
    return fichas.map(f => {
      const nome = f.responsavelUserId ? porId.get(f.responsavelUserId) : null
      if (f.ficha.colaborador_responsavel || !nome) return f
      return { ...f, ficha: { ...f.ficha, colaborador_responsavel: nome } }
    })
  } catch (e) {
    console.error('Erro ao resolver o colaborador do acolhimento:', e)
    return fichas
  }
}

// ============================================
// Page
// ============================================
export default function GruposEncaminhamentosPage() {
  const supabase = createClient()
  const { currentUnit, userName, userEmail } = useUnit()
  const { isVisible } = useFieldPermission()
  const fluxoNovo = isVisible('tela_pipeline', 'obj_enc_pipeline')
  /**
   * Quem pode marcar "Contato Realizado": **só a Matriz**, e só com a chave ligada.
   *
   * Dupla trava de propósito (pedido do Lucas): `btn_gc_contatado_grupos` é o interruptor
   * paralelo — liga/desliga o botão sem tocar no rollout do fluxo novo —, e o
   * `currentUnit.is_matriz` é a regra de negócio: ligar pro tutor é trabalho da Matriz. As
   * outras unidades **não veem o botão**, só a bandeirinha de "já contatou".
   * ⚠️ `is_matriz` é lido direto de `unidades`, não via FLS: é estado da unidade, não permissão
   * de pessoa — e o super_admin é `edit` em tudo por hardcode, o que faria ele ver o botão em
   * qualquer unidade se a chave fosse a única guarda.
   */
  const podeMarcarContato = isVisible('tela_entregas', 'btn_gc_contatado_grupos') && !!currentUnit?.is_matriz

  const hoje = new Date()
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(hoje)
  const [desktopOffset, setDesktopOffset] = useState(0)
  const [encAberto, setEncAberto] = useState<EncGrupo | null>(null)

  const [grupos, setGrupos] = useState<EncGrupo[]>([])
  const [loading, setLoading] = useState(true)

  const [fichas, setFichas] = useState<FichaMsg[]>([])
  // Só as observações IMPORTANTES, por contrato. Ver `carregarObservacoes`.
  const [obsPorContrato, setObsPorContrato] = useState<Record<string, ObsMsg[]>>({})
  const [carregandoFichas, setCarregandoFichas] = useState(false)
  const [fichaAmpliada, setFichaAmpliada] = useState<FichaMsg | null>(null)

  // Escala da miniatura e do zoom saem do tamanho da janela: uma medida, dois usos.
  const [janela, setJanela] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const medir = () => setJanela({ w: window.innerWidth, h: window.innerHeight })
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  // Tamanho da ficha no balão, imitando foto de WhatsApp.
  //
  // 🔴 Eu tinha feito INVERTIDO: 0,42 no celular e 0,5 no desktop. Medido em 23/09/2026 num
  // viewport de 460px, a miniatura saía com **176px numa coluna de 409** — um quadradinho
  // perdido, quando no zap uma foto no celular ocupa quase toda a largura do balão. No desktop
  // o certo é o contrário: a coluna tem 672px (`max-w-2xl`) e uma ficha gigante ali não lê como
  // conversa, lê como documento aberto.
  //
  // Então: **desktop fixo** e **celular proporcional à tela**. Os 132px descontados no celular
  // são o respiro da página + a borda do balão + os 15% que o `max-w-[85%]` deixa de fora, com
  // ~8px de folga (com 124 a conta encostava na beirada e sub-pixel podia cortar).
  //
  // 🔴 **Tudo aqui vale 1/4 da ÁREA do que valia** — pedido do Lucas em 23/09/2026: *"pode
  // deixar as imagens das fichas com 1/4 do tamanho atual para economizar espaço quando não
  // clicada"*. 1/4 de área = **metade de cada lado**, então os dois números foram divididos por
  // 2 (desktop 0,5 → 0,25; no celular o divisor virou `DOC_W * 2` e o teto/piso caíram à
  // metade). Conferido na conta em 6 larguras: dá exatos 25% de área em todas.
  //
  //   desktop .... 210x280 → **105x140**
  //   460px ...... 328x437 → **164x219**
  //   360px ...... 228x304 → **114x152**
  //
  // ⚠️ A miniatura deixou de ser "foto de WhatsApp" e virou **chip de abrir**: a 105px o texto
  // da ficha não se lê, e não é pra ler — é pra reconhecer a folha e tocar. Quem lê é o
  // lightbox. Se um dia o pedido for "quero ler sem clicar", o caminho é voltar a escala, não
  // aumentar a fonte da ficha (que é proporção de papel).
  const escalaMini = janela.w < 640
    ? Math.min(0.40, Math.max(0.21, (janela.w - 132) / (DOC_W * 2)))
    : 0.25
  // Ampliada: tem que caber inteira SEM CORTE, então a escala é limitada pelas DUAS dimensões —
  // só pela largura, num notebook de 768px de altura o pé da ficha ("Observações especiais")
  // ficava fora da tela, escondendo justamente o campo que a Matriz precisa ler. Os 132px
  // descontados são o cabeçalho do lightbox + a barra de baixar. `DOC_MIN_H` é a altura de
  // referência: a ficha pode crescer além disso, e aí o lightbox rola (tem `overflow-auto`).
  const escalaZoom = Math.max(0.5, Math.min(1.35, (janela.w - 40) / FICHA_W, (janela.h - 132) / DOC_MIN_H))

  // ---- Carga dos grupos (todos os encaminhamentos, de TODAS as unidades) ----
  // Sem filtro de unidade de propósito: são os 7 grupos do zap, e a Matriz vê os 7.
  // (A /encaminhamentos carrega essa mesma lista do mesmo jeito.)
  useEffect(() => {
    let vivo = true
    async function carregar() {
      const { data, error } = await supabase
        .from('supindas')
        .select('id, numero, data, responsavel, quantidade_pets, peso_total, status, observacoes, unidades(codigo, nome)')
        .order('data', { ascending: false })

      if (!vivo) return
      if (error) {
        console.error('Erro ao carregar encaminhamentos:', error)
        setLoading(false)
        return
      }
      setGrupos((data || []).map((e: Record<string, unknown>) => {
        const u = e.unidades as { codigo?: string; nome?: string } | null
        return {
          id: e.id as string,
          numero: e.numero as string,
          data: e.data as string,
          codigo_unidade: u?.codigo || '??',
          unidade_nome: u?.nome || u?.codigo || 'Unidade',
          responsavel: (e.responsavel as string) || null,
          quantidade_pets: (e.quantidade_pets as number) || 0,
          peso_total: (e.peso_total as number) || 0,
          status: e.status as string,
          observacoes: (e.observacoes as string) || null,
        }
      }))
      setLoading(false)
    }
    carregar()
    return () => { vivo = false }
  }, [supabase])

  /**
   * Carrega as observações **IMPORTANTES e não resolvidas** das fichas da viagem.
   *
   * 🔴 O filtro está na QUERY, não na tela, e a história explica por quê. A primeira versão
   * trazia TODAS as observações e virava parede de log de auditoria — porque 5 pontos do
   * sistema gravavam `importante: true` automático (449 linhas marcadas, 172 puro log). O
   * Lucas cortou a renderização inteira (*"Não é para renderizar observações"*), a causa foi
   * corrigida (os 5 sites passaram a gravar `false` e as 172 antigas foram limpas), e então
   * ele notou que a observação que ELE escreveu na Charlote não aparecia.
   *
   * A síntese das duas coisas é esta: renderiza **só o que alguém marcou como importante**.
   * Depois da limpeza isso é sinal, não ruído — medido em 23/09/2026: dos 1.374 contratos com
   * observação, só **168** têm alguma importante, mediana **1**, máximo 4, e apenas 7 passam
   * de 2 na mesma ficha. Por isso não há "ver anteriores" aqui: não há o que esconder.
   */
  const carregarObservacoes = useCallback(async (contratoIds: string[]) => {
    if (contratoIds.length === 0) { setObsPorContrato({}); return }
    const { data, error } = await supabase
      .from('tarefas')
      .select('id, contrato_id, descricao, criado_por, created_at')
      .in('contrato_id', contratoIds)
      .eq('importante', true)
      .eq('resolvido', false)
      .order('created_at', { ascending: true })

    if (error) { console.error('Erro ao carregar observações:', error); return }
    const mapa: Record<string, ObsMsg[]> = {}
    for (const t of (data || []) as unknown as {
      id: string; contrato_id: string; descricao: string; criado_por: string | null; created_at: string
    }[]) {
      ;(mapa[t.contrato_id] ||= []).push({
        id: t.id, texto: t.descricao, autor: t.criado_por, criadoEm: t.created_at,
      })
    }
    setObsPorContrato(mapa)
  }, [supabase])

  // ---- Observações da conversa ----
  //
  // 🔴 **Isto quebra o "somente leitura" da tela, de propósito** (pedido do Lucas em
  // 23/09/2026): *"cria uma possibilidade de colocar uma mensagem para cada ficha, com um
  // botão + emoji de sirene.. é para as unidades escreverem algo de observação... e isso que
  // escreverem, tem que alimentar o observações do contrato, como item importante"*.
  //
  // ⚠️ **Não existe campo novo.** A observação é uma linha de **`tarefas`** — a MESMA tabela
  // que o card "Observações" de `/contratos/[id]` lê e escreve (`components/contratos/
  // ObservacoesCard.tsx`). O insert copia o formato dele campo por campo, e o `tipo_id` sai de
  // `tarefa_tipos` pelo nome, igual lá. Assim o que a unidade escreve aqui aparece lá sem
  // nenhuma sincronização, porque é o mesmo registro.
  //
  // A diferença é **`importante: true`** (lá nasce `false`): foi o pedido explícito, e é o que
  // faz a observação subir no card do contrato e acender o alerta que o `GCAcaoModal` já lê
  // (`obsTemImportante`). Uma observação escrita aqui é a unidade avisando de algo fora do
  // comum na remoção — nasce em destaque, não como nota de rodapé.
  const salvarObservacao = useCallback(async (contratoId: string, texto: string): Promise<boolean> => {
    const limpo = texto.trim()
    if (!limpo || !currentUnit) return false

    // Mesma regra do ObservacoesCard: o tipo diz de QUEM é a observação, e sai da unidade
    // logada — não da unidade do encaminhamento. Quem escreve é quem está na tela.
    const tipoNome = currentUnit.is_matriz ? 'Observação da Matriz' : 'Observação da Unidade'
    const { data: tipo } = await supabase
      .from('tarefa_tipos').select('id').eq('nome', tipoNome).maybeSingle()

    const { error } = await supabase.from('tarefas').insert({
      contrato_id: contratoId,
      descricao: limpo,
      tipo_id: (tipo as { id: string } | null)?.id ?? null,
      unidade_id: currentUnit.id,
      criado_por: userName || userEmail?.split('@')[0] || null,
      criado_por_email: userEmail || null,
      importante: true,   // ⚠️ o pedido: entra no contrato como item IMPORTANTE
      resolvido: false,
    } as never)

    if (error) {
      console.error('Erro ao salvar a observação:', error)
      return false
    }
    // Recarrega o contrato tocado pra a sirene aparecer na hora — o insert nasce
    // `importante: true`, então ela entra na lista renderizada.
    await carregarObservacoes([contratoId])
    return true
  }, [supabase, currentUnit, userName, userEmail, carregarObservacoes])

  /**
   * Marca "Contato Realizado" — a PRIMEIRA etapa do GC, gravada daqui.
   *
   * Grava `contrato_gc.contato_status = 'contatado'` + `contato_tutor_em = agora`, exatamente
   * o que o botão "Registrar Contato" do `GCAcaoModal` faz. Não é um campo novo nem um fluxo
   * paralelo: é o mesmo registro, alcançado de outro lugar.
   *
   * 🔴 **Por que valeu trazer pra cá:** o degrau `contatado` estava enterrado no modal do GC e
   * praticamente ninguém o usava — **1 linha em 3.646** —, apesar de o telefonema acontecer
   * (3.551 linhas com `contato_tutor_em`). O estado existia e não era lido por quem precisava.
   * E o que a unidade quer saber é exatamente isto: *"a Matriz já falou com o tutor?"*, porque
   * entre o contato e o agendamento passa tempo (o tutor demora pra responder).
   *
   * ⚠️ **Só avança, nunca volta.** Escreve apenas quando `contato_status` está nulo — se o GC
   * já andou pra `agendado`, um clique daqui NÃO rebaixa. O botão já não aparece nesse caso,
   * mas a trava está aqui também porque tela aberta envelhece.
   *
   * ⚠️ Confere as linhas afetadas, como o `GCAcaoModal` faz: `update` sem retorno é RLS
   * negando em silêncio, não sucesso.
   */
  const marcarContatoRealizado = useCallback(async (contratoId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('contrato_gc')
      .update({ contato_status: 'contatado', contato_tutor_em: new Date().toISOString() } as never)
      .eq('contrato_id', contratoId)
      .is('contato_status', null)
      .select('contato_status, contato_tutor_em')

    if (error) { console.error('Erro ao marcar contato realizado:', error); return false }
    const linha = (data || [])[0] as { contato_status: string | null; contato_tutor_em: string | null } | undefined
    if (!linha) {
      // 0 linhas: ou o GC já tinha contato (corrida com outra aba), ou a RLS barrou.
      console.warn('Nada atualizado — contato já registrado ou permissão negada.')
      return false
    }
    setFichas(prev => prev.map(f => f.contratoId === contratoId
      ? { ...f, contatoStatus: linha.contato_status, contatoEm: linha.contato_tutor_em }
      : f))
    return true
  }, [supabase])

  // ---- Carga das fichas do grupo aberto (on demand — nunca as 523 viagens de uma vez) ----
  const abrirGrupo = useCallback(async (grupo: EncGrupo) => {
    setEncAberto(grupo)
    setFichas([])
    setCarregandoFichas(true)
    window.scrollTo({ top: 0 })

    const { data, error } = await supabase
      .from('contratos')
      .select(CAMPOS_FICHA)
      .eq('supinda_id', grupo.id)
      .order('data_acolhimento', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('Erro ao carregar fichas do encaminhamento:', error)
      setCarregandoFichas(false)
      return
    }
    const montadas = ((data || []) as unknown as LinhaContrato[]).map(c => montarFicha(c))
    setFichas(await resolverColaboradores(supabase, montadas))
    await carregarObservacoes(montadas.map(f => f.contratoId))
    setCarregandoFichas(false)
  }, [supabase, carregarObservacoes])

  // Fechar a ficha ampliada no Esc (é um lightbox, comportamento esperado)
  useEffect(() => {
    if (!fichaAmpliada) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFichaAmpliada(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fichaAmpliada])

  // ---- Calendário: mesmas janelas da /encaminhamentos (10 dias desktop, scroll no mobile) ----
  const desktopVisivel: Date[] = []
  for (let i = -7; i <= 2; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + desktopOffset + i)
    desktopVisivel.push(d)
  }
  const mobileDias: Date[] = []
  for (let i = -14; i <= 13; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    mobileDias.push(d)
  }

  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const mobileJaRolou = useRef(false)
  useEffect(() => {
    if (mobileScrollRef.current && !mobileJaRolou.current) {
      const c = mobileScrollRef.current
      c.scrollLeft = (c.scrollWidth / mobileDias.length) * 13 - 8
      mobileJaRolou.current = true
    }
  }, [mobileDias.length])

  const gruposDoDia = (dia: Date) => grupos.filter(g => g.data === dataLocal(dia))
  const gruposSelecionados = gruposDoDia(diaSelecionado)

  // ---- Gate ----
  // Não redireciona: `flsPermissions` nasce vazio (= permissivo) e um redirect piscaria a
  // tela antes de saber a resposta. Um aviso com o caminho certo não tem essa corrida.
  if (!fluxoNovo) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6 text-center">
        <Info className="h-8 w-8 mx-auto mb-3 text-[var(--surface-400)]" />
        <h1 className="text-lg font-semibold text-[var(--surface-700)] mb-1">Ainda não é por aqui</h1>
        <p className="text-sm text-[var(--surface-500)] mb-4">
          Esta unidade segue montando encaminhamento na tela de sempre.
        </p>
        <Link href="/encaminhamentos" className="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          Ir para Encaminhamentos
        </Link>
      </div>
    )
  }

  // ============================================
  // Render
  // ============================================
  return (
    <div className="pb-24">
      {/* ===== Cabeçalho ===== */}
      {/* 🔴 Só ícone + nome da tela. **Nada de subtítulo/descrição aqui** — é regra de header
          do CRM, e eu tinha posto uma linha "Escolha o dia, abra o grupo…" que virou ruído.
          Se precisar contextualizar o que a tela faz, o lugar é o `desc` do `field-catalog.ts`
          (que aparece em /admin/visibilidade) ou um tooltip no ícone. */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[var(--surface-700)] flex items-center gap-2">
          <Users className="h-5 w-5 text-[#25D366]" />
          Grupos de Encaminhamento
        </h1>
      </div>

      {/* ===== DESKTOP: calendário-line ===== */}
      <div className="hidden md:block relative mb-6">
        {desktopOffset !== 0 && (
          <button
            onClick={() => { setDesktopOffset(0); setDiaSelecionado(hoje) }}
            className="absolute -top-5 left-0 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            Ver Hoje
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDesktopOffset(p => p - 2)}
            className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
            title="2 dias antes"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 flex gap-1 overflow-visible pt-2">
            {desktopVisivel.map((dia, i) => {
              const ehHoje = isMesmoDia(dia, hoje)
              const selecionado = isMesmoDia(dia, diaSelecionado)
              const fds = dia.getDay() === 0 || dia.getDay() === 6
              return (
                <button
                  key={i}
                  onClick={() => { setDiaSelecionado(dia); setEncAberto(null) }}
                  className={`relative flex-1 min-w-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                    ${selecionado
                      ? ehHoje
                        ? 'border-blue-500 bg-transparent text-blue-400'
                        : 'border-blue-500 bg-blue-500/15 text-blue-400'
                      : fds
                        ? 'border-[var(--surface-200)] bg-[var(--surface-100)] text-[var(--surface-400)] hover:border-[var(--surface-300)]'
                        : 'border-[var(--surface-200)] bg-transparent text-[var(--surface-500)] hover:border-[var(--surface-300)] hover:bg-[var(--surface-50)]'
                    }`}
                >
                  {ehHoje && (
                    <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 z-10 px-2 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-[var(--shell-bg)]">
                      Hoje
                    </span>
                  )}
                  <span className={`text-xs font-semibold uppercase ${selecionado ? 'text-blue-400' : ''}`}>
                    {DIAS_SEMANA[dia.getDay()]}
                  </span>
                  <span className={`text-xs ${selecionado ? 'text-blue-300' : ''}`}>{formatDia(dia)}</span>
                  <span className="flex flex-col items-center gap-0.5 mt-0.5 w-full">
                    {gruposDoDia(dia).map(g => (
                      <span
                        key={g.id}
                        className="block w-full py-0.5 mx-0.5 rounded-sm text-xs font-bold leading-tight text-center"
                        style={{ background: UNIT_COLORS[g.codigo_unidade] || '#6366f1', color: textoSobreUnidade(g.codigo_unidade) }}
                      >
                        {g.numero}
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setDesktopOffset(p => p + 2)}
            className="p-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--shell-text)] hover:bg-[var(--surface-100)] transition-colors shrink-0"
            title="2 dias depois"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ===== MOBILE: calendário-line ===== */}
      <div className="md:hidden mb-5">
        <div
          ref={mobileScrollRef}
          className="flex gap-2 overflow-x-auto overflow-y-visible scrollbar-hide snap-x snap-mandatory px-1 -mx-1 pt-2"
          style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
        >
          {mobileDias.map((dia, i) => {
            const ehHoje = isMesmoDia(dia, hoje)
            const selecionado = isMesmoDia(dia, diaSelecionado)
            const fds = dia.getDay() === 0 || dia.getDay() === 6
            return (
              <button
                key={i}
                onClick={() => { setDiaSelecionado(dia); setEncAberto(null) }}
                className={`relative snap-start shrink-0 pt-3.5 pb-1 px-0 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-0.5
                  ${selecionado
                    ? ehHoje
                      ? 'border-blue-500 bg-transparent text-blue-400'
                      : 'border-blue-500 bg-blue-500/15 text-blue-400'
                    : fds
                      ? 'border-[var(--surface-200)] bg-[var(--surface-100)] text-[var(--surface-400)]'
                      : 'border-[var(--surface-200)] bg-transparent text-[var(--surface-500)]'
                  }`}
                style={{ width: 'calc((100% - 2rem) / 5)' }}
              >
                {ehHoje && (
                  <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 z-10 px-2 text-[9px] font-bold uppercase tracking-wider text-orange-400 bg-[var(--shell-bg)]">
                    Hoje
                  </span>
                )}
                <span className={`text-xs font-semibold uppercase ${selecionado ? 'text-blue-400' : ''}`}>
                  {DIAS_SEMANA[dia.getDay()]}
                </span>
                <span className={`text-xs ${selecionado ? 'text-blue-300' : ''}`}>{formatDia(dia)}</span>
                <span className="flex flex-col items-center gap-0.5 mt-0.5 w-full px-0.5">
                  {gruposDoDia(dia).map(g => (
                    <span
                      key={g.id}
                      className="block w-full py-0.5 rounded-sm text-xs font-bold leading-tight text-center"
                      style={{ background: UNIT_COLORS[g.codigo_unidade] || '#6366f1', color: textoSobreUnidade(g.codigo_unidade) }}
                    >
                      {g.numero}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ===== Conteúdo: lista de grupos do dia OU a conversa ===== */}
      {loading ? (
        <div className="text-sm text-[var(--surface-400)] py-8 text-center">Carregando encaminhamentos…</div>
      ) : encAberto ? (
        <Conversa
          grupo={encAberto}
          fichas={fichas}
          carregando={carregandoFichas}
          escalaMini={escalaMini}
          obsPorContrato={obsPorContrato}
          onSalvarObs={salvarObservacao}
          podeMarcarContato={podeMarcarContato}
          onMarcarContato={marcarContatoRealizado}
          onVoltar={() => setEncAberto(null)}
          onAmpliar={setFichaAmpliada}
        />
      ) : (
        <ListaDeGrupos
          dia={diaSelecionado}
          grupos={gruposSelecionados}
          unidadeAtualCodigo={(currentUnit as { codigo?: string } | null)?.codigo}
          onAbrir={abrirGrupo}
        />
      )}

      {/* ===== Lightbox da ficha ampliada (com baixar PDF/PNG) ===== */}
      {fichaAmpliada && (
        <LightboxFicha
          ficha={fichaAmpliada}
          escala={escalaZoom}
          onFechar={() => setFichaAmpliada(null)}
        />
      )}
    </div>
  )
}

// ============================================
// A ficha reduzida
// ============================================
/**
 * A ficha-documento em escala. Largura é fixa (`DOC_W`), **altura é livre** — o HTML cresce com
 * o conteúdo (nome comprido quebra linha, observação longa empurra o pé).
 *
 * 🔴 Por isso a caixa **mede o nó real** em vez de calcular `DOC_H * escala`:
 * `transform: scale()` não muda o tamanho de layout, então sem medir o balão ficaria com a
 * altura de outra ficha — sobrando branco numa, cortando a outra. `offsetHeight` ignora
 * transform de propósito, e é exatamente o número que precisamos.
 */
function FichaEscalada({ ficha, escala }: { ficha: FichaContratoData; escala: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [alturaNatural, setAlturaNatural] = useState(DOC_MIN_H)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAlturaNatural(el.offsetHeight)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ width: DOC_W * escala, height: alturaNatural * escala, overflow: 'hidden' }}>
      <div ref={ref} style={{ width: DOC_W, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
        <FichaRemocaoDoc contrato={ficha} />
      </div>
    </div>
  )
}

// ============================================
// Lightbox: a ficha inteira + baixar PDF/PNG
// ============================================
function LightboxFicha({ ficha, escala, onFechar }: {
  ficha: FichaMsg
  escala: number
  onFechar: () => void
}) {
  // 🔴 Nó OCULTO em escala 1:1 — é dele que o html2canvas captura. O visível está dentro de um
  // `transform: scale()`, e o html2canvas lê o layout **ignorando transform**: capturar do
  // visível daria um arquivo em tamanho de projeto com o conteúdo desalinhado. Mesmo padrão que
  // o `lib/impressao-unificada.ts` já usa pra imprimir ficha em lote.
  const capturaRef = useRef<HTMLDivElement>(null)
  const [baixando, setBaixando] = useState<'png' | 'pdf' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const nomeBase = nomeDeArquivo('ficha', ficha.petNome, ficha.lacre)

  async function baixar(formato: 'png' | 'pdf') {
    const el = capturaRef.current
    if (!el || baixando) return
    setBaixando(formato)
    setErro(null)
    try {
      if (formato === 'png') await baixarFichaPng(el, nomeBase)
      else await baixarFichaPdf(el, nomeBase)
    } catch (e) {
      console.error('Erro ao baixar a ficha:', e)
      setErro('Não deu pra gerar o arquivo. Tente de novo.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 overflow-auto"
      onClick={onFechar}
    >
      <div className="flex items-center justify-between gap-3 w-full max-w-md mb-3 text-white/90">
        <span className="text-sm font-medium truncate">
          Ficha de {ficha.petNome}
          {ficha.lacre ? ` · lacre ${ficha.lacre}` : ''}
        </span>
        <button
          onClick={onFechar}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          title="Fechar (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* A ficha visível — o mesmo componente da miniatura, em escala maior */}
      <div onClick={e => e.stopPropagation()} style={{ borderRadius: 6, overflow: 'hidden' }}>
        <FichaEscalada ficha={ficha.ficha} escala={escala} />
      </div>

      {/* Baixar: PDF primeiro, que é o que vai pra impressora */}
      <div onClick={e => e.stopPropagation()} className="flex items-center gap-2 mt-3">
        <button
          onClick={() => baixar('pdf')}
          disabled={baixando !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {baixando === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </button>
        <button
          onClick={() => baixar('png')}
          disabled={baixando !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {baixando === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PNG
        </button>
        <Link
          href={`/contratos/${ficha.contratoId}`}
          className="ml-1 text-xs text-white/70 hover:text-white underline"
        >
          Abrir o contrato
        </Link>
      </div>

      {erro && <p className="mt-2 text-xs text-red-300">{erro}</p>}

      {/* Nó de captura: renderizado de verdade (o html2canvas precisa de layout real).
          🔴 Fica no **canto superior esquerdo**, NÃO em `left: -10000`. O
          `foreignObjectRendering` (obrigatório aqui — ver `lib/ficha-download.ts`) não
          translada o offset: elemento deslocado do topo do documento sai **em branco**.
          Quem esconde é o overlay preto do lightbox, que cobre a tela toda por cima — daí o
          `zIndex: 0` contra o `z-50` do overlay. */}
      <div
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' }}
      >
        <div ref={capturaRef} style={{ width: DOC_W }}>
          <FichaRemocaoDoc contrato={ficha.ficha} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// "Contato Realizado" — a primeira etapa do GC, marcada da conversa
// ============================================
/**
 * Botão próprio pra ter estado LOCAL de "salvando". Se o spinner morasse na `Conversa`, um
 * clique numa ficha piscaria as 39 outras da viagem.
 *
 * ⚠️ Não tem confirmação e não tem desfazer aqui — e é decisão, não esquecimento: é um
 * carimbo de "eu liguei", o estado só avança (`null` → `contatado` → `agendado`), e voltar
 * atrás é trabalho do GC, que é onde o resto da jornada do tutor vive. Um `confirm()` em cima
 * de uma ação de um clique que não perde nada seria atrito sem ganho.
 */
function BotaoContatoRealizado({ contratoId, onMarcar }: {
  contratoId: string
  onMarcar: (contratoId: string) => Promise<boolean>
}) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(false)

  return (
    <button
      onClick={async () => {
        if (salvando) return
        setSalvando(true); setErro(false)
        const ok = await onMarcar(contratoId)
        setSalvando(false)
        if (!ok) setErro(true)
      }}
      disabled={salvando}
      title="Registrar que a Matriz já falou com o tutor (1ª etapa do GC)"
      className="flex flex-1 items-center justify-center gap-1.5 min-h-11 py-2 border-l text-xs font-semibold hover:bg-black/5 transition-colors disabled:opacity-50"
      style={{ borderColor: 'var(--zap-balao-borda)', color: erro ? '#dc2626' : 'var(--zap-acao)' }}
    >
      {salvando
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <CheckCheck className="h-4 w-4" />}
      {erro ? 'Falhou — tentar de novo' : 'Contato Realizado'}
    </button>
  )
}

// ============================================
// Observações de uma ficha (a "mensagem" da unidade)
// ============================================
/**
 * As observações que a unidade escreve sobre a ficha, como mensagens na conversa, mais o botão
 * de escrever uma nova.
 *
 * 🔴 **Não é um campo desta tela. É `tarefas`** — a mesma tabela do card "Observações" de
 * `/contratos/[id]`. O que for escrito aqui aparece lá, e vice-versa, porque é o mesmo
 * registro. E entra **`importante: true`**: é a unidade avisando de algo fora do comum na
 * remoção, então nasce em destaque. Ver `salvarObservacao`.
 *
 * ⚠️ Componente próprio pra o `textarea` ter estado LOCAL. Se o texto morasse no estado da
 * `Conversa`, cada tecla digitada re-renderizaria as fichas todas da viagem — e SP manda 46
 * pets por viagem, cada um com uma ficha de ~40 nós. Digitar ficaria travado.
 */
function BlocoObservacoes({ contratoId, petNome, obs, onSalvar }: {
  contratoId: string
  petNome: string
  obs: ObsMsg[]
  onSalvar: (contratoId: string, texto: string) => Promise<boolean>
}) {
  const [compondo, setCompondo] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(false)


  async function salvar() {
    if (!texto.trim() || salvando) return
    setSalvando(true)
    setErro(false)
    const ok = await onSalvar(contratoId, texto)
    setSalvando(false)
    // Sem aviso de "salvou": a sirene aparece na conversa na hora, e o balão novo é um
    // feedback melhor que uma frase.
    if (ok) { setTexto(''); setCompondo(false) } else { setErro(true) }
  }

  return (
    <>
      {/* As observações IMPORTANTES, como mensagem de sirene.
          ⚠️ **Só as importantes** — nunca a lista toda. Ver `carregarObservacoes` pro histórico
          dessa decisão; em resumo: renderizar tudo virava parede de log de auditoria, e o
          conserto foi na origem (automático não nasce mais importante) + este filtro.
          O balão usa vermelho, não o verde do zap: é a única mensagem da conversa que grita, e
          precisa se distinguir das outras duas. As classes de vermelho são as que TÊM remap no
          `[data-theme="white"]` (`bg-red-500/10`, `border-red-700`, `text-red-400`). */}
      {obs.map(o => (
        <div key={o.id} className="flex">
          <div className="max-w-[85%] rounded-lg rounded-tl-none border border-red-700 bg-red-500/10 p-2.5 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="shrink-0" style={{ fontSize: 13 }}>🚨</span>
              <span className="text-xs font-semibold text-red-400">Observação importante</span>
            </div>
            <p className="text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--zap-balao-texto)' }}>
              {o.texto}
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-1">
              {o.autor && <span className="text-[11px]" style={{ color: 'var(--zap-balao-meta)' }}>{o.autor}</span>}
              <span className="text-xs font-mono" style={{ color: 'var(--zap-balao-meta)' }}>
                {horaDoAcolhimento(o.criadoEm)}
              </span>
            </div>
          </div>
        </div>
      ))}

      {/* Escrever uma nova */}
      {compondo ? (
        <div className="flex">
          <div className="max-w-[85%] w-full sm:w-[320px] rounded-lg rounded-tl-none bg-[var(--surface-100)] border border-red-700 p-2 shadow-sm">
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder={`Observação sobre ${petNome}…`}
              rows={3}
              autoFocus
              className="w-full bg-transparent text-xs text-[var(--surface-700)] placeholder:text-[var(--surface-400)] resize-none outline-none"
            />
            {erro && <p className="text-[11px] text-red-400 mb-1">Não deu pra salvar. Tente de novo.</p>}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--surface-200)]">
              <button
                onClick={() => { setCompondo(false); setTexto(''); setErro(false) }}
                className="min-h-11 px-3 text-xs text-[var(--surface-500)] hover:text-[var(--surface-700)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={!texto.trim() || salvando}
                className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg bg-red-500/10 border border-red-700 text-xs font-semibold text-red-400 disabled:opacity-40 hover:bg-red-500/20 transition-colors"
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span style={{ fontSize: 13 }}>🚨</span>}
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex">
          {/* ⚠️ `min-h-11` (44px) — alvo de toque no celular, igual ao "Conversar". */}
          <button
            onClick={() => setCompondo(true)}
            className="flex items-center gap-1.5 min-h-11 px-3 rounded-lg border border-dashed border-[var(--surface-300)] text-xs font-medium text-[var(--surface-500)] hover:border-red-700 hover:text-red-400 transition-colors"
          >
            <span style={{ fontSize: 13 }}>🚨</span>
            + Observação
          </button>
        </div>
      )}
    </>
  )
}

// ============================================
// Lista de grupos do dia (a "lista de conversas")
// ============================================
function ListaDeGrupos({ dia, grupos, unidadeAtualCodigo, onAbrir }: {
  dia: Date
  grupos: EncGrupo[]
  unidadeAtualCodigo?: string
  onAbrir: (g: EncGrupo) => void
}) {
  return (
    <div>
      {/* `capitalize` do Tailwind maiusculiza TODA palavra ("Terça-Feira, 15 De Setembro").
          `first-letter` pega só a primeira, que é o que o português pede. */}
      <h2 className="text-sm font-semibold text-[var(--surface-600)] mb-3 first-letter:uppercase">
        {diaExtenso(dataLocal(dia))}
      </h2>

      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--surface-200)] p-8 text-center">
          <MessageCircle className="h-7 w-7 mx-auto mb-2 text-[var(--surface-300)]" />
          <p className="text-sm text-[var(--surface-400)]">Nenhum encaminhamento neste dia.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--surface-200)] overflow-hidden divide-y divide-[var(--surface-200)]">
          {grupos.map(g => {
            const st = STATUS_ENC[g.status] || { rotulo: g.status, classe: 'bg-[var(--surface-100)] text-[var(--surface-500)] border-[var(--surface-200)]' }
            const cor = UNIT_COLORS[g.codigo_unidade] || '#6366f1'
            return (
              <button
                key={g.id}
                onClick={() => onAbrir(g)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--surface-50)] transition-colors"
              >
                {/* Avatar do grupo — a cor da unidade é o rosto do grupo */}
                <span
                  className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: cor, color: textoSobreUnidade(g.codigo_unidade) }}
                >
                  {g.codigo_unidade}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--surface-700)] truncate">
                      {g.unidade_nome}
                      {g.codigo_unidade === unidadeAtualCodigo && (
                        <span className="ml-1.5 text-[11px] font-medium text-[var(--surface-400)]">(sua unidade)</span>
                      )}
                    </span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold border ${st.classe}`}>
                      {st.rotulo}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--surface-400)] mt-0.5">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="font-mono font-semibold text-[13px] text-[var(--surface-500)]">{g.numero}</span>
                    <span>·</span>
                    <span>{g.quantidade_pets} {g.quantidade_pets === 1 ? 'ficha' : 'fichas'}</span>
                    <span>·</span>
                    <span className="font-mono">{fmtPeso(g.peso_total)}</span>
                    {g.responsavel && (
                      <>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline truncate">{g.responsavel}</span>
                      </>
                    )}
                  </span>
                </span>

                <ChevronRight className="h-4 w-4 text-[var(--surface-300)] shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================
// A conversa do grupo
// ============================================
function Conversa({ grupo, fichas, carregando, escalaMini, obsPorContrato, podeMarcarContato, onMarcarContato, onSalvarObs, onVoltar, onAmpliar }: {
  grupo: EncGrupo
  fichas: FichaMsg[]
  carregando: boolean
  escalaMini: number
  obsPorContrato: Record<string, ObsMsg[]>
  podeMarcarContato: boolean
  onMarcarContato: (contratoId: string) => Promise<boolean>
  onSalvarObs: (contratoId: string, texto: string) => Promise<boolean>
  onVoltar: () => void
  onAmpliar: (f: FichaMsg) => void
}) {
  const cor = UNIT_COLORS[grupo.codigo_unidade] || '#6366f1'
  const st = STATUS_ENC[grupo.status] || { rotulo: grupo.status, classe: 'bg-[var(--surface-100)] text-[var(--surface-500)] border-[var(--surface-200)]' }

  return (
    // Coluna estreita de propósito: a conversa é uma janela de chat, não uma tabela. Num
    // monitor de 1500px o balão de 200px ficava perdido num campo vazio de 1300px.
    <div className="max-w-2xl rounded-xl border border-[var(--surface-200)] overflow-hidden">
      {/* ---- Cabeçalho do grupo (a barra de cima da conversa) ---- */}
      <div className="flex items-center gap-3 p-3 bg-[var(--surface-100)] border-b border-[var(--surface-200)]">
        <button
          onClick={onVoltar}
          className="shrink-0 p-1.5 -ml-1 rounded-lg text-[var(--surface-400)] hover:text-[var(--surface-700)] hover:bg-[var(--surface-200)] transition-colors"
          title="Voltar para os grupos do dia"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span
          className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: cor, color: textoSobreUnidade(grupo.codigo_unidade) }}
        >
          {grupo.codigo_unidade}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--surface-700)] truncate">{grupo.unidade_nome}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold border ${st.classe}`}>
              {st.rotulo}
            </span>
          </div>
          <div className="text-xs text-[var(--surface-400)] truncate">
            <span className="font-mono font-semibold">{grupo.numero}</span>
            {' · '}{grupo.quantidade_pets} {grupo.quantidade_pets === 1 ? 'ficha' : 'fichas'}
            {' · '}<span className="font-mono">{fmtPeso(grupo.peso_total)}</span>
            {grupo.responsavel && ` · ${grupo.responsavel}`}
          </div>
        </div>
      </div>

      {/* ---- Corpo da conversa ---- */}
      {/* Fundo do grupo no bege característico do WhatsApp (pedido do Lucas, 23/09/2026).
          Token e não cor fixa: o zap tem paleta clara E escura, e cravar o bege deixaria o
          tema escuro com cara de página clara suja. Ver `--zap-*` no globals.css. */}
      <div className="p-3 sm:p-4 space-y-4" style={{ background: 'var(--zap-fundo)' }}>
        {/* Divisor de data, igual ao do zap */}
        <div className="flex justify-center">
          <span
            className="px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wide capitalize shadow-sm"
            style={{ background: 'var(--zap-divisor-bg)', color: 'var(--zap-divisor-texto)' }}
          >
            {diaExtenso(grupo.data)}
          </span>
        </div>

        {carregando ? (
          <div className="text-sm text-[var(--surface-400)] py-8 text-center">Carregando as fichas…</div>
        ) : fichas.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="h-7 w-7 mx-auto mb-2 text-[var(--surface-300)]" />
            <p className="text-sm text-[var(--surface-400)]">
              Este encaminhamento ainda não tem nenhum pet vinculado.
            </p>
            <p className="text-xs text-[var(--surface-400)] mt-1">
              Os pets entram arrastando no Pipeline, na etapa Ativo.
            </p>
          </div>
        ) : (
          fichas.map(f => {
            const linkZap = linkChatDireto(f.telefone)
            return (
              <div key={f.contratoId} className="space-y-1.5">
                {/* ===== Mensagem 1: a foto da ficha ===== */}
                <div className="flex">
                  <div
                    className="max-w-[85%] rounded-lg rounded-tl-none p-1.5 shadow-sm"
                    style={{ background: 'var(--zap-balao)', border: '1px solid var(--zap-balao-borda)' }}
                  >
                    <button
                      onClick={() => onAmpliar(f)}
                      className="block relative rounded overflow-hidden group"
                      title="Ver a ficha inteira"
                    >
                      {/* A miniatura É a ficha-documento em escala. Ver a nota do topo. */}
                      <FichaEscalada ficha={f.ficha} escala={escalaMini} />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </button>
                    {/* Legenda do "anexo": LACRE · nome do pet — pedido do Lucas em 23/09/2026.
                        O lacre lidera a linha porque é por ele que a operação identifica o pet
                        (mesma ordem do card de `/tarefas`, "5646 — MORCILLA"). Aqui ele sai
                        **sem `#`, no MESMO tamanho e fonte do nome (15px), em azul e negrito** —
                        o peso visual separa os dois sem precisar de símbolo nem de monospace, e
                        o azul amarra com os campos preenchidos da ficha logo acima.
                        ⚠️ `text-blue-400` e não um hex: só a classe tem remap no
                        `[data-theme="white"]` (#2563eb), e a legenda precisa ler nos 4 temas.
                        ⚠️ **Sem ícone de espécie** — mesma conversa. Abre mão da exceção do
                        §9.1 ("o ícone do pet continua sendo o emoji") de propósito: a ficha
                        logo acima já traz espécie, raça e porte escritos, então o emoji era
                        redundância ocupando a linha. */}
                    {/* ⚠️ Havia um `maxWidth: miniW` aqui até 23/09/2026. Fazia sentido quando a
                        miniatura tinha 210–328px, mas com ela a 1/4 da área (105px no desktop) o
                        cap truncava lacre e nome. Agora é a LEGENDA que define a largura do
                        balão, e a miniatura é o elemento estreito dentro dele.
                        🔴 `width: max-content` é o que faz isso funcionar: sem ele o balão ficava
                        do tamanho da MINIATURA e a legenda encolhia (o `truncate` do nome cede
                        antes de empurrar). Medido: o nome mais longo desta base
                        ("BUCKMINSTER (BUCK)") precisa de 159px, e a legenda inteira de 211px —
                        com o cap de 105px sobrava menos da metade. O `maxWidth: '100%'` mantém
                        o teto do balão (`max-w-[85%]`), e aí sim o `truncate` do nome entra. */}
                    <div
                      className="flex items-center gap-1.5 px-1 pt-1.5 pb-0.5 whitespace-nowrap"
                      style={{ width: 'max-content', maxWidth: '100%' }}
                    >
                      {f.lacre && (
                        <span className="shrink-0 text-[15px] font-bold" style={{ color: 'var(--zap-lacre)' }}>
                          {f.lacre}
                        </span>
                      )}
                      <span className="text-[15px] font-semibold truncate" style={{ color: 'var(--zap-balao-texto)' }}>{f.petNome}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1 px-1 pb-0.5">
                      {/* 🔴 IND = verde, COL = roxo — padrão de cor do produto. As classes são
                          as MESMAS do `chipsTipo` do pipeline (`contratos/page.tsx`), não
                          equivalentes: só elas têm remap no `[data-theme="white"]`, e o chip
                          precisa ler nos 4 temas. Eu tinha posto IND violeta / COL azul. */}
                      {f.tipoCremacao && (
                        <span className={`mr-auto px-1.5 rounded text-xs font-bold ${f.tipoCremacao === 'individual' ? 'bg-emerald-900/30 text-emerald-300' : 'bg-violet-900/30 text-violet-300'}`}>
                          {f.tipoCremacao === 'individual' ? 'IND' : 'COL'}
                        </span>
                      )}
                      <span className="text-xs font-mono" style={{ color: 'var(--zap-balao-meta)' }}>{f.hora}</span>
                      {/* 🔴 O check duplo era DECORATIVO — pintava azul em toda ficha, sempre,
                          sem significar nada. Era um sinal falso que eu tinha introduzido ao
                          imitar o WhatsApp. Agora ele diz o que o check duplo diz no zap:
                          **chegou no destinatário**. Aqui, "a Matriz já falou com o tutor".
                          Cinza = a chamar · azul + 🆗 = contato feito.
                          ⚠️ Vale pra `contatado` E pra `agendado`: os dois querem dizer que o
                          contato aconteceu, e `agendado` é 97% da base. Ver `contatoStatus`. */}
                      {f.contatoStatus ? (
                        <span
                          className="flex items-center gap-0.5"
                          title={`Contato realizado${f.contatoEm ? ` em ${dataHoraCurta(f.contatoEm)}` : ''}${f.contatoStatus === 'agendado' ? ' · despedida já agendada' : ' · aguardando o tutor responder'}`}
                        >
                          <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
                          <span style={{ fontSize: 12 }}>🆗</span>
                        </span>
                      ) : (
                        <span className="flex items-center" title="A Matriz ainda não falou com o tutor">
                          <CheckCheck className="h-3.5 w-3.5" style={{ color: 'var(--zap-balao-meta)' }} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ===== Mensagem 2: o contato do tutor anexado ===== */}
                {/* É o contato que a unidade manda logo depois da foto, pra Matriz salvar na
                    agenda e ligar. O nome é o MESMO que o botão "copiar nome para agenda"
                    do detalhe do contrato gera (`lib/nome-agenda.ts`). */}
                <div className="flex">
                  <div
                    className="max-w-[85%] w-full sm:w-auto sm:min-w-[260px] rounded-lg rounded-tl-none shadow-sm overflow-hidden"
                    style={{ background: 'var(--zap-balao)', border: '1px solid var(--zap-balao-borda)' }}
                  >
                    <div className="flex items-center gap-2.5 p-2.5">
                      <span className="shrink-0 h-9 w-9 rounded-full bg-[var(--surface-300)] text-[var(--surface-700)] flex items-center justify-center text-xs font-bold">
                        {iniciais(f.contatoNome || f.petNome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold break-words" style={{ color: 'var(--zap-balao-texto)' }}>
                          {f.nomeAgenda}
                        </span>
                        <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: 'var(--zap-balao-meta)' }}>
                          <Phone className="h-3 w-3 shrink-0" />
                          <span className="font-mono">{fmtTelefone(f.telefone) || 'sem telefone'}</span>
                        </span>
                      </span>
                    </div>
                    {/* Pé do card de contato: Conversar | Contato Realizado.
                        🔴 `min-h-11` (44px) e não `py-2`: medido em 23/09/2026, o botão saía com
                        **33px de altura** no celular, abaixo do mínimo de alvo de toque (44px
                        iOS / 48dp Material) — e errar o toque aqui é ligar pro tutor errado.
                        ⚠️ O "Contato Realizado" só aparece **pra Matriz, com a chave ligada e
                        enquanto não houve contato** — as outras unidades só leem a bandeirinha
                        na legenda da ficha. Ver `podeMarcarContato`. */}
                    <div className="flex items-stretch border-t" style={{ borderColor: 'var(--zap-balao-borda)' }}>
                      {linkZap ? (
                        <a
                          href={linkZap}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 min-h-11 py-2 text-xs font-semibold hover:bg-black/5 transition-colors"
                          style={{ color: 'var(--zap-acao)' }}
                        >
                          <MessageCircle className="h-4 w-4" />
                          Conversar
                        </a>
                      ) : (
                        <span
                          className="flex flex-1 items-center justify-center gap-1.5 min-h-11 py-2 text-xs"
                          style={{ color: 'var(--zap-balao-meta)' }}
                        >
                          Sem telefone
                        </span>
                      )}
                      {podeMarcarContato && !f.contatoStatus && (
                        <BotaoContatoRealizado contratoId={f.contratoId} onMarcar={onMarcarContato} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ===== Mensagem 3: observações da unidade sobre esta ficha ===== */}
                <BlocoObservacoes
                  contratoId={f.contratoId}
                  petNome={f.petNome}
                  obs={obsPorContrato[f.contratoId] || []}
                  onSalvar={onSalvarObs}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
