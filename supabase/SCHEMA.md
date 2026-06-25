# Schema Supabase - R.I.P. Pet CRM

> **!!! ALERTA CRITICO PARA AGENTES DE IA !!!**
>
> Este arquivo e a FONTE DA VERDADE do schema do banco de dados.
> Ele DEVE ser lido no inicio de qualquer conversa que envolva banco, queries, migrations, tipos ou qualquer alteracao de dados.
>
> **REGRA OBRIGATORIA:** Se voce alterar QUALQUER coisa no banco (ADD COLUMN, ALTER TABLE, CREATE TABLE, DROP, ALTER TYPE, etc.),
> voce DEVE atualizar este arquivo IMEDIATAMENTE na mesma resposta.
> Nao deixe para depois. Nao esqueca. Nao pule.
>
> Se este arquivo estiver desatualizado, o proximo agente vai trabalhar com informacao errada e causar bugs.
>
> **Como atualizar:** Edite a tabela afetada neste arquivo refletindo exatamente a alteracao feita no banco.
> Atualize tambem a data de "Ultima atualizacao" abaixo.

**Ultima atualizacao:** 2026-06-22 (migration 096: view vw_estoque_reservado_pv — reserva de PV derivada)
**Total:** 50 tabelas/views (48 tabelas + 2 views: `vw_estatisticas_estabelecimentos`, `vw_estoque_reservado_pv`)
**RPCs ativas no banco (21):** `ajustar_estoque_unidade`, `editar_entrada_estoque`, `format_valor_historico`, `get_admin_activity_overview`, `get_ads_suspects`, `get_campo_label`, `insert_funnel_events`, `insert_lead`, `is_super_admin`, `list_users_with_profiles`, `patch_session_ip`, `recalc_contrato_valores`, `registrar_entrada_estoque`, `registrar_inventario_estoque`, `renomear_remessa`, `save_partial_lead`, `set_estoque_minimo_unidade`, `sync_ads_blocklist`, `upsert_session`, `user_unidade_codes`, `user_unidade_ids`

> **Como auditar drift entre este arquivo e o banco real:**
> `GET https://{PROJECT}.supabase.co/rest/v1/` com header `apikey: {SERVICE_ROLE_KEY}` retorna o swagger OpenAPI completo do schema `public` (tabelas, colunas, tipos, RPCs). Use isso pra validar este arquivo periodicamente — script de referência em `.tmp/dump_schema.py` + `.tmp/full_diff.py` (gitignored).

## configuracoes (6 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| chave | character varying |  |
| created_at | timestamp with time zone | default=now() |
| descricao | text |  |
| id | uuid | PK default=gen_random_uuid() |
| updated_at | timestamp with time zone | default=now() |
| valor | jsonb |  |

## contas (5 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |
| unidade_id | uuid | FK->unidades.id |

## contatos (17 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| aniversario | date |  |
| ativo | boolean | default=True |
| atualizado_em | timestamp with time zone | default=now() |
| cargo | text |  |
| criado_em | timestamp with time zone | default=now() |
| email | text |  |
| especialidade | text |  |
| estabelecimento_id | uuid | FK->estabelecimentos.id |
| foto_url | text |  |
| hobbies | text |  |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| nome | text |  |
| observacoes | text |  |
| preferencias | text |  |
| telefone | text |  |
| unidade_id | uuid | FK->unidades.id |
| whatsapp | text |  |

## contrato_gc (25 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| acompanhamento_confirmado | text |  |
| certificado_pronto | boolean | default=False |
| cinzas_prontas | boolean | default=False |
| contato_status | text | null=sem contato, 'contatado', 'agendado' |
| contato_tutor_em | timestamp with time zone |  |
| contato_tutor_obs | text |  |
| contrato_id | uuid | FK->contratos.id |
| created_at | timestamp with time zone | default=now() |
| cremacao_por | text |  |
| data_agendamento | timestamp with time zone |  |
| data_cremacao | timestamp with time zone |  |
| data_disponivel | timestamp with time zone | quando a etapa virou 'disponivel' (cinzas + cert prontos). Usado pelo trigger 091 pra setar `contratos.data_retorno` em unidades com `cb_cremacao_local` |
| data_recebimento | timestamp with time zone | nullable, sem default (migration 084) |
| etapa | text | default=provisionado (migration 084) |
| forno | integer |  |
| id | uuid | PK default=gen_random_uuid() |
| lacre_conferido | boolean | default=False |
| observacoes_unidade | text |  |
| pedidos_especiais_obs | text |  |
| pet_especie | text | snapshot editável (migration 081) |
| pet_genero | text | snapshot editável (migration 081) |
| pet_nome | text | snapshot editável (migration 081) |
| pet_raca | text | snapshot editável (migration 081) |
| recebido_por | text |  |
| updated_at | timestamp with time zone | default=now() |

