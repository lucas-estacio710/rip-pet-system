# Pendências e Próximos Passos

> Extraído dos comentários (§) do FLUXO_COMPLETO.md + novas demandas.
> Prioridade: 🔴 Entrega 1 (precisa fazer) | 🟡 Entrega 2 (vender depois) | 🟢 Futuro

---

## 🔴 ENTREGA 1 — PENDÊNCIAS

### Ficha Digital
- [ ] **Configurar emails por unidade** — Lucão já tem os emails, precisa colocar no mapa `EMAILS_UNIDADE` em `/api/ficha/email/route.ts`
- [ ] **Validar observações automáticas** — Verificar o que vai automaticamente pro campo observações ao processar ficha (pagamento, outros tutores, local). Lucão quer validar se faz sentido
- [ ] **Campo desconto pré-venda** na tratativa — Criar campo no `TratativaModal` com cálculo: valor do plano - desconto = valor final

### Processamento de Ficha
- [ ] **Busca de estabelecimentos** — Manter habilitada só pra Santos (func_ no visibilidade). Outras unidades usam texto livre. Orientar padronização de escrita (ex: "Madedog" sempre igual)
- [ ] **Campos da ficha no processamento** — Lacre, local de coleta, clínica já devem ser preenchidos no processamento se souber. Se não, preencher depois na ficha ID

### Pipeline
- [ ] **Contrato padrão por unidade** — Disponibilizar PDF/template de contrato com dados da unidade na ficha ID. Fazer quando chegar nessa pendência
- [ ] **Apagar facilities de montagem** (fácil/médio/difícil) para outras unidades — Controlar via visibilidade

### Encaminhamento (Envio pra Matriz)
- [ ] **Fluxo exclusivo na aba Encaminhamentos** — Não pelo pipeline. Mostra todos os pets na unidade, seleciona, fecha encaminhamento com numeração automática (ex: ST145, PA1, CP1)
- [ ] **Numeração automática por unidade** — Código 2 letras + sequencial. Novas unidades começam em 1

### GC (Gerenciamento de Cremações)
- [ ] **Conferência ≠ recebimento** — Data/hora registrada é da conferência, não do recebimento físico
- [ ] **Post-it de observações** — Explicar pro Lucão: são as observações que vêm do contrato da unidade (ex: "cremar com manta rosa"). Aparecem em destaque amarelo no card do GC pra Pinda não ignorar
- [ ] **Contato tutor simplificado** — Toggle simples (ligou/não ligou) na primeira entrega. Detalhes do acompanhamento escolhido ficam pra próximas entregas
- [ ] **Cremação simplificada** — Toggle simples (não cremado → cremado). Sem data, responsável, detalhes

### Retorno
- [ ] **Chamar de "encaminhamento"** em tela e manual. Em banco mantém `supinda`
- [ ] **Pinda só finaliza** — Quem traz fisicamente e marca como retornado é o operador da unidade, não Pinda

### Entrega e Finalização
- [ ] **Botões de ação de entrega** — Não existem ainda. Criar: registrar entrega → muda status pra pendente ou finalizado
- [ ] **Botão de finalização** — Confirmar pagamento → status finalizado
- [ ] **Protocolo de entrega** — Template já existe, mas precisa do botão pra imprimir

---

## 🟡 ENTREGA 2 — VENDER DEPOIS (mais din din 💰)

### GC Avançado
- [ ] **Agendamento de forno** — Selecionar forno (1/2/3) + data/hora. Desligado na primeira entrega
- [ ] **Pedidos especiais detalhados** — Molde patinha, pelo extra, carimbo com tracking individual. Desligado na primeira entrega
- [ ] **Cremação detalhada** — Data, responsável, tipo de acompanhamento confirmado. Desligado
- [ ] **Cinzas/certificado como etapas** — Toggles separados com datas. Desligado
- [ ] **Acompanhamento confirmado** — Tipo escolhido pelo tutor (vídeo-chamada/gravado/presencial). Próximas entregas

### Pipeline Avançado
- [ ] **func_produtos** — Adicionar/gerenciar produtos no contrato
- [ ] **func_financeiro** — Pagamentos, contas, taxas de cartão
- [ ] **func_nfs** — Emissão de notas fiscais
- [ ] **func_bac** — Botões de Ação Rápida no pipeline
- [ ] **func_tags** — Tags de pendência visual no pipeline
- [ ] **func_logs** — Histórico de alterações do contrato

### Campos Controlados
- [ ] **campo_seguradora** — Mostrar/esconder campo de seguradora
- [ ] **campo_lacre** — Mostrar/esconder campo de lacre
- [ ] **campo_velorio** — Mostrar/esconder opções de vvelório
- [ ] **campo_acompanhamento** — Mostrar/esconder acompanhamento
- [ ] **campo_pelinho** — Mostrar/esconder controle de pelinho
- [ ] **campo_certificado_nomes** — Mostrar/esconder nomes do certificado

### Busca de Estabelecimentos
- [ ] **Vender pra outras unidades** — Cadastro estruturado de clínicas/contatos. Migrar texto livre pra tabela normalizada

### Tutores
- [ ] **Vender módulo Tutores** — Cadastro unificado, histórico, deduplicação. Super herói chega com a solução

---

## 🟢 FUTURO

### Novas Telas
- [ ] **tela_comercial** — CRM Comercial: estabelecimentos, contatos, visitas, indicações. Tela e sidebar não existem ainda
- [ ] **tela_entregas** — Gestão de entregas: montagem de retorno + rotas de entrega. Agrupar as funcionalidades de rotas + retorno numa tela dedicada. Sidebar aponta pra encaminhamentos hoje, repensar

### Infraestrutura
- [ ] **RLS por unidade** — Policies de banco filtrando dados automaticamente. Hoje o filtro é client-side
- [ ] **Mensagens automáticas** — Templates + envio programado
- [ ] **Relatórios** — Dashboards avançados com filtros por unidade/período
- [ ] **App mobile** — PWA ou nativo

---

*Atualizado em Março/2026*
