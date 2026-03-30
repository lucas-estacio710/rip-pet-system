# T-shirts — Catálogo de Pacotes (Lego Blocks)

> **Modelo:** Cada T-shirt = 10h de dev = R$ 1.000/unidade | ~1 semana de entrega
> **Filosofia:** Pacotes independentes. Cada unidade monta sua "casinha" escolhendo os blocos que precisa.
> **Atualizado:** 17/03/2026

---

## Mapa de dependências

```
T-0 Fundação (obrigatória)
 ├── T-1 Financeiro + Produtos
 │    └── T-6 Estoque Avançado (entradas, empréstimos entre unidades)
 ├── T-2 Supindas + Fichas de Remoção
 │    └── T-3 Rescaldos + Itens Pessoais
 ├── T-4 NFS-e (Nota Fiscal)
 ├── T-5 Rotas de Entrega
 ├── T-7 Mensageria (WhatsApp + Email)
 ├── T-8 Tarefas + Checklist Operacional
 ├── T-9 CRM Comercial (clínicas + visitas)
 ├── T-10 Leads + Funil de Captação
 ├── T-11 Gestão de Equipe + Permissões
 └── T-12 Dashboard Executivo (visão CEO multi-unidade)
```

**Regra:** T-0 é pré-requisito de todas. As demais são independentes entre si (salvo onde indicado).

---

## T-0 — Fundação
*"A unidade entra no sistema"*

> **Obrigatória para todas as unidades.** Base que faz o CRM funcionar multi-unidade.

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `unidades` | Usar | Cadastrar nova unidade (nome, cidade, estado) |
| `perfis` | Usar | Vincular colaboradores à unidade (nome, email, cargo) |
| `fichas` | Adaptar | Adicionar `unidade_id`, ficha pública por unidade |
| `contratos` | Adaptar | Adicionar `unidade_id`, filtrar pipeline por unidade |
| `tutores` | Adaptar | Adicionar `unidade_id`, filtrar por unidade |
| `configuracoes` | Adaptar | Configurações por unidade |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/ficha/[slug]` | Existe (`/ficha/santos`) | Generalizar para qualquer unidade |
| `/fichas` | Existe | Filtrar fichas por unidade do usuário |
| `/contratos` | Existe | Pipeline filtrado por unidade |
| `/dashboard` | Existe | KPIs básicos filtrados por unidade (volume, status) |
| `/login` | Existe | Carregar perfil + unidade após login |
| Sidebar | Existe | Branding dinâmico, remover "Santos" hardcoded |

### Escopo técnico

- [ ] Migration: `unidade_id UUID` em contratos, tutores, fichas
- [ ] Migration: popular unidade_id = Santos para registros legados
- [ ] RLS: policies filtrando por `perfis.unidade_id` do usuário
- [ ] Auth: carregar perfil após login → contexto React com unidade
- [ ] Ficha pública: `/ficha/[slug-unidade]`
- [ ] Todas as queries: filtrar por unidade_id
- [ ] Sidebar/Login: branding dinâmico por unidade

### Entregáveis pro cliente

- Link de ficha digital exclusivo da unidade
- Pipeline visual de contratos (preventivo → ativo → pinda → retorno → finalizado)
- Dashboard com volume de atendimentos
- Login individual por colaborador

### Pré-requisitos do cliente

- Nome da unidade + cidade
- Lista de colaboradores (nome + email)

---

## T-1 — Financeiro + Produtos
*"Quanto entra, quanto sai, o que vendeu"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `pagamentos` | Adaptar | Adicionar `unidade_id`, CRUD completo |
| `taxas_cartao` | Usar | Cálculo automático de taxas crédito/débito |
| `contas` | Usar | Destinos: Inter, Granito, Dinheiro |
| `produtos` | Adaptar | Adicionar `unidade_id`, catálogo por unidade |
| `contrato_produtos` | Usar | Vínculo produto ↔ contrato |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/contratos/[id]` | Parcial | Modal "Registrar Pagamento" completo + lista de produtos vendidos |
| `/estoque` | Existe (read-only) | Filtro por unidade, indicadores de estoque |
| `/estoque/[id]` | Existe (parcial) | Preço editável (já tem), vinculação a unidade |
| `/dashboard` | Existe | Cards financeiros: receita, ticket médio, métodos de pagamento |