**Triggers:**
- `contrato_gc_snapshot_pet` (BEFORE INSERT, migration 081) — preenche snapshot pet_* a partir de `contratos` se vier vazio.
- `gc_disponivel_auto_retorno` (AFTER UPDATE OF etapa, migration 091) — quando etapa muda pra `disponivel`, AVANÇA `contratos.status` para `retorno` **se a unidade dona do contrato tem `cb_cremacao_local` em `modulos_ativos`**. Para outras unidades, retorno é disparado por `/encaminhamentos`.

## contrato_itens_pessoais (7 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| descricao | character varying |  |
| destino | public.destino_item_pessoal | enum=[doar, descartar, retornar, cremar_junto] |
| id | uuid | PK default=gen_random_uuid() |
| resolvido | boolean | default=False |
| updated_at | timestamp with time zone | default=now() |

## contrato_mensagens (9 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| conteudo_enviado | text |  |
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| enviada_em | timestamp with time zone | default=now() |
| enviada_via | character varying |  |
| id | uuid | PK default=gen_random_uuid() |
| observacoes | text |  |
| template_id | uuid | FK->mensagem_templates.id |
| tipo | character varying |  |

## contrato_produtos (13 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| desconto | numeric | default=0 |
| foto_recebida | boolean | default=False |
| foto_url | text |  |
| id | uuid | PK default=gen_random_uuid() |
| is_reserva_pv | boolean | default=False — **DEPRECATED** (mig 096): nunca foi gravada `true`. Reserva de PV agora é derivada de `status='preventivo'` via `vw_estoque_reservado_pv`. |
| produto_id | uuid | FK->produtos.id |
| quantidade | integer | default=1 |
| rescaldo_feito | boolean | default=False |
| separado | boolean | default=False |
| updated_at | timestamp with time zone | default=now() |
| valor | numeric |  |

**Trigger (migration 074):** `trg_recalc_contrato_valores` (AFTER INSERT/UPDATE/DELETE) chama `recalc_contrato_valores(contrato_id)` que recalcula `contratos.valor_acessorios` (SUM valor*qtd onde tipo != 'incluso') e `contratos.desconto_acessorios` (SUM desconto*qtd) automaticamente. Frontend não precisa atualizar esses campos manualmente.

## contrato_rescaldos (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| observacoes | text |  |
| quantidade | integer | default=1 |
| status | public.status_rescaldo | default=pendente enum=[nao_pediu, pendente, feito] |
| tipo | public.tipo_rescaldo | enum=[molde_patinha, pelinho, pelo_extra, carimbo, outro, itens_pessoais] |
| updated_at | timestamp with time zone | default=now() |

## contrato_restricoes_entrega (9 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| data_minima | date |  |
| dias_bloqueados | public.dia_semana[] |  |
| endereco_alternativo | text |  |
| id | uuid | PK default=gen_random_uuid() |
| observacoes | text |  |
| periodos_bloqueados | public.periodo_dia[] |  |
| updated_at | timestamp with time zone | default=now() |

