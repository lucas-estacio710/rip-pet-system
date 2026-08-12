# PLANO DE UPGRADE DO CRM — 2026

> Gerado em 03/07/2026 a partir de auditoria de código em 5 frentes paralelas (Segurança, Performance, UX, Confiabilidade/Observabilidade, Multi-unidade/Débito técnico). Todos os achados têm evidência `arquivo:linha` verificada no código — nada é teoria.
>
> **⚠️ Fonte da verdade viva: tabela `demandas` (tela `/admin/demandas`).** Os 42 itens deste plano foram convertidos nas demandas **`2026/40` a `2026/81`** em 03/07/2026, na ordem do plano (0.1→`2026/40` ... 6.6→`2026/81`), com diagnóstico técnico e evidências em cada uma. Este arquivo é o retrato da auditoria + a visão de fases/sprints; status e andamento vivem nas demandas.

---

## Sumário executivo

O CRM está funcional e maduro em features, mas tem **3 buracos estruturais** que precisam ser fechados antes de qualquer expansão:

1. **Segurança cross-tenant**: o RLS não escopa por unidade. Qualquer operador logado consegue ler CPF/telefone/endereço de TODOS os tutores e contratos de TODAS as unidades chamando a REST API direto. O filtro de unidade é 100% frontend. Além disso, `/api/nfse/emitir` emite nota fiscal real sem verificar quem chamou, e o bucket de fichas (imagens com PII) é público.
2. **Rede de segurança inexistente**: zero testes, zero error tracking, zero CI, zero transações. Fluxos críticos (processar ficha, pagamentos) são sequências de escritas independentes — falha no meio deixa contrato órfão/duplicado, e ninguém fica sabendo porque erros morrem no console do device do operador.
3. **Números errados silenciosos**: dashboards agregam contratos no client sem limite — acima de 1000 linhas o Supabase trunca e os KPIs sub-contam sem nenhum erro visível.

A boa notícia: a infraestrutura pra corrigir quase tudo **já existe no projeto** (função `user_unidade_ids()` nunca usada, componentes Toast/Modal/Skeleton prontos, padrão de rate-limit em `insert_lead`, RPCs agregadas corretas em 2 KPIs). Grande parte do plano é *aplicar consistentemente o que já foi construído*.

**Estrutura do plano**: 7 fases. Fases 0–1 são "estancar sangramento" (1–2 sprints), 2–4 são consolidação, 5–6 são a preparação real pra franquia.

Tamanhos: XS (< meio dia) · S (1 dia) · M (2–4 dias) · L (1–2 semanas) · XL (> 2 semanas).

---

## FASE 0 — Estancar sangramento (crítico — fazer antes de tudo)

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 0.1 | **RLS por unidade** em todas as tabelas de negócio: reescrever policies `auth_full_*` para `USING (unidade_id = ANY(user_unidade_ids()) OR is_super_admin())`. A função `user_unidade_ids()` existe desde a mig 041 e nunca foi usada. Atenção aos fluxos cross-unit legítimos (GC/crematório, encaminhamentos, agenda da Matriz) — precisam de policies específicas, não de exceção geral | **L** | `002_rls_security_v2.sql:82-213`, `041_multi_unit_foundation.sql:108` |
| 0.2 | **Auth server-side em `/api/nfse/emitir`** — hoje qualquer autenticado emite NFS-e fiscal real de qualquer contrato com o certificado da empresa | **S** | `api/nfse/emitir/route.ts:30-33` |
| 0.3 | **Bucket `fichas` privado** + URLs assinadas de curta duração (imagens contêm CPF/endereço, hoje legíveis sem login) | **M** | `030_storage_fichas.sql:2-4,25-28` |
| 0.4 | **Insert anônimo de fichas via RPC `SECURITY DEFINER`** com rate limit por IP/fingerprint (padrão já existe em `insert_lead`, mig 034) e colunas restritas — hoje `WITH CHECK (true)` permite flood e injetar `processada=true`/`contrato_id` | **M** | `026/053_fichas_anon_insert.sql`, `034_leads_rate_limit.sql:26-35` |
| 0.5 | **Filtro de unidade em `/preventivos`, `/ativos`, `/tutores`** (vazam todas as unidades na UI hoje). Criar helper único `filterUnit` (existe local em encaminhamentos) | **S** | `preventivos/page.tsx:112-116`, `ativos/page.tsx:82-86`, `tutores/page.tsx:55-60` |
| 0.6 | **Rodar migrations pendentes 094/095/096** no SQL Editor — 095/096 têm código em produção que quebra sem elas (`estoque-reservado.ts:32`, `estoque/page.tsx:562`) | **XS** | CLAUDE.md tabela de migrations |

