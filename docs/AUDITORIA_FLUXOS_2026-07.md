# AUDITORIA POR FLUXO — Casos-limite (Copa do Mundo do CRM)

> Gerada em 07/07/2026 por 7 agentes-operador percorrendo os fluxos críticos do CRM simulando casos reais e "quase impossíveis". Diferente da auditoria por pilar (`docs/PLANO_UPGRADE_2026.md` → demandas `2026/40`–`2026/81`), que acha problemas sistêmicos, esta caça **bugs semânticos e temporais** — os que só aparecem quando se percorre um cenário de negócio concreto atravessando funções que rodam em momentos diferentes.
>
> **Fonte da verdade viva: demandas `2026/83`–`2026/108`** (tela `/admin/demandas`). Este arquivo é o retrato + os padrões-mãe; o andamento vive nas demandas.
>
> **Gatilho da caça:** o bug `2026/82` (clínica duplicada), reportado pelo Lucas e invisível à auditoria por pilar. Esta rodada procurou os irmãos dele — e achou muitos.

## Por que a auditoria por pilar não pegou estes

A varredura por pilar é orientada a **classes de problema** (query sem `.limit()`, rota sem auth, `alert()`). Acha o sistêmico com ótima cobertura, mas passa ao lado de bugs que exigem *simular um cenário específico atravessando duas funções em tempos diferentes* (ex: `processarFicha` agora, `criarContrato` depois, com reidratação de `op_dados` no meio). Nenhum grep pega isso — só quem percorre o fluxo com persona de operador, ou quem opera a ferramenta de verdade.

---

## Os 7 padrões-mãe (raízes que se repetem entre fluxos)

Os 26 achados não são 26 problemas independentes. Eles se agrupam em **7 raízes**. Corrigir a raiz mata vários de uma vez:

### A — Estoque materializado sem transação nem fonte única (`2026/83`–`2026/86`)
`estoque_atual` é um número guardado, movido por chamadas incrementais soltas. Baixa no momento errado (PV desconta 2×), sem transação (venda sem baixa), inventário relativo em vez de absoluto, unidade errada no compartilhamento. **Raiz:** falta um ponto único e transacional que seja dono do saldo.

### B — Transições supinda↔contrato em lote client-side (`2026/87`–`2026/91`)
Toda transição de status entre contrato e supinda é feita em JS, a partir de arrays carregados no navegador, com `.in('id', [...])` — sem trigger de banco, sem `.range()`. **Raiz:** o banco nunca é dono da transição, então array truncado/esquecido gera contrato e supinda contando histórias diferentes. **Fix estrutural comum:** updates server-side por FK (`.eq('supinda_volta_id', enc.id)`), idempotentes, ou triggers espelhando a mig 091.

### C — GC com dupla máquina de estado (`2026/92`–`2026/95`)
A coluna `contrato_gc.etapa` é escrita por duas telas com vocabulários incompatíveis (o `/gc` moderno e o `GCTracking` legado). **Raiz:** componente legado não aposentado escrevendo na mesma coluna que a tela nova lê.

### D — Escopo pela unidade LOGADA, não a do dado (`2026/96`, cruza com `2026/95`, `2026/86`)
Super_admin operando dado de outra unidade: status inicial, código, endereço e rota leem `currentUnit` em vez da unidade do contrato/ficha. **Raiz:** confundir "unidade em que estou logado" com "unidade dona do registro". Aparece em Ficha, PV e GC.

### E — Ficha→contrato: escritas soltas sem transação nem idempotência (`2026/97`–`2026/101`)
Criar contrato são 5+ escritas independentes; falha/retry deixa órfãos (tutor, clínica) e duplica. **Raiz:** ausência de RPC transacional (é a `2026/53` da auditoria por pilar) + falta de dedupe/UNIQUE.

### F — Tutor: snapshot desnormalizado vs JOIN vivo, e telefone com 2 convenções (`2026/102`–`2026/105`)
O snapshot em `contratos` quase nunca é lido (todas as telas preferem o JOIN vivo), tornando falsa a promessa de "congelar finalizados"; e "telefone principal" tem dois modelos brigando (posição de coluna vs flag). **Raiz:** duas fontes de verdade não reconciliadas.

### G — Financeiro: cálculo duplicado em 4+ cópias (`2026/106`–`2026/108`)
Excluir pagamento não estorna desconto (perda de dinheiro), e cada tela conta o saldo diferente. **Raiz:** as 4 cópias do cálculo de saldo (é a `2026/78` da auditoria por pilar).