## contratos (98 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| acompanhamento_online | boolean | default=False |
| acompanhamento_presencial | boolean | default=False |
| acondicionado | boolean | default=False — flag de encaminhamento (pet preparado para embarque); separado de certificado_confirmado a partir da migration 080 |
| certificado_confirmado | boolean | default=False — apenas nomes do certificado confirmados via CertificadoModal |
| certificado_nome_1 | text |  |
| certificado_nome_2 | text |  |
| certificado_nome_3 | text |  |
| certificado_nome_4 | text |  |
| certificado_nome_5 | text |  |
| certificado_nome_6 | text |  |
| certificado_nome_7 | text |  |
| certificado_recebido | boolean | default=False |
| cinzas_recebidas | boolean | default=False |
| clinica_coleta | text |  |
| codigo | character varying |  |
| contato_id | uuid | FK->contatos.id |
| created_at | timestamp with time zone | default=now() |
| custo_cremacao | numeric |  |
| data_acolhimento | timestamp with time zone |  |
| data_contrato | date |  |
| data_cremacao | date |  |
| data_entrega | date |  |
| data_leva_pinda | date |  |
| data_retorno | date |  |
| desconto_acessorios | numeric | default=0 (auto via trigger 074, SUM(cp.desconto*qtd)) |
| desconto_acessorios_ajuste | numeric | default=0. Ajuste manual extra. Total = desconto_acessorios + desconto_acessorios_ajuste (migration 078) |
| desconto_plano | numeric | default=0 (deprecated — usar desconto_plano_unificado) |
| desconto_plano_unificado | numeric | default=0. Substitui desconto_plano + Σ pagamentos.desconto(plano). Editável manual (migration 078) |
| descricao_contrato | text | Texto livre que substitui a descrição padrão de IND/COL no PDF do contrato (mig 090) |
| estabelecimento_id | uuid | FK->estabelecimentos.id (local de remoção) |
| estabelecimento_indicacao_id | uuid | FK->estabelecimentos.id (quem indicou) |
| fonte_conhecimento_id | uuid | FK->fontes_conhecimento.id (legado, primeiro da lista) |
| fonte_conhecimento_ids | uuid[] | Array de FKs para múltiplas fontes |
| fonte_outro_especificar | text | Texto livre quando uma das fontes é "Outro". Origem: fichas.outro_especificar |
| funcionario_id | uuid | FK->funcionarios.id |
| id | uuid | PK default=gen_random_uuid() |
| indicacao_clinica | text | fallback texto (sem módulo clínicas) |
| indicacao_contato | text | fallback texto (sem módulo clínicas) |
| indicador_id | uuid | FK->indicadores.id |
| latitude | numeric |  |
| local_coleta | character varying |  |
| longitude | numeric |  |
| nfse_codigo_verificacao | character varying | default=NULL |
| nfse_data | timestamp with time zone |  |
| nfse_link_pdf | text |  |
| nfse_numero | character varying | default=NULL |
| nfse_status | character varying | default=NULL |
| numero_lacre | character varying |  |
| observacoes | text |  |
| pelinho_feito | boolean | default=False |
| pelinho_quantidade | integer | default=1 |
| pelinho_quer | boolean |  |
| pet_cor | character varying |  |
| pet_especie | public.especie_pet | enum=[canina, felina, exotica] |
| pet_genero | public.genero_pet | enum=[macho, femea] |
| pet_idade_anos | integer |  |
| pet_nome | character varying |  |
| pet_peso | numeric |  |
| pet_raca | character varying |  |
| pet_raca_normalizada | text | default=pet_raca (trigger BEFORE INSERT). Editada via CertificadoModal para normalização (catálogo). Migration 081. |
| protocolo_data | jsonb |  |
| remocao_bairro | text |  |
| remocao_cep | text |  |
| remocao_cidade | text |  |
| remocao_endereco | text |  |
| seguradora | text |  |
| status | public.status_atendimento | default=ativo enum=[preventivo, ativo, pinda, retorno, pendente, finalizado] |
| supinda_id | uuid | FK->supindas.id |
| supinda_direcao | varchar(10) | DEPRECATED — usar supinda_volta_id |
| supinda_volta_id | uuid | FK->supindas.id. Qual supinda trouxe cinzas/cert de volta |
| tipo_cremacao | public.tipo_cremacao | enum=[individual, coletiva] |
| tipo_plano | public.tipo_plano | enum=[emergencial, preventivo] |
| tutor_bairro | character varying |  |
| tutor_cep | character varying |  |
| tutor_cidade | character varying |  |
| tutor_cpf | character varying |  |
| tutor_email | character varying |  |
| tutor_endereco | text |  |
| tutor_id | uuid | FK->tutores.id |
| tutor_nome | character varying |  |
| tutor_telefone | character varying |  |
| tutor_telefone2 | character varying |  |
| tutor_telefone_nome | text | label do telefone (ex: Ficha, Processado) |
| tutor_telefone2_nome | text | label do telefone 2 |
| tutor_telefone_principal | integer | qual telefone é o principal (1 ou 2) |
| tutor_vet_segmento | boolean | default=False |
| unidade_id | uuid | FK->unidades.id |
| unidade_remocao_id | uuid | FK->unidades.id. Unidade que faz remoção (se diferente da dona) |
| unidade_entrega_id | uuid | FK->unidades.id. Unidade que entrega cinzas (se diferente da dona) |
| updated_at | timestamp with time zone | default=now() |
| valor_acessorios | numeric | default=0 |
| valor_plano | numeric |  |
| velorio_agendado_para | timestamp with time zone |  |
| velorio_deseja | boolean |  |
| velorio_realizado | boolean | default=False |
| vip_pet | boolean | NOT NULL default=false — flag VIP Pet (Sim/Não), mig 094 |
| comissao_valor | numeric | nullable, default=NULL — comissão devida à clínica de indicação (mig 085) |
| comissao_paga | boolean | NOT NULL default=false — pagamento da comissão efetivado (mig 085) |

**Triggers:**
- `contratos_pet_raca_normalizada_default` (BEFORE INSERT, migration 081) — copia `pet_raca` para `pet_raca_normalizada` se NULL.
- `contratos_create_gc_on_pinda` (AFTER INSERT OR UPDATE OF status, migration 091) — quando contrato entra em `status='pinda'`, cria row em `contrato_gc` (etapa=`provisionado`) se ainda não existe. **Universal** (vale pra todas as unidades; idempotente). Snapshot pet_* é preenchido pelo trigger 081.

