'use client'

// ============================================================================
// /tarefas — fila de trabalho do perfil Operacional (mobile-first).
//
// 2 abas:
//  - "Minhas Tarefas" (todo mundo com módulo cb_operacional vê a própria fila,
//    inclusive gerente/concierge que se autoatribuem remoção — ver LayoutWrapper).
//  - "Atribuir" (só gerente/operador/super_admin) — pool de Entrega/Molde/Carimbo/
//    Pelo Extra pendentes na unidade, pra mandar pra um Operacional.
//
// Remoção NÃO passa por pool — nasce quando o campo Responsável da Tratativa resolve
// pra um usuário Operacional (ver TratativaModal.tsx). Aqui só CONCLUI: preenche lacre
// (obrigatório) + anotação, e isso dispara a criação do contrato sozinha
// (criarContratoDeFicha, responsavelEhOperacional=true).
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { HandHeart, PackageCheck, PawPrint, Fingerprint, Scissors, Feather, MapPin, Navigation, FileDown, Check, Loader2, ClipboardList, UserPlus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUnit } from '@/contexts/UnitContext'
import { useToast } from '@/components/ui/Toast'
import { criarContratoDeFicha, ContratoValidationError } from '@/lib/criar-contrato-de-ficha'
import { gerarContratoPDF, contratoFilename } from '@/lib/contrato-pdf'
import { hojeLocal, inputLocalParaIso } from '@/lib/date-local'

type TarefaTipo = 'remocao' | 'entrega' | 'molde_patinha' | 'carimbo' | 'pelo_extra' | 'pelinho'

const TIPO_INFO: Record<TarefaTipo, { label: string; icon: typeof HandHeart; cor: string }> = {
  remocao: { label: 'Acolhimento', icon: HandHeart, cor: '#0ea5e9' },
  entrega: { label: 'Realizar Entrega', icon: PackageCheck, cor: '#22c55e' },
  molde_patinha: { label: 'Tirar Molde', icon: PawPrint, cor: '#a855f7' },
  carimbo: { label: 'Tirar Carimbo', icon: Fingerprint, cor: '#f59e0b' },
  pelo_extra: { label: 'Tirar Pelo Extra', icon: Scissors, cor: '#ec4899' },
  pelinho: { label: 'Tirar Pelinho', icon: Feather, cor: '#14b8a6' },
}

// Cor única do botão "Atribuir" em todo o pool — não usa mais a cor por tipo (que continua
// valendo pra ícone/label/badge de tudo mais), pra padronizar a ação mais comum da tela.
const AZUL_ROYAL = '#2563eb'

type TarefaRow = {
  id: string
  unidade_id: string
  tipo: TarefaTipo
  ficha_id: string | null
  contrato_id: string | null
  contrato_produto_id: string | null
  atribuido_a: string
  status: 'pendente' | 'concluida'
  lacre: string | null
  observacao_atribuicao: string | null
  atribuido_em: string
  concluido_em?: string | null
}

type FichaRemocao = {
  id: string
  nome_completo: string
  cpf: string
  telefone: string
  email: string | null
  cep: string
  estado: string
  cidade: string
  bairro: string
  endereco: string
  numero: string
  complemento: string | null
  outros_tutores: string[] | null
  nome_pet: string
  idade: string | null
  especie: string
  genero: string
  raca: string | null
  cor: string
  peso: string | null
  cremacao: string
  como_conheceu: string[] | null
  outro_especificar: string | null
  observacoes: string | null
  localizacao: string
  localizacao_outra: string | null
  unidade_id: string
  contrato_id: string | null
  processada: boolean | null
  op_dados: Record<string, unknown> | null
}

type ContratoResumo = {
  id: string
  codigo: string
  pet_nome: string
  pet_especie: string | null
  pet_raca: string | null
  pet_cor: string | null
  tutor_nome: string
  tutor_telefone: string | null
  tutor_endereco: string | null
  tutor_bairro: string | null
  tutor_cidade: string | null
  status: string
  numero_lacre: string | null
  unidade_id: string
  data_acolhimento: string | null
  // Só preenchido em "Minhas Tarefas" (carregarMinhas) — pro badge/detalhe de saldo em aberto
  // na tarefa de Entrega. Pool não busca esses campos, ficam undefined lá.
  valor_plano?: number | null
  desconto_plano_unificado?: number | null
  valor_acessorios?: number | null
  desconto_acessorios?: number | null
  desconto_acessorios_ajuste?: number | null
  pagamentos?: { tipo: string; valor: number }[]
}

// Saldo em aberto de um contrato (mesma fórmula de contrato-tags.ts/getPagamentoPendente, mas
// devolve o VALOR, não só se está pendente — pro popup mostrar quanto falta).
function calcularSaldoPendente(c: Pick<ContratoResumo, 'valor_plano' | 'desconto_plano_unificado' | 'valor_acessorios' | 'desconto_acessorios' | 'desconto_acessorios_ajuste' | 'pagamentos'>) {
  const valorPlanoEsperado = (c.valor_plano || 0) - (c.desconto_plano_unificado || 0)
  const valorAcessoriosEsperado = (c.valor_acessorios || 0) - (c.desconto_acessorios || 0) - (c.desconto_acessorios_ajuste || 0)
  const pagamentos = c.pagamentos || []
  const totalPagoPlano = pagamentos.filter(p => p.tipo === 'plano').reduce((s, p) => s + (p.valor || 0), 0)
  const totalPagoAcessorios = pagamentos.filter(p => p.tipo === 'catalogo').reduce((s, p) => s + (p.valor || 0), 0)
  const saldoPlano = Math.max(0, valorPlanoEsperado - totalPagoPlano)
  const saldoAcessorios = Math.max(0, valorAcessoriosEsperado - totalPagoAcessorios)
  return { saldoPlano, saldoAcessorios, saldoTotal: saldoPlano + saldoAcessorios }
}

type ContratoProdutoResumo = {
  id: string
  contrato_id: string
  rescaldo_feito: boolean
  produto: { nome: string; rescaldo_tipo: string | null } | null
  contrato: ContratoResumo | null
}

// Mesmas siglas + cores do pipeline mobile (STATUS_FLOW/STATUS_COLORS de /contratos) — selo de
// status ao lado do nome do pet, pro Operacional reconhecer de cara sem precisar ler o status por extenso.
const STATUS_BADGE: Record<string, { short: string; cor: string }> = {
  preventivo: { short: 'PRV', cor: '#f59e0b' },
  ativo: { short: 'ATV', cor: '#ef4444' },
  pinda: { short: 'PIN', cor: '#f97316' },
  retorno: { short: 'ENT', cor: '#06b6d4' },
  pendente: { short: 'PEN', cor: '#a855f7' },
  finalizado: { short: 'FIN', cor: '#94a3b8' },
}

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_BADGE[status]
  if (!info) return null
  return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{ background: info.cor + '22', color: info.cor }}>
      {info.short}
    </span>
  )
}

// Ordem fixa de exibição dos tipos em qualquer agrupamento (pool, minhas, em andamento,
// concluídas) — Remoção sempre em primeiro, é sempre prioridade (decisão do Lucas, 01/09/2026).
const ORDEM_TIPOS: TarefaTipo[] = ['remocao', 'entrega', 'molde_patinha', 'carimbo', 'pelo_extra', 'pelinho']

function agruparPorTipo<T extends { tipo: TarefaTipo }>(itens: T[]): Partial<Record<TarefaTipo, T[]>> {
  const acc: Partial<Record<TarefaTipo, T[]>> = {}
  for (const t of itens) {
    if (!acc[t.tipo]) acc[t.tipo] = []
    acc[t.tipo]!.push(t)
  }
  return acc
}

// "31/08 14:32" — data/hora de conclusão nos cards de Concluídas.
function formatarDataHoraConclusao(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Ordem em toda a aba Tarefas: pet mais novo pro mais antigo por data/hora de acolhimento
// (pedido do Lucas, 01/09/2026) — não por quando a tarefa foi atribuída/concluída. Sem data
// (remoção pendente — o pet ainda nem foi acolhido, contrato não existe) fica por último.
function ordenarPorAcolhimento<T extends { dataAcolhimento?: string | null }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    if (!a.dataAcolhimento && !b.dataAcolhimento) return 0
    if (!a.dataAcolhimento) return 1
    if (!b.dataAcolhimento) return -1
    return new Date(b.dataAcolhimento).getTime() - new Date(a.dataAcolhimento).getTime()
  })
}

// Sub-grupo por TIPO de tarefa dentro de uma etapa — só renderiza se tiver item (elimina o
// "(0) Nenhum pendente" que antes aparecia sempre pros 4 tipos do pool).
function TipoGroup({ tipo, count, children, defaultAberto = true }: { tipo: TarefaTipo; count: number; children: React.ReactNode; defaultAberto?: boolean }) {
  const [aberto, setAberto] = useState(defaultAberto)
  if (count === 0) return null
  const info = TIPO_INFO[tipo]
  const Icon = info.icon
  return (
    <div>
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
        <h4 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: info.cor }}>{info.label}</h4>
        <span className="text-[10px] text-[var(--surface-400)]">({count})</span>
        {aberto ? <ChevronUp className="h-3 w-3 text-[var(--surface-400)]" /> : <ChevronDown className="h-3 w-3 text-[var(--surface-400)]" />}
      </button>
      {aberto && <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

// Cartão de identificação único — mesma ordem de informação (tipo, selo+lacre+pet, tutor, linha
// extra opcional) em qualquer lugar da página: pool, em andamento, concluídas, minhas tarefas.
// `onClick` = cartão inteiro é o botão (uso em "Minhas Tarefas"); sem `onClick` = linha estática
// com `acao` (botão Atribuir/Reatribuir/Desfazer) à direita.
function TarefaCard({ tipo, statusBadge, lacre, petNome, tutorNome, quantidade, linhaExtra, acao, onClick }: {
  tipo: TarefaTipo
  statusBadge?: string
  lacre?: string | null
  petNome: string
  tutorNome: string
  quantidade?: number
  linhaExtra?: React.ReactNode
  acao?: React.ReactNode
  onClick?: () => void
}) {
  const info = TIPO_INFO[tipo]
  const Icon = info.icon
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide" style={{ color: info.cor }}>
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
          {info.label}
        </p>
        <p className="text-sm font-semibold text-[var(--surface-800)] truncate flex items-center gap-1.5">
          {statusBadge && <StatusBadge status={statusBadge} />}
          {lacre ? `${lacre} — ${petNome}` : petNome}
          {!!quantidade && quantidade > 1 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ background: info.cor }}>×{quantidade}</span>
          )}
        </p>
        <p className="text-xs text-[var(--surface-500)] truncate">{tutorNome}</p>
        {linhaExtra}
      </div>
      {acao}
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl border-2 shadow-sm hover:shadow-md transition-all text-left" style={{ borderColor: info.cor + '55', background: info.cor + '0d' }}>
        {conteudo}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--surface-200)]">
      {conteudo}
    </div>
  )
}

// Item de um pool (Pra atribuir) — cartão de identificação + botão Atribuir, que abre um
// formulário inline (quem vai fazer + pedido específico) embaixo do próprio cartão.
// Exemplo de "pedido específico" por tipo — entrega é sobre onde/quando entregar, os demais
// são sobre o rescaldo em si. Ajuda quem atribui a entender o que cabe nesse campo.
const PLACEHOLDER_PEDIDO: Record<TarefaTipo, string> = {
  entrega: 'Pedido específico (ex: Tutor pediu pra entregar na Rua das Palmeiras, 245 em vez do endereço cadastrado)...',
  remocao: 'Pedido específico...',
  molde_patinha: 'Pedido específico (ex: molde da patinha esquerda)...',
  carimbo: 'Pedido específico (ex: carimbo da patinha direita)...',
  pelo_extra: 'Pedido específico (ex: pelinho do pescoço)...',
  pelinho: 'Pedido específico (ex: 2 vidrinhos de pelinho)...',
}

// Item do pool já agrupado por (tipo, contrato) — itemIds carrega os `contrato_produto_id`
// (ou o `contrato.id` pra entrega) do grupo inteiro; quantidade > 1 vira o badge "×N" no card.
type PoolItemData = { key: string; itemIds: string[]; quantidade: number; petNome: string; tutorNome: string; status: string; lacre: string | null; enderecoResumo?: string; dataAcolhimento?: string | null }

// Os 4 tipos de rescaldo do mesmo pet viram 1 card só no pool ("Personalizados") — pedido do
// Lucas (01/09/2026): "agrupa por pet se tiver mais de uma atividade". Entrega fica de fora
// (ação de conclusão diferente — pede data de entrega, não é só marcar feito) e continua no
// próprio grupo por tipo, como antes.
const TIPOS_PERSONALIZADOS: TarefaTipo[] = ['molde_patinha', 'carimbo', 'pelo_extra', 'pelinho']
type PetPoolGroup = {
  contratoId: string
  petNome: string
  tutorNome: string
  status: string
  lacre: string | null
  dataAcolhimento?: string | null
  itens: { tipo: TarefaTipo; item: PoolItemData }[]
}

