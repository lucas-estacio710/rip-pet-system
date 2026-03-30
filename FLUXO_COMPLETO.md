# Fluxo Completo — Do Lead à Entrega das Cinzas

> Mapa operacional do CRM RIP PET multi-unidade.
> Cada etapa descreve: o que acontece, quem faz, onde clica, e o que rola por trás.

---

## 1. LEAD CHEGA NO WHATSAPP

**O que acontece:**
O tutor (ou familiar) clica no botão do site, preenche o popup de captura, e é redirecionado pro WhatsApp da unidade com uma mensagem pré-montada contendo nome, cidade, tipo de atendimento, espécie e protocolo.

**Responsável:** Automático (site) + Atendente da unidade (WhatsApp)

**Onde clica:** Site da LP (rippet.com.br/santos, /sao-paulo, etc.)

**Por trás:**
- `lead-capture.js` captura dados e salva na tabela `leads` via RPC `insert_lead`
- Gera protocolo com prefixo da unidade (ex: ST26E001M36C91)
- Session tracking salva engajamento na tabela `sessions`
- GA4 + Meta Pixel disparam eventos
§só santos tem esse fluxo.. as outras vao receber aleatorio, de onde costumam receber leads mesmo. não precisa focar no tecnico aqui.
---

## 2. ATENDENTE FECHA O CONTRATO

**O que acontece:**
O atendente conversa com o tutor pelo WhatsApp, confirma o serviço, combina valores e horário de coleta/remoção. Quando fecha, precisa registrar no sistema.

**Responsável:** Atendente da unidade

**Onde clica:** Envia o link da ficha digital para o tutor preencher (ex: `rippet.com.br/ficha/santos`)

**Por trás:**
- Nada no CRM ainda — a conversa é no WhatsApp
- O atendente pode marcar o lead como "Contatado" na tela de Leads
§só santos tem leads.. aqui só falar que o atendente envia  ficha para o tutor.. o link, com uma mensagem salva rapida
---

## 3. TUTOR PREENCHE A FICHA DIGITAL

**O que acontece:**
O tutor acessa o link da ficha no celular, preenche dados pessoais, dados do pet, tipo de cremação, forma de pagamento, velório, acompanhamento, e como conheceu a RIP PET.

**Responsável:** Tutor

**Onde clica:** Link da ficha (`/ficha/santos`, `/ficha/campinas`, etc.)

**Por trás:**
- Formulário salva na tabela `fichas` com `unidade_id` da unidade
- Email de notificação enviado pra unidade via Resend (`/api/ficha/email`)
§ja tenho os emails de todos usuários. vamos criar.
- Se Supabase falhar, email vai como fallback com dados completos
- Draft salvo em localStorage (tutor pode continuar depois)
§vi que estão indo infos automaticas para o observações.. eu queria validar com você este ponto.
---

## 4. UNIDADE RECEBE E PROCESSA A FICHA

**O que acontece:**
A ficha aparece na tela de Fichas do CRM com badge "Pendente". O operador abre, confere os dados, insere o valor do plano, escreve o nome da clínica/contato (texto livre), e clica em "Processar".
§aqui precisamos deixar a função de busca na tabela de estabelecimentos habilitada somente para santos. para as outras unidades venderemos essa solução depois. mas eles vão escrevendo em texto aberto.. vou solicitar para que mantenham sempre o mesmo padrão, por exemplo, tutor recebe MADE DOG, ou o endereço da clinica.. mas o correto é Madedog.. então ele digita sempre corretamente.. isso vai facilitar o trabalho depois para migração do mini-legado que vamos criar.
**Responsável:** Operador da unidade

**Onde clica:** Menu lateral → **Fichas** → card da ficha → botão **Processar**

**Por trás:**
- Abre o `TratativaModal`
- Operador preenche: código do contrato, valor do plano, tipo de plano (EM/PV), clínica, funcionário responsável
- Ao confirmar:
  - Cria registro na tabela `contratos` com `unidade_id` e status `ativo`
  - Cria/vincula registro na tabela `tutores` (busca por CPF/telefone ou cria novo)
  - Marca ficha como `processada = true` com `contrato_id`
  - Contrato entra no pipeline