**FKs filhas com `ON DELETE CASCADE` (mig 093):** contrato_produtos, pagamentos, contrato_rescaldos, contrato_itens_pessoais, contrato_mensagens, tarefas, rota_entregas, contrato_restricoes_entrega — além de contrato_gc (mig 044). Deletar um contrato apaga todos esses filhos automaticamente. (`fichas.contrato_id` NÃO cascateia — fica órfão/null; tratado em código no undo de ficha.)

## conversation_context (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| compiled_context | jsonb |  |
| conversation_id | uuid | FK->conversations.id |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| last_analyzed_at | timestamp with time zone | default=now() |
| locked_fields | text[] |  |
| updated_at | timestamp with time zone | default=now() |
| version | integer | default=3 |

## conversations (6 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| customer_name | text |  |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| phone_number | text |  |
| status | text | default=active |
| updated_at | timestamp with time zone | default=now() |

## estabelecimentos (34 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| atualizado_em | timestamp with time zone | default=now() |
| bairro | text |  |
| cep | text |  |
| cidade | text | default=Santos |
| concorrentes_presentes | text[] |  |
| criado_em | timestamp with time zone | default=now() |
| email | text |  |
| endereco | text |  |
| estado | text | default=SP |
| estrategia | text |  |
| fotos | text[] |  |
| horario_funcionamento | text |  |
| id | uuid | PK default=gen_random_uuid() |
| ilha_de_exibicao | text[] |  |
| instagram | text |  |
| latitude | double precision |  |
| longitude | double precision |  |
| modelo_gratificacao | text |  |
| nome | text |  |
| observacoes | text |  |
| percentual_prefeitura | integer |  |
| politica_concorrencia | text |  |
| porte_equipe | text |  |
| qtde_media_obitos_mensal | integer |  |
| relacionamento | integer | default=0 |
| telefone | text |  |
| tipo | text |  |
| ultima_visita | timestamp with time zone |  |
| unidade_id | uuid | FK->unidades.id |
| valor_prefeitura_10kg | numeric |  |
| veterinarios_fixos | integer |  |
| veterinarios_volantes | integer |  |
| website | text |  |
| whatsapp | text |  |

## estoque_emprestimos (10 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| data_devolucao | date |  |
| data_emprestimo | date | default=CURRENT_DATE |
| direcao | public.direcao_emprestimo | enum=[emprestamos, tomamos_emprestado] |
| id | uuid | PK default=gen_random_uuid() |
| observacoes | text |  |
| produto_id | uuid | FK->produtos.id |
| quantidade | integer |  |
| unidade | character varying |  |
| updated_at | timestamp with time zone | default=now() |

## estoque_entradas (9 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| custo_unitario | numeric |  |
| data_entrada | date | default=CURRENT_DATE |
| id | uuid | PK default=gen_random_uuid() |
| produto_id | uuid | FK->produtos.id |
| quantidade | integer |  |
| remessa | character varying |  |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## fichas (40 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| acompanhamento | text |  |
| bairro | text |  |
| cep | text |  |
| cidade | text |  |
| como_conheceu | jsonb |  |
| complemento | text |  |
| contrato_id | uuid | FK->contratos.id |
| cor | text |  |
| cpf | text |  |
| created_at | timestamp with time zone | default=timezone('utc'::text, now()) |
| cremacao | text |  |
| email | text |  |
| endereco | text |  |
| especie | text |  |
| estado | text |  |
| genero | text |  |
| id | uuid | PK default=gen_random_uuid() |
| idade | text |  |
| localizacao | text |  |
| localizacao_outra | text |  |
| nome_completo | text |  |
| nome_pet | text |  |
| numero | text |  |
| observacoes | text |  |
| op_dados | jsonb | Dados preenchidos pelo operador no processamento |
| outro_especificar | text |  |
| outros_tutores | jsonb |  |
| pagamento | text |  |
| parcelas | text |  |
| peso | numeric |  |
| processada | boolean | default=False |
| processada_em | timestamp with time zone |  |
| processada_por | uuid | FK->funcionarios.id |
| raca | text |  |
| telefone | text |  |
| unidade | text |  |
| unidade_id | uuid | FK->unidades.id |
| valor | numeric |  |
| velorio | text |  |
| veterinario_especificar | text |  |

## fontes_conhecimento (3 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |

## funcionarios (6 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## funnel_events (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| event_type | text |  |
| event_value | text |  |
| id | bigint | PK |
| lead_id | uuid |  |
| metadata | jsonb |  |
| session_id | text |  |
| step_duration_ms | integer |  |

## historico_alteracoes (13 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| alterado_por | uuid |  |
| alterado_por_email | text |  |
| campo | text |  |
| campo_label | text |  |
| criado_em | timestamp with time zone | default=now() |
| entidade | text |  |
| entidade_id | uuid |  |
| entidade_nome | text |  |
| id | uuid | PK default=gen_random_uuid() |
| nota | text |  |
| tipo | text | default=alteracao |
| valor_anterior | text |  |
| valor_novo | text |  |

