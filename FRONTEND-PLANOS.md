# PerfilPro — como montar planos e login no Frontend

Guia para implementar no Next.js (App Router) o que a API já entrega: **plano Free no cadastro**, **Pro e Premium via Stripe (sem trial)** e **limites de feature no backend**.

Contrato técnico complementar: `API-FRONTEND.md`  
Swagger: `http://localhost:3333/docs`

Base URL: `http://localhost:3333`  
O backend já libera CORS em `http://localhost:3000`.

---

## 1. O que o produto precisa ter na tela

| Tela | Rota sugerida | Quem acessa |
|---|---|---|
| Preços / escolher plano | `/planos` | público |
| Cadastro (já com plano escolhido) | `/cadastro?plan=PRO` | público |
| Checkout Stripe | URL que a API devolve | Stripe hospeda |
| Login | `/login` | público |
| Volta da Stripe | `/login?checkout=success&session_id=...` | público |
| Painel | `/app` (ou `/dashboard`) | só com plano ativo |
| Assinatura | `/app/assinatura` | só com plano ativo |
| Página pública do perfil | `/p/[username]` | público |

Fluxo feliz:

```
/cadastro  →  POST /auth/register (Free + token)  →  /app
/app/assinatura  →  Stripe Checkout (Pro/Premium)  →  /app
```

Regras que o front precisa respeitar:

1. **Cadastro já loga.** `POST /auth/register` devolve `accessToken` e `subscription.plan = "FREE"`.
2. **Login não exige plano pago.** Free entra no painel.
3. **Não existe trial.** Upgrade cobra na hora via Stripe.
4. Cancelar Pro/Premium **volta para Free**; a página pública continua no ar, com limites e marca.
5. Premium esconde a marca PerfilPro (`showBranding: false`).
6. Ultrapassar limite do plano: **402** `PLAN_LIMIT_REACHED` ou `PLAN_FEATURE_LOCKED` (use `subscription.entitlements` para travar a UI).

---

## 2. Env do Next.js

```env
NEXT_PUBLIC_API_URL=http://localhost:3333
```

Não precisa de chave publishable da Stripe no front: o checkout é **hospedado** (redirect para `checkoutUrl`).

---

## 3. Cliente HTTP

Use o mesmo `api()` de `API-FRONTEND.md`, com `credentials: "include"`.

Trate **402** como “precisa de plano”, não como senha errada:

```ts
// lib/api.ts (trecho)
if (!res.ok || json.error) {
  const err = Object.assign(new Error(json.error?.message ?? "Erro na API"), {
    code: json.error?.code,
    status: res.status,
    details: json.error?.details,
  });
  throw err;
}
```

```ts
function isSubscriptionRequired(err: unknown) {
  return (err as { status?: number; code?: string }).status === 402
    || (err as { code?: string }).code === "SUBSCRIPTION_REQUIRED";
}
```

---

## 4. Tipos

```ts
// types/billing.ts
export type PlanId = "FREE" | "PRO" | "PREMIUM";

export type SubscriptionStatus =
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED";

export type Entitlements = {
  maxBlocks: number | null;
  maxServices: number | null;
  maxTestimonials: number | null;
  allowedBlockTypes: string[] | null;
  customTheme: boolean; // tema da página + look/layout dos blocos + banner. Free = false. Pro e Premium = true.
  removeBranding: boolean;
  prioritySupport: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  priceCents: number;
  priceFormatted: string; // "R$ 20,00"
  currency: "BRL";
  interval: "month";
  features: string[];
  entitlements: Entitlements;
};

export type Subscription = {
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  trialUsed: boolean;
  isTrialing: boolean;
  grantsAccess: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  entitlements: Entitlements | null;
};
```

Catálogo atual (a API é a fonte da verdade; não hardcode preço no botão):

| Plano | Preço | Destaque de produto |
|---|---|---|
| **Free** | R$ 0 | página pública, 4 blocos, 2 serviços, 2 depoimentos, marca PerfilPro |
| **Pro** | R$ 20,00/mês | ilimitado, todos os blocos, `customTheme: true` (tema + look + banner) |
| **Premium** | R$ 39,00/mês | tudo do Pro + sem marca PerfilPro + suporte prioritário |