**Por que primeiro:** 0.1–0.4 são exposição de PII e risco fiscal reais hoje, com qualquer usuário logado (ou anônimo, no caso do bucket). 0.5 é o band-aid imediato enquanto 0.1 não sai.

---

## FASE 1 — Visibilidade e rede de segurança (paralelizável com Fase 0)

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 1.1 | **Sentry** (SDK Next.js) — client + API routes, com contexto de usuário/unidade. Hoje erros morrem em `console.error` no device do operador | **S** | zero APM no package.json |
| 1.2 | **CI GitHub Actions**: `npm ci && npm run lint && npm run build` em cada push/PR (build já faz typecheck — só falta alguém rodar) | **XS** | `.github/workflows/` não existe |
| 1.3 | **Smoke E2E Playwright**: login → processar ficha → contrato criado → pagamento. 1 teste que cubra o caminho que paga as contas. Aproveitar o plano de 5 fases já desenhado (17/05, adiado) | **M** | zero testes no repo |
| 1.4 | **Runbook de backup**: confirmar PITR do plano Supabase + `pg_dump` periódico documentado em `docs/` | **XS** | nenhum doc de backup no repo |
| 1.5 | **Headers de segurança**: CSP, HSTS, X-Frame-Options, nosniff via `headers()` no next.config (hoje vazio) | **S** | `next.config.ts:3-5` |
| 1.6 | **Auth nas APIs restantes**: `/api/push/send` (spam/phishing push pra todos os devices), `/api/produtos/nome-retorno` (PATCH/PUT sem role), `/api/push/subscribe` (userId do body), `/api/places/search` (proxy de API paga) | **S** | `push/send/route.ts:26-34`, `produtos/nome-retorno/route.ts:10-52` |
| 1.7 | **Segredo dedicado pro token de recontratação** (`RECONTRATACAO_SECRET` obrigatório; hoje cai pra service_role key ou string vazia) + parar de persistir senha temporária em claro no user_metadata | **XS** | `recontratacao-token.ts:9`, `admin/reset-password/route.ts:122` |

---

## FASE 2 — Integridade transacional (o fim dos órfãos)

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 2.1 | **RPC transacional `processar_ficha`**: contrato + vínculo da ficha + tarefas + produtos + pagamentos numa transação única. Hoje são 3+ escritas independentes — falha no meio = contrato órfão + ficha "não processada" = reprocessa e duplica | **M** | `TratativaModal.tsx:926-967` |
| 2.2 | **RPC transacional `desfazer_ficha`**: o undo já admite `partial: true` no próprio código | **S** | `desfazer-ficha/route.ts:166-205` |
| 2.3 | **Pagamentos/produtos atômicos com o contrato** nos demais fluxos (quitar saldo, ativar PV, pelinho) — hoje um insert de pagamento que falha deixa contrato financeiramente zerado com `alert()` | **M** | `contratos/page.tsx:2381-2405` |
| 2.4 | **Validação zod** nos payloads de API e no form público de ficha (hoje `.insert(payload as any)`) | **M** | `FichaForm.tsx:510` |

---

## FASE 3 — Performance

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 3.1 | **Índices no banco** (mig nova): `idx_contratos_unidade_status_data`, `idx_contrato_produtos_contrato`, `idx_contrato_gc_contrato`, `idx_tutores_nome/telefone/cpf`, `idx_fichas_unidade_created`, `idx_leads_unidade_created`. `contratos` (98 colunas, tabela mais consultada) não tem NENHUM índice além da PK | **S** | SCHEMA.md — só 6 índices documentados, nenhum em contratos |
| 3.2 | **KPIs do dashboard → RPCs agregadas** (`GROUP BY` no Postgres): `EspecieKPI`, `ComoConheceuKPI`, `LocalRemocaoKPI`, `FonteOutroKPI` agregam no client sem limite → **truncam em 1000 e mostram números errados**. `RemocoesKPI`/`TipoCremacaoKPI` já fazem certo (usar de modelo) | **M** | `EspecieKPI.tsx:41-50` etc. |
| 3.3 | **Limite/paginação nas queries sem `.range()`**: `/encaminhamentos` (3 scans full-table refeitos a cada mutação), `/ativos` (`select('*')` sem limite), grupo "sem supinda" em contratos | **S** | `encaminhamentos/page.tsx:306-311`, `ativos/page.tsx:82-86`, `contratos/page.tsx:985-990` |
| 3.4 | **Dynamic import das libs pesadas**: pdf-lib, fontkit, html2canvas, jszip, node-forge, recharts entram no bundle inicial das rotas — mover pra `await import()` nos handlers de exportação | **S** | `contrato-pdf.ts:1-2`, `ficha-generator.ts:1`, `DashboardInsights.tsx:8-11` |
| 3.5 | **React Query (TanStack)** como camada de cache: hoje zero cache, cada navegação e cada evento realtime refaz todos os fetches. Adotar incremental (começar por contratos/fichas) | **L** | grep SWR/React Query = 0 |
| 3.6 | **`next/image`** nas fotos de produtos/estoque/clínicas (hoje `<img>` cru em grids longos) | **S** | `estoque/page.tsx:1179` etc. |