### Escopo técnico

- [ ] Migration: `unidade_id` em produtos, pagamentos
- [ ] UI: modal "Registrar Pagamento" no detalhe do contrato
- [ ] UI: taxas automáticas (crédito/débito) com tabela `taxas_cartao`
- [ ] UI: modal "Adicionar Produto" ao contrato (urna, acessório)
- [ ] UI: Quitar saldo pendente
- [ ] Estoque: filtro por unidade
- [ ] Dashboard: receita bruta/líquida, ticket médio, métodos, contas destino

### Entregáveis pro cliente

- Registrar pagamentos com cálculo automático de taxas
- Vincular produtos (urnas, acessórios) a cada contrato
- Ver estoque da unidade
- Dashboard financeiro (receita, ticket médio, formas de pagamento)

### Pré-requisitos do cliente

- Catálogo de produtos da unidade (se diferente de Santos)
- Taxas das maquininhas usadas

---

## T-2 — Supindas + Fichas de Remoção
*"Gestão de viagens ao crematório"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `supindas` | Adaptar | Adicionar `unidade_id`, CRUD por unidade |
| `fichas` (Storage) | Usar | Geração de fichas de remoção PNG + ZIP |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/supindas` | Existe completa | Filtro por unidade, geração em lote de fichas |

### Escopo técnico

- [ ] Migration: `unidade_id` em supindas
- [ ] Filtrar supindas por unidade
- [ ] Associar apenas contratos da mesma unidade
- [ ] Fichas de remoção: layout com dados da unidade (logo, endereço)
- [ ] Storage: organizar por unidade (`fichas/{unidade_slug}/`)
- [ ] Status flow: planejada → em_andamento → retornada

### Entregáveis pro cliente

- Criar e gerenciar viagens ao crematório
- Vincular contratos à viagem
- Gerar fichas de remoção em lote (PNG + ZIP para download)
- Acompanhar status da viagem

### Pré-requisitos do cliente

- Logo da unidade (para ficha de remoção)
- Confirmar se crematório é Pinda ou outro

---

## T-3 — Rescaldos + Itens Pessoais
*"Nada se perde antes da cremação"*

**Depende de:** T-2 (Supindas)

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `contrato_produtos` | Usar | Campo `rescaldo_feito` para tracking |
| `contrato_itens_pessoais` | Criar UI | Destino: doar/descartar/retornar/cremar_junto |
| `contrato_rescaldos` | Deprecar | Migrar para `contrato_produtos.rescaldo_feito` |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/contratos/[id]` | Parcial (modal existe) | UI completa de rescaldos com checklist visual |
| `/contratos` | Tags existem | Faróis de rescaldo no pipeline (pendente/feito) |

### Escopo técnico

- [ ] UI: checklist visual de rescaldos (molde patinha, pelinho, pelo extra, carimbo)
- [ ] UI: status por item (nao_pediu / pendente / feito)
- [ ] UI: itens pessoais do pet (descrição + destino)
- [ ] Pipeline: faróis de rescaldo atualizados em tempo real
- [ ] Migration 025: ativar `rescaldo_feito` em `contrato_produtos`
- [ ] Filtro no pipeline: "rescaldo pendente"

### Entregáveis pro cliente

- Checklist visual de rescaldos por contrato
- Status de cada item (molde, pelinho, carimbo)
- Registro de itens pessoais do pet com destino
- Filtro rápido: contratos com rescaldo pendente

### Pré-requisitos do cliente

- Definir quais rescaldos a unidade oferece

---