`grantsAccess` é `true` quando o status é `ACTIVE`, `TRIALING` (legado) ou `PAST_DUE`.

---

## 5. Páginas e o que cada uma chama

### 5.1 `/planos` — catálogo

```ts
const { plans } = await api<{ plans: Plan[] }>("/billing/plans");
```

UI:

- Badge no topo: **“Comece grátis”**
- Dois cards (Pro / Premium), Premium marcado como recomendado
- Lista `plan.features`
- Preço: `plan.priceFormatted` + “/mês”
- CTA: `Começar grátis` → `/cadastro?plan=PRO` ou `PREMIUM`
- Link “Já tenho conta” → `/login`

Não invente features: use o array que a API mandou.

---

### 5.2 `/cadastro` — criar conta Free e entrar

Formulário: nome, e-mail, senha, confirmar senha. Sem escolha de plano.

```ts
type RegisterResponse = {
  user: { id: string; name: string; email: string };
  accessToken: string;
  subscription: Subscription;
};

const data = await api<RegisterResponse>("/auth/register", {
  method: "POST",
  body: JSON.stringify({
    name,
    email,
    password,
    confirmPassword,
  }),
});

router.replace("/app");
```

Erros:

| status | code | UI |
|---|---|---|
| 409 | `EMAIL_ALREADY_USED` | “Esse e-mail já tem conta. Faça login ou retome o checkout.” |
| 422 | `VALIDATION_ERROR` | mostre `error.details` nos campos |

Se a pessoa já cadastrou e abandonou a Stripe, **não** chame register de novo. Use a tela de login / “retomar pagamento” (`POST /billing/checkout`).

---

### 5.3 Stripe Checkout (não é página sua)

A Stripe coleta o cartão mesmo no trial. Copy útil no card do plano:

> Comece grátis. Faça upgrade quando quiser. Sem cartão no cadastro.

URLs que o backend já configura:

- sucesso → `{FRONTEND_URL}/login?checkout=success&session_id={CHECKOUT_SESSION_ID}`
- cancelou → `{FRONTEND_URL}/planos?checkout=canceled`

---

### 5.4 `/login` — entrar (e voltar da Stripe)

Form: e-mail + senha.

```ts
type LoginResponse = {
  user: { id: string; name: string; email: string };
  accessToken: string;
  subscription: Subscription;
};

try {
  const data = await api<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  router.replace("/app");
} catch (err) {
  if (isSubscriptionRequired(err)) {
    // senha certa, mas sem plano → retomar checkout
    setNeedsCheckout(true);
    return;
  }
  // 401 INVALID_CREDENTIALS
}
```

Quando `?checkout=success` estiver na URL:

1. Leia `session_id`.
2. Chame `POST /billing/confirm-session` `{ sessionId }` (se o webhook atrasar, isso sincroniza).
3. Mostre: “Trial ativado. Entre para continuar.”
4. A pessoa digita a senha e loga.

```ts
await api("/billing/confirm-session", {
  method: "POST",
  body: JSON.stringify({ sessionId }),
});
```

Se `?checkout=canceled`: toast “Checkout cancelado. Você pode tentar de novo.”

**Retomar checkout** (cadastro feito, Stripe não concluída, ou plano caiu):

```ts
const { checkoutUrl } = await api<{ checkoutUrl: string | null }>(
  "/billing/checkout",
  {
    method: "POST",
    body: JSON.stringify({ email, password, plan: selectedPlan }),
  },
);
if (checkoutUrl) window.location.href = checkoutUrl;
```

Códigos:

| status | code | Significado |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | e-mail/senha errados |
| 402 | `SUBSCRIPTION_REQUIRED` | conta existe, falta plano. `details.trialUsed` diz se ainda tem trial |
| 409 | `ALREADY_SUBSCRIBED` | já tem esse plano (não deveria aparecer no login) |
| 409 | `USE_CHANGE_PLAN` | já tem outro plano ativo — mande logar e ir em `/app/assinatura` |