§necessario criar o campo desconto pré-venda, ou usar se já tiver, trazer na tela (a priori campo aberto livre) e colocar aqui, deixando um campo de calculo valor do plano - desconto pré-venda.
---

## 5. CONTRATO ENTRA NO PIPELINE (STATUS: ATIVO)

**O que acontece:**
O contrato aparece na tela de Pipeline com status "Ativo". O operador pode adicionar observações, verificar dados do tutor, e acompanhar o andamento.

**Responsável:** Operador da unidade

**Onde clica:** Menu lateral → **Pipeline** → card do contrato

**Por trás:**
- Tabela `contratos` com `status = 'ativo'`
- Tags de pendência mostram o que falta (quando habilitado)
- Observações salvas na tabela `tarefas`

---

## 6. PET É COLETADO/RECEBIDO NA UNIDADE

**O que acontece:**
O pet é coletado na residência/clínica ou o tutor traz até a unidade. O operador confirma o recebimento, coloca o lacre, e registra no sistema.

**Responsável:** Operador da unidade (quem faz a remoção)

**Onde clica:** Pipeline → abre o contrato → preenche número do lacre, confirma dados do pet

**Por trás:**
- Atualiza campos do contrato: `numero_lacre`, `data_acolhimento`, `local_coleta`, `clinica_coleta`
- Se tutor quer velório, agenda
§esses campos eu achava que ja preenchia no processamento da ficha, não? se não.. é bom já preencher... mas similar ao lacre, se não souber na hora, pode preencher depois da ficha criada.
§preciamos na ficha id disponibilizar um contrato padrão com os dados para cada unidade. quando chegar nessa pendência, nós fazemos.
---

## 7. UNIDADE ENVIA PRA MATRIZ (STATUS: PINDA)

**O que acontece:**
Quando tem pets suficientes (ou urgência), a unidade monta um encaminhamento (supinda) e envia os pets pra Matriz/Pinda pra cremação.

**Responsável:** Operador da unidade

**Onde clica:** Pipeline → contrato → muda status pra **Pinda** (ou via Encaminhamentos → criar supinda)
§vamos deixar esse fluxo somente na aba de encaminhamentos. tipo: ele mostra todos pets na unidade, ai pode selecionar todos, com alguns, ou selecionar todos depois desmarcar alguns, ai aparece um botão de fechar encaminhamento, ele gera um numero com o codigo 2 letras da unidade+numeração, ex: ST145... todas as outras unidades vão começar com 1, exemplo PA1, e vai subindo. fazer isso automático.

**Por trás:**
- Status do contrato muda pra `pinda`
- Contrato pode ser vinculado a uma `supinda` (viagem)
- **Card GC aparece** no detalhe do contrato (por enquanto vazio, aguardando recebimento na Matriz)
- Contrato aparece no **Kanban GC** da Matriz na coluna da unidade

---

## 8. MATRIZ RECEBE O PET (GC: RECEBIDO)

**O que acontece:**
O pet chega na Matriz. O operador da Matriz confere o lacre e confirma o recebimento no sistema.
§aqui não deve registra data hora do recebimento, mas sim da conferencia.
**Responsável:** Operador da Matriz

**Onde clica:** Tela **GC** → card do pet → ou abre o contrato → card GC → botão **Confirmar Recebimento**

**Por trás:**
- Cria registro na tabela `contrato_gc` com `etapa = 'recebido'`
- Toggle de lacre conferido
- Observações da unidade aparecem como post-it amarelo
§não entendi isso do observações com post-it
---

## 9. CONTATO COM O TUTOR (GC: CONTATO TUTOR)

**O que acontece:**
A Matriz liga pro tutor pra confirmar a escolha de acompanhamento (vídeo-chamada ao vivo, vídeo gravado, presencial na Matriz, ou não deseja).

**Responsável:** Operador da Matriz

**Onde clica:** GC → avança pra **Contato Tutor** → seleciona tipo de acompanhamento

