// "+ LANÇAR" — a porta única de tudo que se lança no financeiro (08/10/2026).
// Antes eram sete botões em três abas, e quem ia lançar precisava saber em que
// aba morava cada coisa ("paguei a fatura pelo Caixa e fui procurar em
// Lançamentos"). O menu fica no topo da tela; as abas viram consulta.
//
// O menu não tem formulário próprio: ele troca de aba e manda um COMANDO, e a
// aba abre o formulário que já tinha. Quem recebe avisa que cumpriu
// (`onComandoFeito`), e a página limpa — senão voltar à aba reabriria o modal.

export type AcaoLancar = 'importar' | 'despesa' | 'recebiveis' | 'quitacao' | 'movimentacao'

// O MENU em 4 portas (Lucas, 14/10/2026), pela natureza do registro:
//   · Lançar OFX     — o LANÇAMENTO de verdade: o que o extrato/fatura prova (concilia e classifica)
//   · Pré-Lançamento — o que se lança à mão só pra não perder o controle; concilia depois
//   · Repasse / Fatura — ver o que fechou, as prévias e confirmar o pagamento
export type ItemMenuLancar =
  | { tipo: 'acao'; acao: AcaoLancar; titulo: string; detalhe: string }
  | { tipo: 'grupo'; titulo: string; detalhe: string; itens: AcaoLancar[] }
  | { tipo: 'aba'; aba: 'repasse'; titulo: string; detalhe: string }

export const MENU_LANCAR: ItemMenuLancar[] = [
  { tipo: 'acao', acao: 'importar', titulo: 'Lançar OFX', detalhe: 'Para conciliação e classificação' },
  // um popup só, com as abas Despesa · Movimentação entre contas (14/10/2026)
  { tipo: 'acao', acao: 'despesa', titulo: 'Pré-Lançamento', detalhe: 'Para controle, deve ser conciliado depois.' },
  { tipo: 'aba', aba: 'repasse', titulo: 'Repasse', detalhe: 'Ver fechados, prévias e confirmar pagamento' },
  { tipo: 'acao', acao: 'quitacao', titulo: 'Fatura', detalhe: 'Ver fechadas, prévias e confirmar pagamento' },
]

export const ITENS_LANCAR: { acao: AcaoLancar; titulo: string; detalhe: string }[] = [
  { acao: 'importar',     titulo: 'Importar extrato',          detalhe: 'Cola o extrato ou a fatura; cada linha é identificada' },
  { acao: 'despesa',      titulo: 'Despesa',                   detalhe: 'Gasto da unidade — entra na DRE' },
  { acao: 'recebiveis',   titulo: 'Recebíveis de cartão',      detalhe: 'Liquidação, antecipação, chargeback da maquininha' },
  { acao: 'quitacao',     titulo: 'Quitação',                  detalhe: 'Pagamento do repasse à Matriz ou da fatura do cartão' },
  { acao: 'movimentacao', titulo: 'Movimentação entre contas', detalhe: 'Transferência, aporte, empréstimo, ajuste' },
]
