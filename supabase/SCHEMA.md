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

**Ultima atualizacao:** 2026-04-07
**Total:** 44 tabelas/views

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

## contrato_gc (20 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| acompanhamento_confirmado | text |  |
| certificado_pronto | boolean | default=False |
| cinzas_prontas | boolean | default=False |
| contato_tutor_em | timestamp with time zone |  |
| contato_tutor_obs | text |  |
| contrato_id | uuid | FK->contratos.id |
| created_at | timestamp with time zone | default=now() |
| cremacao_por | text |  |
| data_agendamento | timestamp with time zone |  |
| data_cremacao | timestamp with time zone |  |
| data_disponivel | timestamp with time zone |  |
| data_recebimento | timestamp with time zone | default=now() |
| etapa | text | default=recebido |
| forno | integer |  |
| id | uuid | PK default=gen_random_uuid() |
| lacre_conferido | boolean | default=False |
| observacoes_unidade | text |  |
| pedidos_especiais_obs | text |  |
| recebido_por | text |  |
| updated_at | timestamp with time zone | default=now() |

## contrato_itens_pessoais (7 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id |
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
| contrato_id | uuid | FK->contratos.id |
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
| contrato_id | uuid | FK->contratos.id |
| created_at | timestamp with time zone | default=now() |
| desconto | numeric | default=0 |
| foto_recebida | boolean | default=False |
| foto_url | text |  |
| id | uuid | PK default=gen_random_uuid() |
| is_reserva_pv | boolean | default=False |
| produto_id | uuid | FK->produtos.id |
| quantidade | integer | default=1 |
| rescaldo_feito | boolean | default=False |
| separado | boolean | default=False |
| updated_at | timestamp with time zone | default=now() |
| valor | numeric |  |

## contrato_rescaldos (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id |
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
| contrato_id | uuid | FK->contratos.id |
| created_at | timestamp with time zone | default=now() |
| data_minima | date |  |
| dias_bloqueados | public.dia_semana[] |  |
| endereco_alternativo | text |  |
| id | uuid | PK default=gen_random_uuid() |
| observacoes | text |  |
| periodos_bloqueados | public.periodo_dia[] |  |
| updated_at | timestamp with time zone | default=now() |

## contratos (80 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| acompanhamento_online | boolean | default=False |
| acompanhamento_presencial | boolean | default=False |
| certificado_confirmado | boolean | default=False |
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
| desconto_acessorios | numeric | default=0 |
| desconto_plano | numeric | default=0 |
| estabelecimento_id | uuid | FK->estabelecimentos.id (local de remoção) |
| estabelecimento_indicacao_id | uuid | FK->estabelecimentos.id (quem indicou) |
| fonte_conhecimento_id | uuid | FK->fontes_conhecimento.id |
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
| protocolo_data | jsonb |  |
| remocao_bairro | text |  |
| remocao_cep | text |  |
| remocao_cidade | text |  |
| remocao_endereco | text |  |
| seguradora | text |  |
| status | public.status_atendimento | default=ativo enum=[preventivo, ativo, pinda, retorno, pendente, finalizado] |
| supinda_id | uuid | FK->supindas.id |
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
| tutor_vet_segmento | boolean | default=False |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |
| valor_acessorios | numeric | default=0 |
| valor_plano | numeric |  |
| velorio_agendado_para | timestamp with time zone |  |
| velorio_deseja | boolean |  |
| velorio_realizado | boolean | default=False |

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
| contrato_id | uuid | FK->contratos.id |
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
| estoque_atual | integer | default=0 |
| estoque_infinito | boolean | default=False |
| estoque_minimo | integer | default=0 |
| id | uuid | PK default=gen_random_uuid() |
| imagem_url | text |  |
| nome | character varying |  |
| nome_retorno | text |  |
| precisa_foto | boolean | default=False |
| preco | numeric | default=0 |
| qtde_vendida | integer | default=0 |
| rescaldo_tipo | public.tipo_rescaldo | enum=[molde_patinha, pelinho, pelo_extra, carimbo, outro, itens_pessoais] |
| tipo | public.tipo_produto | enum=[urna, acessorio, incluso] |
| updated_at | timestamp with time zone | default=now() |

## rota_entregas (8 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id |
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
| status | public.status_supinda | default=planejada enum=[planejada, em_andamento, retornada] |
| unidade_id | uuid | FK->unidades.id |
| updated_at | timestamp with time zone | default=now() |

## tarefa_tipos (3 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| created_at | timestamp with time zone | default=now() |
| id | uuid | PK default=gen_random_uuid() |
| nome | character varying |  |

## tarefas (9 colunas)

| Coluna | Tipo | Info |
|--------|------|------|
| contrato_id | uuid | FK->contratos.id |
| created_at | timestamp with time zone | default=now() |
| descricao | text |  |
| id | uuid | PK default=gen_random_uuid() |
| importante | boolean | default=False |
| resolvido | boolean | default=False |
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

## tutores (18 colunas)

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