## T-4 — NFS-e (Nota Fiscal)
*"Emissão fiscal automatizada"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `configuracoes` | Usar | CNPJ, inscrição municipal, certificado A1, próximo RPS por unidade |
| `contratos` | Usar | Campos `nfse_*` (numero, codigo_verificacao, data, status, link_pdf) |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/configuracoes` | Existe | Configuração NFS-e por unidade (certificado, CNPJ) |
| `/contratos/[id]` | Existe (botão) | Emitir NF vinculada à unidade do contrato |
| `/api/nfse/emitir` | Existe | Adaptar para ler config da unidade |

### Escopo técnico

- [ ] Configuracoes: NFS-e por unidade (CNPJ, inscrição, certificado, RPS)
- [ ] Emissão: ler dados fiscais da unidade do contrato
- [ ] Validação: ambiente homologação → produção por unidade
- [ ] Histórico: NFs emitidas por unidade no dashboard

### Entregáveis pro cliente

- Configuração fiscal própria (CNPJ, certificado digital)
- Emissão de NFS-e com 1 clique no contrato
- Numeração automática de RPS

### Pré-requisitos do cliente

- CNPJ da unidade
- Inscrição Municipal
- Certificado digital A1 (e-CNPJ)
- Município e código de serviço (se diferente de Santos)

---

## T-5 — Rotas de Entrega
*"Logística de retorno das cinzas"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `rotas_entrega` | Criar UI | numero, data, período, responsável, status |
| `rota_entregas` | Criar UI | Contratos na rota, ordem, entregue |
| `contrato_restricoes_entrega` | Criar UI | Dias/períodos bloqueados, endereço alternativo |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/rotas` | Não existe | **Nova página:** lista de rotas por data, criar/editar rota |
| `/rotas/[id]` | Não existe | **Nova página:** mapa com pontos, sequência, marcar entregue |
| `/contratos/[id]` | Existe | Seção "Restrições de Entrega" + endereço alternativo |

### Escopo técnico

- [ ] Página `/rotas`: CRUD de rotas (data, período, responsável)
- [ ] Selecionar contratos "prontos" (status retorno, sem restrição no dia)
- [ ] Agrupar por CEP/região
- [ ] Mapa interativo (Leaflet + OpenStreetMap)
- [ ] Algoritmo nearest neighbor para ordenação
- [ ] Marcar entregue por contrato
- [ ] ViaCEP: geocoding dos endereços
- [ ] Restrições: dias bloqueados, períodos, endereço alternativo

### Entregáveis pro cliente

- Planejamento de rotas de entrega com mapa
- Otimização de trajeto por região
- Marcar entregas realizadas
- Respeitar restrições de dia/horário do tutor

### Pré-requisitos do cliente

- Nenhum (dados vêm dos contratos)

---

## T-6 — Estoque Avançado
*"Controle completo de inventário"*

**Depende de:** T-1 (Financeiro + Produtos)

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `estoque_entradas` | Criar UI | CRUD: quantidade, custo, remessa, data |
| `estoque_emprestimos` | Criar UI | Bidirecional entre unidades |
| `produtos` | Usar | estoque_atual, estoque_minimo, estoque_infinito |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/estoque` | Existe (grid) | Colunas: Real, Reservado PV, Emprestado, Virtual |
| `/estoque/[id]` | Existe (parcial) | **CRUD entradas** + **CRUD empréstimos** + alertas |

### Escopo técnico

- [ ] UI: registrar entrada de estoque (quantidade, custo unitário, remessa/origem)
- [ ] UI: registrar empréstimo entre unidades (bidirecional)
- [ ] Cálculo virtual: Real - Reservas PV - Empréstimos = Virtual
- [ ] Alerta visual: estoque abaixo do mínimo
- [ ] Histórico: timeline de movimentações por produto
- [ ] Dashboard: produtos mais vendidos, estoque crítico

### Entregáveis pro cliente

- Registrar entradas de estoque (com custo e origem)
- Empréstimos entre unidades (emprestou/pegou emprestado)
- Estoque virtual (descontando reservas PV e empréstimos)
- Alertas de estoque baixo

### Pré-requisitos do cliente

- T-1 implantada (catálogo de produtos)

---

## T-7 — Mensageria (WhatsApp + Email)
*"Comunicação automática com o tutor"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `mensagem_templates` | Criar UI | Templates por tipo de mensagem |
| `contrato_mensagens` | Criar UI | Histórico: o que foi enviado, quando, por onde |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/configuracoes` | Existe | **Nova aba:** templates de mensagem por unidade |
| `/contratos/[id]` | Parcial (modals) | Botões de ação com envio real (WhatsApp API) |
| `/contratos/[id]` | Não tem | **Nova seção:** histórico de mensagens enviadas |

