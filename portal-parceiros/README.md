# RIP Pet Parceiros

Portal dos parceiros (veterinários, recepcionistas, auxiliares, gerentes e proprietários
de clínicas) que indicam a RIP Pet.

- **Produção:** `parceiro.rippet.com.br` (projeto Vercel separado, root = `portal-parceiros/`)
- **Dev:** `npm run dev` → http://localhost:3001 (o CRM usa a 3000; não conflita)
- **Requisitos:** `../docs/PORTAL_PARCEIROS_REQUISITOS.md` (decisões 1–41, numeradas)
- **Banco:** mesmo Supabase do CRM. Migrations `099` (segurança) e `100` (fundação).

## A regra que não se quebra

O client **nunca** fala com o banco. A chave anon existe só para o fluxo de login;
todas as tabelas `parceiro_*` são **deny-all** (RLS ligado, zero policies). Todo dado
entra e sai por `/api/*`, que usa `service_role` **depois** de validar a sessão com
`getParceiroSessao()`.

`contato_id` e `unidade_id` saem **sempre** da sessão, nunca do corpo da request —
caso contrário um parceiro trocaria o id e leria o extrato (ou a chave pix) de outro.

Se um dia parecer que "seria mais simples liberar uma policy de leitura", a resposta
certa é criar uma API route. Foi exatamente o atalho oposto (policies `authenticated`
genéricas + middleware que só checa se há usuário) que abriu o buraco no CRM,
corrigido na migration 099.

## Estrutura

```
src/
├── middleware.ts          # só sessão + refresh. Autorização real fica nas rotas.
├── lib/
│   ├── sessao.ts          # getParceiroSessao() — o guarda de entrada de toda API
│   ├── categoria.ts       # ano móvel, faixas, valor da comissão
│   ├── tipos.ts           # espelho de parceiro_config + lista de cargos
│   └── supabase/
│       ├── admin.ts       # service_role — server-only
│       ├── server.ts      # anon SSR — só para ler a sessão
│       └── client.ts      # anon browser — só login/logout
└── app/
    ├── entrar/            # Google + e-mail/senha
    ├── auth/callback/     # troca o code do OAuth pela sessão
    ├── sem-acesso/        # autenticado, mas não é parceiro / módulo desligado
    ├── api/me/            # perfil + a CONTA da categoria
    └── page.tsx           # home
```

## Variáveis de ambiente

Copie `.env.local.example` para `.env.local`. Os valores são os mesmos do
`web/.env.local`. `SUPABASE_SERVICE_ROLE_KEY` **nunca** recebe prefixo `NEXT_PUBLIC_`.

## Estado atual — fases 1 a 7 concluídas

| Fase | Entrega |
|------|---------|
| 1 | Configuração, autenticação (Google + e-mail/senha), sessão segura, home |
| 2 | Convite por QR e onboarding em duas etapas, com termos |
| 3 | Catálogo, wizard de orçamento, link do tutor e pré-ficha |
| 4 | Comissão automática por categoria + bilhete, na criação do contrato |
| 5 | Extrato do parceiro e fila de pagamentos com comprovante |
| 6 | Sorteio, member-get-member e reivindicações |
| 7 | Materiais, Orquestrador e as três rotinas de cron |

Ícones do PWA: os mesmos do CRM (copiados de `web/public` em 30/07/2026).

## Rotinas automáticas

`vercel.json` agenda três chamadas para `/api/cron`:

| Tarefa | Quando | O que faz |
|--------|--------|-----------|
| `expirar-orcamentos` | de hora em hora | fecha orçamento vencido para o link não parecer válido |
| `recalcular-categorias` | diário, 6h20 | reavalia Bronze/Prata/Ouro no ano móvel |
| `fechar-mes` | dia 1, 6h40 | abre o sorteio do mês novo nas unidades ativas |

Todas exigem `CRON_SECRET` no header — sem ele respondem 401.

## Ativar o programa numa unidade

O portal só responde a unidades com o módulo ligado — é o kill switch:

```sql
UPDATE unidades
SET modulos_ativos = array_append(modulos_ativos, 'cb_portal_parceiros')
WHERE codigo = 'ST' AND NOT ('cb_portal_parceiros' = ANY(modulos_ativos));
```

Sem isso, convite e login respondem "programa indisponível nesta região". Só ligue
quando as telas que o parceiro vai usar existirem — a home leva pra `/orcar` e
`/extrato`, que ainda não foram construídas.