## indicacoes (18 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| atualizado_em | timestamp with time zone | default=now() |
| cidade | text |  |
| criado_em | timestamp with time zone | default=now() |
| data_conversao | timestamp with time zone |  |
| data_primeiro_contato | timestamp with time zone |  |
| email | text |  |
| endereco | text |  |
| estabelecimento_origem_id | uuid | FK->estabelecimentos.id |
| estado | text | default=SP |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| motivo_indicacao | text |  |
| nome_indicado | text |  |
| observacoes | text |  |
| status | text | default=nova |
| telefone | text |  |
| tipo_estabelecimento | text |  |
| unidade_id | uuid | FK->unidades.id |
| usuario_id | uuid |  |

## indicadores (6 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## knowledge_base (5 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| conversation_text | text |  |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| tags | text[] |  |
| updated_at | timestamp with time zone | default=now() |

## leads (39 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| abandoned_at_step | text |  |
| canal | text |  |
| cidade | text |  |
| contrato_id | uuid |  |
| convertido | boolean | default=False |
| convertido_em | timestamp with time zone |  |
| convertido_por | uuid |  |
| created_at | timestamp with time zone | default=now() |
| dispositivo | text |  |
| especie_pet | text |  |
| funnel_duration_sec | integer |  |
| gclid | text |  |
| geo_city | text |  |
| geo_state | text |  |
| grande_porte | boolean |  |
| id | uuid | PK default=gen_random_uuid() |
| last_step | text |  |
| nome | text |  |
| notas | text |  |
| page_views | integer |  |
| pagina_origem | text |  |
| popup_duration_sec | integer |  |
| protocolo | text |  |
| scroll_depth | integer |  |
| secao_clique | text |  |
| session_id | text |  |
| status | text | default=completo |
| steps_completed | integer | default=0 |
| telefone_destino | text |  |
| telefone_lead | text |  |
| tempo_pagina_seg | integer |  |
| tipo_atendimento | text |  |
| unidade_code | text | default=ST |
| unidade_id | uuid | FK->unidades.id |
| utm_campaign | text |  |
| utm_medium | text |  |
| utm_source | text |  |
| utm_term | text |  |
| visitor_id | text |  |

## mensagem_templates (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| codigo | character varying |  |
| conteudo | text |  |
| created_at | timestamp with time zone | default=now() |
| dias_apos_evento | integer |  |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |
| updated_at | timestamp with time zone | default=now() |

## messages (7 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| content | text |  |
| conversation_id | uuid | FK->conversations.id |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| is_ai_suggestion | boolean | default=False |
| sender | text |  |
| sent_to_whatsapp | boolean | default=False |
| timestamp | timestamp with time zone | default=now() |

## pagamentos (18 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| bandeira | text |  |
| conta_id | uuid | FK->contas.id |
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| data_pagamento | date | default=CURRENT_DATE |
| desconto | numeric | default=0 |
| id | uuid | PK default=gen_random_uuid() |
| id_transacao | text |  |
| is_seguradora | boolean | default=False |
| mes_competencia | character varying |  |
| metodo | public.metodo_pagamento | enum=[pix, dinheiro, credito, debito] |
| parcelas | integer | default=1 |
| taxa | numeric | default=0 |
| tipo | character varying |  |
| updated_at | timestamp with time zone | default=now() |
| valor | numeric |  |
| valor_liquido | numeric |  |
| valor_liquido_sem_taxa | numeric |  |

## push_subscriptions (7 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK default=gen_random_uuid() |
| user_id | uuid | FK->auth.users.id ON DELETE CASCADE |
| endpoint | text | NOT NULL |
| keys_p256dh | text | NOT NULL |
| keys_auth | text | NOT NULL |
| unidade_id | uuid | FK->unidades.id ON DELETE SET NULL |
| created_at | timestamptz | default=now() |

**UNIQUE:** (user_id, endpoint)
**Index:** idx_push_subscriptions_unidade (unidade_id)
**RLS:** Users manage own (auth.uid() = user_id), Service role full access

## perfis (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| is_default | boolean | default=False |
| nome | text |  |
| role | text | default=operador |
| unidade_id | uuid | FK->unidades.id |
| user_id | uuid |  |

