# Prompt para o frontend — plano Free (sem trial)

Cole este arquivo no chat do agente/dev do **Next.js**. A API do PerfilPro mudou. Implemente o plano Free, remova o trial e respeite os limites. Não invente campos. A API é a fonte da verdade.

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

---

## O que mudou (obrigatório)

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
- `POST /me/profile/avatar` (multipart campo `file`)
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
