# 🎯 MÉTODO DAS SETINHAS — Editor visual de posições sobre imagem

> **Termos de busca / sinônimos** (procure por qualquer um destes quando precisar disto de novo):
> `método das setinhas` · `metodo das setinhas` · `editor visual de posições` · `editor estilo PPT` ·
> `posicionar campos sobre template` · `ajuste fino de coordenadas` · `overlay de texto sobre imagem` ·
> `arrow-method` · `setinhas` · `ficha de remoção template` · `template PNG` · `html2canvas posicionamento` ·
> `mover elementos com setas` · `editor de coordenadas x/y` · `alinhar texto na linha do template` ·
> `gerar log de pixels` · `página de teste de render` · `teste-ficha`

---

## O que é

Técnica/ferramenta pra **posicionar com precisão textos/campos por cima de uma imagem de template**
(ex: a Ficha de Remoção, que é um PNG de fundo + `<div>`s absolutos com `top/left` em cima).

Em vez de chutar coordenadas no código → recarregar → conferir → repetir, a gente cria uma
**página de editor temporária** onde dá pra:

1. **Clicar** num campo pra selecioná-lo (estilo PowerPoint)
2. Mover com **4 botões de seta** (↑ ↓ ← →), com **passo** ajustável (1/2/5 px)
3. Ver um **log de alterações** (`campo: top X→Y (Δ) · left X→Y (Δ)`) pronto pra copiar
4. **"Ver captura real"** — renderiza com o MESMO `html2canvas` do fluxo de produção pra conferir fiel

O usuário (Lucão) move tudo no editor, copia o log, e o Claude aplica as coordenadas no componente real.

## ⚠️ Aprendizados críticos (não repetir os erros)

1. **NÃO use `transform: scale()` na página de teste.** Ele desloca o texto em relação à imagem de um
   jeito que NÃO corresponde ao `html2canvas`. Pra ampliar, use o **zoom do navegador (Ctrl +)** — esse é fiel.
2. **O render do navegador (DOM) ≠ `html2canvas`.** O fluxo real captura via `html2canvas` (a ficha vira
   imagem/PDF). Pequenas diferenças de baseline/line-height fazem o DOM ao vivo parecer diferente do download.
   → A **fonte da verdade** é o botão **"Ver captura real"** (mesmas opções: `{ scale: 2, backgroundColor: '#ffffff', useCORS: true }`).
3. **Confira as dimensões reais do PNG** (`python -c "import struct;..."`) e use-as como o espaço de
   coordenadas. A Ficha de Remoção é **398×512**.
4. A imagem capturada é **2× (scale:2)** → no overlay de grade, `y_original * 2 = y_pixel`.

## Receita (como recriar o editor)

Crie uma rota temporária `web/src/app/teste-XXX/page.tsx` (`'use client'`). Pastas com `_` no início
NÃO viram rota no App Router — use nome normal (ex: `teste-ficha`). Estrutura:

- `CAMPOS_INICIAIS: Campo[]` — espelha as posições atuais do componente real (`{ key, label, top, left, width?, text, size?, bold?, ... }`).
- `useState(campos)` + `sel` (campo selecionado) + `passo`.
- **Canvas editável** (`width/height` = dims do PNG, `position: relative`): `<img>` do template + um `<div absolute>` por campo (replicando o estilo do componente real — no caso, o `BASE_FIELD`: `fontFamily:'Arial', fontSize:11, color:'#1d4ed8', lineHeight:1.4`). `onClick` seleciona; outline amarelo no selecionado.
- **Setas** chamam `mover(dx,dy)` que soma no `top/left` do campo selecionado.
- **Log** (`useMemo`): compara `campos` vs `CAMPOS_INICIAIS`, lista só os mudados com Δ. Botão copiar (`navigator.clipboard`).
- **"Ver captura real"**: `html2canvas(canvasRef.current, { scale: 2, backgroundColor:'#ffffff', useCORS:true })` → `toDataURL` → `<img>`. Espere ~300-600ms antes (o template precisa carregar).
- **Grade** opcional: `repeating-linear-gradient` a cada 10px + rótulos a cada 50px (em coordenadas reais).

> O código completo da última vez está no histórico do git do componente alvo e na conversa do Claude.
> Se precisar, peça pro Claude "recriar o editor método das setinhas pra <tela>".

## Processo (passo a passo)

1. Usuário edita o **PNG** (Paint etc.) adicionando rótulos/linhas dos campos novos, salva no mesmo caminho.
2. Claude lê o PNG (consegue ver a imagem) e ajusta o componente (campos novos + compressões).
3. Claude cria a **página editor** (método das setinhas) com dados fake completos.
4. Usuário move tudo no editor, confere com **"Ver captura real"**, copia o **log**.
5. Claude aplica as coordenadas no componente real + atualiza a baseline do editor.
6. Repete o ciclo de "últimos ajustes" até 100%.
7. Claude **apaga a página de teste**, commita o componente + o **PNG** (versionado → produção).

## Onde isso já foi usado

- **Ficha de Remoção** (`web/src/components/fichas/FichaRemocao.tsx` + `web/public/images/ficha-remocao-template.png`) — jun/2026: adição de Tel/Cont + Cidade Acolhimento, compressão dos 7 tutores.

## Aplicável a

Qualquer documento que seja **template de imagem + overlay de texto posicionado**: contratos, certificados,
protocolos, etiquetas, fichas — qualquer render que vire imagem/PDF via `html2canvas`.
