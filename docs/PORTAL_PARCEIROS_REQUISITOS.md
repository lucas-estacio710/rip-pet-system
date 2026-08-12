# PORTAL DE PARCEIROS — Requisitos v1

> **Status:** requisitos fechados em 30/07/2026 (32 perguntas respondidas pelo Lucas)
> + adendo do mesmo dia: nome "Portal de Parceiros" (não só vets), campo **cargo** no
> cadastro, **multi-unidade obrigatório** (produto vendável pras unidades irmãs) e
> **tabela de comissões definida**.
> **Objetivo deste doc:** ser o contrato de implementação. O desenvolvimento (Opus 5) NÃO deve
> re-decidir nada que está aqui — só implementar. Dúvidas novas → seção "Pontos em aberto".

---

## 1. Visão geral

Portal web (PWA) para **parceiros** da RIP Pet — veterinários, recepcionistas, auxiliares,
gerentes e proprietários de clínicas/pet shops (quem indica é gente, não só o vet!).
O parceiro se cadastra por convite presencial do Lucas, e passa a poder:

- Ver o **catálogo de planos** (com preço cheio) da unidade dele
- **Orçar na frente do tutor** no momento do óbito (wizard delicado, visual)
- Enviar ao tutor um **link de ficha pré-preenchida e rastreada** (ou preencher na hora)
- Escolher, por indicação, o **benefício**: comissão pra ele, desconto pro tutor ou cortesia
- Acompanhar **extrato** de indicações, comissões e pagamentos (com comprovante)
- Participar do **sorteio mensal** (bilhetes por indicação + member-get-member)
- Baixar **materiais de apoio ao luto** pra entregar ao tutor
- **Convidar colegas vets** (MgM) com link/QR rastreado

Pro Lucas (admin): cadastro de todos os vets, funil orçamento→indicação→contrato,
fila de pagamento das segundas, engajamento por vet, gestão de sorteio/prêmio/materiais.

**Princípio de produto:** o vet tem que se encantar — visual delicado, zero fricção,
transparência total no dinheiro. O portal externaliza pro próprio vet o que hoje é feito
manualmente na tela `/clinicas` (Indicações por Mês + comissão).

---

## 2. Decisões de requisitos (respostas fechadas)

### Identidade & cadastro

| # | Decisão |
|---|---------|
| 1 | Usuário = **parceiro pessoa física** (não a clínica), vinculado a um estabelecimento (`estabelecimentos`). **Cargo obrigatório no cadastro** (select): `veterinario`, `recepcionista`, `aux_veterinario`, `tecnico_veterinario`, `banhista_tosador`, `gerente`, `proprietario`, `outro` (com especificar). O campo `contatos.cargo` já existe — normalizar com essas opções. |
| 2 | Convite **presencial via QR/link com token de USO ÚNICO** gerado pelo Lucas na visita; o parceiro completa o cadastro no celular dele na hora. **+ Member-get-member:** o parceiro gera QR/link personalizado pra convidar colega; convite rastreado; benefício = 1 bilhete de sorteio quando o colega se cadastra. **Antes de gerar qualquer convite (admin ou MgM), quem convida preenche: "Nome do novo membro" (texto) + "Região de atuação" (droplist das cidades de cobertura da unidade — seed Santos: as 9 da Baixada Santista)** — resolve o parceiro fora de área na origem: sem cidade coberta, sem link. |
| 3 | Modelo de dados: **estender a tabela `contatos`** (não criar tabela paralela). Se o parceiro já existe em `contatos` (CRM comercial), o cadastro do portal **complementa** o registro — preserva histórico de indicações/visitas. |
| 4 | Auth: **Google OAuth + e-mail/senha** (Supabase Auth, os dois habilitados). |
| 5 | Perfil mínimo: nome, **cargo**, CRMV (**opcional — só se veterinário**), clínica, telefone/WhatsApp, **chave pix**, **Instagram** (só o @, campo texto — **SEM mecanismo de avatar na v1**; foto fica placeholder com iniciais). v2: gamificação de perfil completo (foto etc.) valendo bilhete de sorteio. |

### Catálogo & orçamento

