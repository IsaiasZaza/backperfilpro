# PerfilPro API

Backend REST do PerfilPro: autenticacao, builder de pagina (blocos) e pagina publica estilo Linktree.

Stack: **Node.js + Express 5 + TypeScript + Neon (`@neondatabase/serverless`) + SQL puro**.

Sem Prisma. As queries sao SQL em `src/modules/*` e o schema fica em `db/migrations/`.

---

## Setup rapido

```bash
npm install

# 1) copie o env e cole a DATABASE_URL do Neon (connection string POOLED)
cp .env.example .env

# 2) cria as tabelas no Neon (via WebSocket — evita P1001 do Prisma)
npm run db:migrate

# 3) dados de demonstracao
npm run db:seed

# 4) sobe a API
npm run dev
```

- API: http://localhost:3333
- Swagger: http://localhost:3333/docs

### DATABASE_URL

No Neon Console, copie a connection string **pooled** com `sslmode=require`:

```env
DATABASE_URL="postgresql://USER:PASS@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
```

Nao use `channel_binding=require`.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe a API com hot reload |
| `npm run db:migrate` | aplica `db/migrations/*.sql` |
| `npm run db:seed` | cria `maria@demo.com` (Premium) |
| `npm run stripe:setup` | cria produtos Pro/Premium na Stripe |
| `npm test` | e2e |

---

## Usuario demo (seed)

| Campo | Valor |
|---|---|
| E-mail | `maria@demo.com` |
| Senha | `Demo1234!` |
| Pagina | `GET /p/maria-oliveira` |

---

## Autenticacao

- O **cadastro exige um plano** (`PRO` ou `PREMIUM`) e **nao devolve token**.
- A API cria a sessao de checkout da Stripe com **7 dias gratis**. Depois do trial/pagamento, use `/auth/login`.
- Login/refresh so funcionam com assinatura `TRIALING`, `ACTIVE` ou `PAST_DUE`.
- Rotas `/me/*` aceitam `Authorization: Bearer <token>` ou o cookie, e tambem exigem plano ativo.

Resposta padrao:

```json
{ "data": { }, "error": null }
```

---

## Assinaturas (Stripe)

Planos mensais em BRL:

| Plano | Preco | Trial |
|---|---|---|
| Pro | R$ 20,00 | 7 dias |
| Premium | R$ 39,00 | 7 dias (somente na 1a assinatura) |

```bash
# 1) cole STRIPE_SECRET_KEY (sk_test_...) no .env
# 2) cria produtos/precos e imprime STRIPE_PRICE_PRO / STRIPE_PRICE_PREMIUM
npm run stripe:setup

# 3) encaminha webhooks para a API local
stripe listen --forward-to localhost:3333/billing/webhook
# cole o whsec_... em STRIPE_WEBHOOK_SECRET
```

Fluxo:

1. `POST /auth/register` com `plan` → `{ checkoutUrl }`
2. Usuario paga/inicia trial na Stripe
3. Webhook `checkout.session.completed` / `customer.subscription.*` grava a assinatura
4. `POST /auth/login` libera o painel
5. Troca/cancelamento: `POST /billing/change-plan`, `/cancel`, `/resume` ou `/portal`

Sem plano ativo a pagina publica (`GET /p/:username`) tambem some.

---

## Regras de negocio

1. No register, cria `Profile` DRAFT com username `user-<id>`.
2. Username livre em DRAFT; apos PUBLISHED, no maximo 1 troca.
3. Publicar exige username definitivo, displayName e 1 bloco visivel.
4. `GET /p/:username` so retorna PUBLISHED **e** dono com plano ativo.
5. Cadastro exige plano; login e `/me/*` exigem assinatura ativa (trial conta).

---

## Endpoints (resumo)

Auth: `/auth/register|login|logout|refresh|forgot-password|reset-password|me`

Billing: `/billing/plans`, `/checkout`, `/confirm-session`, `/subscription`, `/change-plan`, `/cancel`, `/resume`, `/portal`, `/webhook`

Perfil: `/me/profile`, `/publish`, `/unpublish`, `/preview`, `/avatar`

Blocos: `/me/profile/blocks` (+ `/reorder`, `/:id`)

Servicos / Depoimentos: `/me/profile/services`, `/me/profile/testimonials`

Publico: `/p/:username`, `/usernames/check?username=`

Veja exemplos completos em `/docs`.

---

## Estrutura

```
db/
  migrations/001_init.sql
  migrations/002_subscriptions.sql
  migrate.ts
  seed.ts
src/
  db/client.ts
  db/types.ts
  modules/auth|billing|profile|blocks|services|testimonials|public/
```
