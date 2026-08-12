# AUDITORIA DE LAYOUT E RESPONSIVIDADE — 07/07/2026

> 4 agentes varreram o CSS/Tailwind por grupo de telas (shell/nav/dashboards · listas/tabelas · pipeline/contratos · modais/formulários), caçando os padrões que causam **estouro de tela (scroll horizontal)** e **"botão fora da caixinha"** relatados pelos usuários (muitos no celular).
>
> **Fonte da verdade viva: demandas `2026/110`–`2026/116`** (`/admin/demandas`). Este arquivo é o retrato + o padrão de fix.

## Diagnóstico em uma frase

O CSS das telas está, na maioria, **bem construído** (padrão tabela-desktop + cards-mobile, `flex-wrap` nas toolbars, `truncate`/`min-w-0` nos cards, `Modal.tsx` base vira bottom-sheet). O que falta é **uma rede de segurança global** + um punhado de **culpados cirúrgicos** — não é reescrita, é correção pontual.

## A estrutura do fix: 1 guarda global + culpados por tela

### Camada 1 — a guarda global (faz PRIMEIRO, `2026/110`)
3 dos 4 agentes bateram, independentemente, no mesmo ponto: **não existe `overflow-x: hidden` global** no `body`/`html` nem `overflow-x-hidden` no `<main>`. Sem isso, qualquer elemento que vaze estraga a página inteira. Duas linhas de CSS contêm a classe toda de sintomas — é o item de maior alavancagem do pacote.

### Camada 2 — os culpados confirmados
| Demanda | Sev | Tela | Sintoma |
|---------|-----|------|---------|
| `2026/111` | alta | AtivarModal, CertificadoModal | **Botão salvar inalcançável** no celular (modal não rola) |
| `2026/112` | alta | /ativos | Scroll horizontal (sem layout mobile) |
| `2026/113` | media | /contratos card | Botões cortados em tablet/paisagem (breakpoint denso liga em `md`, subir pra `lg`) |
| `2026/114` | media | /clinicas, /estoque(lista), /admin/funcionarios | `overflow-hidden` corta colunas de tabela larga → trocar por `overflow-x-auto` |
| `2026/115` | media | TratativaModal, EditarFichaModal, AtivarModal | Grids de campos não colapsam (`grid-cols-N` → `grid-cols-1/2 sm:N`); datetime estoura |
| `2026/116` | baixa | UnitSelector, layout, tutores | Dropdown vaza em 320px, zoom bloqueado, truncates faltando |

## Padrões-ouro internos (replicar, não reinventar)

O código já tem exemplos exemplares do fix — usar de molde:
- **`Modal.tsx` base** — bottom-sheet mobile + `max-h-[90vh]` + `overflow-y-auto` + footer sticky. Os modais que cortam o salvar (`2026/111`) só precisam migrar pra ele.
- **`DocMenu.tsx:54`** — dropdown via portal com flip quando estoura à direita. Molde pro `UnitSelector` (`2026/116`).
- **`contratos/page.tsx:5143`** — barra de ação com `max-w-[calc(100vw-2rem)]`. Molde pra qualquer elemento fixo/absoluto.
- **`admin/catalogo`, `admin/demandas`, `admin/visibilidade`** — tabelas densas em `overflow-x-auto`. Molde pras tabelas de `2026/114`.
- **Mega pagamento (`contratos/[id]:4265`)** — `max-h-[95vh]` + `min-w-0`/`overflow-hidden`. Verificado defensivo — NÃO era o vilão que se suspeitava.

## Verificado e OK (não mexer)

Bottom nav / header fixos (largura + safe-area corretos), z-index coerente, KPIs do dashboard em SVG responsivo (não Recharts), leads/fichas/encaminhamentos/grade de estoque, hero do contrato com `flex-wrap`, FichaForm multi-step, todas as `<img>` contidas em `object-cover`.

## Código morto encontrado (limpeza futura)

- **`PipelineBar.tsx`** — não importado; a barra real é inline em `contratos/page.tsx:3532` (essa correta). O `overflow-visible` problemático dele é latente.
- **`DashboardInsights.tsx`** — não montado em nenhuma página; os Recharts sem `min-w-0` dele são risco latente, não ativo.

Candidatos a remoção (junto com a `2026/80` — quebrar/limpar arquivos gigantes).

## Verificação no browser (09/07/2026 — Chrome logado, DOM real)

Rodei uma verificação no navegador real (medição via DOM, não só leitura de código). Resultados que **mudaram** o quadro:

- **`2026/110` (guarda global) — CONFIRMADO objetivamente.** `getComputedStyle` no `html`/`body`: `overflow-x: visible`, `max-width: none`. A trava realmente não existe. Continua sendo o item nº1.
- **`2026/111` (modais cortam salvar) — CONFIRMADO E QUANTIFICADO.** Abri o `AtivarModal` (Acionar PV): `max-height: none`, `overflow-y: visible`. Com Local=Clínica o conteúdo vai a **554px**; num iPhone SE (667px) com teclado aberto (~367px úteis) o botão "Ativar Contrato" fica **187px abaixo, inacessível, sem scroll**. Método validado por contraste: o mega pagamento e o modal "Tornar ativo" têm `max-h-[95vh]` + `overflow-y-auto` e passam. É o culpado mais provável das reclamações de "não consigo usar no celular".
- **`2026/112` (/ativos) — DESCARTADO.** Tela deprecated, não usada na operação (info do Lucas). Bug irrelevante na prática.
- **`2026/113` (botões cortados em tablet) — REBAIXADO p/ baixa.** A estimativa estática (~840px, "corta claro") **superestimou**. Medição real (forçando o card à largura de tablet e lendo `scrollWidth`): conteúdo exige ~684px; nenhum dos 5 cards corta em tablet 768px (696px úteis, folga de 12px) — o bloco central encolhe por `truncate` e absorve a folga. Corta só em tablets estreitos/zoom/cards carregados. **O layout mobile do pipeline `/contratos` NÃO estoura** (medido a 288–343px).

**Lição:** a auditoria estática acerta os padrões estruturais mas erra a MAGNITUDE — superestimou o `2026/113` e o `2026/112` (tela morta), e o browser confirmou com força o `2026/110` e `2026/111`. Verificar no ambiente real vale — tanto pra confirmar quanto pra rebaixar.

**Limitação técnica registrada:** a ponte Chrome desta sessão não controla o viewport CSS (o `resize_window` não desce abaixo do mínimo de janela do Chrome no Windows — `innerWidth` ficou em 1707px). Por isso a prova foi por **medição do DOM** (forçar largura/altura em elementos e ler `scrollWidth`/`scrollHeight` + `getComputedStyle`), que é mais rigorosa que um print, e um screenshot do `AtivarModal` aberto como registro visual. Para prints em viewport de celular real, usar o modo dispositivo do DevTools (F12 → toolbar responsiva → iPhone SE).