## produtos (18 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| categoria | character varying |  |
| codigo | character varying |  |
| created_at | timestamp with time zone | default=now() |
| custo | numeric | default=0 |
| estoque_atual | integer | default=0 (DEPRECATED — usar produtos_estoque, migration 075) |
| estoque_infinito | boolean | default=False |
| estoque_minimo | integer | default=0 (DEPRECATED — usar produtos_estoque, migration 075/076) |
| id | uuid | PK default=gen_random_uuid() |
| imagem_url | text |  |
| nome | character varying |  |
| nome_retorno | text |  |
| precisa_foto | boolean | default=False |
| preco | numeric | default=0 |
| qtde_vendida | integer | default=0 (DEPRECATED — usar produtos_estoque, migration 076) |
| rescaldo_tipo | public.tipo_rescaldo | enum=[molde_patinha, pelinho, pelo_extra, carimbo, outro, itens_pessoais] |
| tipo | public.tipo_produto | enum=[urna, acessorio, incluso] |
| updated_at | timestamp with time zone | default=now() |

## produtos_estoque (6 colunas)

Estoque por unidade (migration 075). Substitui produtos.estoque_atual/estoque_minimo/qtde_vendida (deprecated globais). PK composta (produto_id, unidade_id).

| Coluna | Tipo | Info |
|--------|------|------|
| produto_id | uuid | PK + FK->produtos.id ON DELETE CASCADE NOT NULL |
| unidade_id | uuid | PK + FK->unidades.id ON DELETE CASCADE NOT NULL |
| estoque_atual | integer | NOT NULL default=0. Permite negativo (decisão operador, migration 077) |
| estoque_minimo | integer | NOT NULL default=0 |
| qtde_vendida | integer | NOT NULL default=0. Sincronizado via trigger trg_cp_qtde_vendida (migration 076) |
| updated_at | timestamptz | NOT NULL default=now(), trigger trg_pe_updated_at |

**Index:** idx_pe_unidade (unidade_id)
**RLS:** SELECT autenticado. INSERT/UPDATE/DELETE só via RPCs SECURITY DEFINER.
**RPCs (migrations 075-077):**
- `ajustar_estoque_unidade(produto_id, unidade_id, delta)` — UPSERT atômico, retorna novo saldo (NULL se estoque_infinito)
- `registrar_entrada_estoque(produto_id, unidade_id, qtd, custo, remessa, data)` — insere em estoque_entradas + ajusta saldo (qtd DEVE ser > 0)
- `registrar_inventario_estoque(produto_id, unidade_id, delta, remessa, data)` — ajuste de inventário (mig 095): insere em estoque_entradas com quantidade=delta (aceita NEGATIVO) + ajusta saldo. Usado pelo botão "Inventário" em /estoque
- `set_estoque_minimo_unidade(produto_id, unidade_id, minimo)` — UPSERT atômico do mínimo
- `editar_entrada_estoque(entrada_id, nova_qtd)` — edita/deleta entrada, ajusta saldo por delta (permite negativo)
- `renomear_remessa(unidade_id, data_antiga, remessa_antiga, data_nova, remessa_nova)` — UPDATE em lote

## rota_entregas (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| data_entrega | timestamp with time zone |  |
| entregue | boolean | default=False |
| id | uuid | PK default=gen_random_uuid() |
| observacoes | text |  |
| ordem | integer |  |
| rota_id | uuid | FK->rotas_entrega.id |

## rotas_entrega (10 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| data_prevista | date |  |
| id | uuid | PK default=gen_random_uuid() |
| numero | integer |  |
| observacoes | text |  |
| periodo | public.periodo_dia | default=dia_todo enum=[manha, tarde, dia_todo] |
| responsavel | character varying |  |
| status | public.status_rota | default=planejada enum=[planejada, em_andamento, concluida, cancelada] |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## sessions (34 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| browser | text |  |
| created_at | timestamp with time zone | default=now() |
| cta_channel | text |  |
| cta_clicked | boolean | default=False |
| cta_clicked_at | timestamp with time zone |  |
| cta_section | text |  |
| device_type | text |  |
| gclid | text |  |
| geo_city | text |  |
| geo_state | text |  |
| geo_timezone | text |  |
| id | uuid | PK default=gen_random_uuid() |
| landing_page | text |  |
| max_scroll_depth | integer | default=0 |
| os | text |  |
| page_views | integer | default=1 |
| popup_opened_count | integer | default=0 |
| referrer | text |  |
| screen_resolution | text |  |
| sections_viewed | text[] |  |
| session_id | text |  |
| time_on_page_sec | integer | default=0 |
| updated_at | timestamp with time zone | default=now() |
| user_language | text |  |
| utm_campaign | text |  |
| utm_medium | text |  |
| utm_source | text |  |
| utm_term | text |  |
| viewport | text |  |
| visitor_id | text |  |
| ip_address | text |  |
| fingerprint | text |  |
| unidade_code | text |  |
| is_ads | boolean | default=False |

## ads_shield_whitelist (6 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK default=gen_random_uuid() |
| ip_address | text |  |
| fingerprint | text |  |
| reason | text |  |
| created_at | timestamp with time zone | default=now() |
| created_by | uuid | FK->auth.users.id |

## ads_shield_blocklist (11 colunas)