---

## FASE 4 — UX (a experiência do Concierge)

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 4.1 | **`ConfirmDialog` + varredura de `alert()`/`confirm()`**: ~150 `alert()` e ~30 `confirm()` nativos → trocar por `toast()` (infra pronta, usada em só 3 telas) e um ConfirmDialog baseado no Modal existente (botão destrutivo vermelho). Inclui banir "Verifique o console" como mensagem ao operador | **M** | `contratos/page.tsx:2388`, `estoque/page.tsx:274,457` |
| 4.2 | **Toggles otimistas com revert**: `separado`, `rescaldo_feito`, `foto_recebida` hoje falham em silêncio total (sem toast, sem revert) — crítico no celular em campo | **S** | `contratos/page.tsx:2409-2428, 3348-3369, 2190-2223` |
| 4.3 | **Fila offline da ficha pública**: `PENDING_KEY` é escrito mas NUNCA relido/reenviado — ficha de tutor em luto se perde em silêncio e ele vê tela de sucesso. Flush no mount + honestidade no feedback | **S** | `FichaForm.tsx:529-538` |
| 4.4 | **Guard `isDirty` nos modais** de edição (toque fora do modal no celular descarta tudo digitado sem aviso) | **S** | `Modal.tsx:53-54` |
| 4.5 | **Skeleton + EmptyState em `/contratos`** (a tela mais usada tem o pior loading: texto "Carregando..." cru) — nivelar ao padrão-ouro de `/tutores` | **XS** | `contratos/page.tsx:3979-3986` |
| 4.6 | **Filtros persistentes em `/estoque`** (URL, como contratos já faz) — hoje resetam ao entrar num produto e voltar | **XS** | `estoque/page.tsx:82-85` |
| 4.7 | **Higiene**: datas 100% via `date-local.ts` (12 pontos inline), `aria-label` nos botões-ícone (5 no projeto inteiro), toast de erro sem auto-dismiss | **XS** | `Toast.tsx:39-42` |

---

## FASE 5 — Escala multi-unidade (a preparação pra franquia)

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 5.1 | **Ficha pública data-driven**: mapa slug→UUID hardcoded em `ficha/[slug]/page.tsx:7-78` (unidade nova = editar código + deploy). Resolver via `unidades.slug` (coluna já existe) + endpoint/RPC anônimo restrito. Aposentar a rota legada `/ficha/santos` | **S** | `ficha/[slug]/page.tsx:7-78`, `ficha/santos/page.tsx` |
| 5.2 | **Bootstrap de unidade** (`criar_unidade` RPC ou script): hoje unidade nova exige 7 passos manuais (row, mapa de ficha, seed de field_permissions, funcionários, produtos/estoque, e-mail hardcoded, NFS-e). Documentar + automatizar o seed | **M** | levantamento no relatório multi-unidade |
| 5.3 | **Des-hardcodear Santos**: mensagens "chegou à Santos" (2 lugares), certificado "Pindamonhangaba" fixo, fallback "Santos - SP" em 5 arquivos, e-mails de ficha hardcoded, `leads.unidade_code DEFAULT 'ST'`, prefixo supinda `\|\| 'ST'`, listas de cidades fixas | **M** | `contratos/page.tsx:1888-1961`, `certificado-pdf.ts:168`, `api/ficha/email/route.ts:8-14`, `040_leads_unidade_code.sql:5` |
| 5.4 | **NFS-e multi-município**: hoje 100% Santos (config, WSDL, código de município chumbados). Abstrair provider por unidade — grande, mas bloqueia faturamento de qualquer unidade nova | **XL** | `lib/nfse/index.ts:60-69`, `client.ts:11` |
| 5.5 | **Implementar `/pinda` e `/retorno`** — são stubs hardcoded ("Conecte ao Supabase") apesar de listados como ✅ no CLAUDE.md | **M** | `pinda/page.tsx:1-22` |
| 5.6 | **LGPD**: política de retenção/anonimização de contratos finalizados antigos, processo de atendimento a titular (acesso/exclusão), revisão de quem vê CPF (amarra com FLS server-side 6.4) | **M** | — |

