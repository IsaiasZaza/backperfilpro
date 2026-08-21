# PerfilPro API — guia para o Frontend

Base URL (dev): `http://localhost:3333`  
Swagger: `http://localhost:3333/docs`  
Formato das respostas: sempre `{ "data": ..., "error": null }` ou `{ "data": null, "error": { "code", "message" } }`

---

## 1. Env do Next.js

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

No backend, o CORS já libera `http://localhost:3000`:

```env
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

---

## 2. Cliente HTTP sugerido

```ts
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type ApiOk<T> = { data: T; error: null };
type ApiErr = { data: null; error: { code: string; message: string; details?: unknown } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include", // cookies httpOnly
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || json.error) {
    const err = new Error(json.error?.message ?? "Erro na API") as Error & {
      code?: string;
      status?: number;
    };
    err.code = json.error?.code;
    err.status = res.status;
    throw err;
  }

  return json.data;
}
```

**Obrigatório:** `credentials: "include"` para enviar/receber cookies.

Autenticação aceita:
- cookie `pp_access_token` (setado no login/register), **ou**
- header `Authorization: Bearer <accessToken>`

---

## 3. Auth

### POST `/auth/register`
```json
{
  "name": "Maria Oliveira",
  "email": "maria@demo.com",
  "password": "Demo1234!",
  "confirmPassword": "Demo1234!",
  "plan": "PRO"
}
```
`plan` e obrigatorio: `PRO` ou `PREMIUM`.

Resposta (`201`): `{ user, checkoutUrl, sessionId, plan, trialGranted, trialDays }` — **sem accessToken**.

Redirecione o usuario para `checkoutUrl` (Stripe Checkout, 7 dias gratis na primeira assinatura). Depois que a Stripe confirmar, chame `/auth/login`.

Se o checkout for abandonado, use `POST /billing/checkout` com e-mail, senha e plano.

### POST `/auth/login`
```json
{ "email": "maria@demo.com", "password": "Demo1234!" }
```
Resposta: `{ user, accessToken, subscription }` + cookies.

**402 `SUBSCRIPTION_REQUIRED`** se nao houver plano ativo (trial, active ou past_due). Nesse caso mande a pessoa para o checkout.

### POST `/auth/logout`
Encerra sessão e limpa cookies.

### POST `/auth/refresh`
Renova tokens. Tambem exige plano ativo (402 se a assinatura caiu).

### POST `/auth/forgot-password`
```json
{ "email": "maria@demo.com" }
```
Em dev o link aparece no terminal do backend.

### POST `/auth/reset-password`
```json
{
  "token": "...",
  "password": "NovaSenha123!",
  "confirmPassword": "NovaSenha123!"
}
```

### GET `/auth/me`
Usuário logado + resumo do profile + `subscription`.

---

## 3.1 Billing (Stripe)

Guia completo para montar as telas no Next.js: **[FRONTEND-PLANOS.md](./FRONTEND-PLANOS.md)** (rotas, tipos, 402, checkout, trial, portal).

Planos: **Pro R$ 20,00/mes** e **Premium R$ 39,00/mes**, ambos com **7 dias gratis** na primeira assinatura. O cartao e coletado no checkout; a Stripe cobra quando o trial acaba.

| Método | Rota | Auth | Uso |
|---|---|---|---|
| GET | `/billing/plans` | nao | Catalogo dos planos |
| POST | `/billing/checkout` | nao | `{ email, password, plan }` → `{ checkoutUrl }` |
| POST | `/billing/confirm-session` | nao | `{ sessionId }` sincroniza se o webhook atrasar |
| GET | `/billing/subscription` | sim | Assinatura atual |
| POST | `/billing/change-plan` | sim + plano | `{ plan: "PREMIUM" }` (prorata) |
| POST | `/billing/cancel` | sim + plano | Cancela no fim do periodo |
| POST | `/billing/resume` | sim + plano | Desfaz o cancelamento |
| POST | `/billing/portal` | sim | `{ portalUrl }` Customer Portal (cartao/faturas) |

Apos o checkout, a Stripe redireciona para:

`{FRONTEND_URL}/login?checkout=success&session_id={CHECKOUT_SESSION_ID}`

Fluxo sugerido no FE:

1. Tela de planos → register com `plan`
2. Redirect para `checkoutUrl`
3. Volta no login → `POST /auth/login`
4. Se o login vier 402, chame `/billing/checkout` de novo
5. Painel: `GET /auth/me` le `subscription.plan`, `isTrialing`, `currentPeriodEnd`, `cancelAtPeriodEnd`
6. Premium esconde a marca: `showBranding === false` na pagina publica

`subscription.grantsAccess` e `true` para `TRIALING`, `ACTIVE` e `PAST_DUE`.

---

## 4. Perfil / builder (precisa auth)

| Método | Rota | Uso |
|---|---|---|
| GET | `/me/profile` | Dados do perfil |
| PUT | `/me/profile` | Atualizar (username, displayName, bio, location, theme, avatarUrl) |
| POST | `/me/profile/publish` | Publicar página |
| POST | `/me/profile/unpublish` | Voltar para rascunho |
| GET | `/me/profile/preview` | Preview (mesmo shape da pública, inclui ocultos) |
| POST | `/me/profile/avatar` | Upload multipart campo `file` |

Exemplo PUT:
```json
{
  "username": "maria-oliveira",
  "displayName": "Maria Oliveira",
  "headline": "Lash Designer",
  "bio": "Atendo com hora marcada",
  "location": "Brasília - DF",
  "theme": {
    "primaryColor": "#7C3AED",
    "buttonStyle": "pill",
    "font": "sans"
  }
}
```

### Regras
- No cadastro já nasce um Profile `DRAFT` com username temporário `user-...`
- Username livre enquanto `DRAFT`
- Depois de `PUBLISHED`, username pode mudar **no máximo 1x**
- Publicar exige: username definitivo (não `user-*`), `displayName` e ≥ 1 bloco visível

---

## 5. Blocos (editor estilo WordPress)

| Método | Rota |
|---|---|
| GET | `/me/profile/blocks` |
| POST | `/me/profile/blocks` |
| PATCH | `/me/profile/blocks/:id` |
| DELETE | `/me/profile/blocks/:id` |
| PUT | `/me/profile/blocks/reorder` |

### Criar bloco
```json
{
  "type": "WHATSAPP",
  "content": {
    "phone": "5561999999999",
    "message": "Oi! Vi seu perfil"
  }
}
```

### Tipos e `content`

| type | content |
|---|---|
| `HERO` | `{ name?, headline?, bio?, avatarUrl?, location? }` |
| `CTA_BUTTON` | `{ label, url, style: "primary"\|"secondary"\|"outline" }` |
| `LINK_BUTTON` | `{ label, url, icon? }` |
| `WHATSAPP` | `{ phone, message?, label? }` (phone só dígitos c/ DDI) |
| `SOCIAL` | `{ items: [{ network, url }] }` — network: `instagram\|facebook\|tiktok\|youtube\|linkedin\|x\|site` |
| `SERVICES` | `{ heading }` (itens em `/services`) |
| `TESTIMONIALS` | `{ heading }` (itens em `/testimonials`) |
| `LOCATION` | `{ address, mapsUrl?, label? }` |

### Reordenar (drag and drop)
```json
[
  { "id": "uuid-bloco-1", "sortOrder": 0 },
  { "id": "uuid-bloco-2", "sortOrder": 1 }
]
```

Autosave do editor → `PATCH /me/profile/blocks/:id` com `{ content }` ou `{ isVisible }`.

---

## 6. Serviços

| Método | Rota |
|---|---|
| GET | `/me/profile/services` |
| POST | `/me/profile/services` |
| PATCH | `/me/profile/services/:id` |
| DELETE | `/me/profile/services/:id` |

```json
{
  "name": "Volume Brasileiro",
  "description": "Duração 2h",
  "priceCents": 18000
}
```
`priceCents`: R$ 180,00 → `18000`. A API também devolve `priceFormatted`.

---

## 7. Depoimentos

| Método | Rota |
|---|---|
| GET | `/me/profile/testimonials` |
| POST | `/me/profile/testimonials` |
| PATCH | `/me/profile/testimonials/:id` |
| DELETE | `/me/profile/testimonials/:id` |

```json
{
  "authorName": "Juliana Prado",
  "text": "Atendimento impecável!",
  "rating": 5
}
```

---

## 8. Público (sem auth)

### GET `/p/:username`
Página publicada. **404** se não existir ou estiver `DRAFT`.

Shape:
```ts
{
  username, displayName, headline, bio, avatarUrl, location,
  theme, status, publishedAt,
  blocks: Block[],
  services: Service[],
  testimonials: Testimonial[]
}
```

### GET `/usernames/check?username=maria-oliveira`
```json
{
  "available": true,
  "reason": null,
  "message": "Username disponivel"
}
```
`reason` pode ser: `INVALID_FORMAT` | `RESERVED` | `TAKEN` | `null`.

---

## 9. Usuário demo (seed)

| Campo | Valor |
|---|---|
| E-mail | `maria@demo.com` |
| Senha | `Demo1234!` |
| Plano | Premium (seed) |
| Página | `GET /p/maria-oliveira` |

---

## 10. Fluxo sugerido no FE

1. Escolher plano (Pro/Premium) e Register  
2. Stripe Checkout (7 dias gratis)  
3. Login  
4. Onboarding: escolher username (`PUT /me/profile` + `/usernames/check`)  
5. Preencher HERO / WhatsApp / serviços  
6. Preview (`GET /me/profile/preview`)  
7. Publicar (`POST /me/profile/publish`)  
8. Página pública (`GET /p/:username`)

---

## 11. Checklist de integração

- [ ] `NEXT_PUBLIC_API_URL` apontando para a API
- [ ] `credentials: "include"` em todas as requests
- [ ] Tratar `{ error: { code, message } }`
- [ ] Login com demo e abrir `/docs` se precisar do contrato
- [ ] Página pública via Server Component (pode `fetch` sem cookie)

---

## 12. Erros comuns

| Status | code | Significado |
|---|---|---|
| 401 | `UNAUTHORIZED` / `INVALID_CREDENTIALS` | Sem login / senha errada |
| 402 | `SUBSCRIPTION_REQUIRED` | Sem plano ativo (login, refresh ou `/me/*`) |
| 404 | `PAGE_NOT_FOUND` | Username inexistente, DRAFT ou dono sem plano |
| 409 | `USERNAME_TAKEN` / `EMAIL_ALREADY_USED` / `ALREADY_SUBSCRIBED` | Conflito |
| 422 | `VALIDATION_ERROR` | Body inválido (`details` com campos) |
| 429 | `TOO_MANY_REQUESTS` | Rate limit em login/forgot |