Blocklist cumulativa de IPs ja flagrados como fraude (migration 069). Persiste entre janelas de scoring — filtro "Todo periodo" na UI le daqui. Alimentada pelo RPC `sync_ads_blocklist`.

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK default=gen_random_uuid() |
| ip_address | text | UNIQUE NOT NULL |
| fingerprint | text |  |
| unidade_codes | text[] |  |
| first_flagged_at | timestamp with time zone | NOT NULL default=now() |
| last_flagged_at | timestamp with time zone | NOT NULL default=now() |
| max_score | integer | NOT NULL |
| visit_count | bigint | NOT NULL default=0 |
| ever_converted | boolean | NOT NULL default=False |
| cities | text[] |  |
| devices | text[] |  |

## supinda_itens (6 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| descricao | text |  |
| feito | boolean | default=False |
| id | uuid | PK default=gen_random_uuid() |
| supinda_id | uuid | FK->supindas.id |
| tipo | text | default=levar |

## supindas (11 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| data | date |  |
| id | uuid | PK default=gen_random_uuid() |
| numero | text |  |
| observacoes | text |  |
| peso_total | numeric |  |
| quantidade_pets | integer |  |
| responsavel | character varying |  |
| status | public.status_supinda | default=planejada enum=[planejada, em_andamento, retornada, embarcada, embarcada_ida, ida_finalizada, finalizada]. Fluxo atual (migration 082): planejada → embarcada_ida → ida_finalizada → finalizada. Valores legados (em_andamento, retornada, embarcada) preservados no enum. |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## tarefa_tipos (3 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |

## tarefas (13 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id ON DELETE CASCADE (mig 093) |
| created_at | timestamp with time zone | default=now() |
| criado_por | text | Nome do autor |
| criado_por_email | text | Email do autor |
| descricao | text |  |
| id | uuid | PK default=gen_random_uuid() |
| importante | boolean | default=False |
| resolvido | boolean | default=False |
| resolvido_por | text | Nome de quem resolveu |
| resolvido_em | timestamp with time zone | Quando foi resolvido |
| tipo_id | uuid | FK->tarefa_tipos.id |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## taxas_cartao (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |
| ordem | integer | default=0 |
| percentual | numeric |  |
| tipo | character varying |  |
| updated_at | timestamp with time zone | default=now() |

## tutores (21 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativo | boolean | default=True |
| bairro | character varying |  |
| cep | character varying |  |
| cidade | character varying |  |
| complemento | character varying |  |
| cpf | character varying |  |
| created_at | timestamp with time zone | default=now() |
| email | character varying |  |
| endereco | character varying |  |
| estado | character varying |  |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |
| numero | character varying |  |
| observacoes | text |  |
| telefone | character varying |  |
| telefone2 | character varying |  |
| telefone_nome | text | label do telefone (ex: Ficha, Processado) |
| telefone2_nome | text | label do telefone 2 |
| telefone_principal | integer | qual telefone é o principal (1 ou 2) |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## unidades (16 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| ativa | boolean | default=True |
| cidade | text |  |
| codigo | text |  |
| created_at | timestamp with time zone | default=now() |
| email | text |  |
| endereco | text |  |
| estado | text | default=SP |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| is_matriz | boolean | default=False |
| modulos_ativos | text[] |  |
| nome | text |  |
| ordem | integer | default=99 |
| slug | text |  |
| telefone | text |  |
| updated_at | timestamp with time zone | default=now() |
| whatsapp | text |  |

## field_permissions (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK default=gen_random_uuid() |
| unidade_id | uuid | FK->unidades.id ON DELETE CASCADE |
| tela | varchar(50) | NOT NULL - ex: 'pipeline', 'contrato_detalhe' |
| campo | varchar(80) | NOT NULL - ex: 'btn_novo_contrato', 'valor_plano' |
| role | varchar(20) | NOT NULL CHECK IN ('gerente', 'operador') |
| permissao | varchar(10) | NOT NULL CHECK IN ('edit', 'read', 'hidden') |
| created_at | timestamptz | default=now() |
| updated_at | timestamptz | default=now(), trigger |

**UNIQUE:** (unidade_id, tela, campo, role)
**Index:** idx_fp_unidade_role (unidade_id, role)
**RLS:** SELECT autenticado, INSERT/UPDATE/DELETE super_admin
**Nota:** Apenas exceções são armazenadas (default = 'edit'). super_admin nunca tem rows aqui.

## demandas (13 colunas)