Copy no 402:

- `trialUsed === false` → “Escolha um plano. Os 7 primeiros dias são grátis.”
- `trialUsed === true` → “Sua assinatura não está ativa. Assine de novo para entrar.”

---

### 5.5 Guard do painel

Rotas `/app/*` só existem com sessão **e** plano.

No layout do painel:

```ts
const me = await api<{
  id: string;
  email: string;
  profile: { username: string | null; status: string } | null;
  subscription: Subscription;
}>("/auth/me");

if (!me.subscription.grantsAccess) {
  redirect("/planos?reason=expired");
}
```

Middleware Next (cookie `pp_access_token`):

- sem cookie em `/app` → `/login`
- com cookie, o layout confirma `/auth/me`
- **402** em qualquer `/me/*` → mande para `/planos` ou `/login` com checkout

Refresh de token: `POST /auth/refresh` também devolve 402 se o plano caiu. Trate igual.

Banner no header do painel, se `subscription.isTrialing`:

> Teste grátis até **{format(trialEndsAt)}**. Depois vira R$ xx/mês no cartão.

Se `cancelAtPeriodEnd`:

> Acesso até **{format(currentPeriodEnd)}**. [Manter plano]

---

### 5.6 `/app/assinatura` — gerenciar plano

```ts
const { plans, subscription } = await api<{
  plans: Plan[];
  subscription: Subscription;
}>("/billing/subscription");
```

Blocos da tela:

1. **Plano atual** — nome, status em PT, data do próximo ciclo / fim do trial  
2. **Trocar plano** — botão “Assinar Premium” ou “Voltar para o Pro”  
3. **Cancelar / retomar**  
4. **Cartão e faturas** — abre o portal da Stripe

```ts
// upgrade / downgrade (prorata na Stripe)
await api("/billing/change-plan", {
  method: "POST",
  body: JSON.stringify({ plan: "PREMIUM" }),
});

// cancela no FIM do período (trial ou pago). Não corta na hora.
await api("/billing/cancel", { method: "POST" });

// desfaz o cancelamento
await api("/billing/resume", { method: "POST" });

// cartão, faturas, troca de plano no portal Stripe
const { portalUrl } = await api<{ portalUrl: string }>("/billing/portal", {
  method: "POST",
});
window.location.href = portalUrl;
```

Labels de status:

| status API | Texto |
|---|---|
| `TRIALING` | Período grátis |
| `ACTIVE` | Ativa |
| `PAST_DUE` | Pagamento atrasado — atualize o cartão |
| `CANCELED` | Encerrada |
| `INCOMPLETE` | Checkout não concluído |

`PAST_DUE`: ainda entra no painel. CTA: “Atualizar cartão” → `/billing/portal`.

Confirme cancelamento com modal: *“Você continua usando até {data}. Depois a página pública sai do ar.”*

---

## 6. Página pública e marca

`GET /p/:username` e o preview (`GET /me/profile/preview`) vêm com:

```ts
{
  // ...perfil, blocks, services, testimonials
  plan: "PRO" | "PREMIUM" | null,
  showBranding: boolean
}
```

- `showBranding === true` (Pro) → rodapé “Feito com PerfilPro”
- `showBranding === false` (Premium) → sem marca

Se o dono perder o plano, essa rota vira 404. Não mostre “assinatura expirada” (não vaze que o perfil existe).

---

## 7. Estados de UI (checklist)

**Cadastro**

- [ ] Plano vem da query e pode ser alterado
- [ ] Botão “Começar grátis”
- [ ] Loading no redirect para a Stripe
- [ ] E-mail já usado → login / retomar checkout

**Login**

- [ ] 401 ≠ 402 (mensagens diferentes)
- [ ] `checkout=success` confirma sessão e pede senha
- [ ] Sem plano: escolher Pro/Premium e chamar `/billing/checkout`