// Tarefa com pet/tutor/contrato resolvidos (compartilhado entre "Minhas Tarefas", "Em
// andamento" e "Concluídas recentemente" — ver resolverPetTutor).
type TarefaEnriquecida = TarefaRow & {
  petNome: string
  tutorNome: string
  contratoIdResolvido: string | null
  statusContrato?: string
  lacreContrato?: string | null
  dataAcolhimento?: string | null
}
// Grupo de (tipo, contrato) — agrega N linhas físicas de `tarefas_operacionais` que nascem
// de N linhas físicas de `contrato_produtos` (1 linha = 1 item, convenção do projeto) num só
// card "×N". `ids` = tarefas_operacionais.id[] (pra UPDATE/reatribuir/desfazer em lote);
// `contratoProdutoIds` = contrato_produtos.id[] (pra marcar rescaldo_feito em lote). Entrega e
// remoção nunca agrupam de verdade (sempre 1 por contrato/ficha) — mas usam o mesmo tipo pra
// não duplicar toda a lógica de render/conclusão em dois caminhos.
type TarefaGrupo = TarefaEnriquecida & { ids: string[]; contratoProdutoIds: string[]; quantidade: number }

// Agrupa por (tipo, contrato, atribuído, status) — remoção/entrega usam a própria linha como
// chave (nunca agrupam de verdade); os 4 tipos de rescaldo agrupam por contrato, já que N
// linhas de `contrato_produtos` do mesmo tipo pro mesmo contrato viram 1 card "×N". Função pura
// (sem closure sobre estado do componente) — fica em module scope de propósito, pra não disparar
// react-hooks/exhaustive-deps nos `useCallback` que a chamam.
function agruparTarefas(tarefas: TarefaEnriquecida[]): TarefaGrupo[] {
  const grupos: Record<string, TarefaGrupo> = {}
  for (const t of tarefas) {
    const chave = t.tipo === 'remocao' || t.tipo === 'entrega'
      ? `${t.tipo}:${t.id}`
      : `${t.tipo}:${t.contratoIdResolvido}:${t.atribuido_a}:${t.status}`
    const existente = grupos[chave]
    if (!existente) {
      grupos[chave] = { ...t, ids: [t.id], contratoProdutoIds: t.contrato_produto_id ? [t.contrato_produto_id] : [], quantidade: 1 }
    } else {
      existente.ids.push(t.id)
      if (t.contrato_produto_id) existente.contratoProdutoIds.push(t.contrato_produto_id)
      existente.quantidade++
      if (new Date(t.atribuido_em) < new Date(existente.atribuido_em)) existente.atribuido_em = t.atribuido_em
    }
  }
  return Object.values(grupos)
}

// Mesmo agrupamento por pet do pool ("Personalizados"), agora pra "Minhas Tarefas" — pergunta
// do Lucas: "e na visão minhas tarefas? fez da mesma forma?". Os 4 rescaldos já atribuídos ao
// mesmo pet viram 1 card, cada tipo com o próprio clique (abre a conclusão só daquele tipo —
// mesmo racional do pool: cada um pode ter anotação/observação diferente).
type PetMinhasGroup = {
  contratoId: string
  petNome: string
  tutorNome: string
  statusContrato?: string
  lacreContrato?: string | null
  dataAcolhimento?: string | null
  itens: TarefaGrupo[]
}
function agruparPorPet(tarefas: TarefaGrupo[]): PetMinhasGroup[] {
  const porContrato: Record<string, PetMinhasGroup> = {}
  for (const t of tarefas) {
    const chave = t.contratoIdResolvido || t.id
    if (!porContrato[chave]) {
      porContrato[chave] = { contratoId: chave, petNome: t.petNome, tutorNome: t.tutorNome, statusContrato: t.statusContrato, lacreContrato: t.lacreContrato, dataAcolhimento: t.dataAcolhimento, itens: [] }
    }
    porContrato[chave].itens.push(t)
  }
  return Object.values(porContrato)
}

function PoolItem({ tipo, item, onAbrirAtribuir, onMarcarFeito, marcandoFeitoId }: {
  tipo: TarefaTipo
  item: PoolItemData
  onAbrirAtribuir: (item: PoolItemData) => void
  onMarcarFeito: (item: PoolItemData) => void
  marcandoFeitoId: string | null
}) {
  // item.key = contrato_id — sozinho colidiria entre tipos diferentes do MESMO pet (ex: molde
  // e carimbo pendentes pro mesmo contrato); qualifica por tipo pra cada botão "Feito" ter seu
  // próprio estado de loading.
  const marcandoKey = `${tipo}:${item.key}`
  return (
    <TarefaCard
      tipo={tipo}
      statusBadge={item.status}
      lacre={item.lacre}
      petNome={item.petNome}
      tutorNome={item.tutorNome}
      quantidade={item.quantidade}
      linhaExtra={item.enderecoResumo ? <p className="text-xs text-[var(--surface-500)] line-clamp-2 mt-0.5">📍 {item.enderecoResumo}</p> : undefined}
      acao={
        <div className="flex flex-col items-stretch gap-2 shrink-0">
          <button
            onClick={() => onAbrirAtribuir(item)}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: AZUL_ROYAL }}
          >
            <UserPlus className="h-3.5 w-3.5" />Atribuir
          </button>
          <button
            onClick={() => onMarcarFeito(item)}
            disabled={marcandoFeitoId === marcandoKey}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 disabled:opacity-50"
            title="Já fiz — abre a tela de conclusão (com data, se for entrega antiga)"
          >
            <Check className="h-3.5 w-3.5" />{marcandoFeitoId === marcandoKey ? '...' : 'Feito'}
          </button>
        </div>
      }
    />
  )
}

