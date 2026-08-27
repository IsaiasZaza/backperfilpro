# Prompt para o frontend — PerfilPro

Cole este arquivo no chat do agente/dev do **Next.js**. A API do PerfilPro mudou. Não invente campos. A API é a fonte da verdade.

- Base URL: `http://localhost:3333`
- CORS: `http://localhost:3000` com `credentials: "include"`
- Cookies httpOnly já autenticam. `accessToken` também vem no body.

Envelope de toda resposta:

```ts
{
  data: T | null
  error: { code: string; message: string; details?: unknown } | null
}
```

Env do Next.js (só isso):

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

**Proibido no frontend:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` para upload. O avatar **não** vai direto ao Supabase. O front envia o arquivo para a API.

---

## NOVO (obrigatório): foto de perfil / avatar

### O que mudou

Antes o editor mandava `avatarUrl` (string https) no `PUT /me/profile`.

Agora o fluxo oficial é:

```
<input type="file"> → FormData campo `file` → POST /me/profile/avatar → { avatarUrl, profile }
```

A API envia ao Supabase Storage, converte para **WEBP 256x256** e devolve a URL pública. Use **somente** o `avatarUrl` da resposta no `<img>`.

### O que NÃO fazer

- Não cole URL de Cloudinary/Unsplash/Imgur como fluxo principal de foto de perfil.
- Não faça upload direto ao Supabase no browser.
- Não exponha `SUPABASE_SERVICE_ROLE_KEY`.
- Não confie no nome original do arquivo; o back ignora.
- Não use `PATCH /users/:id`. Não existe essa rota. Tudo é `/me/profile/*` (o usuário só altera o próprio perfil).
- Não mande `Content-Type: application/json` no upload. O browser precisa setar `multipart/form-data` com boundary.

### Compatibilidade

- Perfis que **já têm** `avatarUrl` (pravatar, Drive, URL antiga) **continuam funcionando**. Renderize a URL que vier no GET.
- `PUT /me/profile` **ainda aceita** `avatarUrl` (legado). Não quebre quem ainda envia. O fluxo novo de troca de foto é o POST multipart.
- Depois do upload, o GET `/me/profile` e a página pública já vêm com a URL nova.

### Rota

```
POST /me/profile/avatar
Auth: cookie ou Authorization: Bearer <token>
Content-Type: multipart/form-data
Campo: file   ← o nome do campo é `file`, não `avatar`
```

Arquivo:

| Regra | Valor |
|---|---|
| Tipos | JPEG, JPG, PNG, WEBP |
| Tamanho | máximo **1 MB** |
| Campo | `file` |
| Conversão | o back vira WEBP 256x256 (você não precisa redimensionar) |

Resposta `201`:

```ts
{
  data: {
    avatarUrl: string; // use no <img src>
    profile: Profile;  // perfil já atualizado
  };
  error: null;
}
```

### Helper de upload

O `api()` JSON **não serve** para multipart se ele força `Content-Type: application/json`. Crie um helper separado:

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type ApiOk<T> = { data: T; error: null };
type ApiErr = { data: null; error: { code: string; message: string; details?: unknown } };

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("file", file); // NÃO use outro nome de campo

  const res = await fetch(`${API_URL}/me/profile/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
    // NÃO setar Content-Type
  });

  const json = (await res.json()) as ApiOk<{ avatarUrl: string; profile: Profile }> | ApiErr;

  if (!res.ok || json.error) {
    const err = new Error(json.error?.message ?? "Erro no upload") as Error & {
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

### UI sugerida no editor de perfil

1. Mostrar preview circular com `profile.avatarUrl` (pode ser `null`).
2. Botão “Alterar foto” abre `<input type="file" accept="image/jpeg,image/png,image/webp" />`.
3. Validar no client **antes** de enviar (UX): tipo + tamanho ≤ 1 MB. O back valida de novo.
4. Loading no botão enquanto o POST roda.
5. No sucesso: `setProfile(data.profile)` e `<img src={data.avatarUrl} />`.
6. A URL pode vir com `?v=timestamp` — isso é cache-bust. Use a string inteira. Não remova o query.
7. Se o usuário salvar o resto do perfil (`PUT /me/profile`), **não precisa** reenviar a foto. O avatar já está no banco.

Preview local (opcional, antes do POST):

```ts
const previewUrl = URL.createObjectURL(file);
// mostrar no <img>, e URL.revokeObjectURL(previewUrl) depois
```

Isso é só preview. A foto oficial só existe depois do `201`.

### Erros do upload

| status | code | UI |
|---|---|---|
| 400 | `FILE_REQUIRED` | “Envie uma imagem” |
| 400 | `INVALID_FILE_TYPE` | “Use JPEG, PNG ou WEBP” |
| 401 | `UNAUTHORIZED` | redirecionar ao login |
| 413 | `FILE_TOO_LARGE` | “A imagem deve ter no máximo 1 MB” |
| 502 | `STORAGE_ERROR` | “Não foi possível salvar a foto. Tente de novo.” |
| 400 | `STORAGE_NOT_CONFIGURED` | erro de infra; toast genérico |

### Página pública e bloco HERO

- `GET /p/:username` e `GET /me/profile/preview` já devolvem `avatarUrl`.
- Bloco `HERO` ainda pode ter `content.avatarUrl`. Se o HERO usar a foto do perfil, prefira a do perfil (`profile.avatarUrl`), não peça URL no editor.
- `<img src={avatarUrl} alt="" />` — a URL é pública (Supabase ou URL antiga). Sem Authorization no `<img>`.

### PUT /me/profile

Continua igual para username, displayName, bio, location, theme.

```json
{
  "username": "maria-oliveira",
  "displayName": "Maria Oliveira",
  "headline": "Lash Designer",
  "bio": "Atendo com hora marcada",
  "location": "Brasília - DF",
  "theme": { "primaryColor": "#7C3AED", "buttonStyle": "pill", "font": "sans" }
}
```

Pode omitir `avatarUrl`. Se o form antigo ainda envia `avatarUrl` copiado do GET, ok — não apaga a foto.

---

## O que mudou no plano (obrigatório)

1. Cadastro **não escolhe plano pago**. Toda conta nasce **FREE** e **já loga**.
2. **Não existe mais trial de 7 dias.** Sem badge “7 dias grátis”, sem `trialDays`, sem `trialGranted`.
3. Login **não exige** Pro/Premium. Free entra no painel.
4. Upgrade Pro/Premium é **depois**, via Stripe Checkout.
5. Cancelar Pro/Premium **volta para Free**. A página pública **não some**.
6. Features pagas são travadas no **backend** (HTTP 402). O front só espelha `subscription.entitlements`.

---

## Tipos

```ts
type PlanId = "FREE" | "PRO" | "PREMIUM";

type BlockType =
  | "HERO"
  | "CTA_BUTTON"
  | "LINK_BUTTON"
  | "WHATSAPP"
  | "SOCIAL"
  | "SERVICES"
  | "TESTIMONIALS"
  | "LOCATION";

type Entitlements = {
  maxBlocks: number | null; // null = ilimitado
  maxServices: number | null;
  maxTestimonials: number | null;
  allowedBlockTypes: BlockType[] | null;
  customTheme: boolean;
  removeBranding: boolean;
  prioritySupport: boolean;
};

type Subscription = {
  plan: PlanId | null;
  status:
    | "INCOMPLETE"
    | "INCOMPLETE_EXPIRED"
    | "TRIALING"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELED"
    | "UNPAID"
    | "PAUSED"
    | null;
  trialUsed: boolean; // legado; ignore na UI
  isTrialing: boolean; // legado; ignore na UI
  grantsAccess: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  entitlements: Entitlements | null;
};

type Plan = {
  id: PlanId;
  name: string;
  description: string;
  priceCents: number;
  currency: "BRL";
  interval: "month";
  features: string[];
  entitlements: Entitlements;
  priceFormatted: string; // "R$ 20,00"
};
```

`GET /billing/plans` devolve só `{ plans }`. **Não vem `trialDays`.**

Catálogo:

| Plano | Preço | Limites |
|---|---|---|
| FREE | R$ 0 | 4 blocos (`HERO`, `LINK_BUTTON`, `WHATSAPP`, `SOCIAL`), 2 serviços, 2 depoimentos, tema bloqueado, marca PerfilPro |
| PRO | R$ 20/mês | ilimitado, todos os blocos, `customTheme: true`, marca continua |
| PREMIUM | R$ 39/mês | tudo do Pro + `removeBranding: true` |

`null` em `max*` = ilimitado. `allowedBlockTypes` no Pro/Premium = os 8 tipos.

---

## Auth

### `POST /auth/register` → 201

Body:

```json
{
  "name": "Maria Oliveira",
  "email": "maria@demo.com",
  "password": "Demo1234!",
  "confirmPassword": "Demo1234!"
}
```

**Não envie `plan`.**

`data`: `{ user, accessToken, subscription }`  
`subscription.plan === "FREE"` e `grantsAccess === true`. Cookies de sessão já são setados.

Depois do 201: vá para o painel (`/app`). **Não redirecione para Stripe.**

### `POST /auth/login`

Body: `{ email, password }`  
`data`: `{ user, accessToken, subscription }`

Free entra. **Não trate 402 como “precisa assinar para logar”.**

### `POST /auth/refresh`

Também devolve `{ user, accessToken, subscription }`. Free continua válido.

### `GET /auth/me` (auth)

`data`: user + `{ profile, subscription }`.

Guard do `/app`: só precisa cookie/token + `subscription.grantsAccess`. **Não redirecione Free para `/planos`.**

---

## Billing

### `GET /billing/plans`

`data: { plans: Plan[] }`

Tela `/planos`: 3 cards (Free, Pro, Premium).

- CTA Free: `/cadastro` (ou “você já está no Free” se logado).
- CTA Pro/Premium: checkout.

Não hardcode preço. Use `plan.priceFormatted`.

### `POST /billing/checkout`

Body:

```json
{ "email": "maria@demo.com", "password": "Demo1234!", "plan": "PRO" }
```

`plan` só pode ser `"PRO"` ou `"PREMIUM"`.

`data`:

```ts
{
  checkoutUrl: string | null
  sessionId: string | null
  plan: "PRO" | "PREMIUM"
  subscription: Subscription
}
```

- Se `checkoutUrl`: `window.location.href = checkoutUrl`
- Se `checkoutUrl === null` (dev sem Stripe): o backend já ativou o plano localmente. Recarregue `GET /auth/me` e siga.

Stripe volta para:

- sucesso: `{FRONTEND_URL}/login?checkout=success&session_id=...`
- cancelou: `{FRONTEND_URL}/planos?checkout=canceled`

No sucesso, se o webhook atrasar:

```http
POST /billing/confirm-session
{ "sessionId": "cs_..." }
```

Depois, login/painel.

Códigos:

| status | code | Ação |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | senha errada |
| 409 | `ALREADY_SUBSCRIBED` | já está nesse plano pago |
| 409 | `USE_CHANGE_PLAN` | já é Pro/Premium em outro plano → `/app/assinatura` |

### `GET /billing/subscription` (auth)

`data: { plans, subscription }`

### `POST /billing/change-plan` (auth)

Body: `{ "plan": "PREMIUM" }`  
Só troca **entre Pro e Premium**. Free **não** usa isso. Free usa checkout.

Free tentando: **402** `CHECKOUT_REQUIRED`.

### `POST /billing/cancel` | `POST /billing/resume` | `POST /billing/portal`

Só para plano pago.

- Free em cancel → **400** `FREE_PLAN_CANNOT_CANCEL`
- Portal: `{ portalUrl }` — redirecione para gerenciar cartão/faturas

Copy de cancelamento:

> Você volta para o Free no fim do período. A página continua no ar, com limites e a marca PerfilPro.

**Não diga** que a página pública some.

`cancelAtPeriodEnd === true`: banner “acesso pago até {currentPeriodEnd}” + botão retomar.

---

## Limites no builder

Use `subscription.entitlements` para travar a UI **antes** de chamar a API. O back ainda valida.

Rotas do builder (todas auth):

- `GET/PUT /me/profile`
- `POST /me/profile/publish` | `/unpublish`
- `GET /me/profile/preview`
- `POST /me/profile/avatar` (multipart campo `file` → Supabase Storage; use o `avatarUrl` devolvido)
- `GET/POST /me/profile/blocks` · `PATCH/DELETE /me/profile/blocks/:id` · `PUT /me/profile/blocks/reorder`
- `GET/POST /me/profile/services`
- `GET/POST /me/profile/testimonials`

Regras:

- Criar bloco: se `maxBlocks != null` e `blocks.length >= maxBlocks` → CTA upgrade.
- Tipo: se `allowedBlockTypes` não inclui o tipo → esconda/desabilite (`CTA_BUTTON`, `SERVICES`, `TESTIMONIALS`, `LOCATION` no Free).
- Serviços / depoimentos: mesmo padrão com `maxServices` / `maxTestimonials`.
- Editor de tema/cores: só se `customTheme === true`.
- Página pública: `showBranding === true` → rodapé “Feito com PerfilPro”. `false` só no Premium.

Se a API responder **402**:

| code | Quando | UI |
|---|---|---|
| `PLAN_LIMIT_REACHED` | estourou quantidade | modal upgrade |
| `PLAN_FEATURE_LOCKED` | tipo de bloco ou tema | igual |
| `CHECKOUT_REQUIRED` | tentou change-plan sendo Free | checkout |
| `SUBSCRIPTION_REQUIRED` | conta sem plano ativo (raro) | `/planos` |

`error.details` no limite/feature:

```ts
{
  currentPlan: "FREE"
  suggestedPlan: "PRO"
  entitlement: "maxBlocks" | "maxServices" | "maxTestimonials" | "allowedBlockTypes" | "customTheme"
  blockType?: BlockType
  limit?: number
  current?: number
}
```

Não use mais 402 no login como fluxo principal.

---

## Página pública

`GET /p/:username`

`data` inclui `plan`, `showBranding`, `theme`, `blocks`, `services`, `testimonials`.

No Free, o back já corta listas e pode devolver `theme: {}`. Mesmo assim, no editor não ofereça o que o plano não tem.

Se o dono perder acesso de verdade (sem plano ativo), a rota continua 404.

---

## Fluxos de tela

**Cadastro**

```
/cadastro → POST /auth/register → /app
```

**Upgrade**

```
/app ou /planos
  → POST /billing/checkout { email, password, plan: "PRO" | "PREMIUM" }
  → Stripe
  → /login?checkout=success&session_id=...
  → POST /billing/confirm-session
  → painel
```

**Troca Pro ↔ Premium**

```
/app/assinatura → POST /billing/change-plan
```

---

## Checklist

Foto de perfil:

- [ ] Input `file` + `POST /me/profile/avatar` (campo `file`)
- [ ] Sem `Content-Type: application/json` no upload
- [ ] Sem chaves do Supabase no Next.js
- [ ] Preview usa `data.avatarUrl` devolvido (incluindo `?v=`)
- [ ] Erros `INVALID_FILE_TYPE` / `FILE_TOO_LARGE` / `STORAGE_ERROR`
- [ ] URLs antigas de `avatarUrl` ainda renderizam
- [ ] PUT do perfil não apaga a foto

Plano Free:

- [ ] Remover `plan` do cadastro
- [ ] Register grava sessão e vai para `/app`
- [ ] `/planos` lista FREE + PRO + PREMIUM, sem trial
- [ ] Guard `/app` aceita Free (`grantsAccess`)
- [ ] Builder usa `entitlements` (blocos, tipos, serviços, depoimentos, tema)
- [ ] 402 `PLAN_LIMIT_REACHED` / `PLAN_FEATURE_LOCKED` abre upgrade
- [ ] Checkout só PRO/PREMIUM
- [ ] `change-plan` só Pro ↔ Premium
- [ ] Copy de cancelamento = volta para Free, página fica
- [ ] `showBranding` na página pública
- [ ] Apagar qualquer “7 dias grátis”
- [ ] Preço só via `plan.priceFormatted`

Docs complementares no backend: `FRONTEND-PLANOS.md` e `API-FRONTEND.md`.