### Escopo técnico

- [ ] Integração WhatsApp Business API (provider a definir)
- [ ] Templates editáveis: Chegamos, Pet Grato, Cinzas Chegaram, Finalizadora
- [ ] Variáveis dinâmicas: `{pet_nome}`, `{tutor_nome}`, `{unidade}`, etc.
- [ ] Envio via modals existentes (ChegamosModal, ChegaramModal, etc.)
- [ ] Fallback email (Resend - já existe API route)
- [ ] Histórico de mensagens por contrato
- [ ] Configuração da API por unidade

### Entregáveis pro cliente

- Mensagens automáticas por WhatsApp em cada etapa
- Templates personalizáveis por unidade
- Histórico de comunicação por contrato
- Fallback por email quando WhatsApp não disponível

### Pré-requisitos do cliente

- Conta WhatsApp Business API (custo mensal à parte)
- Número dedicado da unidade
- Aprovação dos templates pelo WhatsApp (leva ~24h)

---

## T-8 — Tarefas + Checklist Operacional
*"Nada passa batido"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `tarefas` | Criar UI | contrato_id, tipo, descrição, importante, resolvido |
| `tarefa_tipos` | Criar UI | Tipos configuráveis por unidade |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/contratos/[id]` | Não tem | **Nova seção:** lista de tarefas do contrato |
| `/contratos` | Pipeline existe | Farol de tarefas pendentes no pipeline |
| `/tarefas` | Não existe | **Nova página:** visão geral de tarefas (todas, hoje, atrasadas) |

### Escopo técnico

- [ ] Página `/tarefas`: lista geral com filtros (pendentes, hoje, importante, por tipo)
- [ ] Contrato detalhe: seção tarefas com add/check/delete
- [ ] Tipos de tarefa configuráveis (ex: "Ligar tutor", "Conferir urna", "Enviar foto")
- [ ] Marcar como importante (prioridade)
- [ ] Farol no pipeline: contrato tem tarefas pendentes
- [ ] Auto-criar tarefas por status (ex: ao entrar em "retorno" → criar "Enviar mensagem chegaram")

### Entregáveis pro cliente

- Lista de tarefas por contrato
- Visão geral de todas as tarefas pendentes
- Priorização (importantes primeiro)
- Tarefas automáticas por mudança de status

### Pré-requisitos do cliente

- Definir tipos de tarefa usados na operação

---

## T-9 — CRM Comercial
*"Gestão de clínicas parceiras e prospecção"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `estabelecimentos` | Criar UI | 34 campos: nome, tipo, endereço, relacionamento, concorrentes, estratégia |
| `contatos` | Criar UI | Pessoas-chave em cada estabelecimento |
| `visitas` | Criar UI | Registro de visitas comerciais com temperatura |
| `indicacoes` | Criar UI | Indicações recebidas e status |
| `historico_alteracoes` | Usar | Audit trail automático |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/comercial` | Não existe | **Nova página:** lista de estabelecimentos (clínicas, pet shops) |
| `/comercial/[id]` | Não existe | **Nova página:** detalhe com contatos, histórico visitas, indicações |
| `/comercial/visitas` | Não existe | **Nova página:** agenda de visitas (calendário ou lista) |
| `/dashboard` | Existe | Cards: top clínicas, indicações por período, temperatura média |

### Escopo técnico

- [ ] Página `/comercial`: CRUD estabelecimentos com busca e filtros
- [ ] Detalhe: contatos, visitas, indicações, concorrentes presentes
- [ ] Registro de visitas: data, tipo, temperatura antes/depois, observações
- [ ] Indicações: origem → indicado, status (pendente/contatado/convertido)
- [ ] View materializada: `vw_estatisticas_estabelecimentos` (já existe no schema)
- [ ] Dashboard: ranking clínicas por indicações convertidas