---

## FASE 6 — Débito técnico e manutenibilidade

| # | Item | Tamanho | Evidência |
|---|------|---------|-----------|
| 6.1 | **`supabase gen types`** e aposentar `types/database.ts` manual (131 linhas, 2 tabelas, sem `unidade_id` em tutores) — elimina as dezenas de `as never`/`as any` | **M** | `types/database.ts:7-26,94` |
| 6.2 | **Remover deprecated dos SELECTs/tipos**: `is_reserva_pv`, `desconto_plano`, `pagamentos.desconto` (ainda lido em 7 pontos), uso direto de `produtos.estoque_atual` (vs `produtos_estoque`), `clinica_coleta`, `supinda_direcao` | **S** | relatório multi-unidade, Grupo 4 |
| 6.3 | **Centralizar lógica duplicada**: cálculo financeiro do contrato (7+ cópias → `lib/`), mensagens WhatsApp "Chegaram"/despedida (2 cópias cada → `lib/whatsapp-msg.ts`), fallback de nome de unidade. `contrato-tags.ts` é o modelo a seguir | **M** | `contratos/page.tsx:252-257` vs `[id]/page.tsx:304-309` etc. |
| 6.4 | **FLS server-side**: hoje o field_permissions é 100% cosmético (hook React); um operador com campo `hidden` edita via REST direto. Depende de 0.1 (redesign de RLS) | **L** | `useFieldPermission.ts:19-39` |
| 6.5 | **Quebrar os gigantes**: `contratos/page.tsx` (6.799 linhas) e `contratos/[id]/page.tsx` (5.421) — extrair modais, mensagens e financeiro. Fazer DEPOIS de 6.3 (a extração de lógica já reduz muito) | **L** | contagem de linhas |
| 6.6 | **Alerta de anomalia operacional** (pg_cron ou rota agendada): fichas em Recebidas > N horas, contratos sem pagamento — primeiro passo de observabilidade de negócio | **S** | — |

---

## Sequência recomendada (visão de sprint)

| Sprint | Foco | Itens |
|--------|------|-------|
| **1** | Segurança crítica | 0.2, 0.5, 0.6, 1.2, 1.6, 1.7 (os rápidos) + começar 0.1 (RLS) |
| **2** | Segurança + visibilidade | terminar 0.1, 0.3, 0.4, 1.1 (Sentry), 1.5 |
| **3** | Rede de segurança | 1.3 (E2E), 1.4, 2.1, 2.2 |
| **4** | Integridade + perf de dados | 2.3, 2.4, 3.1 (índices), 3.2 (KPIs certos) |
| **5** | Performance + UX core | 3.3, 3.4, 4.1, 4.2, 4.3 |
| **6** | UX + higiene | 4.4–4.7, 6.1, 6.2 |
| **7–8** | Multi-unidade | 5.1, 5.2, 5.3, 5.5, 6.3 |
| **9+** | Grandes estruturais | 3.5 (React Query), 5.4 (NFS-e), 5.6 (LGPD), 6.4 (FLS server), 6.5 (quebrar gigantes) |

### Regras de dependência
- **0.1 (RLS) antes de 6.4 (FLS server-side)** — mesmo redesign de policies.
- **6.3 (centralizar lógica) antes de 6.5 (quebrar arquivos)** — senão quebra-se código duplicado.
- **1.3 (E2E smoke) antes de 2.1 e das fases 5–6** — refatorar fluxos críticos sem teste é andar no escuro.
- **3.5 (React Query) depois de 3.1–3.3** — cache não conserta query errada.

### Quick wins (dá pra fazer numa tarde cada)
0.6 (rodar migrations) · 1.2 (CI) · 1.4 (backup runbook) · 1.7 (segredos) · 4.5 (skeleton contratos) · 4.6 (filtros estoque) · 3.1 (índices)

---

## Pontos positivos confirmados (não regredir)

- `/api/admin/*` verificam super_admin corretamente; webhook valida secret; recontratação tem auth própria.
- Realtime bem-feito: 1 canal por página, cleanup correto, sem vazamentos.
- Listas principais (contratos, tutores, fichas, leads) já paginam corretamente.
- `Modal.tsx` já é bottom-sheet no mobile com scroll-lock e Escape; `tutores/page.tsx` é o padrão-ouro de tela; `contratos` é o padrão-ouro de filtros na URL; `FichaForm` tem autosave e validação por etapa.
- `contrato-tags.ts` é o modelo de lógica centralizada.
- Sem segredos hardcoded; `.env` fora do git; `RemocoesKPI`/`TipoCremacaoKPI` agregam do jeito certo.
