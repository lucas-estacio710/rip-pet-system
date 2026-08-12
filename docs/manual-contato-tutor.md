# 📞 Manual — Contato do Tutor

Guia operacional pra equipe entender como funcionam os telefones do tutor desde a ficha pública até a edição no contrato.

---

## 1️⃣ Tutor preenche a ficha pública

O tutor coloca **um telefone** na ficha. É só esse campo na hora.

## 2️⃣ Concierge processa a ficha (vira contrato)

Na hora de processar, o concierge tem que responder uma pergunta importante: **"Esse número é o do tutor mesmo, ou é de outra pessoa que está ajudando?"**

### 🟢 Cenário fácil — Ana entra pelo próprio pet

- A Ana preencheu com o número dela mesma.
- Concierge marca **"Sim, é este"** e digita o apelido **"Ana"**.
- Pronto: o número da ficha vira o principal, com apelido Ana.

### 🟡 Cenário comum — Ana ajudando o Rui (tutor)

- A Ana preencheu a ficha pelo Rui, mas botou o telefone do Rui (não dela).
- Concierge marca **"Sim, é este"** + apelido **"Rui"**.
- Tudo certo: o número da ficha = do tutor.

### 🔴 Cenário terrível — Ana é namorada do Rui (em luto), mas botou o tel dela

- O tel da ficha é da Ana, e o tutor é o Rui.
- Concierge marca **"Não, é outro"** → abre 2º campo.
- Cola o tel da Ana (ou re-confirma) + apelido **"Ana — namorada do tutor"**.
- O sistema entende: o tel da ficha ficou guardado, mas o **principal pra Matriz ligar** é o da Ana.

## 3️⃣ Depois que vira contrato

Tudo pode mudar — luto é assim. A vida do contato muda. Agora dá pra editar **direto no contrato** (página `/contratos/[id]`):

### 📝 Editar o apelido (do tel1 ou tel2)

- Clica no lápis ✏️ ao lado de "Ficha" ou "Processado" → digita novo apelido → Enter (ou ✓).
- Use isso quando: *"agora é a mãe do Rui que atende esse telefone"*.

### 🔢 Trocar o número do tel2

- Clica no lápis ✏️ ao lado do **número** do tel2 → abre modal pra editar número + DDI + apelido.
- Use isso quando: *a Ana terminou com o Rui, agora a mãe dele assumiu, e ela tem outro número*.

### 🗑️ Remover o tel2

- Clica no ícone de lixeira → confirma.
- Se o tel2 era o principal, vira o tel1 automaticamente.
- Use isso quando: o contato extra não responde mais ou não é mais relevante.

### 🟢 Trocar qual é o "Mais ativo"

- Clica em "Tornar ativo" no que está cinza.
- Use isso quando: *"agora a Matriz precisa ligar pro outro número"*.

## ⚠️ Regra importante (não esquecer)

**O número do tel1 (da ficha) NUNCA pode ser apagado nem trocado.** Só o apelido pode mudar.

Por quê? Histórico. O tel1 é a "fonte" da ficha original — se sumir, perdemos o rastro de quem realmente entrou em contato no momento da emergência. Se o tutor agora atende em outro número, **adicione o tel2** e marque ele como ativo.

## 🎯 Casos práticos resumidos

| Situação real | O que fazer |
|---------------|-------------|
| Cliente confirmou que o número é dele mesmo | Modal Tratativa: "Sim, é este" + apelido |
| Cliente disse que outro vai atender | Modal Tratativa: "Não, é outro" + número + relação |
| Após 3 dias, "agora pode falar comigo" (tutor) | Contrato: "Tornar ativo" no tel1 |
| O tel2 era a namorada, agora é a mãe | Contrato: lápis no número do tel2 → trocar |
| Errou o apelido do tel1 | Contrato: lápis no apelido (do "Ficha") |
| Não vai precisar do tel2 nunca mais | Contrato: lixeira no tel2 |

---

# 🔗 Como a edição no contrato se conecta com o cadastro do tutor

## O conceito-chave

Pensa no **tutor como um cadastro central** (tipo uma "ficha" única). Cada **contrato é uma compra/atendimento** ligado a esse tutor.

Um tutor pode ter vários contratos:
- 🐶 Rex (preventivo, contratado em 2024)
- 🐱 Mimi (emergencial, contratado em 2025)
- 🐰 Pipoca (preventivo, contratado em 2026)

Os 3 contratos apontam pro mesmo cadastro de tutor.

## Quando você edita pelo contrato

Quando você muda **apelido**, **tel2** ou **remove tel2** no `/contratos/[id]`, o sistema atualiza **duas coisas ao mesmo tempo**:

1. **O cadastro central do tutor** (tabela `tutores`)
2. **O snapshot dentro desse contrato específico** (campos `tutor_*` dentro do contrato)

## Como isso aparece nos outros contratos do mesmo tutor

**Cenário:** O tutor Rui tem o contrato do Rex (2024) e do Mimi (2026). Você abre o contrato do Mimi (2026) e muda o apelido do tel1 de "Rui" pra "Sr. Rui".

**O que acontece:**

- ✅ No contrato do Mimi → mostra "Sr. Rui" (você acabou de mudar)
- ✅ No cadastro central do tutor → agora também tá "Sr. Rui"
- ✅ **No contrato do Rex (2024)** → também passa a mostrar "Sr. Rui" da próxima vez que abrir!

Isso porque a tela lê **primeiro do cadastro central**, e só usa o snapshot do contrato como segurança (caso o central não exista por algum motivo).

## Por que é assim

**Vantagem:** se o Rui trocar de tel ou apelido, você só precisa mudar uma vez — todos os contratos passados/futuros já refletem.

**Cuidado:** se você editar pensando *"vou ajustar só este contrato"*, lembre que a mudança propaga pra **todos os contratos do mesmo tutor**. Não dá pra ter "Rui" no contrato do Rex e "Sr. Rui" no contrato do Mimi — é sempre o mesmo apelido em todos.

## Resumo visual

```
[Tutor central: Rui]
    ├── tel1: (12) 99999-1111  apelido: "Sr. Rui"  ← FONTE
    ├── tel2: (12) 88888-2222  apelido: "Maria — mãe"
    └── principal: 1
         ↓ é lido por
    ↓
[Contrato Rex 2024]    → exibe: tel1 "Sr. Rui"  ✅ (puxa do central)
[Contrato Mimi 2026]   → exibe: tel1 "Sr. Rui"  ✅ (puxa do central)
[Contrato Pipoca 2026] → exibe: tel1 "Sr. Rui"  ✅ (puxa do central)
```

## ⚠️ Exceção conhecida (problema 11-A em aberto)

**Hoje há um buraco:** quando o concierge processa uma ficha e o tutor **já existe** (foi detectado pelo CPF), o sistema **NÃO atualiza** o cadastro central com os novos dados que o concierge digitou no Tratativa Modal.

**Sintoma:** se o Rui virar tutor em 2024 com tel "Rui", e em 2026 chegar uma ficha nova dele com tel novo + apelido "Sr. Rui":

- O contrato novo (2026) recebe "Sr. Rui" no snapshot ✅
- Mas o cadastro central do tutor **continua** com "Rui" ❌
- Outros contratos antigos continuam mostrando "Rui" porque puxam do central desatualizado

**Como contornar hoje:** edite pelo `/contratos/[id]` — isso sincroniza ambos. Cura o efeito do bug 11-A caso a caso.

**Fix definitivo do 11-A** (criar contrato com tutor existente também sincronizar): pendente, anotado no roadmap.