### Entregáveis pro cliente

- Cadastro de clínicas e pet shops parceiros
- Registro de visitas comerciais
- Acompanhamento de indicações
- Ranking de parceiros por performance

### Pré-requisitos do cliente

- Lista de clínicas parceiras da unidade (se tiver)

---

## T-10 — Leads + Funil de Captação
*"Do Google até o contrato"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `leads` | Adaptar | Adicionar `unidade_id`, filtrar por unidade |
| `sessions` | Usar | Tracking de visitantes da LP |
| `funnel_events` | Usar | Eventos do funil (popup, steps, abandono) |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/leads` | Existe | Filtro por unidade, funil de conversão |
| Landing Page | Externa | LP por unidade com UTM tracking |

### Escopo técnico

- [ ] Migration: `unidade_id` em leads, sessions
- [ ] Landing page: adaptar para captar por unidade (slug no UTM ou path)
- [ ] Leads: filtro por unidade
- [ ] Funil: visualização abandono por etapa, por unidade
- [ ] Conversão: lead → ficha → contrato (tracking completo)
- [ ] Dashboard: taxa de conversão, custo por lead (se integrar com ads)

### Entregáveis pro cliente

- Captação de leads pela landing page da unidade
- Funil visual de conversão (visitou → preencheu → virou contrato)
- Tracking de origem (Google, Instagram, indicação)
- Métricas de abandono por etapa

### Pré-requisitos do cliente

- Landing page da unidade (ou usar template existente)
- UTMs configurados nas campanhas

---

## T-11 — Gestão de Equipe + Permissões
*"Quem pode ver o quê"*

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| `perfis` | Expandir | Cargos com permissões granulares |
| `funcionarios` | Criar UI | CRUD de funcionários por unidade |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/equipe` | Não existe | **Nova página:** lista de colaboradores, cargos, convites |
| `/configuracoes` | Existe | **Nova aba:** permissões por cargo |

### Escopo técnico

- [ ] Página `/equipe`: lista colaboradores da unidade, status (ativo/inativo)
- [ ] Convite por email: criar conta Supabase Auth + perfil vinculado
- [ ] Cargos: admin, operador, comercial, visualizador
- [ ] Permissões por cargo: quais páginas/ações cada cargo pode acessar
- [ ] UI: esconder menus/botões conforme cargo
- [ ] RLS: reforçar no banco (cargo admin vê tudo, operador só operacional)
- [ ] Audit: quem fez o quê (usar `historico_alteracoes`)

### Entregáveis pro cliente

- Gestão de colaboradores por unidade
- Convite de novos usuários por email
- Cargos com permissões (admin vê financeiro, operador só pipeline)
- Histórico de ações por usuário

### Pré-requisitos do cliente

- Definir cargos e o que cada um pode acessar

---

## T-12 — Dashboard Executivo
*"Visão CEO: todas as unidades em um lugar"*

**Ideal para:** CEO ou gestor que supervisiona múltiplas unidades.

### Tabelas envolvidas

| Tabela | Ação | Detalhes |
|--------|------|----------|
| Todas | Leitura | Queries cross-unidade com aggregation |

### Telas

| Tela | Status atual | O que entra |
|------|-------------|-------------|
| `/dashboard` | Existe (1 unidade) | Seletor de unidade + visão consolidada |
| `/relatorios` | Não existe | **Nova página:** relatórios exportáveis (PDF/Excel) |

### Escopo técnico

- [ ] Dashboard: seletor "Todas as unidades" vs unidade específica
- [ ] Comparativo: cards lado a lado (receita, volume, ticket por unidade)
- [ ] Ranking entre unidades: quem performa melhor
- [ ] Relatórios exportáveis: financeiro mensal, operacional, por período
- [ ] Alertas centralizados: estoque baixo, pagamentos atrasados, seguradora >30d
- [ ] Métricas de SLA: tempo médio por status, entrega, conversão ficha→contrato