| # | Decisão |
|---|---------|
| 6 | v1 mostra **só os planos com preço cheio** (reusa `planos`/`plano_grupos`/`plano_itens`, mig 098). Urnas/recordações avulsas ficam pra v1.1 (exceto cortesia, ver #11). |
| 7 | Orçamento = **versão da ficha pública pré-preenchida** ("como nos conheceu" + "quem indicou" já travados no vet). Dois modos: (a) vet envia **link personalizado rastreado** pro WhatsApp do tutor; (b) vet **preenche na hora** no celular dele com o tutor do lado. |
| 8 | Orçamento finalizado → **pré-ficha a 1 clique**: o tutor abre o link e a ficha já vem com pet, plano e indicador preenchidos. |
| 9 | Botão **"Solicitar remoção"** (pet em óbito na clínica): cria ficha EM (`tipo_plano='emergencial'`) e notifica a equipe por push. **Sem tracking de status do pet na v1** (fica pra v2). |
| 10/31 | Orçamento **congela o preço por 24h** (snapshot). Depois expira. |

### Benefício & comissão

| # | Decisão |
|---|---------|
| 11 | **O vet escolhe na hora, por orçamento:** comissão pra ele OU desconto pro tutor OU recordação de cortesia (item do catálogo). |
| 12 | Comissão **progressiva por categoria** (ano móvel de 12 meses): **Bronze** (0 a 5 pets indicados), **Prata** (6 a 12), **Ouro** (13+). Valores definidos pelo Lucas (seed da config, editáveis por unidade): **Bronze R$80 COL / R$150 IND · Prata R$120 COL / R$200 IND · Ouro R$160 COL / R$250 IND**. **Transparência obrigatória na experiência do parceiro:** ele sempre vê a conta da própria categoria — "**N pets indicados desde DD/MM/AAAA** (ano móvel) → categoria **Y**; faltam **M** pra **Z**" — na home e no extrato. Nunca deixar a categoria parecer arbitrária. |
| 13 | Desconto pro tutor = **percentual fixo definido pelo admin** (config por unidade). **Valor definido: 10%** (seed, editável no Orquestrador). |
| 14 | Indicação **valida na criação do contrato** (não espera pagamento do tutor). Pagamento da comissão é manual, em cadência combinada — **segundas-feiras** (tutor paga até domingo, então o ciclo é rápido). |
| 15 | Tutor "solto" (ligou direto): vínculo manual na **tratativa** (`contato_id` já existe no TratativaModal) **+ botão "reivindicar indicação"** no portal, com aprovação do admin. |

### Financeiro do vet

| # | Decisão |
|---|---------|
| 16 | Extrato completo: indicações com status (pendente/validada/paga), saldo a receber, histórico de pagamentos, **gráfico de evolução mensal + projeção de categoria** (quanto falta pra Prata/Ouro). |
| 17 | Tela admin de pagamento (segundas): **fila "a pagar" agrupada por vet** — total + pix copiável + marcar pago em lote + **anexar comprovante colando imagem da área de transferência (Ctrl+V)**. O vet vê o comprovante no extrato dele. |
| 18 | **Sem formalização fiscal** na v1 (pix direto; o extrato é o registro). |

### Sorteio & gamificação

| # | Decisão |
|---|---------|
| 19 | Bilhetes: **1 por indicação que virou contrato no mês + 1 por colega convidado que se cadastrou (MgM)**. Só esses dois na v1. |
| 20 | Sorteio v1 **simples, sem live**: aba "Sorteio" mostra resultado do último (bilhete vencedor + "Não foi desta vez — boa sorte no próximo mês"), próximo sorteio (data + prêmio) e **meus bilhetes concorrentes**. |
| 21 | **Prêmio único por mês**, cadastrado pelo admin com foto + descrição (massagem, curso, diária...). ⚠️ **v1: o ganhador é escolhido MANUALMENTE pelo admin** (decisão estratégica do Lucas) — o portal só publica o resultado. Randômico auditável fica pra v2. **Não expor essa mecânica na UI.** |
| 22 | Ranking: o vet vê **só a própria categoria** (Bronze/Prata/Ouro) + progresso pro próximo nível + benefício do próximo nível. Sem leaderboard entre vets. |

### Relacionamento

| # | Decisão |
|---|---------|
| 23 | Notificações: **push PWA** (reusa infra `push_subscriptions`) **+ e-mail** (Resend, já integrado). |
| 24 | Gatilhos: indicação virou contrato · comissão paga (com comprovante) · ganhou bilhete · resultado do sorteio. Sem campanhas de marketing na v1. |
| 25 | Aba **"Materiais"**: PDFs/cartões de apoio ao luto pra clínica entregar ao tutor (admin faz upload). |
| 26 | ~~Selo/certificado de parceiro~~ — **descartado**. |

### Arquitetura & operação

| # | Decisão |
|---|---------|
| 27 | Admin: tela com **funil orçamento→indicação→contrato + fila de comissões + engajamento por vet** (último login, orçamentos no mês). |
| 28 | **Mesmo backend Supabase**, mas **app Next.js SEPARADO com URL própria no Vercel** — domínio definido: **`parceiro.rippet.com.br`** (singular) — PWA com manifest próprio. Motivação: isolar superfície de ataque — falha no portal não expõe o CRM. |
| 29 | **Zero acesso direto do client ao banco**: todo dado via **API routes server-side com `service_role`**, validando a sessão em cada request. Chave anon presente SÓ pro fluxo de auth. RLS **deny-all** nas tabelas novas do portal (defesa em profundidade). |
| 30 | Cron (Vercel Cron no app novo): **diário** — expira orçamentos >24h, recalcula categorias (ano móvel); **mensal** — consolida bilhetes do mês fechado, cria o sorteio do mês seguinte. |
| 32 | MVP = **tudo de uma vez**: cadastro/convite + orçamento + indicação + benefício + extrato + pagamento c/ comprovante + sorteio + MgM + categorias + materiais. |
| 33 | **Multi-unidade DESDE O DIA 1** (produto vendável pras unidades irmãs, modelo do módulo de clínicas): TODA tabela nova do portal carrega `unidade_id`; parceiro pertence a uma unidade; catálogo, config de comissão, sorteio, bilhetes, materiais e fila de pagamento são **escopados por unidade**. Portal vira módulo `cb_portal_parceiros` em `unidades.modulos_ativos` (liga/desliga por unidade). Admin `/admin/parceiros` respeita a unidade ativa (`currentUnit`); super_admin vê todas. ⚠️ Lembrar da lição da RLS: nunca depender só de filtro de frontend — como o acesso é 100% API server-side, o escopo de unidade é aplicado NO SERVIDOR em toda query. |
| 34 | **Orquestrador super_admin:** TODA variável do programa vive num painel central (tab "Orquestrador" em `/admin/parceiros`, no estilo dos botõezinhos/toggles do `/admin/visibilidade`). Nada de número mágico hardcoded no app do parceiro: comissões, faixas, desconto, validade do orçamento, regras de bilhete, módulo on/off — tudo lido de `parceiro_config` + `modulos_ativos`, editável por unidade sem deploy. |
| 35 | 🔴 **PRÉ-REQUISITO DE SEGURANÇA (auditoria Opus 5, 30/07):** as policies do CRM são `auth.role() = 'authenticated'` e o middleware só checa `!user` — logo, um parceiro cadastrado no mesmo projeto Supabase leria o CRM inteiro pela API REST (a chave anon é pública). Isolar o app noutro domínio NÃO resolve: o furo é a autenticação. **Fix escolhido (opção A):** policies passam a exigir `public.is_crm_user()` = perfil ATIVO em `perfis` (**migration `099_rls_exigir_perfil_crm.sql`**, já escrita) + guard no middleware do CRM redirecionando usuário sem perfil. **Rodar a 099 ANTES de existir o primeiro parceiro.** Atualiza a demanda `2026/40`. |
| 36 | **Rastreio forte da indicação:** `fichas` não tem `contato_id`/`estabelecimento_id` — hoje a tratativa descobre quem indicou por **busca de texto** em `veterinario_especificar` (`TratativaModal.tsx:546-549`). Pra pré-ficha do portal isso é inaceitável (comissão iria pro parceiro errado). A migration do portal adiciona **`fichas.parceiro_orcamento_id`** (+ `fichas.contato_id`) e a tratativa passa a pré-selecionar por FK. Vínculo é seguro porque **na etapa de ficha ainda é cotação** — nada financeiro foi firmado. |
| 37 | **Comissão é do INDIVÍDUO, e o portal SUBSTITUI o pagamento de bonificações de hoje.** Não existe comissão paralela pra clínica: quem indicou recebe, mesmo que seja recepcionista. Motivo estratégico do Lucas: fugir do modelo em que "o dono da clínica fica com tudo" e não sobra incentivo pra quem está na ponta — o portal é a forma sutil de inverter isso. Vet ainda não cadastrado é **cadastrado presencialmente na hora** (é a condição pra receber o pix). Implicação: a fila de pagamento do admin não é um extra — ela **assume um processo operacional existente**, então precisa ser pelo menos tão boa quanto a planilha/tela atual antes de desligar a antiga. `contratos.comissao_valor`/`comissao_paga` seguem sendo os campos (sem colunas novas). |
| 38 | **Contrato desfeito/cancelado NÃO estorna nada** — nem a comissão paga, nem o bilhete de sorteio, nem a contagem da categoria. Relacionamento vale mais que o valor. |
| 39 | **Validade do orçamento = fim do dia seguinte (D+1 23:59)**, não 24h corridas — cobre o caso "orçou de madrugada, tutor resolve de manhã" sem o link morrer no meio do luto. `orcamento_validade_horas` no Orquestrador vira `orcamento_validade_modo` = `fim_do_dia_seguinte` (default). |
| 40 | **1 parceiro = 1 unidade** (via `contatos.unidade_id`, que **já existe** — não inferir por cidade). Conurbação (ex.: PI × SJC) é problema futuro e fora do escopo desta versão. |
| 41 | **Vercel plano Pro (US$20)** confirmado → cron sem restrição de frequência. O `expirar-orcamentos` pode rodar de hora em hora; não precisa do fallback "expirar na leitura". |

---

## 3. Modelo de dados (TO-BE)

> Seguir a Regra de Ouro: conferir `supabase/SCHEMA.md` antes; migration numerada sequencial
> (verificar no disco o último número antes de criar!); atualizar SCHEMA.md na mesma resposta.

### 3.1 Extensão de `contatos` (decisão #3)

> ✅ **Auditado no banco real em 30/07/2026** (swagger via service_role). `contatos` tem
> **17 colunas** hoje: id, estabelecimento_id, **unidade_id**, nome, **cargo**, **especialidade**,
> telefone, email, **whatsapp**, aniversario, preferencias, hobbies, **foto_url**, observacoes,
> **ativo**, criado_em, atualizado_em.

```
-- JÁ EXISTEM — reusar, NÃO recriar:
--   unidade_id  → unidade do parceiro (decisão #40)
--   cargo       → só normalizar os valores do select
--   whatsapp    → contato do parceiro
--   foto_url    → era o "avatar_url" do rascunho; v1 não preenche (UI usa iniciais)
--   ativo       → status do contato no CRM (≠ portal_ativo, ver abaixo)

contatos +
  user_id uuid UNIQUE NULL → auth.users        -- NULL = contato ainda não é usuário do portal
  cargo_outro text NULL                        -- especificar quando cargo='outro'
  crmv text NULL                               -- só faz sentido pra cargo=veterinario (opcional)
  pix_chave text NULL
  instagram text NULL                          -- handle sem @ (v1: só coleta; sem avatar)
  portal_ativo boolean NOT NULL DEFAULT false  -- participa do programa (≠ contatos.ativo, que é o cadastro comercial)
  portal_cadastrado_em timestamptz NULL
  termos_aceitos_em timestamptz NULL           -- decisão #8 (LGPD)
  termos_versao text NULL
  categoria_parceiro text NULL                 -- 'bronze' | 'prata' | 'ouro' (recalc diário)
  convidado_por_contato_id uuid NULL → contatos -- MgM: quem convidou

-- Rastreio forte da indicação (decisão #36):
fichas +
  parceiro_orcamento_id uuid NULL → parceiro_orcamentos
  contato_id uuid NULL → contatos              -- quem indicou, por FK (hoje só existe texto livre)
```

- Cadastro por convite: se o Lucas selecionar um `contatos` existente ao gerar o convite,
  o fluxo **complementa** esse registro (preenche user_id etc.). Senão, cria `contatos` novo
  (⚠️ lembrar: `estabelecimentos.endereco` é NOT NULL — cf. memória dos modais gêmeos).
- `unidade_id` do parceiro: default = unidade de quem gerou o convite (admin) ou do
  padrinho (MgM); editável pelo admin.

### 3.2 Tabelas novas

> **Regra transversal (decisão #33):** TODAS as tabelas abaixo têm `unidade_id` NOT NULL
> (exceto onde indicado) e TODA query de API filtra por ele no servidor.

```
parceiro_convites     -- convites presenciais (admin) e MgM (parceiro→parceiro), USO ÚNICO
  id, unidade_id, token UNIQUE, tipo ('admin'|'mgm'),
  criado_por_user_id (admin) | criado_por_contato_id (parceiro MgM),
  nome_indicado text NOT NULL,       -- "Nome do novo membro" (preenchido antes de gerar)
  cidade_atuacao text NOT NULL,      -- escolhida do droplist de cidades_cobertura da unidade
  contato_id_previnculado NULL,      -- admin apontou um contato existente
  estabelecimento_id NULL,           -- clínica sugerida
  usado_em NULL, contato_id_resultante NULL, expira_em

parceiro_orcamentos   -- orçamento/pré-ficha congelada por 24h
  id, contato_id (parceiro), unidade_id,
  pet_nome, pet_especie, pet_peso, tipo_cremacao,
  plano_id, plano_nome (snapshot), plano_preco_congelado (snapshot c/ adicional de porte),
  beneficio_tipo ('comissao'|'desconto'|'cortesia'),
  cortesia_produto_id NULL, desconto_percentual NULL (snapshot da config),
  token_publico UNIQUE,              -- vira o link da pré-ficha do tutor
  status ('aberto'|'expirado'|'convertido'), expira_em (+24h),
  ficha_id NULL,                     -- preenchida quando o tutor submete
  created_at

parceiro_bilhetes     -- bilhetes de sorteio
  id, contato_id, unidade_id, mes_ref (date, dia 1),
  origem ('indicacao'|'mgm'), contrato_id NULL, convite_id NULL,
  codigo text UNIQUE                 -- ex. 'ST-2607-A3F' (mostrado na aba Sorteio)

parceiro_sorteios     -- 1 por mês POR UNIDADE
  id, unidade_id, mes_ref, UNIQUE(unidade_id, mes_ref),
  premio_nome, premio_descricao, premio_imagem_url,
  status ('aberto'|'encerrado'), bilhete_vencedor_id NULL, realizado_em NULL

parceiro_pagamentos   -- lote de pagamento (segundas) por parceiro
  id, contato_id, unidade_id, valor_total, comprovante_url NULL,
  pago_em, criado_por (user_id admin)
  -- contratos cobertos: tabela de junção
  --   parceiro_pagamento_itens(pagamento_id, contrato_id) — não polui contratos

parceiro_materiais    -- materiais de apoio ao luto
  id, unidade_id NULL (NULL = global, visível a todas), titulo, descricao,
  arquivo_url, capa_url NULL, ordem, ativo

parceiro_config       -- TODAS as variáveis do programa (1 row por unidade) — fonte única do Orquestrador (decisão #34)
  unidade_id UNIQUE,
  comissao JSONB,                    -- seed: {bronze:{col:80,ind:150}, prata:{col:120,ind:200}, ouro:{col:160,ind:250}}
  desconto_percentual numeric,       -- seed: 10
  faixas JSONB,                      -- seed: {bronze_max:5, prata_max:12}  (ouro = 13+)
  orcamento_validade_horas int,      -- seed: 24
  beneficios_ativos JSONB,           -- seed: {comissao:true, desconto:true, cortesia:true} (toggle por benefício)
  bilhete_por_indicacao boolean,     -- seed: true
  bilhete_por_mgm boolean,           -- seed: true
  sorteio_ativo boolean,             -- seed: true (esconde a aba Sorteio se false)
  mgm_ativo boolean,                 -- seed: true (esconde /convidar se false)
  remocao_ativa boolean,             -- seed: true (esconde "Solicitar remoção" se false)
  materiais_ativos boolean,          -- seed: true
  cortesia_produtos JSONB,           -- elegíveis como cortesia POR TIPO:
                                     --   {individual: uuid[], coletiva: uuid[]}
                                     -- (escolhidos no Orquestrador; o wizard só oferece os do tipo orçado)
  cidades_cobertura text[]           -- droplist de "Região de atuação" dos convites
                                     -- seed Santos: Santos, São Vicente, Guarujá, Praia Grande,
                                     --   Cubatão, Bertioga, Itanhaém, Mongaguá, Peruíbe
```

O app do parceiro lê `parceiro_config` (via API) pra decidir o que renderiza — **nenhum
valor de negócio hardcoded**. Unidade sem row = seeds acima (default permissivo, mesmo
espírito do FLS).

### 3.3 O que REUSA do CRM (não duplicar!)

| Já existe | Uso no portal |
|-----------|---------------|
| `contatos` / `estabelecimentos` | identidade do vet e clínica (extensão acima) |
| `contratos.contato_id` | vínculo indicação→contrato (é a fonte do extrato) |
| `contratos.comissao_valor` / `comissao_paga` | valor e status de pagamento por contrato |
| `planos` / `plano_grupos` / `plano_itens` (mig 098) | catálogo mostrado ao vet + preço/porte |
| `fichas` (+ `op_dados`) | pré-ficha do tutor e "Solicitar remoção" |
| `produtos` (tipo incluso/acessorio) | escolha da cortesia |
| `push_subscriptions` + web-push | notificações push |
| Resend (`/api/ficha/email`) | e-mails transacionais |
| Storage (bucket novo `parceiros`) | avatar, comprovantes, materiais, foto do prêmio |

**Extrato/indicações NÃO ganham tabela própria:** derivam de `contratos` com
`contato_id = parceiro` (+ `parceiro_orcamentos` pro funil pré-contrato). A tabela legada
`indicacoes` (CRM comercial) segue intocada.

### 3.4 Reivindicação (decisão #15)

```
parceiro_reivindicacoes
  id, contato_id (parceiro), unidade_id, descricao (tutor/pet/data), contrato_id NULL,
  status ('pendente'|'aprovada'|'recusada'), resolvido_por NULL, resolvido_em NULL
```
Aprovação do admin seta `contratos.contato_id` = vet e a indicação passa a contar
(extrato + bilhete do mês da aprovação).

---

## 4. Apps & telas

### 4.1 App novo `portal-parceiros/` (Next.js separado, deploy próprio no Vercel)

- Mesmo Supabase (env: URL + anon [só auth] + service_role [só server]).
- PWA: manifest próprio — nome **"RIP Pet Parceiros"**, domínio `parceiro.rippet.com.br` — ícones próprios, instalável.
- Design: **mesmo design system Warm Minimalism** (copiar tokens/globals.css), tom ainda mais
  delicado/visual (fotos grandes no catálogo).
- Mobile-first radical: o vet usa no celular, na frente do tutor.

| Rota | Tela |
|------|------|
| `/entrar` | Login: Google + e-mail/senha |
| `/convite/[token]` | Onboarding do convite (admin ou MgM): dados mínimos + pix + Instagram → cria conta |
| `/` (home) | Dashboard do parceiro: **card de categoria com a conta explícita** ("N pets desde DD/MM/AAAA → Prata · faltam M pra Ouro", decisão #12), bilhetes do mês, atalhos (Orçar agora · Solicitar remoção · Meu extrato), último status |
| `/orcar` | Wizard de orçamento: espécie → peso → IND/COL → plano (cards com foto, preço já com adicional de porte) → benefício (comissão/desconto/cortesia) → resumo → **[Enviar link pro tutor] [Preencher agora]** |
| `/orcamentos` | Meus orçamentos (aberto/expirado/convertido, contagem regressiva das 24h, reenviar link) |
| `/remocao` | "Solicitar remoção" — form curto (tutor, pet, endereço da clínica pré-preenchido) → cria ficha EM + push pra equipe |
| `/extrato` | Indicações com status · saldo a receber · pagamentos recebidos (com comprovante) · gráfico mensal · **detalhe da categoria: lista dos pets que contam na janela do ano móvel, com a data em que cada um sai da conta** |
| `/sorteio` | Prêmio do mês (foto grande) · meus bilhetes (códigos) · resultado do último ("Não foi desta vez…") · data do próximo |
| `/materiais` | Grid de materiais de luto pra download |
| `/convidar` | MgM: preenche **Nome do novo membro** + **Região de atuação** (droplist `cidades_cobertura`) → gera QR/link de uso único · status dos convites ("Dr. Fulano se cadastrou — você ganhou 1 bilhete!") |
| `/perfil` | Dados, pix, @ do Instagram (só texto, v1), notificações (opt-in push) |
| `/termos` | Termos de Uso + Privacidade (pública; base: `docs/PORTAL_PARCEIROS_TERMOS_DRAFT.md`); aceite via checkbox obrigatório no onboarding, com data/versão do aceite gravada |

> **A página do tutor coleta forma de pagamento e parcelamento** (corrigido em 31/07 —
> a primeira versão omitia). Os rótulos gravados são os MESMOS da ficha pública do CRM
> (`Pix`, `Dinheiro`, `Cartão Débito`, `Cartão Crédito` + `1x`…`Nx`), senão a tratativa
> não reconhece. O limite de parcelas vem de `parceiro_config.max_parcelas` (mig 101).
> As taxas de cartão (2,2% a 4,55%, variam por bandeira) **não sobem o preço do tutor** —
> são descontadas do líquido da empresa no registro do pagamento. Por isso a tela mostra
> "12x de R$ X · sem juros": é verdade para quem está lendo.

**Fluxo do tutor (público, sem login):** `/(o|orcamento)/[token_publico]` — a pré-ficha:
apresentação delicada (pet, plano, preço congelado, benefício se desconto/cortesia) →
1 clique → entra no fluxo da ficha pública já pré-preenchida (`fichas` com indicador travado,
`op_dados` registrando origem `portal_vet` + orçamento). Respeitar validade de 24h
(expirado → mensagem gentil + CTA WhatsApp da RIP Pet).

### 4.2 CRM existente (app `web/`) — tela admin

`/admin/parceiros` (super_admin; registrar em `field-catalog.ts` — regra FLS obrigatória):

- **Tab Visão geral:** funil orçamento→indicação→contrato; engajamento por vet
  (último login, orçamentos no mês, indicações, categoria)
- **Tab Pagamentos (a segunda-feira):** fila agrupada por vet — total validado, pix
  copiável, **colar comprovante com Ctrl+V** (paste event → upload Storage), marcar pago em lote
- **Tab Convites:** gerar convite presencial (Nome do novo membro + Região de atuação →
  QR fullscreen pra visita, uso único), opcionalmente pré-vinculando
  `contatos`/`estabelecimentos` existentes; lista de convites/status
- **Tab Sorteio:** cadastrar prêmio do mês (foto+descrição), ver bilhetes, **definir
  bilhete vencedor (manual, v1)**, publicar resultado
- **Tab Reivindicações:** pendências de "essa indicação foi minha" → aprovar (vincula
  `contato_id` no contrato) / recusar
- **Tab Orquestrador (super_admin — decisão #34):** o "painel do Pinky e o Cérebro" —
  TODAS as variáveis do programa num painel só, no estilo visual dos toggles do
  `/admin/visibilidade`, escopado pela unidade ativa (super_admin troca de unidade e
  configura cada irmã):
  - **Módulo:** liga/desliga `cb_portal_parceiros` da unidade
  - **Comissões:** grid categoria × tipo (Bronze/Prata/Ouro × COL/IND), valores editáveis
  - **Faixas das categorias:** bronze_max / prata_max
  - **Desconto do tutor:** % (seed 10%)
  - **Benefícios:** toggle individual (comissão / desconto / cortesia) + produtos elegíveis
    pra cortesia em **duas listas separadas: Individual e Coletiva**
  - **Orçamento:** validade em horas (seed 24h)
  - **Sorteio:** ativo on/off + regras de bilhete (por indicação on/off, por MgM on/off)
  - **Features:** MgM on/off, Solicitar remoção on/off, Materiais on/off
  - **Cidades de cobertura:** lista editável (droplist dos convites — seed Santos: 9 cidades da Baixada)
  - Toda alteração audita em `historico_alteracoes`
- **Tab Materiais:** upload/ordenação dos PDFs

**Integração na tratativa (TratativaModal):** nada estrutural muda — o `contato_id` já
existe. Adicionar: quando a ficha veio de `parceiro_orcamentos` (op_dados), pré-selecionar o parceiro
e o plano congelado; ao criar contrato, marcar orçamento `convertido`, gravar
`comissao_valor` conforme categoria vigente do vet (ou zerar se benefício foi
desconto/cortesia — desconto entra em `desconto_plano_unificado`; cortesia entra como
`contrato_produtos` com desconto 100%) e gerar `parceiro_bilhetes` do mês.

---

## 5. APIs (todas server-side, service_role, sessão validada por request)

No app `portal-parceiros/`:

```
POST /api/auth/*                     (fluxo Supabase Auth — único uso da anon key)
GET  /api/me                         perfil + categoria + progresso
GET  /api/catalogo                   planos da unidade do vet (via estabelecimento→cidade)
POST /api/orcamentos                 cria orçamento (congela preço, gera token 24h)
GET  /api/orcamentos                 lista do vet
POST /api/remocao                    cria ficha EM + push equipe
GET  /api/extrato                    indicações (de contratos) + pagamentos + série mensal
GET  /api/sorteio                    sorteio corrente + meus bilhetes + último resultado
GET  /api/materiais
POST /api/convites/mgm               gera link/QR MgM
POST /api/reivindicacoes             "essa indicação foi minha"
GET  /api/publico/orcamento/[token]  pré-ficha do tutor (sem auth; rate-limited)
POST /api/publico/orcamento/[token]/aceitar → cria/encaminha pra ficha pública
```

No app `web/` (admin): rotas `/api/admin/parceiros/*` espelhando as tabs
(pagamentos+comprovante, convites, sorteio, reivindicações, config, materiais).

**Regras de segurança (decisão #29):**
- Tabelas `parceiro_*`: RLS **deny-all** (nenhuma policy pra anon/authenticated). Só service_role passa.
- Toda rota valida o JWT da sessão e escopa por `contato_id` do próprio parceiro **e pela
  `unidade_id` dele** (decisão #33). Nunca aceitar `contato_id`/`unidade_id` vindos do client.
- Token de convite e token público de orçamento: aleatórios (≥128 bits), com expiração.
- Rate limit nas rotas públicas (padrão das RPCs de leads).

---

## 6. Rotinas automáticas (Vercel Cron no app portal-parceiros)

| Cron | Frequência | O que faz |
|------|-----------|-----------|
| `expirar-orcamentos` | diário (ou a cada hora) | `parceiro_orcamentos` abertos com `expira_em < now()` → `expirado` |
| `recalcular-categorias` | diário | conta contratos por parceiro nos últimos 365 dias → atualiza `contatos.categoria_parceiro` (notifica push/e-mail se subiu de nível) |
| `fechar-mes-sorteio` | mensal (dia 1) | por unidade com módulo ativo: encerra o `parceiro_sorteios` do mês anterior (se resultado publicado), cria o do mês novo (status aberto, sem prêmio até admin cadastrar) |

Eventos síncronos (não-cron), disparados nas APIs: push+e-mail de indicação validada,
comissão paga (com comprovante), bilhete ganho, resultado do sorteio.

---

## 7. Ordem de implementação sugerida (MVP = tudo, mas nesta sequência)

1. **Fundação:** migration (extensão `contatos` + tabelas `parceiro_*` + bucket `parceiros` + RLS deny-all + módulo `cb_portal_parceiros`) · app `portal-parceiros/` com auth (Google + e-mail/senha) e shell PWA
2. **Convite presencial + onboarding** (admin gera QR na tela nova `/admin/parceiros`)
3. **Catálogo + wizard de orçamento + pré-ficha do tutor** (coração do produto)
4. **Integração tratativa** (conversão, comissão por categoria, desconto/cortesia, bilhetes)
5. **Extrato do vet + fila de pagamentos admin com Ctrl+V de comprovante**
6. **Sorteio (aba + admin manual) + MgM**
7. **Materiais + notificações (push/e-mail) + crons**

Cada etapa: atualizar SCHEMA.md / CLAUDE.md / FLOW.md / field-catalog.ts / CHANGELOG.md
na mesma resposta (Tríade de Ouro).

### ✅ Status da execução (30/07/2026) — fases 1 a 7 CONCLUÍDAS

Migrations 099 e 100 aplicadas e verificadas. **101 pendente** (`parceiro_orcamentos.plano_itens`).

| Fase | Situação |
|------|----------|
| 1. Fundação | ✅ app, auth Google + e-mail/senha, `getParceiroSessao()`, home |
| 2. Convite e onboarding | ✅ QR no CRM, `/convite/[token]` em 2 etapas, termos |
| 3. Catálogo e orçamento | ✅ wizard 6 passos, link do tutor, pré-ficha com FK |
| 4. Integração tratativa | ✅ `/api/parceiros/indicacao` (comissão + bilhete), idempotente |
| 5. Extrato e pagamentos | ✅ extrato com série e projeção; fila com Ctrl+V de comprovante |
| 6. Sorteio e MgM | ✅ aba do parceiro, admin define vencedor, convite entre colegas, reivindicações |
| 7. Materiais, Orquestrador e crons | ✅ signed URLs, painel completo, 3 rotinas em `vercel.json` |

**Ainda NÃO feito (fora do escopo das 7 fases):**
- Notificações push/e-mail dos gatilhos da decisão #24 — a infra existe (`push_subscriptions`,
  Resend), mas o disparo não foi ligado. É o próximo item natural.
- Aba Materiais no admin (upload) — a leitura pelo parceiro funciona; a publicação ainda
  precisa ser feita direto no Storage/banco.
- Botão "Solicitar remoção" (`remocao_ativa` já existe na config e no Orquestrador, mas a
  tela `/remocao` não foi construída).

---

## 8. Pontos em aberto (decidir com o Lucas antes/durante o dev)

1. ~~Valores de comissão e desconto~~ **RESOLVIDO 30/07:** Bronze R$80 COL / R$150 IND · Prata R$120 COL / R$200 IND · Ouro R$160 COL / R$250 IND · desconto do tutor **10%** (seeds; tudo editável por unidade no Orquestrador).
2. ~~Faixas das categorias~~ **RESOLVIDO 30/07:** Bronze 0–5 · Prata 6–12 · Ouro 13+ (ano móvel; seed `{bronze_max:5, prata_max:12}`).
3. ~~Domínio e nome~~ **RESOLVIDO 30/07:** `parceiro.rippet.com.br` (singular) · nome de exibição do PWA: **"RIP Pet Parceiros"**.
4. ~~Parceiro fora da área~~ **RESOLVIDO 30/07:** todo convite (admin e MgM) exige "Nome do novo membro" + "Região de atuação" (droplist de `cidades_cobertura` da unidade) ANTES de gerar o link/QR de uso único — sem cidade coberta, sem convite.
5. ~~Cortesia~~ **RESOLVIDO 30/07:** duas listas no Orquestrador (`cortesia_produtos.individual` e `.coletiva`); o Lucas escolhe os produtos direto no painel — nenhuma escolha pendente pro dev.
6. ~~Instagram → avatar~~ **RESOLVIDO 30/07:** v1 só coleta o @ (campo texto); SEM avatar (UI usa iniciais). v2: gamificação de perfil completo valendo bilhete.
7. ~~Orçamento COL~~ **RESOLVIDO 30/07:** sim, wizard oferece Individual E Coletiva desde a v1.
8. ~~LGPD~~ **RESOLVIDO 30/07:** checkbox de aceite no onboarding + página de Termos. Rascunho do texto em `docs/PORTAL_PARCEIROS_TERMOS_DRAFT.md` (⚠️ revisar com advogado antes do primeiro cadastro real).
9. ~~Lista de cargos~~ **CONFIRMADA 30/07:** veterinário, recepcionista, aux. veterinário, técnico veterinário, banhista/tosador, gerente, proprietário, outro.

**✅ NENHUMA PENDÊNCIA ESTRUTURAL — documento pronto pra implementação.**