Gerenciador interno de pendências/roadmap. Tela `/admin/demandas` — só super_admin. Substitui os `PENDENCIAS*.md` como fonte da verdade viva. (migration 086)

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK default=gen_random_uuid() |
| numero | text | NOT NULL - identificador no padrão `2026/##` (renumerado na mig 087, por prioridade) |
| titulo | text | NOT NULL |
| descricao | text | o que é a demanda |
| diagnostico | text | estado atual / causa raiz / o que falta |
| areas | text[] | tags de etapa/aba do fluxo (Fichas, Contrato, GC, Tutores...) — múltiplas por demanda (mig 088) |
| status | text | NOT NULL default='aberto' CHECK IN ('aberto','em_andamento','parcial','feito','descartado') |
| prioridade | text | CHECK IN ('alta','media','baixa') |
| tamanho | text | CHECK IN ('XS','S','M','L','XL') |
| comentarios | text | histórico livre (evidência/commit, decisões, andamento) |
| ordem | integer | default=100 - ordenação manual (desempate) |
| created_at | timestamptz | default=now() |
| updated_at | timestamptz | default=now(), trigger update_updated_at |

**Index:** idx_demandas_status (status)
**UNIQUE:** numero (mig 089) — impede colisão de número
**RLS:** SELECT/INSERT/UPDATE/DELETE só super_admin (`public.is_super_admin()`) — dados internos
**Seed:** 30 demandas mapeadas em 22/05/2026 (numero renumerado para `2026/01`..`2026/30` na mig 087)

## user_activity_pings (11 colunas)

Heartbeat client-side pra rastrear adoção real (cada abertura de aba → row; ping a cada 60s).
Sessão "viva" = last_ping_at > now() - 2 min. Alimenta o Dashboard Admin via RPC `get_admin_activity_overview()`.

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK default=gen_random_uuid() |
| user_id | uuid | FK->auth.users.id ON DELETE CASCADE, NOT NULL |
| unidade_id | uuid | FK->unidades.id ON DELETE SET NULL |
| session_id | text | NOT NULL - UUID gerado client-side por abertura de aba |
| opened_at | timestamptz | NOT NULL default=now() |
| last_ping_at | timestamptz | NOT NULL default=now() - atualizado a cada 60s |
| page | text | Última rota visitada |
| user_agent | text | UA truncado (250 chars) |
| device_type | text | mobile / tablet / desktop |
| created_at | timestamptz | default=now() |
| updated_at | timestamptz | default=now(), trigger update_updated_at |

**UNIQUE:** (user_id, session_id)
**Index:** idx_uap_user_last_ping (user_id, last_ping_at DESC), idx_uap_last_ping (last_ping_at DESC), idx_uap_unidade (unidade_id), idx_uap_opened_at (opened_at DESC)
**RLS:** próprio usuário SELECT/INSERT/UPDATE suas rows; super_admin SELECT tudo
**RPC:** `get_admin_activity_overview()` → SECURITY DEFINER, retorna kpis + units_activity + users (exige super_admin)

## visibilidade_logs (10 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| adicionados | text[] |  |
| alterado_por | uuid |  |
| alterado_por_email | text |  |
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| modulos_antes | text[] |  |
| modulos_depois | text[] |  |
| removidos | text[] |  |
| unidade_id | uuid | FK->unidades.id |
| unidade_nome | text |  |

## visitas (20 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| atualizado_em | timestamp with time zone | default=now() |
| cargo_contato | text |  |
| contato_realizado | text |  |
| criado_em | timestamp with time zone | default=now() |
| data_proximo_contato | date |  |
| data_visita | timestamp with time zone | default=now() |
| duracao_minutos | integer |  |
| estabelecimento_id | uuid | FK->estabelecimentos.id |
| id | uuid | PK default=extensions.uuid_generate_v4() |
| latitude | numeric |  |
| longitude | numeric |  |
| objetivo | text |  |
| observacoes | text |  |
| potencial_negocio | text |  |
| proximos_passos | text |  |
| status | text | default=realizada |
| temperatura_pos_visita | text |  |
| tipo_visita | text | default=presencial |
| unidade_id | uuid | FK->unidades.id |
| usuario_id | uuid |  |

## vw_estatisticas_estabelecimentos (10 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| id | uuid | PK |
| indicacoes_30d | bigint |  |
| indicacoes_90d | bigint |  |
| nome | text |  |
| total_indicacoes | bigint |  |
| total_visitas | bigint |  |
| ultima_visita | timestamp with time zone |  |
| unidade_id | uuid | FK->unidades.id |
| visitas_30d | bigint |  |
| visitas_90d | bigint |  |

## vw_estoque_reservado_pv (3 colunas) — mig 096

Estoque reservado por PV, **derivado** (não usa a flag `is_reserva_pv`). Agrega `contrato_produtos` de contratos `status='preventivo'`. `security_invoker=on` (RLS de contratos vale). Consumida por `web/src/lib/estoque-reservado.ts`.

| Coluna | Tipo | Info |
|--------|------|------|
| unidade_id | uuid | FK->unidades.id (= contratos.unidade_id) |
| produto_id | uuid | FK->produtos.id |
| reservado | int | count(*) de linhas em PVs (1 linha = 1 unidade física) |