// Grupo colapsável "Personalizados" — mesmo padrão visual do <TipoGroup>, mas não é preso a 1
// tipo (junta os 4 num header só, já que os cards dentro agrupam por pet).
function PersonalizadosGroup({ count, children, defaultAberto = true }: { count: number; children: React.ReactNode; defaultAberto?: boolean }) {
  const [aberto, setAberto] = useState(defaultAberto)
  if (count === 0) return null
  return (
    <div>
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center gap-1.5 mb-1.5">
        <span className="text-sm">💎</span>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-purple-400">Personalizados</h4>
        <span className="text-[10px] text-[var(--surface-400)]">({count})</span>
        {aberto ? <ChevronUp className="h-3 w-3 text-[var(--surface-400)]" /> : <ChevronDown className="h-3 w-3 text-[var(--surface-400)]" />}
      </button>
      {aberto && <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

// Card de 1 pet no pool "Personalizados" — todos os rescaldos pendentes daquele contrato
// juntos, cada um com o próprio Atribuir/Feito (pedido do Lucas: "quero botões e popups
// separados, pq tem o lance das observações" — cada tipo pode ter um pedido específico
// diferente na hora de atribuir, então a ação continua por tipo, só a apresentação é por pet).
function PetPoolCard({ petGroup, onAbrirAtribuir, onMarcarFeito, marcandoFeitoId }: {
  petGroup: PetPoolGroup
  onAbrirAtribuir: (tipo: TarefaTipo, item: PoolItemData) => void
  onMarcarFeito: (tipo: TarefaTipo, item: PoolItemData) => void
  marcandoFeitoId: string | null
}) {
  return (
    <div className="rounded-xl border border-[var(--surface-200)] p-3 space-y-2">
      <div>
        <p className="text-sm font-semibold text-[var(--surface-800)] truncate flex items-center gap-1.5">
          {petGroup.status && <StatusBadge status={petGroup.status} />}
          {petGroup.lacre ? `${petGroup.lacre} — ${petGroup.petNome}` : petGroup.petNome}
        </p>
        <p className="text-xs text-[var(--surface-500)] truncate">{petGroup.tutorNome}</p>
      </div>
      <div className="space-y-1.5">
        {petGroup.itens.map(({ tipo, item }) => {
          const info = TIPO_INFO[tipo]
          const Icon = info.icon
          const marcandoKey = `${tipo}:${item.key}`
          return (
            <div key={tipo} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: info.cor + '0d' }}>
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
              <span className="text-xs font-semibold flex-1 truncate" style={{ color: info.cor }}>
                {info.label}{item.quantidade > 1 ? ` ×${item.quantidade}` : ''}
              </span>
              <button
                onClick={() => onAbrirAtribuir(tipo, item)}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-white shrink-0"
                style={{ background: AZUL_ROYAL }}
              >
                Atribuir
              </button>
              <button
                onClick={() => onMarcarFeito(tipo, item)}
                disabled={marcandoFeitoId === marcandoKey}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-emerald-600 disabled:opacity-50 shrink-0"
              >
                {marcandoFeitoId === marcandoKey ? '...' : 'Feito'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Card de 1 pet em "Minhas Tarefas" — os 4 rescaldos já atribuídos a mim pro mesmo pet juntos;
// cada tipo abre a conclusão só dele (mesmo card de detalhe/conclusão de sempre).
function PetMinhasCard({ petGroup, onAbrirTarefa }: {
  petGroup: PetMinhasGroup
  onAbrirTarefa: (t: TarefaGrupo) => void
}) {
  return (
    <div className="rounded-xl border border-[var(--surface-200)] p-3 space-y-2">
      <div>
        <p className="text-sm font-semibold text-[var(--surface-800)] truncate flex items-center gap-1.5">
          {petGroup.statusContrato && <StatusBadge status={petGroup.statusContrato} />}
          {petGroup.lacreContrato ? `${petGroup.lacreContrato} — ${petGroup.petNome}` : petGroup.petNome}
        </p>
        <p className="text-xs text-[var(--surface-500)] truncate">{petGroup.tutorNome}</p>
      </div>
      <div className="space-y-1.5">
        {petGroup.itens.map(t => {
          const info = TIPO_INFO[t.tipo]
          const Icon = info.icon
          return (
            <button
              key={t.id}
              onClick={() => onAbrirTarefa(t)}
              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left"
              style={{ background: info.cor + '0d' }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
              <span className="text-xs font-semibold flex-1 truncate" style={{ color: info.cor }}>
                {info.label}{t.quantidade > 1 ? ` ×${t.quantidade}` : ''}
              </span>
              {t.observacao_atribuicao && <span className="text-sm shrink-0" title="Tem pedido específico">📝</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Mesmo card por pet, agora em "Concluídas 48h" — cada tipo com o próprio Desfazer.
function PetConcluidasCard({ petGroup, onDesfazer, desfazendoId, nomePorId }: {
  petGroup: PetMinhasGroup
  onDesfazer: (t: TarefaGrupo) => void
  desfazendoId: string | null
  // Só passado em "Finalizadas" (Gestão de Tarefas — mistura gente diferente); em "Minhas
  // Tarefas" é sempre a própria pessoa, então fica implícito e não repete na tela.
  nomePorId?: Record<string, string>
}) {
  return (
    <div className="rounded-xl border border-[var(--surface-200)] p-3 space-y-2">
      <div>
        <p className="text-sm font-semibold text-[var(--surface-800)] truncate flex items-center gap-1.5">
          {petGroup.statusContrato && <StatusBadge status={petGroup.statusContrato} />}
          {petGroup.lacreContrato ? `${petGroup.lacreContrato} — ${petGroup.petNome}` : petGroup.petNome}
        </p>
        <p className="text-xs text-[var(--surface-500)] truncate">{petGroup.tutorNome}</p>
      </div>
      <div className="space-y-1.5">
        {petGroup.itens.map(t => {
          const info = TIPO_INFO[t.tipo]
          const Icon = info.icon
          return (
            <div key={t.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: info.cor + '0d' }}>
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: info.cor }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold truncate block" style={{ color: info.cor }}>
                  {info.label}{t.quantidade > 1 ? ` ×${t.quantidade}` : ''}
                </span>
                <span className="text-[10px] text-[var(--surface-500)]">
                  ✅ {formatarDataHoraConclusao(t.concluido_em)}{nomePorId ? ` · ${nomePorId[t.atribuido_a] || '—'}` : ''}
                </span>
              </div>
              <button
                onClick={() => onDesfazer(t)}
                disabled={desfazendoId === t.id}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-red-600 disabled:opacity-50 shrink-0"
              >
                {desfazendoId === t.id ? '...' : 'Desfazer'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Seletor "Agora" (preenche sozinho, na hora de concluir) vs "Outra" (Operacional escolhe —
// registrando depois do fato, ex: só lembrou de mexer no celular horas depois).
function AgoraOutraToggle({ modo, setModo, outraLabel = 'Outra' }: { modo: 'agora' | 'outra'; setModo: (m: 'agora' | 'outra') => void; outraLabel?: string }) {
  return (
    <div className="flex rounded-lg border border-[var(--surface-200)] overflow-hidden text-xs font-semibold">
      <button type="button" onClick={() => setModo('agora')} className={`flex-1 py-1.5 transition-colors ${modo === 'agora' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
        Agora
      </button>
      <button type="button" onClick={() => setModo('outra')} className={`flex-1 py-1.5 transition-colors ${modo === 'outra' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
        {outraLabel}
      </button>
    </div>
  )
}

// Seletor de fase por abas com sublinhado deslizante — trocou o toggle de blocos pintados
// (3 e 2 botões empilhados pareciam a mesma peça duplicada) por rótulo + linha fina animada
// por baixo, largura de cada aba seguindo o texto em vez de terços/metades forçados; assim a
// versão de 3 fases e a de 2 fases não têm a mesma cara. Opção "B" escolhida pelo Lucas entre
// 5 tratamentos apresentados num artifact comparativo (01/09/2026).
function UnderlineTabs<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count: number }[]
  value: T
  onChange: (key: T) => void
}) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [thumb, setThumb] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const btn = btnRefs.current[value]
    if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [value, tabs])

  return (
    <div className="relative flex gap-5 border-b border-[var(--surface-200)] px-0.5">
      <div
        className="absolute bottom-[-1px] h-0.5 rounded-full bg-[var(--brand-600)] transition-all duration-300 ease-out"
        style={{ left: thumb.left, width: thumb.width }}
      />
      {tabs.map(tab => (
        <button
          key={tab.key}
          ref={el => { btnRefs.current[tab.key] = el }}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-1.5 pb-3 pt-1 text-sm font-semibold whitespace-nowrap transition-colors ${value === tab.key ? 'text-[var(--surface-800)]' : 'text-[var(--surface-400)]'}`}
        >
          {tab.label}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${value === tab.key ? 'text-[var(--brand-700)] bg-[var(--brand-50)]' : 'text-[var(--surface-400)] bg-[var(--surface-100)]'}`}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )
}

export default function TarefasPage() {
  const supabase = createClient()
  const { currentUnit, currentRole, isSuperAdmin, userName, allUnidades, impersonating, impersonatedUserId } = useUnit()
  const { toast } = useToast()

  const podeAtribuir = isSuperAdmin || currentRole === 'gerente' || currentRole === 'operador'
  const temModulo = !!currentUnit?.modulos_ativos?.includes('cb_operacional')

  const [aba, setAba] = useState<'minhas' | 'atribuir'>('minhas')
  // 3 fases de "Gestão de Tarefas" (ex-"Atribuir") — era accordion vertical com as 3 sempre
  // uma embaixo da outra; virou toggle de 3 botões, só uma fase visível por vez (pedido do
  // Lucas, 01/09/2026).
  const [subAbaGestao, setSubAbaGestao] = useState<'pra_atribuir' | 'em_andamento' | 'finalizadas'>('pra_atribuir')
  // "Minhas Tarefas" não tem "Pra atribuir" (tudo ali já é meu) — toggle bifásico igual,
  // mesmo padrão visual do de cima (pedido do Lucas, 01/09/2026).
  const [subAbaMinhas, setSubAbaMinhas] = useState<'em_andamento' | 'finalizadas'>('em_andamento')
  // auth.uid() real (super_admin, se estiver impersonando) — impersonar não troca sessão de
  // verdade, então "Minhas Tarefas" precisa do id de quem está sendo impersonado, não do
  // logado. Achado em produção (25/08/2026): impersonar a Kélvia mostrava a fila vazia mesmo
  // com 2 tarefas atribuídas a ela de verdade.
  const [realUserId, setRealUserId] = useState<string | null>(null)
  const userId = impersonating && impersonatedUserId ? impersonatedUserId : realUserId

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setRealUserId(data.user?.id || null))
  }, [supabase])

  // ── Minhas Tarefas ──────────────────────────────────────────────────────
  const [minhasTarefas, setMinhasTarefas] = useState<TarefaGrupo[]>([])
  const [fichasPorId, setFichasPorId] = useState<Record<string, FichaRemocao>>({})
  const [contratosPorId, setContratosPorId] = useState<Record<string, ContratoResumo>>({})
  const [produtosPorId, setProdutosPorId] = useState<Record<string, ContratoProdutoResumo>>({})
  const [loadingMinhas, setLoadingMinhas] = useState(true)
  const [tarefaAberta, setTarefaAberta] = useState<TarefaGrupo | null>(null)

  // ── Resolve pet/tutor/contrato de um lote de tarefas_operacionais (compartilhado entre
  // "Minhas Tarefas", "Em andamento" e "Concluídas recentemente") ─────────────────────
  const resolverPetTutor = useCallback(async (tarefas: TarefaRow[]): Promise<TarefaEnriquecida[]> => {
    const contratoIds = tarefas.filter(t => t.contrato_id).map(t => t.contrato_id!) as string[]
    const produtoIds = tarefas.filter(t => t.contrato_produto_id).map(t => t.contrato_produto_id!) as string[]
    const fichaIds = tarefas.filter(t => t.ficha_id).map(t => t.ficha_id!) as string[]

    const [{ data: contratos }, { data: produtos }, { data: fichas }] = await Promise.all([
      contratoIds.length > 0 ? supabase.from('contratos').select('id, pet_nome, tutor_nome, status, numero_lacre, data_acolhimento').in('id', contratoIds) : Promise.resolve({ data: [] }),
      produtoIds.length > 0 ? supabase.from('contrato_produtos').select('id, contrato_id, contrato:contratos(pet_nome, tutor_nome, status, numero_lacre, data_acolhimento)').in('id', produtoIds) : Promise.resolve({ data: [] }),
      fichaIds.length > 0 ? supabase.from('fichas').select('id, nome_pet, nome_completo').in('id', fichaIds) : Promise.resolve({ data: [] }),
    ])
    const contratoMap: Record<string, { pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null; data_acolhimento: string | null }> = {}
    for (const c of (contratos || []) as { id: string; pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null; data_acolhimento: string | null }[]) contratoMap[c.id] = c
    const produtoMap: Record<string, { contrato_id: string; contrato: { pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null; data_acolhimento: string | null } | null }> = {}
    for (const p of (produtos || []) as unknown as { id: string; contrato_id: string; contrato: { pet_nome: string; tutor_nome: string; status: string; numero_lacre: string | null; data_acolhimento: string | null } | null }[]) produtoMap[p.id] = p
    const fichaMap: Record<string, { nome_pet: string; nome_completo: string }> = {}
    for (const f of (fichas || []) as { id: string; nome_pet: string; nome_completo: string }[]) fichaMap[f.id] = f

    return tarefas.map(t => {
      const c = t.contrato_id ? contratoMap[t.contrato_id] : null
      const p = t.contrato_produto_id ? produtoMap[t.contrato_produto_id] : null
      const f = t.ficha_id ? fichaMap[t.ficha_id] : null
      return {
        ...t,
        petNome: c?.pet_nome || p?.contrato?.pet_nome || f?.nome_pet || '—',
        tutorNome: c?.tutor_nome || p?.contrato?.tutor_nome || f?.nome_completo || '—',
        contratoIdResolvido: t.contrato_id || p?.contrato_id || null,
        statusContrato: c?.status || p?.contrato?.status,
        lacreContrato: c?.numero_lacre || p?.contrato?.numero_lacre,
        dataAcolhimento: c?.data_acolhimento || p?.contrato?.data_acolhimento,
      }
    })
  }, [supabase])

  const carregouMinhasAntes = useRef(false)
  const carregarMinhas = useCallback(async () => {
    if (!userId) return
    // Só mostra "Carregando..." na primeira vez — recarregar em cima de uma lista que já
    // carregou antes (ex: depois de concluir uma tarefa) troca os dados na hora, sem colapsar
    // a lista e sem pular a rolagem de quem tava vendo outra coisa mais embaixo na tela.
    if (!carregouMinhasAntes.current) setLoadingMinhas(true)
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em')
      .eq('atribuido_a', userId)
      .eq('status', 'pendente')
      .order('atribuido_em', { ascending: true })

    const tarefas = (data || []) as TarefaRow[]
    setMinhasTarefas(agruparTarefas(await resolverPetTutor(tarefas)))

    const fichaIds = tarefas.filter(t => t.tipo === 'remocao' && t.ficha_id).map(t => t.ficha_id!) as string[]
    const contratoIds = tarefas.filter(t => t.tipo === 'entrega' && t.contrato_id).map(t => t.contrato_id!) as string[]
    const produtoIds = tarefas.filter(t => t.contrato_produto_id).map(t => t.contrato_produto_id!) as string[]

    if (fichaIds.length > 0) {
      const { data: fichas } = await supabase
        .from('fichas')
        .select('id, nome_completo, cpf, telefone, email, cep, estado, cidade, bairro, endereco, numero, complemento, outros_tutores, nome_pet, idade, especie, genero, raca, cor, peso, cremacao, como_conheceu, outro_especificar, observacoes, localizacao, localizacao_outra, unidade_id, contrato_id, processada, op_dados')
        .in('id', fichaIds)
      const map: Record<string, FichaRemocao> = {}
      for (const f of (fichas || []) as FichaRemocao[]) map[f.id] = f
      setFichasPorId(map)
    }
    if (contratoIds.length > 0) {
      const { data: contratos } = await supabase
        .from('contratos')
        .select('id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, tutor_nome, tutor_telefone, tutor_endereco, tutor_bairro, tutor_cidade, status, numero_lacre, unidade_id, valor_plano, desconto_plano_unificado, valor_acessorios, desconto_acessorios, desconto_acessorios_ajuste, pagamentos(tipo, valor)')
        .in('id', contratoIds)
      const map: Record<string, ContratoResumo> = {}
      for (const c of (contratos || []) as ContratoResumo[]) map[c.id] = c
      setContratosPorId(map)
    }
    if (produtoIds.length > 0) {
      const { data: produtos } = await supabase
        .from('contrato_produtos')
        .select('id, contrato_id, rescaldo_feito, produto:produtos(nome, rescaldo_tipo), contrato:contratos(id, codigo, pet_nome, pet_especie, pet_raca, pet_cor, tutor_nome, tutor_telefone, tutor_endereco, tutor_bairro, tutor_cidade, unidade_id, status, numero_lacre)')
        .in('id', produtoIds)
      const map: Record<string, ContratoProdutoResumo> = {}
      for (const p of (produtos || []) as unknown as ContratoProdutoResumo[]) map[p.id] = p
      setProdutosPorId(map)
    }
    carregouMinhasAntes.current = true
    setLoadingMinhas(false)
  }, [supabase, userId, resolverPetTutor])

  useEffect(() => { if (aba === 'minhas') carregarMinhas() }, [aba, carregarMinhas])

  // ── Minhas concluídas (últimas 48h) — igual "Concluídas 48h" da aba Atribuir, mas filtrada
  // só pelas MINHAS tarefas (atribuido_a = userId), pra quem não é gerente/operador também
  // conseguir ver e desfazer o que ela mesma concluiu, sem depender de podeAtribuir.
  const [minhasConcluidas, setMinhasConcluidas] = useState<TarefaGrupo[]>([])
  const [loadingMinhasConcluidas, setLoadingMinhasConcluidas] = useState(false)
  const carregouMinhasConcluidasAntes = useRef(false)
  const carregarMinhasConcluidas = useCallback(async () => {
    if (!userId) return
    if (!carregouMinhasConcluidasAntes.current) setLoadingMinhasConcluidas(true)
    const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em, concluido_em')
      .eq('atribuido_a', userId)
      .eq('status', 'concluida')
      .gte('concluido_em', desde)
      .order('concluido_em', { ascending: false }) as { data: TarefaRow[] | null }

    setMinhasConcluidas(agruparTarefas(await resolverPetTutor(data || [])))
    carregouMinhasConcluidasAntes.current = true
    setLoadingMinhasConcluidas(false)
  }, [supabase, userId, resolverPetTutor])

  useEffect(() => { if (aba === 'minhas') carregarMinhasConcluidas() }, [aba, carregarMinhasConcluidas])

  // ── Concluir tarefa simples (entrega/molde/carimbo/pelo_extra) ──────────
  const [concluindoSimples, setConcluindoSimples] = useState(false)
  const [anotacaoSimples, setAnotacaoSimples] = useState('')
  const [leuObservacao, setLeuObservacao] = useState(false)
  // Data de entrega: "agora" (hoje) ou "outra" (registrando depois) — só entrega usa (é `date`, sem hora).
  const [modoDataEntrega, setModoDataEntrega] = useState<'agora' | 'outra'>('agora')
  const [dataEntregaManual, setDataEntregaManual] = useState('')

  async function concluirTarefaSimples(tarefa: TarefaGrupo) {
    if (tarefa.tipo === 'entrega' && modoDataEntrega === 'outra' && !dataEntregaManual) {
      toast('Informe a data da entrega', 'error')
      return
    }
    setConcluindoSimples(true)
    try {
      let contratoId = tarefa.contrato_id
      if (tarefa.tipo === 'entrega' && tarefa.contrato_id) {
        const dataEntregaFinal = modoDataEntrega === 'agora' ? hojeLocal() : dataEntregaManual
        const { error } = await supabase.from('contratos').update({
          status: 'finalizado',
          data_entrega: dataEntregaFinal,
        } as never).eq('id', tarefa.contrato_id)
        if (error) throw new Error(error.message)
      } else if (tarefa.contratoProdutoIds.length > 0) {
        const { error } = await supabase.from('contrato_produtos').update({ rescaldo_feito: true } as never).in('id', tarefa.contratoProdutoIds)
        if (error) throw new Error(error.message)
        contratoId = tarefa.contratoIdResolvido
      }

      const rotulo = tarefa.quantidade > 1 ? `${TIPO_INFO[tarefa.tipo].label} (×${tarefa.quantidade})` : TIPO_INFO[tarefa.tipo].label

      if (contratoId) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        const partes = [`${rotulo} concluído por ${userName || 'Operacional'}.`]
        if (tarefa.tipo === 'entrega' && modoDataEntrega === 'outra') partes.push(`Data de entrega registrada retroativa: ${new Date(dataEntregaManual + 'T00:00:00').toLocaleDateString('pt-BR')}.`)
        if (tarefa.observacao_atribuicao) partes.push(`Pedido específico confirmado: "${tarefa.observacao_atribuicao}".`)
        if (anotacaoSimples.trim()) partes.push(`Nota: ${anotacaoSimples.trim()}`)
        await supabase.from('tarefas').insert({
          contrato_id: contratoId,
          descricao: partes.join(' '),
          tipo_id: tipoTarefa?.id || null,
          importante: true,
          criado_por: userName || 'Operacional',
        } as never)
      }

      await supabase.from('tarefas_operacionais').update({
        status: 'concluida',
        concluido_em: new Date().toISOString(),
        anotacao_conclusao: anotacaoSimples.trim() || null,
      } as never).in('id', tarefa.ids)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'conclusao',
        campo_label: 'Tarefa concluída',
        valor_novo: `${rotulo} concluída por ${userName || 'Operacional'}`,
        tipo: 'conclusao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: anotacaoSimples.trim() || null,
      } as never)

      toast('Tarefa concluída!', 'success')
      setTarefaAberta(null)
      setTarefaAbertaRascunho(false)
      setAnotacaoSimples('')
      setLeuObservacao(false)
      setModoDataEntrega('agora')
      setDataEntregaManual('')
      // carregarEmAndamento/carregarConcluidasRecentes já no-opam sozinhas se quem concluiu
      // não é podeAtribuir — sem custo extra pro Operacional comum, mas mantém a aba Atribuir
      // em dia quando a conclusão veio de lá (botão "Feito" do pool). Pool fica de fora — quem
      // já foi atribuído (mesmo que autoatribuído pelo "Feito") já saiu do pool há muito, não
      // muda de novo aqui.
      await Promise.all([carregarMinhas(), carregarMinhasConcluidas(), carregarEmAndamento(), carregarConcluidasRecentes()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao concluir', 'error')
    } finally {
      setConcluindoSimples(false)
    }
  }

  // ── Concluir tarefa de remoção (dispara criação do contrato) ────────────
  const [lacreRemocao, setLacreRemocao] = useState('')
  const [anotacaoRemocao, setAnotacaoRemocao] = useState('')
  const [concluindoRemocao, setConcluindoRemocao] = useState(false)
  const [erroRemocao, setErroRemocao] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  // Data/hora do acolhimento: "agora" ou "outra" (datetime-local — precisa de hora, é timestamptz).
  const [modoDataRemocao, setModoDataRemocao] = useState<'agora' | 'outra'>('agora')
  const [dataHoraRemocaoManual, setDataHoraRemocaoManual] = useState('')

  function unidadeDaFicha(ficha: FichaRemocao) {
    return allUnidades.find(u => u.id === ficha.unidade_id)
  }

  async function gerarPdfDaFicha(ficha: FichaRemocao) {
    setGerandoPdf(true)
    try {
      const op = (ficha.op_dados || {}) as Record<string, unknown>
      const unidade = unidadeDaFicha(ficha)
      const nomeUnidade = unidade ? `${unidade.cidade} - ${unidade.estado}` : 'Santos - SP'
      const temPadronizacaoClinicas = !!unidade?.modulos_ativos?.includes('cb_padronizacao_clinicas')
      const opLocalColeta = op.localColeta as string | null
      const localPdf = op.semLocal ? '' : opLocalColeta === 'clinica' ? ((temPadronizacaoClinicas ? (op.estabNome as string) : (op.clinicaTextoLivre as string)) || ficha.localizacao)
        : opLocalColeta === 'outro' ? ((op.enderecoOutro as string) || ficha.localizacao_outra || '')
        : opLocalColeta === 'residencia' ? 'Residência (Endereço de Cadastro)'
        : opLocalColeta === 'unidade' ? 'Unidade RIP PET'
        : ficha.localizacao

      const blob = await gerarContratoPDF({
        codigo: String(op.codigo || ''),
        lacre: lacreRemocao.trim() || null,
        tutorNome: ficha.nome_completo || '',
        tutorTelefone: ficha.telefone || '',
        tutorCpf: ficha.cpf || '',
        tutorEmail: ficha.email,
        tutorEndereco: ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''}` : null,
        tutorEstado: ficha.estado,
        tutorCidade: ficha.cidade,
        tutorBairro: ficha.bairro,
        tutorCep: ficha.cep,
        petNome: ficha.nome_pet || '',
        petEspecie: ficha.especie,
        petRaca: ficha.raca,
        petIdade: ficha.idade ? parseInt(ficha.idade) || null : null,
        petCor: ficha.cor,
        petGenero: ficha.genero,
        petPeso: ficha.peso ? parseFloat(ficha.peso) || null : null,
        localColeta: localPdf,
        tipoCremacao: ficha.cremacao?.toLowerCase() as 'individual' | 'coletiva',
        valorPlano: (() => {
          const vp = op.valorPlano ? parseFloat(String(op.valorPlano)) : null
          if (!vp) return null
          const dp = op.descontoPreVenda ? parseFloat(String(op.descontoPreVenda)) : 0
          const dt = (op.descontoTipo as string) || 'valor'
          const dr = dt === 'percentual' ? (vp * dp) / 100 : dp
          return Math.max(vp - dr, 0)
        })(),
        metodoPagamento: null,
        parcelas: null,
        velorioDeseja: null,
        acompanhamentoOnline: false,
        acompanhamentoPresencial: false,
        dataAcolhimento: op.semDataHora ? null : (op.dataHoraAcolhimento as string) || null,
        tipoPlano: 'emergencial',
        dataContrato: (op.dataContrato as string) || null,
        descricaoContrato: (op.detalhamentoPlano as string) || null,
      }, nomeUnidade)

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = contratoFilename(String(op.codigo || 'CONTRATO'), ficha.nome_pet || 'PET')
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      toast('Erro ao gerar PDF', 'error')
    } finally {
      setGerandoPdf(false)
    }
  }

  async function concluirRemocao(tarefa: TarefaGrupo, ficha: FichaRemocao) {
    if (!lacreRemocao.trim()) { setErroRemocao('Informe o lacre'); return }
    if (modoDataRemocao === 'outra' && !dataHoraRemocaoManual) { setErroRemocao('Informe a data/hora da remoção'); return }
    setConcluindoRemocao(true)
    setErroRemocao(null)
    try {
      const dataHoraFinal = modoDataRemocao === 'agora' ? new Date().toISOString() : inputLocalParaIso(dataHoraRemocaoManual)
      const opAtual = (ficha.op_dados || {}) as Record<string, unknown>
      const opAtualizado = {
        ...opAtual,
        lacre: lacreRemocao.trim(),
        semLacre: false,
        dataHoraAcolhimento: dataHoraFinal,
        semDataHora: false,
      }
      const { error: errUpdate } = await supabase.from('fichas').update({ op_dados: opAtualizado } as never).eq('id', ficha.id)
      if (errUpdate) throw new Error(errUpdate.message)

      const unidade = unidadeDaFicha(ficha)
      const { contratoId } = await criarContratoDeFicha(
        supabase,
        { ...ficha, op_dados: opAtualizado },
        {
          codigo: unidade?.codigo || '',
          endereco: unidade?.endereco || null,
          cidade: unidade?.cidade || null,
          modulos_ativos: unidade?.modulos_ativos || [],
        },
        userName || 'Operacional',
        true // responsavelEhOperacional — lacre já validado acima, obrigatório sem escape
      )

      {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        const partes = [`Remoção concluída por ${userName || 'Operacional'} — lacre ${lacreRemocao.trim()}.`]
        if (modoDataRemocao === 'outra') partes.push(`Data/hora do acolhimento registrada retroativa: ${new Date(dataHoraFinal!).toLocaleString('pt-BR')}.`)
        if (tarefa.observacao_atribuicao) partes.push(`Pedido específico confirmado: "${tarefa.observacao_atribuicao}".`)
        if (anotacaoRemocao.trim()) partes.push(`Nota: ${anotacaoRemocao.trim()}`)
        await supabase.from('tarefas').insert({
          contrato_id: contratoId,
          descricao: partes.join(' '),
          tipo_id: tipoTarefa?.id || null,
          importante: true,
          criado_por: userName || 'Operacional',
        } as never)
      }

      await supabase.from('tarefas_operacionais').update({
        status: 'concluida',
        concluido_em: new Date().toISOString(),
        lacre: lacreRemocao.trim(),
        anotacao_conclusao: anotacaoRemocao.trim() || null,
      } as never).eq('id', tarefa.id)

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: ficha.nome_pet || '—',
        campo: 'conclusao',
        campo_label: 'Remoção concluída',
        valor_novo: `Remoção concluída por ${userName || 'Operacional'} — lacre ${lacreRemocao.trim()} — contrato criado`,
        tipo: 'conclusao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: anotacaoRemocao.trim() || null,
      } as never)

      toast('Remoção confirmada — contrato criado!', 'success')
      setTarefaAberta(null)
      setLacreRemocao('')
      setAnotacaoRemocao('')
      setModoDataRemocao('agora')
      setDataHoraRemocaoManual('')
      await Promise.all([carregarMinhas(), carregarMinhasConcluidas()])
    } catch (err) {
      const msg = err instanceof ContratoValidationError ? err.message : (err instanceof Error ? err.message : 'Erro desconhecido')
      setErroRemocao(msg)
      toast(msg, 'error')
    } finally {
      setConcluindoRemocao(false)
    }
  }

  // ── Aba Atribuir (pool) ──────────────────────────────────────────────────
  const [poolEntrega, setPoolEntrega] = useState<ContratoResumo[]>([])
  const [poolRescaldo, setPoolRescaldo] = useState<ContratoProdutoResumo[]>([])
  const [operacionais, setOperacionais] = useState<{ user_id: string; nome: string | null; role: string }[]>([])
  const [loadingPool, setLoadingPool] = useState(false)
  // Popup de atribuição (select + observação) — era expansão inline embaixo do card, mas
  // empurrava a lista inteira pra baixo a cada clique ("bagunça os olhos"); virou modal.
  const [atribuirModalItem, setAtribuirModalItem] = useState<{ tipo: TarefaTipo; item: PoolItemData } | null>(null)
  const [operacionalEscolhido, setOperacionalEscolhido] = useState<Record<string, string>>({})
  const [observacaoAtribuicao, setObservacaoAtribuicao] = useState<Record<string, string>>({})
  const [salvandoAtribuicao, setSalvandoAtribuicao] = useState(false)
  const [marcandoFeitoId, setMarcandoFeitoId] = useState<string | null>(null)
  // true só quando tarefaAberta foi criada agora mesmo pelo botão "Feito" do pool (rascunho
  // autoatribuído, ainda sem confirmação) — se a pessoa fechar sem concluir, apaga de volta
  // em vez de deixar uma tarefa pendente órfã sobrando em "Em andamento".
  const [tarefaAbertaRascunho, setTarefaAbertaRascunho] = useState(false)

  // ── Em andamento (já atribuídas, ainda pendentes) — visibilidade de carga + reatribuir ──
  const [emAndamento, setEmAndamento] = useState<TarefaGrupo[]>([])
  const [loadingEmAndamento, setLoadingEmAndamento] = useState(false)
  const [reatribuindoId, setReatribuindoId] = useState<string | null>(null)
  const [novoOperacional, setNovoOperacional] = useState<Record<string, string>>({})
  const [salvandoReatribuicao, setSalvandoReatribuicao] = useState(false)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)

  const carregouEmAndamentoAntes = useRef(false)
  const carregarEmAndamento = useCallback(async () => {
    if (!currentUnit || !podeAtribuir) return
    // Só "Carregando..." na primeira vez — recarregar por cima (ex: depois de concluir uma
    // tarefa) troca os dados sem colapsar a lista nem pular a rolagem de quem tava mais embaixo.
    if (!carregouEmAndamentoAntes.current) setLoadingEmAndamento(true)
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'pendente')
      .order('atribuido_em', { ascending: true }) as { data: TarefaRow[] | null }

    setEmAndamento(agruparTarefas(await resolverPetTutor(data || [])))
    carregouEmAndamentoAntes.current = true
    setLoadingEmAndamento(false)
  }, [supabase, currentUnit, podeAtribuir, resolverPetTutor])

  // Carga atual por pessoa (soma de itens físicos pendentes, não de cards agrupados) — pra não
  // empilhar tudo num só.
  const cargaPorPessoa = emAndamento.reduce((acc, t) => {
    acc[t.atribuido_a] = (acc[t.atribuido_a] || 0) + t.quantidade
    return acc
  }, {} as Record<string, number>)

  // "Quem fez" em Finalizadas (Gestão de Tarefas mistura gente diferente, diferente de Minhas
  // Tarefas onde é sempre a própria pessoa).
  const nomePorId = operacionais.reduce((acc, o) => {
    acc[o.user_id] = o.nome || 'Sem nome'
    return acc
  }, {} as Record<string, string>)

  async function notificarAtribuicao(userId: string, tipoLabel: string, petNome: string, quantidade?: number) {
    try {
      const label = quantidade && quantidade > 1 ? `${tipoLabel} (×${quantidade})` : tipoLabel
      await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title: '📋 Nova tarefa pra você', body: `${label} — ${petNome}`, url: '/tarefas' }),
      })
    } catch { /* push é best-effort — não trava o fluxo se falhar */ }
  }

  async function reatribuir(tarefa: TarefaGrupo) {
    const novoId = novoOperacional[tarefa.id]
    if (!novoId || novoId === tarefa.atribuido_a) return
    setSalvandoReatribuicao(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const nomeAntigo = operacionais.find(o => o.user_id === tarefa.atribuido_a)?.nome || 'alguém'
      const nomeNovoBase = operacionais.find(o => o.user_id === novoId)?.nome || 'alguém'
      const nomeNovo = tarefa.quantidade > 1 ? `${nomeNovoBase} (×${tarefa.quantidade})` : nomeNovoBase

      const { error } = await supabase.from('tarefas_operacionais').update({
        atribuido_a: novoId,
        atribuido_por: user?.id || null,
        atribuido_em: new Date().toISOString(),
      } as never).in('id', tarefa.ids)
      if (error) throw new Error(error.message)

      // Remoção: mantém o "Responsável" da ficha (op_dados) em sincronia com quem
      // realmente vai fazer o trabalho — senão a Tratativa mostra um nome errado.
      // Direto por user_id (contratos.responsavel_user_id, mig 123) — não passa mais por
      // funcionarios pra isso.
      if (tarefa.tipo === 'remocao' && tarefa.ficha_id) {
        const { data: fichaAtual } = await supabase.from('fichas').select('op_dados').eq('id', tarefa.ficha_id).maybeSingle() as { data: { op_dados: Record<string, unknown> | null } | null }
        await supabase.from('fichas').update({
          op_dados: { ...(fichaAtual?.op_dados || {}), responsavelUserId: novoId, funcionarioId: null },
        } as never).eq('id', tarefa.ficha_id)
      }

      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'reatribuicao',
        campo_label: 'Tarefa reatribuída',
        valor_anterior: nomeAntigo,
        valor_novo: nomeNovo,
        tipo: 'reatribuicao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
      } as never)

      if (tarefa.contratoIdResolvido) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: tarefa.contratoIdResolvido,
          descricao: `${userName || 'Alguém'} reatribuiu ${TIPO_INFO[tarefa.tipo].label} — tirou de ${nomeAntigo}, passou pra ${nomeNovo}.`,
          tipo_id: tipoTarefa?.id || null,
          importante: false,
          criado_por: userName || 'Sistema',
        } as never)
      }

      await notificarAtribuicao(novoId, TIPO_INFO[tarefa.tipo].label, tarefa.petNome, tarefa.quantidade)

      toast('Reatribuído!', 'success')
      setReatribuindoId(null)
      await Promise.all([carregarEmAndamento(), carregarMinhas()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao reatribuir', 'error')
    } finally {
      setSalvandoReatribuicao(false)
    }
  }

  // ── Desatribuir — desfaz sem passar pra ninguém, o item volta pro pool "Pra atribuir"
  // (pedido do Lucas, 01/09/2026 — "Cancelar" soava como cancelar a atividade em si, não a
  // atribuição). Remoção fica de fora — a atribuição dela é o campo Responsável da Tratativa,
  // não tem "pool" pra voltar.
  async function cancelarAtribuicao(tarefa: TarefaGrupo) {
    if (tarefa.tipo === 'remocao') return
    const rotulo = tarefa.quantidade > 1 ? `${TIPO_INFO[tarefa.tipo].label} (×${tarefa.quantidade})` : TIPO_INFO[tarefa.tipo].label
    if (!confirm(`Desatribuir "${rotulo}" — ${tarefa.petNome}?`)) return
    setCancelandoId(tarefa.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const nomeAtual = operacionais.find(o => o.user_id === tarefa.atribuido_a)?.nome || 'alguém'

      const { error } = await supabase.from('tarefas_operacionais').delete().in('id', tarefa.ids)
      if (error) throw new Error(error.message)

      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'cancelamento',
        campo_label: 'Atribuição cancelada',
        valor_anterior: nomeAtual,
        valor_novo: 'Voltou pro pool',
        tipo: 'cancelamento',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
      } as never)

      if (tarefa.contratoIdResolvido) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: tarefa.contratoIdResolvido,
          descricao: `${userName || 'Alguém'} cancelou a atribuição de ${rotulo} (estava com ${nomeAtual}) — voltou pro pool.`,
          tipo_id: tipoTarefa?.id || null,
          importante: false,
          criado_por: userName || 'Sistema',
        } as never)
      }

      toast('Atribuição cancelada — voltou pro pool', 'success')
      await Promise.all([carregarEmAndamento(), carregarPool()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao cancelar', 'error')
    } finally {
      setCancelandoId(null)
    }
  }

  // ── Concluídas recentemente (pra desfazer misclick) ──────────────────────
  type TarefaConcluida = TarefaGrupo
  const [concluidasRecentes, setConcluidasRecentes] = useState<TarefaConcluida[]>([])
  const [loadingConcluidas, setLoadingConcluidas] = useState(false)
  const [desfazendoId, setDesfazendoId] = useState<string | null>(null)

  const carregouConcluidasAntes = useRef(false)
  const carregarConcluidasRecentes = useCallback(async () => {
    if (!currentUnit || !podeAtribuir) return
    if (!carregouConcluidasAntes.current) setLoadingConcluidas(true)
    const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('tarefas_operacionais')
      .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em, concluido_em')
      .eq('unidade_id', currentUnit.id)
      .eq('status', 'concluida')
      .gte('concluido_em', desde)
      .order('concluido_em', { ascending: false }) as { data: TarefaRow[] | null }

    setConcluidasRecentes(agruparTarefas(await resolverPetTutor(data || [])))
    carregouConcluidasAntes.current = true
    setLoadingConcluidas(false)
  }, [supabase, currentUnit, podeAtribuir, resolverPetTutor])

  useEffect(() => { if (aba === 'atribuir') { carregarEmAndamento(); carregarConcluidasRecentes() } }, [aba, carregarEmAndamento, carregarConcluidasRecentes])

  async function desfazerConclusao(tarefa: TarefaConcluida) {
    if (tarefa.tipo === 'remocao') return
    const rotulo = tarefa.quantidade > 1 ? `${TIPO_INFO[tarefa.tipo].label} (×${tarefa.quantidade})` : TIPO_INFO[tarefa.tipo].label
    if (!confirm(`Desfazer a conclusão de "${rotulo}" — ${tarefa.petNome}?`)) return
    setDesfazendoId(tarefa.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (tarefa.tipo === 'entrega' && tarefa.contrato_id) {
        const { error } = await supabase.from('contratos').update({ status: 'retorno', data_entrega: null } as never).eq('id', tarefa.contrato_id)
        if (error) throw new Error(error.message)
      } else if (tarefa.contratoProdutoIds.length > 0) {
        const { error } = await supabase.from('contrato_produtos').update({ rescaldo_feito: false } as never).in('id', tarefa.contratoProdutoIds)
        if (error) throw new Error(error.message)
      }

      await supabase.from('tarefas_operacionais').update({
        status: 'pendente',
        concluido_em: null,
        anotacao_conclusao: null,
      } as never).in('id', tarefa.ids)

      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: tarefa.id,
        entidade_nome: tarefa.petNome,
        campo: 'conclusao',
        campo_label: 'Tarefa desfeita',
        valor_anterior: 'Concluída',
        valor_novo: 'Pendente (desfeita)',
        tipo: 'desfazer',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: `${rotulo} de ${tarefa.petNome} desfeita — voltou pendente pra ${operacionais.find(o => o.user_id === tarefa.atribuido_a)?.nome || 'quem já estava com ela'}`,
      } as never)

      if (tarefa.contratoIdResolvido) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: tarefa.contratoIdResolvido,
          descricao: `${userName || 'Alguém'} desfez a conclusão de ${TIPO_INFO[tarefa.tipo].label} — voltou pendente, ainda com quem já estava.`,
          tipo_id: tipoTarefa?.id || null,
          importante: true,
          criado_por: userName || 'Sistema',
        } as never)
      }

      // Desfazer NÃO devolve pro pool — a tarefa continua atribuída à mesma pessoa, só volta a
      // "pendente" (é desfazer um misclique de conclusão, não uma desatribuição). Por isso
      // atualiza Em andamento/Minhas Tarefas, não o pool.
      toast('Desfeito — tarefa pendente de novo', 'success')
      await Promise.all([carregarConcluidasRecentes(), carregarEmAndamento(), carregarMinhas(), carregarMinhasConcluidas()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao desfazer', 'error')
    } finally {
      setDesfazendoId(null)
    }
  }

  const carregouPoolAntes = useRef(false)
  const carregarPool = useCallback(async () => {
    if (!currentUnit || !podeAtribuir) return
    if (!carregouPoolAntes.current) setLoadingPool(true)

    const { data: pendentesEntrega } = await supabase.from('tarefas_operacionais').select('contrato_id').eq('unidade_id', currentUnit.id).eq('tipo', 'entrega').eq('status', 'pendente')
    const idsEntregaOcupados = (pendentesEntrega || []).map((r: { contrato_id: string | null }) => r.contrato_id).filter(Boolean)

    let qEntrega = supabase.from('contratos').select('id, codigo, pet_nome, tutor_nome, tutor_telefone, tutor_endereco, tutor_bairro, tutor_cidade, status, numero_lacre, unidade_id, data_acolhimento')
      .eq('unidade_id', currentUnit.id).in('status', ['retorno', 'pendente'])
      .order('data_acolhimento', { ascending: false, nullsFirst: false }) // pet mais novo primeiro
    if (idsEntregaOcupados.length > 0) qEntrega = qEntrega.not('id', 'in', `(${idsEntregaOcupados.join(',')})`)
    const { data: contratosEntrega } = await qEntrega
    setPoolEntrega((contratosEntrega || []) as ContratoResumo[])

    const { data: pendentesRescaldo } = await supabase.from('tarefas_operacionais').select('contrato_produto_id').eq('unidade_id', currentUnit.id).in('tipo', ['molde_patinha', 'carimbo', 'pelo_extra', 'pelinho']).eq('status', 'pendente')
    const idsRescaldoOcupados = (pendentesRescaldo || []).map((r: { contrato_produto_id: string | null }) => r.contrato_produto_id).filter(Boolean)

    let qRescaldo = supabase.from('contrato_produtos')
      .select('id, contrato_id, rescaldo_feito, produto:produtos!inner(nome, rescaldo_tipo), contrato:contratos!inner(id, codigo, pet_nome, tutor_nome, unidade_id, status, numero_lacre, data_acolhimento)')
      .eq('rescaldo_feito', false)
      .in('produto.rescaldo_tipo', ['molde_patinha', 'carimbo', 'pelo_extra', 'pelinho'])
      .eq('contrato.unidade_id', currentUnit.id)
      .in('contrato.status', ['ativo', 'pinda', 'retorno', 'pendente'])
    if (idsRescaldoOcupados.length > 0) qRescaldo = qRescaldo.not('id', 'in', `(${idsRescaldoOcupados.join(',')})`)
    const { data: produtosRescaldo } = await qRescaldo
    setPoolRescaldo((produtosRescaldo || []) as unknown as ContratoProdutoResumo[])

    // Quem pode receber tarefa: Operacional de verdade OU gerente/concierge (tem unidade sem
    // motorista dedicado — aí o próprio gerente/concierge se atribui e resolve).
    const { data: perfisAtribuiveis } = await supabase.rpc('listar_atribuiveis_operacional' as never, { p_unidade_id: currentUnit.id } as never)
    setOperacionais((perfisAtribuiveis || []) as { user_id: string; nome: string | null; role: string }[])

    carregouPoolAntes.current = true
    setLoadingPool(false)
  }, [supabase, currentUnit, podeAtribuir])

  useEffect(() => { if (aba === 'atribuir') carregarPool() }, [aba, carregarPool])

  async function atribuir(tipo: TarefaTipo, origem: { contratoId?: string; contratoProdutoIds?: string[]; unidadeId: string }, itemKey: string) {
    const operacionalId = operacionalEscolhido[itemKey]
    if (!operacionalId) return
    const observacao = (observacaoAtribuicao[itemKey] || '').trim()
    setSalvandoAtribuicao(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const quantidade = origem.contratoProdutoIds?.length || 1
      const linhasBase = {
        unidade_id: origem.unidadeId,
        tipo,
        atribuido_a: operacionalId,
        atribuido_por: user?.id || null,
        observacao_atribuicao: observacao || null,
      }
      const rows = origem.contratoProdutoIds && origem.contratoProdutoIds.length > 0
        ? origem.contratoProdutoIds.map(cpId => ({ ...linhasBase, contrato_id: null, contrato_produto_id: cpId }))
        : [{ ...linhasBase, contrato_id: origem.contratoId || null, contrato_produto_id: null }]
      const { data: novasTarefas, error } = await supabase.from('tarefas_operacionais').insert(rows as never).select('id')
      if (error) throw new Error(error.message)

      const petNome = origem.contratoId
        ? poolEntrega.find(c => c.id === origem.contratoId)?.pet_nome
        : poolRescaldo.find(p => origem.contratoProdutoIds?.includes(p.id))?.contrato?.pet_nome
      const atribuidoNome = operacionais.find(o => o.user_id === operacionalId)?.nome
      const rotulo = quantidade > 1 ? `${TIPO_INFO[tipo].label} (×${quantidade})` : TIPO_INFO[tipo].label
      await supabase.from('historico_alteracoes').insert({
        entidade: 'tarefa_operacional',
        entidade_id: (novasTarefas as { id: string }[] | null)?.[0]?.id || null,
        entidade_nome: petNome || TIPO_INFO[tipo].label,
        campo: 'atribuicao',
        campo_label: 'Tarefa atribuída',
        valor_novo: `${rotulo} → ${atribuidoNome || 'Operacional'}`,
        tipo: 'atribuicao',
        alterado_por: user?.id || null,
        alterado_por_email: user?.email || null,
        nota: observacao || null,
      } as never)

      // Fica registrado nas Observações do contrato também — é onde gerente/concierge já olham todo dia.
      const contratoIdParaObs = origem.contratoId || poolRescaldo.find(p => origem.contratoProdutoIds?.includes(p.id))?.contrato_id
      if (contratoIdParaObs) {
        const { data: tipoTarefa } = await supabase.from('tarefa_tipos').select('id').eq('nome', 'Observação da Unidade').maybeSingle() as { data: { id: string } | null }
        await supabase.from('tarefas').insert({
          contrato_id: contratoIdParaObs,
          descricao: `${userName || 'Alguém'} atribuiu para ${atribuidoNome || 'Operacional'} fazer ${rotulo}${observacao ? ` — pedido específico: "${observacao}"` : '.'}`,
          tipo_id: tipoTarefa?.id || null,
          importante: !!observacao,
          criado_por: userName || 'Sistema',
        } as never)
      }

      await notificarAtribuicao(operacionalId, TIPO_INFO[tipo].label, petNome || 'um pet', quantidade)

      toast('Tarefa atribuída!', 'success')
      setAtribuirModalItem(null)
      setObservacaoAtribuicao(prev => { const n = { ...prev }; delete n[itemKey]; return n })
      await Promise.all([carregarPool(), carregarEmAndamento(), carregarMinhas()])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao atribuir', 'error')
    } finally {
      setSalvandoAtribuicao(false)
    }
  }

  // ── Marcar feito direto na atribuição — pro real: quem tá atribuindo (gerente/concierge)
  // já fez o trabalho ele mesmo antes de abrir o app, e não faz sentido atribuir pra outra
  // pessoa fazer de novo. NÃO assume "agora": se for Entrega, a data de verdade importa (ex:
  // zerando um backlog de entregas antigas, cada uma com a data real dela) — por isso "Feito"
  // só se autoatribui e abre a MESMA tela de conclusão de "Minhas Tarefas" (com Agora/Outra
  // pra Entrega, Anotação opcional), em vez de gravar a data de hoje sem perguntar. Se a pessoa
  // fechar o modal sem concluir, sobra uma tarefa autoatribuída pendente em "Em andamento" —
  // mesmo resultado de ter clicado Atribuir e escolhido a si mesma, não é um estado quebrado.
  async function marcarFeitoDireto(tipo: TarefaTipo, origem: { contratoId?: string; contratoProdutoIds?: string[]; unidadeId: string }, itemKey: string) {
    setMarcandoFeitoId(itemKey)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada — recarregue a página')
      const linhasBase = {
        unidade_id: origem.unidadeId,
        tipo,
        atribuido_a: user.id,
        atribuido_por: user.id,
      }
      const rows = origem.contratoProdutoIds && origem.contratoProdutoIds.length > 0
        ? origem.contratoProdutoIds.map(cpId => ({ ...linhasBase, contrato_id: null, contrato_produto_id: cpId }))
        : [{ ...linhasBase, contrato_id: origem.contratoId || null, contrato_produto_id: null }]
      const { data: novasTarefas, error } = await supabase
        .from('tarefas_operacionais')
        .insert(rows as never)
        .select('id, unidade_id, tipo, ficha_id, contrato_id, contrato_produto_id, atribuido_a, status, lacre, observacao_atribuicao, atribuido_em')
      if (error) throw new Error(error.message)

      const grupo = agruparTarefas(await resolverPetTutor((novasTarefas || []) as TarefaRow[]))[0]
      if (!grupo) throw new Error('Erro ao criar a tarefa')

      // Abre na hora — não espera recarregar pool/em-andamento antes (isso pisca a lista de
      // fundo com "Carregando..." antes do modal nem aparecer, feio no mobile). O básico
      // (pet/tutor/status/lacre) já vem no grupo; carregarMinhas() roda em paralelo e traz o
      // detalhe rico (endereço, espécie) — se chegar depois do modal já aberto, só preenche
      // sozinho (contratosPorId/produtosPorId são lidos a cada render).
      setTarefaAberta(grupo)
      setTarefaAbertaRascunho(true)
      setAnotacaoSimples('')
      setLeuObservacao(false)
      setModoDataEntrega('agora')
      setDataEntregaManual('')
      carregarPool()
      carregarEmAndamento()
      carregarMinhas()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao marcar como feito', 'error')
    } finally {
      setMarcandoFeitoId(null)
    }
  }

  // Agrupa linhas físicas de contrato_produtos por contrato — N itens do mesmo tipo pro mesmo
  // contrato viram 1 PoolItemData com quantidade > 1 (badge "×N").
  function agruparPool(rows: ContratoProdutoResumo[]): PoolItemData[] {
    const grupos: Record<string, PoolItemData> = {}
    for (const p of rows) {
      const existente = grupos[p.contrato_id]
      if (!existente) {
        grupos[p.contrato_id] = {
          key: p.contrato_id, itemIds: [p.id], quantidade: 1,
          petNome: p.contrato?.pet_nome || '—', tutorNome: p.contrato?.tutor_nome || '',
          status: p.contrato?.status || '', lacre: p.contrato?.numero_lacre || null,
          dataAcolhimento: p.contrato?.data_acolhimento,
        }
      } else {
        existente.itemIds.push(p.id)
        existente.quantidade++
      }
    }
    return ordenarPorAcolhimento(Object.values(grupos))
  }

  // Agrupamentos por TIPO — mesma fonte de dados de sempre (poolEntrega/poolRescaldo/
  // emAndamento/concluidasRecentes), só reorganizados pra render em etapa → tipo.
  const poolItensPorTipo: Record<TarefaTipo, PoolItemData[]> = {
    entrega: poolEntrega.map(c => ({
      key: c.id, itemIds: [c.id], quantidade: 1, petNome: c.pet_nome, tutorNome: c.tutor_nome, status: c.status, lacre: c.numero_lacre,
      enderecoResumo: [c.tutor_endereco, c.tutor_bairro, c.tutor_cidade].filter(Boolean).join(' - ') || undefined,
      dataAcolhimento: c.data_acolhimento,
    })),
    remocao: [],
    molde_patinha: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'molde_patinha')),
    carimbo: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'carimbo')),
    pelo_extra: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'pelo_extra')),
    pelinho: agruparPool(poolRescaldo.filter(p => p.produto?.rescaldo_tipo === 'pelinho')),
  }
  const totalPraAtribuir = poolEntrega.length + poolRescaldo.length

  // Junta os 4 tipos de rescaldo por PET (contrato) — se um pet tem molde + carimbo pendentes,
  // vira 1 card só no pool, cada tipo com o próprio Atribuir/Feito.
  const petGroupsPool: PetPoolGroup[] = (() => {
    const porContrato: Record<string, PetPoolGroup> = {}
    for (const tipo of TIPOS_PERSONALIZADOS) {
      for (const item of poolItensPorTipo[tipo]) {
        if (!porContrato[item.key]) {
          porContrato[item.key] = { contratoId: item.key, petNome: item.petNome, tutorNome: item.tutorNome, status: item.status, lacre: item.lacre, dataAcolhimento: item.dataAcolhimento, itens: [] }
        }
        porContrato[item.key].itens.push({ tipo, item })
      }
    }
    return ordenarPorAcolhimento(Object.values(porContrato))
  })()

  const minhasPorTipo = agruparPorTipo(ordenarPorAcolhimento(minhasTarefas))
  const minhasPetGroups = ordenarPorAcolhimento(agruparPorPet(minhasTarefas.filter(t => TIPOS_PERSONALIZADOS.includes(t.tipo))))
  const minhasConcluidasPorTipo = agruparPorTipo(ordenarPorAcolhimento(minhasConcluidas))
  const minhasConcluidasPetGroups = ordenarPorAcolhimento(agruparPorPet(minhasConcluidas.filter(t => TIPOS_PERSONALIZADOS.includes(t.tipo))))
  const andamentoPorTipo = agruparPorTipo(ordenarPorAcolhimento(emAndamento))
  const concluidasPorTipo = agruparPorTipo(ordenarPorAcolhimento(concluidasRecentes))
  const concluidasPetGroups = ordenarPorAcolhimento(agruparPorPet(concluidasRecentes.filter(t => TIPOS_PERSONALIZADOS.includes(t.tipo))))

  function abrirTarefaMinhas(t: TarefaGrupo) {
    setTarefaAberta(t)
    setTarefaAbertaRascunho(false)
    setLacreRemocao('')
    setAnotacaoRemocao('')
    setAnotacaoSimples('')
    setErroRemocao(null)
    setLeuObservacao(false)
    setModoDataEntrega('agora')
    setDataEntregaManual('')
    setModoDataRemocao('agora')
    setDataHoraRemocaoManual('')
  }

  // Fecha o modal de detalhe/conclusão — se era um rascunho do "Feito" (autoatribuído, ainda
  // não confirmado), apaga a tarefa de volta em vez de deixar pendente sobrando.
  async function fecharModalTarefa() {
    if (tarefaAbertaRascunho && tarefaAberta) {
      await supabase.from('tarefas_operacionais').delete().in('id', tarefaAberta.ids)
      carregarPool()
      carregarEmAndamento()
    }
    setTarefaAberta(null)
    setTarefaAbertaRascunho(false)
  }

  // ============================================
  // Render
  // ============================================
  if (!temModulo && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4 text-center">
        <p className="text-[var(--surface-400)]">Módulo Operacional não está ativo nessa unidade.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[var(--brand-500)]" />
        <h1 className="text-lg font-bold text-[var(--surface-800)]">Tarefas</h1>
      </div>

      {podeAtribuir && (
        <div className="flex rounded-xl border border-[var(--surface-200)] overflow-hidden">
          <button onClick={() => setAba('minhas')} className={`flex-1 py-2 text-sm font-semibold transition-colors ${aba === 'minhas' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
            Minhas Tarefas
          </button>
          <button onClick={() => setAba('atribuir')} className={`flex-1 py-2 text-sm font-semibold transition-colors ${aba === 'atribuir' ? 'bg-[var(--brand-600)] text-white' : 'text-[var(--surface-500)]'}`}>
            Gestão de Tarefas
          </button>
        </div>
      )}

      {aba === 'minhas' && (
        <div className="space-y-3">
          <UnderlineTabs
            value={subAbaMinhas}
            onChange={setSubAbaMinhas}
            tabs={[
              { key: 'em_andamento', label: 'Em Andamento', count: minhasTarefas.length },
              { key: 'finalizadas', label: 'Finalizadas últ. 2d.', count: minhasConcluidas.length },
            ]}
          />

          {subAbaMinhas === 'em_andamento' && (
          <>
          {loadingMinhas ? (
            <div className="text-center py-8 text-sm text-[var(--surface-400)]">Carregando...</div>
          ) : minhasTarefas.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--surface-400)]">Nenhuma tarefa pendente 🎉</div>
          ) : (
            <>
              <TipoGroup tipo="remocao" count={(minhasPorTipo.remocao || []).length} defaultAberto={true}>
                {(minhasPorTipo.remocao || []).map(t => {
                  const ficha = t.ficha_id ? fichasPorId[t.ficha_id] : null
                  const petNome = ficha?.nome_pet || t.petNome
                  const tutorNome = ficha?.nome_completo || t.tutorNome
                  return (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      statusBadge={t.statusContrato}
                      lacre={t.lacreContrato}
                      petNome={petNome}
                      tutorNome={tutorNome}
                      quantidade={t.quantidade}
                      acao={t.observacao_atribuicao ? <span className="text-base shrink-0" title="Tem pedido específico">📝</span> : undefined}
                      onClick={() => abrirTarefaMinhas(t)}
                    />
                  )
                })}
              </TipoGroup>
              <PersonalizadosGroup count={minhasPetGroups.reduce((soma, g) => soma + g.itens.length, 0)} defaultAberto={false}>
                {minhasPetGroups.map(petGroup => (
                  <PetMinhasCard key={petGroup.contratoId} petGroup={petGroup} onAbrirTarefa={abrirTarefaMinhas} />
                ))}
              </PersonalizadosGroup>
              <TipoGroup tipo="entrega" count={(minhasPorTipo.entrega || []).length} defaultAberto={false}>
                {(minhasPorTipo.entrega || []).map(t => {
                  const contrato = t.contrato_id ? contratosPorId[t.contrato_id] : null
                  const petNome = contrato?.pet_nome || t.petNome
                  const tutorNome = contrato?.tutor_nome || t.tutorNome
                  const enderecoCompleto = contrato ? [contrato.tutor_endereco, contrato.tutor_bairro, contrato.tutor_cidade].filter(Boolean).join(' - ') : ''
                  const saldo = contrato ? calcularSaldoPendente(contrato).saldoTotal : 0
                  return (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      statusBadge={t.statusContrato}
                      lacre={t.lacreContrato}
                      petNome={petNome}
                      tutorNome={tutorNome}
                      quantidade={t.quantidade}
                      linhaExtra={enderecoCompleto ? <p className="text-xs text-[var(--surface-500)] line-clamp-2 mt-0.5">📍 {enderecoCompleto}</p> : undefined}
                      acao={(t.observacao_atribuicao || saldo > 0) ? (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {t.observacao_atribuicao && <span className="text-base" title="Tem pedido específico">📝</span>}
                          {saldo > 0 && <span className="text-sm font-bold text-emerald-500" title={`Saldo em aberto: R$ ${saldo.toFixed(2)}`}>$</span>}
                        </div>
                      ) : undefined}
                      onClick={() => abrirTarefaMinhas(t)}
                    />
                  )
                })}
              </TipoGroup>
            </>
          )}
          </>
          )}

          {subAbaMinhas === 'finalizadas' && (
          <>
            {loadingMinhasConcluidas ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : minhasConcluidas.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada concluído ainda.</p>
            ) : (
              <>
                <TipoGroup tipo="remocao" count={(minhasConcluidasPorTipo.remocao || []).length} defaultAberto={false}>
                  {(minhasConcluidasPorTipo.remocao || []).map(t => (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      lacre={t.lacreContrato}
                      petNome={t.petNome}
                      tutorNome={t.tutorNome}
                      quantidade={t.quantidade}
                      linhaExtra={<p className="text-xs text-[var(--surface-500)] mt-0.5">✅ {formatarDataHoraConclusao(t.concluido_em)}</p>}
                    />
                  ))}
                </TipoGroup>
                <PersonalizadosGroup count={minhasConcluidasPetGroups.reduce((soma, g) => soma + g.itens.length, 0)} defaultAberto={false}>
                  {minhasConcluidasPetGroups.map(petGroup => (
                    <PetConcluidasCard key={petGroup.contratoId} petGroup={petGroup} onDesfazer={desfazerConclusao} desfazendoId={desfazendoId} />
                  ))}
                </PersonalizadosGroup>
                <TipoGroup tipo="entrega" count={(minhasConcluidasPorTipo.entrega || []).length} defaultAberto={false}>
                  {(minhasConcluidasPorTipo.entrega || []).map(t => (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      lacre={t.lacreContrato}
                      petNome={t.petNome}
                      tutorNome={t.tutorNome}
                      quantidade={t.quantidade}
                      linhaExtra={<p className="text-xs text-[var(--surface-500)] mt-0.5">✅ {formatarDataHoraConclusao(t.concluido_em)}</p>}
                      acao={
                        <button
                          onClick={() => desfazerConclusao(t)}
                          disabled={desfazendoId === t.id}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 bg-red-600 disabled:opacity-50"
                        >
                          {desfazendoId === t.id ? '...' : 'Desfazer'}
                        </button>
                      }
                    />
                  ))}
                </TipoGroup>
              </>
            )}
          </>
          )}
        </div>
      )}

      {aba === 'atribuir' && podeAtribuir && (
        <div className="space-y-3">
          <UnderlineTabs
            value={subAbaGestao}
            onChange={setSubAbaGestao}
            tabs={[
              { key: 'pra_atribuir', label: 'Para Atribuir', count: totalPraAtribuir },
              { key: 'em_andamento', label: 'Em Andamento', count: emAndamento.length },
              { key: 'finalizadas', label: 'Finalizadas últ. 2d.', count: concluidasRecentes.length },
            ]}
          />

          {subAbaGestao === 'pra_atribuir' && (
            <>
            {loadingPool ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : operacionais.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nenhum usuário ativo pra atribuir nessa unidade.</p>
            ) : totalPraAtribuir === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada pra atribuir agora 🎉</p>
            ) : (
              <>
                {/* Remoção nunca populada aqui (a atribuição dela é o Responsável da
                    Tratativa, não passa pelo pool) — grupo omitido de propósito. */}
                <PersonalizadosGroup count={petGroupsPool.reduce((soma, g) => soma + g.itens.length, 0)} defaultAberto={false}>
                  {petGroupsPool.map(petGroup => (
                    <PetPoolCard
                      key={petGroup.contratoId}
                      petGroup={petGroup}
                      onAbrirAtribuir={(tipo, item) => setAtribuirModalItem({ tipo, item })}
                      onMarcarFeito={(tipo, item) => marcarFeitoDireto(tipo, { contratoProdutoIds: item.itemIds, unidadeId: currentUnit!.id }, `${tipo}:${item.key}`)}
                      marcandoFeitoId={marcandoFeitoId}
                    />
                  ))}
                </PersonalizadosGroup>
                <TipoGroup tipo="entrega" count={poolItensPorTipo.entrega.length} defaultAberto={false}>
                  {poolItensPorTipo.entrega.map(item => (
                    <PoolItem
                      key={item.key}
                      tipo="entrega"
                      item={item}
                      onAbrirAtribuir={poolItem => setAtribuirModalItem({ tipo: 'entrega', item: poolItem })}
                      onMarcarFeito={poolItem => marcarFeitoDireto('entrega', { contratoId: poolItem.key, unidadeId: currentUnit!.id }, `entrega:${poolItem.key}`)}
                      marcandoFeitoId={marcandoFeitoId}
                    />
                  ))}
                </TipoGroup>
              </>
            )}
            </>
          )}

          {subAbaGestao === 'em_andamento' && (
          <>
            {loadingEmAndamento ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : emAndamento.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada em andamento.</p>
            ) : (
              ORDEM_TIPOS.map(tipo => (
                <TipoGroup key={tipo} tipo={tipo} count={(andamentoPorTipo[tipo] || []).length}>
                  {(andamentoPorTipo[tipo] || []).map(t => {
                    const horasParado = (Date.now() - new Date(t.atribuido_em).getTime()) / (1000 * 60 * 60)
                    const corIdade = horasParado > 48 ? 'text-red-500' : horasParado > 24 ? 'text-amber-500' : 'text-[var(--surface-400)]'
                    const nomeAtual = operacionais.find(o => o.user_id === t.atribuido_a)?.nome || '—'
                    return (
                      <div key={t.id}>
                        <TarefaCard
                          tipo={t.tipo}
                          lacre={t.lacre}
                          petNome={t.petNome}
                          tutorNome={t.tutorNome}
                          quantidade={t.quantidade}
                          linhaExtra={<p className="text-xs text-[var(--surface-500)] truncate mt-0.5">Com {nomeAtual} · <span className={corIdade}>{horasParado < 1 ? 'agora' : `${Math.floor(horasParado)}h`}</span></p>}
                          acao={
                            <div className="flex flex-col items-stretch gap-2 shrink-0">
                              <button
                                onClick={() => setReatribuindoId(reatribuindoId === t.id ? null : t.id)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
                                style={{ background: '#64748b' }}
                              >
                                Reatribuir
                              </button>
                              {t.tipo !== 'remocao' && (
                                <button
                                  onClick={() => cancelarAtribuicao(t)}
                                  disabled={cancelandoId === t.id}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 disabled:opacity-50"
                                  title="Volta pro pool 'Pra atribuir', sem passar pra ninguém"
                                >
                                  {cancelandoId === t.id ? '...' : 'Desatribuir'}
                                </button>
                              )}
                            </div>
                          }
                        />
                        {reatribuindoId === t.id && (
                          <div className="mt-1.5 ml-1 flex gap-1.5">
                            <select
                              value={novoOperacional[t.id] || ''}
                              onChange={e => setNovoOperacional(prev => ({ ...prev, [t.id]: e.target.value }))}
                              className="input text-sm flex-1"
                            >
                              <option value="">Passar pra quem...</option>
                              {operacionais.filter(o => o.user_id !== t.atribuido_a).map(o => (
                                <option key={o.user_id} value={o.user_id}>
                                  {o.nome || 'Sem nome'} ({o.role === 'operacional' ? 'Operacional' : o.role === 'gerente' ? 'Gerente' : o.role === 'super_admin' ? 'Admin' : 'Concierge'}) — {cargaPorPessoa[o.user_id] || 0} pendente{(cargaPorPessoa[o.user_id] || 0) === 1 ? '' : 's'}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => reatribuir(t)}
                              disabled={salvandoReatribuicao || !novoOperacional[t.id]}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                              style={{ background: '#64748b' }}
                            >
                              OK
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </TipoGroup>
              ))
            )}
          </>
          )}

          {subAbaGestao === 'finalizadas' && (
          <>
            {loadingConcluidas ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Carregando...</p>
            ) : concluidasRecentes.length === 0 ? (
              <p className="text-xs text-[var(--surface-400)] px-1 py-2">Nada concluído ainda.</p>
            ) : (
              <>
                <TipoGroup tipo="remocao" count={(concluidasPorTipo.remocao || []).length} defaultAberto={false}>
                  {(concluidasPorTipo.remocao || []).map(t => (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      lacre={t.lacre}
                      petNome={t.petNome}
                      tutorNome={t.tutorNome}
                      quantidade={t.quantidade}
                      linhaExtra={<p className="text-xs text-[var(--surface-500)] mt-0.5">✅ {formatarDataHoraConclusao(t.concluido_em)} · {nomePorId[t.atribuido_a] || '—'}</p>}
                    />
                  ))}
                </TipoGroup>
                <PersonalizadosGroup count={concluidasPetGroups.reduce((soma, g) => soma + g.itens.length, 0)} defaultAberto={false}>
                  {concluidasPetGroups.map(petGroup => (
                    <PetConcluidasCard key={petGroup.contratoId} petGroup={petGroup} onDesfazer={desfazerConclusao} desfazendoId={desfazendoId} nomePorId={nomePorId} />
                  ))}
                </PersonalizadosGroup>
                <TipoGroup tipo="entrega" count={(concluidasPorTipo.entrega || []).length} defaultAberto={false}>
                  {(concluidasPorTipo.entrega || []).map(t => (
                    <TarefaCard
                      key={t.id}
                      tipo={t.tipo}
                      lacre={t.lacre}
                      petNome={t.petNome}
                      tutorNome={t.tutorNome}
                      quantidade={t.quantidade}
                      linhaExtra={<p className="text-xs text-[var(--surface-500)] mt-0.5">✅ {formatarDataHoraConclusao(t.concluido_em)} · {nomePorId[t.atribuido_a] || '—'}</p>}
                      acao={
                        <button
                          onClick={() => desfazerConclusao(t)}
                          disabled={desfazendoId === t.id}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 bg-red-600 disabled:opacity-50"
                        >
                          {desfazendoId === t.id ? '...' : 'Desfazer'}
                        </button>
                      }
                    />
                  ))}
                </TipoGroup>
              </>
            )}
          </>
          )}
        </div>
      )}

      {/* Popup de atribuição — era formulário inline embaixo do card, empurrava a lista
          inteira a cada clique. Virou popup centralizado, mesmo padrão visual do modal de
          conclusão abaixo. */}
      {atribuirModalItem && (() => {
        const { tipo, item } = atribuirModalItem
        const cor = TIPO_INFO[tipo].cor
        const Icon = TIPO_INFO[tipo].icon
        // Qualifica por tipo — item.key é o contrato_id, e um pet pode ter mais de um tipo de
        // rescaldo pendente ao mesmo tempo (ex: molde + carimbo). Sem isso, o operacional
        // escolhido e a observação digitada num tipo vazariam pro popup do outro tipo do
        // mesmo pet.
        const formKey = `${tipo}:${item.key}`
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !salvandoAtribuicao && setAtribuirModalItem(null)}>
            <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-4 space-y-4 bg-[var(--surface-0)]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--surface-800)] flex items-center gap-2">
                  <Icon className="h-5 w-5" style={{ color: cor }} />
                  Atribuir {TIPO_INFO[tipo].label}
                  {item.quantidade > 1 && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: cor }}>×{item.quantidade}</span>
                  )}
                </h2>
                <button onClick={() => setAtribuirModalItem(null)} disabled={salvandoAtribuicao} className="p-1 rounded-lg hover:bg-[var(--surface-100)]">
                  <X className="h-5 w-5 text-[var(--surface-400)]" />
                </button>
              </div>

              <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)]">
                <p className="text-sm font-semibold text-[var(--surface-800)] flex items-center gap-1.5">
                  {item.status && <StatusBadge status={item.status} />}
                  {item.lacre ? `${item.lacre} — ${item.petNome}` : item.petNome}
                </p>
                <p className="text-xs text-[var(--surface-500)]">{item.tutorNome}</p>
              </div>

              <select
                value={operacionalEscolhido[formKey] || ''}
                onChange={e => setOperacionalEscolhido(prev => ({ ...prev, [formKey]: e.target.value }))}
                className="input text-sm w-full"
              >
                <option value="">Escolher quem vai fazer...</option>
                {operacionais.map(o => (
                  <option key={o.user_id} value={o.user_id}>
                    {o.nome || 'Sem nome'} ({o.role === 'operacional' ? 'Operacional' : o.role === 'gerente' ? 'Gerente' : o.role === 'super_admin' ? 'Admin' : 'Concierge'}) — {cargaPorPessoa[o.user_id] || 0} pendente{(cargaPorPessoa[o.user_id] || 0) === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <textarea
                value={observacaoAtribuicao[formKey] || ''}
                onChange={e => setObservacaoAtribuicao(prev => ({ ...prev, [formKey]: e.target.value }))}
                rows={2}
                placeholder={PLACEHOLDER_PEDIDO[tipo]}
                className="input text-sm w-full resize-none"
              />
              <button
                onClick={() => atribuir(tipo, tipo === 'entrega' ? { contratoId: item.key, unidadeId: currentUnit!.id } : { contratoProdutoIds: item.itemIds, unidadeId: currentUnit!.id }, formKey)}
                disabled={salvandoAtribuicao || !operacionalEscolhido[formKey]}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: AZUL_ROYAL }}
              >
                {salvandoAtribuicao ? 'Atribuindo...' : 'Atribuir'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Detalhe / conclusão de tarefa */}
      {tarefaAberta && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !concluindoRemocao && !concluindoSimples && fecharModalTarefa()}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-2xl p-4 space-y-4 bg-[var(--surface-0)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--surface-800)] flex items-center gap-2">
                {(() => { const Icon = TIPO_INFO[tarefaAberta.tipo].icon; return <Icon className="h-5 w-5" style={{ color: TIPO_INFO[tarefaAberta.tipo].cor }} /> })()}
                {TIPO_INFO[tarefaAberta.tipo].label}
                {tarefaAberta.quantidade > 1 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: TIPO_INFO[tarefaAberta.tipo].cor }}>×{tarefaAberta.quantidade}</span>
                )}
              </h2>
              <button onClick={fecharModalTarefa} disabled={concluindoRemocao || concluindoSimples} className="p-1 rounded-lg hover:bg-[var(--surface-100)]">
                <X className="h-5 w-5 text-[var(--surface-400)]" />
              </button>
            </div>

            {tarefaAberta.observacao_atribuicao && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-500 mb-0.5">⚠️ Pedido específico de quem atribuiu</p>
                <p className="text-sm text-[var(--surface-700)] mb-2">{tarefaAberta.observacao_atribuicao}</p>
                {tarefaAberta.tipo !== 'remocao' && (
                  <label className="flex items-center gap-2 text-sm text-[var(--surface-700)] cursor-pointer">
                    <input type="checkbox" checked={leuObservacao} onChange={e => setLeuObservacao(e.target.checked)} className="w-4 h-4" />
                    Li e vou seguir esse pedido
                  </label>
                )}
              </div>
            )}

            {tarefaAberta.tipo === 'remocao' && tarefaAberta.ficha_id && fichasPorId[tarefaAberta.ficha_id] && (() => {
              const ficha = fichasPorId[tarefaAberta.ficha_id!]
              const op = (ficha.op_dados || {}) as Record<string, unknown>
              const petDetalhe = [ficha.especie, ficha.raca, ficha.cor].filter(Boolean).join(' · ')

              // Onde buscar o pet: residência do tutor, uma clínica/hospital ou um 3º endereço
              // avulso — nunca sempre a residência (achado do Lucas, 02/09/2026: o popup
              // sempre linkava Waze/Maps pro endereço de CADASTRO do tutor, mesmo quando o pet
              // estava numa clínica). `op.localColeta` é o que o gerente confirmou na Tratativa
              // (tem prioridade, mesmo padrão de `gerarPdfDaFicha`); sem isso ainda (ficha
              // recém-chegada), cai no que o tutor preencheu na ficha pública
              // (`ficha.localizacao`/`localizacao_outra`).
              const unidade = unidadeDaFicha(ficha)
              const temPadronizacaoClinicas = !!unidade?.modulos_ativos?.includes('cb_padronizacao_clinicas')
              const opLocalColeta = op.localColeta as string | null
              const enderecoResidencia = ficha.endereco ? `${ficha.endereco}, ${ficha.numero}${ficha.complemento ? ` - ${ficha.complemento}` : ''} - ${ficha.bairro}, ${ficha.cidade}/${ficha.estado}` : ''

              let localLabel = 'Residência'
              let enderecoNavegavel = enderecoResidencia
              let semTraslado = false

              if (op.semLocal) {
                localLabel = 'Local não informado'
                enderecoNavegavel = ''
              } else if (opLocalColeta === 'clinica') {
                localLabel = 'Clínica / Hospital'
                enderecoNavegavel = (temPadronizacaoClinicas ? (op.estabNome as string) : (op.clinicaTextoLivre as string)) || ficha.localizacao_outra || ''
              } else if (opLocalColeta === 'outro') {
                localLabel = 'Outro endereço'
                enderecoNavegavel = (op.enderecoOutro as string) || ficha.localizacao_outra || ''
              } else if (opLocalColeta === 'unidade') {
                localLabel = 'Unidade R.I.P. Pet'
                enderecoNavegavel = ''
                semTraslado = true
              } else if (!opLocalColeta) {
                if (ficha.localizacao === 'Hospital/Clínica Veterinária') {
                  localLabel = 'Clínica / Hospital'
                  enderecoNavegavel = ficha.localizacao_outra || ''
                } else if (ficha.localizacao === 'Outro') {
                  localLabel = 'Outro endereço'
                  enderecoNavegavel = ficha.localizacao_outra || ''
                } else if (ficha.localizacao === 'Unidade R.I.P. Pet') {
                  localLabel = 'Unidade R.I.P. Pet'
                  enderecoNavegavel = ''
                  semTraslado = true
                }
              }

              const wazeUrl = enderecoNavegavel ? `https://waze.com/ul?q=${encodeURIComponent(enderecoNavegavel)}&navigate=yes` : null
              const gmapsUrl = enderecoNavegavel ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoNavegavel)}` : null

              return (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Pet:</strong> {ficha.nome_pet?.toUpperCase()}</p>
                    {petDetalhe && <p className="text-xs text-[var(--surface-500)]">{petDetalhe}</p>}
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Tutor:</strong> {ficha.nome_completo}</p>
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Contato:</strong> {(op.telefone1Nome as string) || ficha.nome_completo}</p>
                    <p className="text-sm"><strong className="text-[var(--surface-700)]">Local:</strong> {localLabel}</p>
                    {enderecoNavegavel && <p className="text-sm"><strong className="text-[var(--surface-700)]">Endereço:</strong> {enderecoNavegavel}</p>}
                    {semTraslado && <p className="text-xs text-[var(--surface-500)]">Tutor já trouxe o pet até a unidade — sem deslocamento.</p>}
                  </div>

                  {(wazeUrl || gmapsUrl) && (
                    <div className="grid grid-cols-2 gap-2">
                      {wazeUrl && (
                        <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold">
                          <MapPin className="h-4 w-4" />Waze
                        </a>
                      )}
                      {gmapsUrl && (
                        <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
                          <Navigation className="h-4 w-4" />Google Maps
                        </a>
                      )}
                    </div>
                  )}

                  <button onClick={() => gerarPdfDaFicha(ficha)} disabled={gerandoPdf} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[var(--surface-200)] text-sm font-semibold text-[var(--surface-600)] disabled:opacity-50">
                    {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    Gerar PDF do Contrato
                  </button>

                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-500">📋 Informações Pós-Remoção</p>
                    <div>
                      <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Quando aconteceu o acolhimento? <span className="text-red-400">*</span></label>
                      <AgoraOutraToggle modo={modoDataRemocao} setModo={setModoDataRemocao} outraLabel="Escolher Data/Hora" />
                      {modoDataRemocao === 'outra' && (
                        <input type="datetime-local" step="1800" value={dataHoraRemocaoManual} onChange={e => setDataHoraRemocaoManual(e.target.value)} className="input w-full mt-1.5" />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Número do Lacre <span className="text-red-400">*</span></label>
                      <input type="text" value={lacreRemocao} onChange={e => setLacreRemocao(e.target.value)} placeholder="Número do lacre" className="input w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Anotação (opcional)</label>
                      <p className="text-[10px] text-[var(--surface-500)] mb-1">Ex.: Tutor acertou no cartão em 6x; Tutora pediu para cremar a toalha azul junto com o pet; Cremar ursinho de pelúcia junto.</p>
                      <textarea value={anotacaoRemocao} onChange={e => setAnotacaoRemocao(e.target.value)} rows={2} placeholder="Alguma observação sobre a remoção..." className="input w-full resize-none" />
                    </div>
                    {erroRemocao && <p className="text-xs text-red-400">{erroRemocao}</p>}
                    <button
                      onClick={() => concluirRemocao(tarefaAberta, ficha)}
                      disabled={concluindoRemocao || !lacreRemocao.trim() || (modoDataRemocao === 'outra' && !dataHoraRemocaoManual)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
                    >
                      {concluindoRemocao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Concluir Remoção
                    </button>
                  </div>
                </div>
              )
            })()}

            {tarefaAberta.tipo !== 'remocao' && (
              <div className="space-y-3">
                {(() => {
                  const contratoEntrega = tarefaAberta.contrato_id ? contratosPorId[tarefaAberta.contrato_id] : null
                  const produto = tarefaAberta.contrato_produto_id ? produtosPorId[tarefaAberta.contrato_produto_id] : null
                  const c = contratoEntrega || produto?.contrato
                  const petNome = c?.pet_nome || '—'
                  const tutorNome = c?.tutor_nome || '—'
                  const status = c?.status
                  const lacre = c?.numero_lacre
                  const petDetalhe = [c?.pet_especie, c?.pet_raca, c?.pet_cor].filter(Boolean).join(' · ')
                  const enderecoCompleto = [c?.tutor_endereco, c?.tutor_bairro, c?.tutor_cidade].filter(Boolean).join(' - ')
                  const wazeUrl = enderecoCompleto ? `https://waze.com/ul?q=${encodeURIComponent(enderecoCompleto)}&navigate=yes` : null
                  const gmapsUrl = enderecoCompleto ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoCompleto)}` : null
                  const saldo = tarefaAberta.tipo === 'entrega' && contratoEntrega ? calcularSaldoPendente(contratoEntrega).saldoTotal : 0
                  return (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-[var(--surface-50)] border border-[var(--surface-200)] space-y-1">
                        <p className="text-sm flex items-center gap-1.5">
                          <strong className="text-[var(--surface-700)]">Pet:</strong>
                          {status && <StatusBadge status={status} />}
                          {lacre ? `${lacre} — ${petNome}` : petNome}
                        </p>
                        {petDetalhe && <p className="text-xs text-[var(--surface-500)] pl-[calc(2.5rem+0.375rem)]">{petDetalhe}</p>}
                        <p className="text-sm"><strong className="text-[var(--surface-700)]">Tutor:</strong> {tutorNome}</p>
                        {tarefaAberta.tipo === 'entrega' && enderecoCompleto && (
                          <p className="text-sm"><strong className="text-[var(--surface-700)]">Endereço:</strong> {enderecoCompleto}</p>
                        )}
                      </div>
                      {saldo > 0 && (
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40">
                          <p className="text-sm font-semibold text-emerald-600">💰 Saldo em aberto: R$ {saldo.toFixed(2).replace('.', ',')}</p>
                          <p className="text-xs text-[var(--surface-500)]">Cobrar do tutor na entrega, se possível.</p>
                        </div>
                      )}
                      {tarefaAberta.tipo === 'entrega' && (wazeUrl || gmapsUrl) && (
                        <div className="grid grid-cols-2 gap-2">
                          {wazeUrl && (
                            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold">
                              <MapPin className="h-4 w-4" />Waze
                            </a>
                          )}
                          {gmapsUrl && (
                            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
                              <Navigation className="h-4 w-4" />Google Maps
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-500">📋 Informações de Conclusão</p>
                  {tarefaAberta.tipo === 'entrega' && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Quando foi entregue? <span className="text-red-400">*</span></label>
                      <AgoraOutraToggle modo={modoDataEntrega} setModo={setModoDataEntrega} outraLabel="Escolher Data" />
                      {modoDataEntrega === 'outra' && (
                        <input type="date" value={dataEntregaManual} onChange={e => setDataEntregaManual(e.target.value)} className="input w-full mt-1.5" />
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-[var(--surface-600)] mb-1">Anotação (opcional)</label>
                    <textarea value={anotacaoSimples} onChange={e => setAnotacaoSimples(e.target.value)} rows={2} placeholder="Alguma observação..." className="input w-full resize-none" />
                  </div>
                  <button
                    onClick={() => concluirTarefaSimples(tarefaAberta)}
                    disabled={concluindoSimples || (!!tarefaAberta.observacao_atribuicao && !leuObservacao) || (tarefaAberta.tipo === 'entrega' && modoDataEntrega === 'outra' && !dataEntregaManual)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
                  >
                    {concluindoSimples ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

