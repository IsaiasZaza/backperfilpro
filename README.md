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
| `npm run db:seed` | cria `maria@demo.com` |
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

- Register/login devolvem `accessToken` e cookies httpOnly `pp_access_token` / `pp_refresh_token`.
- Rotas `/me/*` aceitam `Authorization: Bearer <token>` ou o cookie.

Resposta padrao:

```json
{ "data": { }, "error": null }
```

---

## Regras de negocio

1. No register, cria `Profile` DRAFT com username `user-<id>`.
2. Username livre em DRAFT; apos PUBLISHED, no maximo 1 troca.
3. Publicar exige username definitivo, displayName e 1 bloco visivel.
4. `GET /p/:username` so retorna PUBLISHED.

---

## Endpoints (resumo)

Auth: `/auth/register|login|logout|refresh|forgot-password|reset-password|me`

Perfil: `/me/profile`, `/publish`, `/unpublish`, `/preview`, `/avatar`

Blocos: `/me/profile/blocks` (+ `/reorder`, `/:id`)

Servicos / Depoimentos: `/me/profile/services`, `/me/profile/testimonials`

Publico: `/p/:username`, `/usernames/check?username=`

Veja exemplos completos em `/docs`.

---

## Estrutura

```
db/
  migrations/001_init.sql   # schema SQL
  migrate.ts                # runner de migrations
  seed.ts
src/
  db/client.ts              # Pool Neon (WebSocket)
  db/types.ts
  modules/auth|profile|blocks|services|testimonials|public/
```