### Entregáveis pro cliente

- Dashboard consolidado (todas as unidades)
- Comparativo de performance entre unidades
- Relatórios exportáveis (PDF/Excel)
- Alertas automáticos centralizados

### Pré-requisitos do cliente

- Pelo menos 2 unidades ativas com dados

---

## Pacotes extras (backlog futuro)

| # | Tema | Tabelas | Telas | Descrição |
|---|------|---------|-------|-----------|
| T-13 | Preventivos (PV) | `contrato_produtos` (is_reserva_pv) | `/preventivos` | Acionar PV, estoque virtual (real - reservas - empréstimos), alertas de PV antigo |
| T-14 | Portal do Tutor | Nova tabela `tutor_auth` | `/meu-pet` (público) | Área do tutor: acompanhar status, fotos, documentos |
| T-15 | Chat/IA Interno | `conversations`, `messages`, `knowledge_base` | `/chat` | Assistente interno com base de conhecimento do negócio |
| T-16 | PWA / Mobile | Service Worker, manifest | Todas | App instalável, notificações push, modo offline básico |
| T-17 | Integrações Financeiras | `pagamentos` + APIs | `/financeiro` | Gateway (Stripe/MercadoPago), conciliação bancária, boletos |
| T-18 | Protocolo de Entrega Avançado | `contratos` (protocolo_data) | `/contratos/[id]` | Geração automática, impressão em lote, controle de assinaturas |
| T-19 | Gestão de Velórios | `contratos` (velorio_*) | `/velorios` | Agenda de velórios, disponibilidade, preparação, acompanhamento |
| T-20 | Automações | `contrato_mensagens`, triggers | `/configuracoes` | Regras automáticas: status muda → tarefa cria → mensagem envia |

---

## Resumo visual — Menu de pacotes

```
┌─────────────────────────────────────────────────────────┐
│  FUNDAÇÃO (obrigatório)                                 │
│  T-0: Ficha + Pipeline + Dashboard + Login     R$1.000  │
├─────────────────────────────────────────────────────────┤
│  OPERACIONAL                                            │
│  T-1: Financeiro + Produtos                    R$1.000  │
│  T-2: Supindas + Fichas de Remoção             R$1.000  │
│  T-3: Rescaldos + Itens Pessoais               R$1.000  │
│  T-5: Rotas de Entrega                         R$1.000  │
│  T-6: Estoque Avançado                         R$1.000  │
│  T-8: Tarefas + Checklist                      R$1.000  │
├─────────────────────────────────────────────────────────┤
│  FISCAL                                                 │
│  T-4: NFS-e (Nota Fiscal)                      R$1.000  │
├─────────────────────────────────────────────────────────┤
│  COMUNICAÇÃO                                            │
│  T-7: Mensageria (WhatsApp + Email)            R$1.000  │
├─────────────────────────────────────────────────────────┤
│  COMERCIAL                                              │
│  T-9: CRM Comercial (clínicas + visitas)       R$1.000  │
│  T-10: Leads + Funil de Captação               R$1.000  │
├─────────────────────────────────────────────────────────┤
│  GESTÃO                                                 │
│  T-11: Equipe + Permissões                     R$1.000  │
│  T-12: Dashboard Executivo (multi-unidade)     R$1.000  │
├─────────────────────────────────────────────────────────┤
│  AVANÇADO (backlog)                                     │
│  T-13 a T-20: Preventivos, Portal, IA, PWA... sob demanda│
└─────────────────────────────────────────────────────────┘
```

---

## Notas

- Cada unidade escolhe quais T-shirts quer — não precisa comprar todas
- A ordem de implantação é flexível (exceto dependências indicadas)
- Uma T-shirt pode ser implantada em múltiplas unidades simultaneamente (1 dev, N unidades)
- O preço por T-shirt é por unidade (adaptações específicas)
- T-shirts do backlog (13-20) são estimativas — escopo a definir quando demandadas
- Santos já tem T-0 a T-6 parcialmente implementadas (desconto possível)