---

## Correções de documentação (doc drift confirmado no código)

A auditoria pegou a própria tríade mentindo em 3 pontos — corrigidos nos arquivos na mesma leva:

1. **FLOW.md §2** dizia: contrato vira `pinda` quando a supinda muda pra `embarcada_ida`. **Errado** — o código muda em `ida_finalizada` (`encaminhamentos/page.tsx:1194-1197`). Ver `2026/87`/`2026/88`.
2. **FLOW.md §2/§5** tratava a mensagem "Chegaram" como gatilho de `pinda→retorno`. **Errado** — "Chegaram" é manual e só envia texto, não muda status (`ChegaramModal.tsx`). Ver `2026/88`.
3. **FLOW.md §4 / SCHEMA.md (view 096)** descrevem o modelo de reserva PV como "segura sem debitar; debita no acionamento". **O código faz o oposto** (debita no add, nunca no acionamento). Ver `2026/83`.

---

## Achados verificados e INOCENTADOS (não mexer)

Tão importante quanto achar bug é confirmar o que está sólido:

- **Trigger de auto-retorno da mig 091** — o guard `AND status='pinda'` impede qualquer regressão. Correto.
- **Taxa de cartão parcelada** — aplicada 1× sobre o total, não por parcela. Correto (`contratos/[id]:1443`).
- **Trigger 074 vs escrita manual** — o frontend nunca grava `valor_acessorios`/`desconto_acessorios` direto. Regra respeitada.
- **Migrations 095/096 ausentes** — degradam com tratamento de erro, não quebram a tela (`estoque-reservado.ts:36-45`). O item `2026/45` não é urgente-crítico.
- **Devolução de estoque ao remover produto** — simétrica e correta (`GREATEST(0,...)` no trigger de `qtde_vendida`).
- **`estoque_infinito`** — retorno null tratado, nunca exibido como 0.

---

## Confirmações cruzadas (confiança máxima)

Dois achados foram encontrados por **agentes independentes chegando à mesma conclusão por caminhos diferentes** — sinal de alta confiança:

- **`2026/83` (estoque PV 2×)** — times de Estoque E de PV convergiram.
- **`2026/96` (escopo pela unidade logada)** — times de Ficha, PV e GC bateram no mesmo padrão em 3 fluxos.

---

## Índice rápido dos achados

| Demanda | Tema | Sev | Título curto |
|---------|------|-----|--------------|
| 2026/83 | A | alta | Estoque PV descontado 2× |
| 2026/84 | A | alta | Baixa de venda não transacional |
| 2026/85 | A | alta | Inventário relativo (deveria ser absoluto) |
| 2026/86 | A | media | Compartilhado baixa unidade errada |
| 2026/87 | B | alta | Lote >1000 → pets presos em pinda |
| 2026/88 | B | alta | "Chegaram" nunca dispara sem volta vinculada |
| 2026/89 | B | media | /contratos vincula supinda fechada |
| 2026/90 | B | media | Desvincular não reverte status |
| 2026/91 | B | media | Status legado trava supinda |
| 2026/92 | C | alta | Dupla máquina de estado no GC |
| 2026/93 | C | media | Finalizar sem GC pronto + flags fora de ordem |
| 2026/94 | C | baixa | Nome do pet diverge certificado×entrega |
| 2026/95 | C/D | media | /gc sem filtro de unidade + GC prematuro |
| 2026/96 | D | alta | Escopo pela unidade logada (3 fluxos) |
| 2026/97 | E | alta | Ciclo desfazer→reprocessar duplica clínica |
| 2026/98 | E | alta | Tutor duplicado por CPF em retry |
| 2026/99 | E | media | Código do contrato colide sem regenerar |
| 2026/100 | E | media | Espécie/cremação fora do enum quebra criação |
| 2026/101 | E | media | Sem trava double-submit na ficha |
| 2026/102 | F | alta | 2 convenções de telefone principal |
| 2026/103 | F | alta | Editar telefone deixa apelido mentindo |
| 2026/104 | F | media | Finalizado não congela (nem na NFS-e) |
| 2026/105 | F | media | CPF ausente cria tutor novo sempre |
| 2026/106 | G | alta | Excluir pagamento não estorna desconto (perda R$) |
| 2026/107 | G | media | Saldo diverge entre telas |
| 2026/108 | G | media | Descontos/pagamentos sem clamp |