**Por trás:**
- Atualiza `contrato_gc.etapa = 'contato_tutor'`
- Salva `acompanhamento_confirmado` e `contato_tutor_em`
- Unidade vê em tempo real que o contato foi feito
§na primeira entrega, vamos fazer um toogle simples, que acende para a atendente da matriz se controlar se já entrou em contato. o que o cliente escolheu, sera proximas entregas com mais din din pra nois.
---

## 10. AGENDAMENTO DA CREMAÇÃO (GC: AGENDADO)

**O que acontece:**
A Matriz agenda o horário da cremação em um dos 3 fornos disponíveis.

**Responsável:** Operador da Matriz

**Onde clica:** GC → avança pra **Agendado** → seleciona forno (1/2/3) + data/hora

**Por trás:**
- Atualiza `contrato_gc.etapa = 'agendado'`
- Salva `forno` e `data_agendamento`
- Unidade vê: "Agendado — Forno 2, 26/03 às 14h"
§deixa essa funcionalidade desligada. mais din din mais pra frente.
---

## 11. PEDIDOS ESPECIAIS (GC: PEDIDOS ESPECIAIS)

**O que acontece:**
Se o tutor solicitou algo especial (molde de patinha, pelo extra, carimbo, itens pessoais), a Matriz executa antes da cremação.

**Responsável:** Operador da Matriz

**Onde clica:** GC → avança pra **Pedidos Especiais**

**Por trás:**
- Atualiza `contrato_gc.etapa = 'pedidos_especiais'`
- Rescaldos já existem na tabela `contrato_rescaldos` (vinculados ao contrato)
- Observações como "cremar com a manta rosa" ou "bichinho de pelúcia volta pro tutor" ficam no post-it amarelo
§essa funcionalidade desligada também.. mais din din
---

## 12. CREMAÇÃO (GC: CREMAÇÃO)

**O que acontece:**
A cremação é realizada no horário agendado. Se o tutor escolheu acompanhamento, é feito neste momento (vídeo-chamada, gravação, ou presencial).

**Responsável:** Operador da Matriz

**Onde clica:** GC → avança pra **Cremação**

**Por trás:**
- Atualiza `contrato_gc.etapa = 'cremacao'`
- Salva `data_cremacao` e `cremacao_por`
- Aparecem toggles de `cinzas_prontas` e `certificado_pronto`
§proximas entregas, com mais dindin
---

## 13. CINZAS E CERTIFICADO (GC: DISPONÍVEL)

**O que acontece:**
Após a cremação:
- **Individual:** cinzas são acomodadas na urna + certificado é gerado
- **Coletiva:** apenas certificado é gerado (cinzas vão pro jardim)

Tudo é colocado no nicho da unidade de origem, aguardando retorno.

**Responsável:** Operador da Matriz

**Onde clica:** GC → marca **Cinzas prontas** (IND) + **Certificado pronto** → avança pra **Disponível**

**Por trás:**
- Atualiza `contrato_gc.etapa = 'disponivel'`
- Toggles: `cinzas_prontas = true`, `certificado_pronto = true`
- Certificado pode ser impresso direto da ferramenta (template existente)
- Unidade vê: "Disponível — Cinzas ✓ Certificado ✓"
§vamos fazer um toogle simples de não cremado apagado, e o operador clica, e finaliza. depois incrementamos com mais din din.
---

## 14. RETORNO PRA UNIDADE (STATUS: RETORNO)

**O que acontece:**
A Matriz monta uma supinda de retorno e envia cinzas + certificado de volta pra unidade. O contrato sai do GC.
§chamaremos sempre de encaminhamento, em tela e em manual do usuario. se temos algo em banco, manter supinda.
**Responsável:** Operador da Matriz

**Onde clica:** Contrato → muda status pra **Retorno**

**Por trás:**
- Status do contrato muda pra `retorno`
- **Card some do Kanban GC** (BUAAA 💨)
- Contrato pode ser vinculado a uma supinda de retorno
- Unidade vê o contrato de volta no pipeline com status "Retorno"
§na real, pinda vai só finalizar tudo... quem vai ser o responsavel por trazer fisicamente e logicamente as cinzas e certificados, será o operador da unidade. ele vai clicar em cada uma, ja temos isso feito.. 
---