**Painel**

- [ ] Banner de trial
- [ ] Banner de cancelamento agendado
- [ ] 402 `PLAN_FEATURE_LOCKED` / `PLAN_LIMIT_REACHED` → modal de upgrade (`details.entitlement`, ex. `customTheme`)
- [ ] 402 `SUBSCRIPTION_REQUIRED` → `/planos` (não misture com o caso acima)
- [ ] Editor de Aparência / banner só se `customTheme === true`

**Assinatura**

- [ ] Troca Pro ↔ Premium
- [ ] Cancelar no fim do ciclo
- [ ] Retomar
- [ ] Portal (cartão/faturas)

**Página pública**

- [ ] Marca PerfilPro só se `showBranding`

---

## 8. Mapas de rota (App Router)

```
app/
  planos/page.tsx                 GET /billing/plans
  cadastro/page.tsx               POST /auth/register
  login/page.tsx                  POST /auth/login
                                  POST /billing/confirm-session
                                  POST /billing/checkout
  app/layout.tsx                  GET /auth/me  (guard)
  app/page.tsx                    builder
  app/assinatura/page.tsx         GET /billing/subscription
                                  POST /billing/change-plan|cancel|resume|portal
  p/[username]/page.tsx           GET /p/:username
```

Guarde o `accessToken` só se precisar (Swagger/mobile). No browser, o cookie httpOnly já autentica.

---

## 9. Dev local sem Stripe configurada

Se `STRIPE_SECRET_KEY` / price IDs estiverem vazios no backend:

- `checkoutUrl` vem `null`
- o plano Free é ativado **no banco**
- depois do cadastro, a pessoa **já consegue logar**

Quando as chaves existirem, `checkoutUrl` aponta para a Stripe de verdade. O front só precisa do `if (checkoutUrl) redirect; else login`.

---

## 10. Copy pronta

**Hero dos planos**  
“Sua página profissional no ar em minutos. Comece grátis.”

**Pro**  
“Para começar: links, WhatsApp, serviços e depoimentos.”

**Premium**  
“Sem a marca PerfilPro e com suporte prioritário.”

**CTA**  
“Começar grátis” (não “Assinar agora”, no trial)

**Rodapé do card**  
“Cancele quando quiser. O Free continua no ar, com limites.”

**402 no login**  
“Sua conta está pronta. Escolha Pro ou Premium para entrar.”

---

## 11. Erros que o front deve tratar

| Status | code | Onde | Ação |
|---|---|---|---|
| 401 | `INVALID_CREDENTIALS` | login / checkout | senha errada |
| 402 | `PLAN_LIMIT_REACHED` / `PLAN_FEATURE_LOCKED` | builder | modal upgrade. `customTheme` cobre tema, fundo, banner e look dos blocos. **Não** é `SUBSCRIPTION_REQUIRED`. |
| 402 | `SUBSCRIPTION_REQUIRED` | login, refresh, `/me/*` | tela de planos / checkout |
| 409 | `EMAIL_ALREADY_USED` | register | ir para login |
| 409 | `ALREADY_SUBSCRIBED` | checkout | ir para o painel |
| 409 | `USE_CHANGE_PLAN` | checkout | `/app/assinatura` |
| 409 | `ALREADY_ON_PLAN` | change-plan | desabilitar o botão do plano atual |
| 422 | `VALIDATION_ERROR` | forms | `details[].field` + `message` |
| 429 | `TOO_MANY_REQUESTS` | login/register/checkout | aguarde |

---

## 12. Ordem de implementação sugerida

1. `lib/api.ts` + tipos  
2. `/planos` (GET `/billing/plans`)  
3. `/cadastro` + redirect `checkoutUrl`  
4. `/login` com 401/402 e retorno da Stripe  
5. Guard `/app` com `/auth/me`  
6. `/app/assinatura` (troca, cancela, portal)  
7. Marca na página pública via `showBranding`

Com isso o front cobre o ciclo inteiro da assinatura sem SDK da Stripe no browser.