## 15. UNIDADE RECEBE O RETORNO

**O que acontece:**
A unidade recebe as cinzas + certificado + urna. Confere tudo e agenda a entrega pro tutor.

**Responsável:** Operador da unidade

**Onde clica:** Pipeline → contrato em status "Retorno" → confere itens

**Por trás:**
- Contrato continua com `status = 'retorno'`
- Operador pode verificar produtos, certificado, etc.
§vamos apagar para outras unidades as facilities de montagem in line, facil, medio dificil.
---

## 16. ENTREGA PRO TUTOR

**O que acontece:**
A unidade entrega as cinzas, urna e certificado pro tutor. Pode ser na unidade ou via rota de entrega.

**Responsável:** Operador da unidade

**Onde clica:** Pipeline → contrato → registra entrega → muda status pra **Pendente** (se tem pendência financeira) ou **Finalizado**

**Por trás:**
- Atualiza `data_entrega`
- Se pagamento completo: `status = 'finalizado'`
- Se falta pagamento: `status = 'pendente'`
- Protocolo de entrega pode ser impresso (template existente)
§não temos estes botões de ação ainda, temos?
---

## 17. FINALIZAÇÃO

**O que acontece:**
Tudo entregue e pago. Contrato encerrado.

**Responsável:** Operador da unidade

**Onde clica:** Pipeline → contrato pendente → confirma pagamento → muda status pra **Finalizado**

**Por trás:**
- `status = 'finalizado'`
- Contrato sai do pipeline ativo
- Fica disponível no histórico pra consulta
§tambem não temos botão e inserção ainda
---

## RESUMO DO FLUXO

```
SITE/WHATSAPP          UNIDADE                    MATRIZ                   UNIDADE
─────────────          ───────                    ──────                   ───────
1. Lead chega    →  2. Atendente fecha
                    3. Tutor preenche ficha
                    4. Processa ficha → Contrato (ATIVO)
                    5. Pipeline
                    6. Coleta + lacre
                    7. Envia pra Matriz (PINDA)
                                           →  8. Recebe (GC)
                                              9. Contato tutor
                                             10. Agenda forno
                                             11. Pedidos especiais
                                             12. Cremação
                                             13. Cinzas + certificado (DISPONÍVEL)
                                             14. Retorno (BUAAA 💨)
                                                                    → 15. Recebe retorno
                                                                       16. Entrega pro tutor
                                                                       17. Finalizado ✓
```

---

## STATUS DO CONTRATO (em ordem)

| Status | Onde fica | Quem controla |
|--------|----------|---------------|
| `ativo` | Pipeline da unidade | Unidade |
| `pinda` | Pipeline da unidade + GC da Matriz | Matriz (GC) |
| `retorno` | Pipeline da unidade | Unidade |
| `pendente` | Pipeline da unidade | Unidade |
| `finalizado` | Histórico | — |

---

## TABELAS ENVOLVIDAS (em ordem de uso)

| Tabela | Quando é usada |
|--------|---------------|
| `leads` | Etapa 1 — lead capturado do site |
| `sessions` | Etapa 1 — tracking de visita |
| `fichas` | Etapa 3-4 — ficha digital preenchida |
| `tutores` | Etapa 4 — criado/vinculado ao processar ficha |
| `contratos` | Etapa 4-17 — registro principal |
| `tarefas` | Etapa 5+ — observações e pendências |
| `contrato_gc` | Etapa 8-13 — tracking na Matriz |
| `contrato_rescaldos` | Etapa 11 — pedidos especiais |
| `supindas` | Etapa 7, 14 — viagens de ida/volta |
| `contrato_produtos` | Quando habilitado — produtos vinculados |
| `pagamentos` | Quando habilitado — pagamentos recebidos |

---

*Documento gerado em Março/2026 — Fluxo da Entrega 1 (Fichas + Pipeline + GC)*
