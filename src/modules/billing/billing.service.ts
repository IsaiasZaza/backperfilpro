import type Stripe from "stripe";
import { env } from "../../config/env";
import { query, queryOne } from "../../db/client";
import type { Plan, Subscription, SubscriptionStatus, User } from "../../db/types";
import { badRequest, conflict, notFound, paymentRequired, unauthorized } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { verifyPassword } from "../../lib/password";
import { getStripe, isStripeConfigured, planFromPriceId, priceIdForPlan } from "../../lib/stripe";
import { addDays } from "../../lib/tokens";
import type { CheckoutInput } from "./billing.schemas";
import { listPlans } from "./plans";
import { grantsAccess, presentSubscription, subscriptionRequiredError } from "./subscription-access";

export { grantsAccess, listPlans, presentSubscription };

export async function getSubscriptionByUserId(userId: string) {
  return queryOne<Subscription>(`SELECT * FROM subscriptions WHERE "userId" = $1`, [userId]);
}

export async function requireActiveSubscription(userId: string) {
  const subscription = await getSubscriptionByUserId(userId);
  if (!grantsAccess(subscription)) {
    throw paymentRequired(
      "Sua conta precisa de um plano Pro ou Premium ativo para continuar.",
      "SUBSCRIPTION_REQUIRED",
      subscriptionRequiredError(subscription?.plan),
    );
  }
  return subscription!;
}

export async function assertLoginAllowed(user: User) {
  const subscription = await getSubscriptionByUserId(user.id);
  if (!grantsAccess(subscription)) {
    throw paymentRequired(
      "Escolha um plano (Pro ou Premium) para entrar. Os primeiros 7 dias sao gratis.",
      "SUBSCRIPTION_REQUIRED",
      {
        ...subscriptionRequiredError(subscription?.plan),
        trialUsed: subscription?.trialUsed ?? false,
      },
    );
  }
  return subscription!;
}

export async function createCheckoutForUser(user: User, plan: Plan) {
  const existing = await getSubscriptionByUserId(user.id);
  if (grantsAccess(existing)) {
    if (existing!.plan === plan) {
      throw conflict("Voce ja tem esse plano ativo", "ALREADY_SUBSCRIBED");
    }
    throw conflict(
      "Para trocar de plano, faca login e use POST /billing/change-plan.",
      "USE_CHANGE_PLAN",
    );
  }

  if (env.NODE_ENV === "test" || !isStripeConfigured()) {
    if (env.NODE_ENV === "production") {
      throw badRequest(
        "Stripe nao configurada. Defina STRIPE_SECRET_KEY, STRIPE_PRICE_PRO e STRIPE_PRICE_PREMIUM no .env.",
        "STRIPE_NOT_CONFIGURED",
      );
    }

    const subscription = await activateLocalTrial(user.id, plan);
    if (env.NODE_ENV !== "test") {
      logger.warn("stripe nao configurada; trial local de 7 dias ativado", { userId: user.id, plan });
    }

    return {
      checkoutUrl: null as string | null,
      sessionId: null as string | null,
      trialGranted: true,
      trialDays: env.STRIPE_TRIAL_DAYS,
      plan,
      subscription: presentSubscription(subscription),
    };
  }

  const customerId = await getOrCreateCustomer(user);
  const trialGranted = await shouldGrantTrial(user.id, customerId);
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/login?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.FRONTEND_URL}/planos?checkout=canceled`,
    locale: "pt-BR",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    payment_method_collection: "always",
    metadata: { userId: user.id, plan },
    subscription_data: {
      metadata: { userId: user.id, plan },
      ...(trialGranted && env.STRIPE_TRIAL_DAYS > 0
        ? { trial_period_days: env.STRIPE_TRIAL_DAYS }
        : {}),
    },
  });

  if (!session.url) {
    throw badRequest("Nao foi possivel criar a sessao de pagamento", "CHECKOUT_SESSION_FAILED");
  }

  logger.info("checkout stripe criado", { userId: user.id, plan, trialGranted, sessionId: session.id });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    trialGranted,
    trialDays: trialGranted ? env.STRIPE_TRIAL_DAYS : 0,
    plan,
    subscription: presentSubscription(existing),
  };
}

export async function checkoutWithCredentials(input: CheckoutInput) {
  const user = await queryOne<User>(`SELECT * FROM users WHERE email = $1`, [input.email]);
  const invalid = unauthorized("E-mail ou senha invalidos", "INVALID_CREDENTIALS");
  if (!user) throw invalid;

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) throw invalid;

  return createCheckoutForUser(user, input.plan);
}

export async function confirmCheckoutSession(sessionId: string) {
  if (env.NODE_ENV === "test") {
    throw badRequest("Confirmacao de sessao nao e usada em teste", "STRIPE_NOT_CONFIGURED");
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.status !== "complete" || session.mode !== "subscription") {
    throw badRequest("Pagamento ainda nao foi concluido", "CHECKOUT_NOT_COMPLETE");
  }

  const userId = session.metadata?.userId ?? session.client_reference_id;
  const stripeSub = await resolveStripeSubscription(session.subscription);
  if (!stripeSub) {
    throw badRequest("Assinatura nao encontrada na sessao", "SUBSCRIPTION_MISSING");
  }

  const subscription = await syncStripeSubscription(stripeSub, userId);
  return presentSubscription(subscription);
}

export async function getBillingOverview(userId: string) {
  const subscription = await getSubscriptionByUserId(userId);
  return {
    plans: listPlans(),
    subscription: presentSubscription(subscription),
  };
}

export async function changePlan(userId: string, plan: Plan) {
  const current = await requireActiveSubscription(userId);
  if (current.plan === plan) {
    throw conflict("Voce ja esta nesse plano", "ALREADY_ON_PLAN");
  }

  if (env.NODE_ENV === "test" || !current.stripeSubscriptionId) {
    const updated = await queryOne<Subscription>(
      `UPDATE subscriptions SET plan = $1, "updatedAt" = NOW() WHERE "userId" = $2 RETURNING *`,
      [plan, userId],
    );
    return presentSubscription(updated);
  }

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) {
    throw badRequest("Assinatura Stripe invalida", "STRIPE_SUBSCRIPTION_INVALID");
  }

  const updatedStripe = await stripe.subscriptions.update(current.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceIdForPlan(plan) }],
    proration_behavior: "create_prorations",
    metadata: { userId, plan },
  });

  const synced = await syncStripeSubscription(updatedStripe, userId);
  logger.info("plano alterado", { userId, from: current.plan, to: plan });
  return presentSubscription(synced);
}

export async function cancelSubscription(userId: string) {
  const current = await requireActiveSubscription(userId);

  if (current.cancelAtPeriodEnd) {
    return presentSubscription(current);
  }

  if (env.NODE_ENV === "test" || !current.stripeSubscriptionId) {
    const updated = await queryOne<Subscription>(
      `UPDATE subscriptions
       SET "cancelAtPeriodEnd" = TRUE, "updatedAt" = NOW()
       WHERE "userId" = $1
       RETURNING *`,
      [userId],
    );
    return presentSubscription(updated);
  }

  const stripe = getStripe();
  const updatedStripe = await stripe.subscriptions.update(current.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  const synced = await syncStripeSubscription(updatedStripe, userId);
  logger.info("assinatura marcada para cancelar no fim do periodo", { userId });
  return presentSubscription(synced);
}

export async function resumeSubscription(userId: string) {
  const current = await getSubscriptionByUserId(userId);
  if (!current || !grantsAccess(current)) {
    throw paymentRequired(
      "Nao ha assinatura ativa para retomar.",
      "SUBSCRIPTION_REQUIRED",
      subscriptionRequiredError(current?.plan),
    );
  }

  if (!current.cancelAtPeriodEnd) {
    return presentSubscription(current);
  }

  if (env.NODE_ENV === "test" || !current.stripeSubscriptionId) {
    const updated = await queryOne<Subscription>(
      `UPDATE subscriptions
       SET "cancelAtPeriodEnd" = FALSE, "canceledAt" = NULL, "updatedAt" = NOW()
       WHERE "userId" = $1
       RETURNING *`,
      [userId],
    );
    return presentSubscription(updated);
  }

  const stripe = getStripe();
  const updatedStripe = await stripe.subscriptions.update(current.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  const synced = await syncStripeSubscription(updatedStripe, userId);
  logger.info("cancelamento revertido", { userId });
  return presentSubscription(synced);
}

export async function createPortalSession(userId: string) {
  const user = await queryOne<User>(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!user) throw unauthorized("Usuario nao encontrado");
  if (!user.stripeCustomerId) {
    throw badRequest("Nenhuma conta de pagamento vinculada. Faca o checkout primeiro.", "NO_STRIPE_CUSTOMER");
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.FRONTEND_URL}/configuracoes/assinatura`,
  });

  return { portalUrl: session.url };
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw badRequest("STRIPE_WEBHOOK_SECRET nao configurado", "STRIPE_NOT_CONFIGURED");
  }
  if (!signature) {
    throw unauthorized("Assinatura do webhook ausente", "INVALID_STRIPE_SIGNATURE");
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw unauthorized("Assinatura do webhook invalida", "INVALID_STRIPE_SIGNATURE");
  }

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO stripe_events (id, type) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [event.id, event.type],
  );

  if (!inserted) {
    return { received: true, duplicate: true };
  }

  try {
    await dispatchStripeEvent(event);
  } catch (error) {
    await query(`DELETE FROM stripe_events WHERE id = $1`, [event.id]);
    throw error;
  }

  logger.info("webhook stripe processado", { type: event.type, id: event.id });
  return { received: true, duplicate: false };
}

export async function ownerHasActivePlan(userId: string) {
  const subscription = await getSubscriptionByUserId(userId);
  return grantsAccess(subscription);
}

async function dispatchStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;
      const stripeSub = await resolveStripeSubscription(session.subscription);
      if (!stripeSub) return;
      await syncStripeSubscription(
        stripeSub,
        session.metadata?.userId ?? session.client_reference_id,
      );
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncStripeSubscription(event.data.object as Stripe.Subscription);
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = getInvoiceSubscription(invoice);
      const stripeSub = await resolveStripeSubscription(subscriptionRef);
      if (stripeSub) await syncStripeSubscription(stripeSub);
      return;
    }
    default:
      return;
  }
}

async function resolveStripeSubscription(
  ref: string | Stripe.Subscription | null | undefined,
) {
  if (!ref) return null;
  if (typeof ref !== "string") return ref;
  return getStripe().subscriptions.retrieve(ref);
}

function getInvoiceSubscription(invoice: Stripe.Invoice) {
  const withSub = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  if (withSub.subscription) return withSub.subscription;

  const parent = (
    invoice as Stripe.Invoice & {
      parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } };
    }
  ).parent?.subscription_details?.subscription;

  return parent ?? null;
}

async function syncStripeSubscription(stripeSub: Stripe.Subscription, fallbackUserId?: string | null) {
  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
  const userId =
    stripeSub.metadata?.userId ||
    fallbackUserId ||
    (await queryOne<User>(`SELECT * FROM users WHERE "stripeCustomerId" = $1`, [customerId]))?.id;

  if (!userId) {
    logger.warn("webhook sem userId", { stripeSubscriptionId: stripeSub.id, customerId });
    throw notFound("Usuario da assinatura nao encontrado", "USER_NOT_FOUND");
  }

  const price = stripeSub.items.data[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  const plan =
    (stripeSub.metadata?.plan as Plan | undefined) ||
    planFromPriceId(priceId) ||
    (await getSubscriptionByUserId(userId))?.plan ||
    "PRO";

  const period = periodFromSubscription(stripeSub);
  const trialEndsAt = fromUnix(stripeSub.trial_end);
  const status = mapStripeStatus(stripeSub.status);
  const canceledAt = fromUnix(stripeSub.canceled_at);

  const saved = await upsertSubscription({
    userId,
    plan,
    status,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId ?? null,
    trialUsed: Boolean(trialEndsAt) || status === "TRIALING",
    trialEndsAt,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
    canceledAt,
  });

  await query(
    `UPDATE users SET "stripeCustomerId" = COALESCE("stripeCustomerId", $1), "updatedAt" = NOW()
     WHERE id = $2 AND ("stripeCustomerId" IS NULL OR "stripeCustomerId" = $1)`,
    [customerId, userId],
  );

  return saved;
}

async function getOrCreateCustomer(user: User) {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });

  await query(`UPDATE users SET "stripeCustomerId" = $1, "updatedAt" = NOW() WHERE id = $2`, [
    customer.id,
    user.id,
  ]);

  return customer.id;
}

async function shouldGrantTrial(userId: string, customerId: string) {
  const local = await getSubscriptionByUserId(userId);
  if (local?.trialUsed || local?.trialEndsAt) return false;

  const stripe = getStripe();
  const history = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  return !history.data.some((item) => item.trial_end != null || item.status === "trialing");
}

async function activateLocalTrial(userId: string, plan: Plan) {
  const trialEndsAt = addDays(env.STRIPE_TRIAL_DAYS);
  return upsertSubscription({
    userId,
    plan,
    status: "TRIALING",
    stripeSubscriptionId: null,
    stripePriceId: null,
    trialUsed: true,
    trialEndsAt,
    currentPeriodStart: new Date(),
    currentPeriodEnd: trialEndsAt,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  });
}

async function upsertSubscription(input: {
  userId: string;
  plan: Plan;
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  trialUsed: boolean;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}) {
  return queryOne<Subscription>(
    `INSERT INTO subscriptions (
       "userId", plan, status, "stripeSubscriptionId", "stripePriceId",
       "trialUsed", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd",
       "cancelAtPeriodEnd", "canceledAt"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT ("userId") DO UPDATE SET
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       "stripeSubscriptionId" = COALESCE(EXCLUDED."stripeSubscriptionId", subscriptions."stripeSubscriptionId"),
       "stripePriceId" = COALESCE(EXCLUDED."stripePriceId", subscriptions."stripePriceId"),
       "trialUsed" = subscriptions."trialUsed" OR EXCLUDED."trialUsed",
       "trialEndsAt" = COALESCE(EXCLUDED."trialEndsAt", subscriptions."trialEndsAt"),
       "currentPeriodStart" = EXCLUDED."currentPeriodStart",
       "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
       "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
       "canceledAt" = EXCLUDED."canceledAt",
       "updatedAt" = NOW()
     RETURNING *`,
    [
      input.userId,
      input.plan,
      input.status,
      input.stripeSubscriptionId,
      input.stripePriceId,
      input.trialUsed,
      input.trialEndsAt,
      input.currentPeriodStart,
      input.currentPeriodEnd,
      input.cancelAtPeriodEnd,
      input.canceledAt,
    ],
  ).then((row) => {
    if (!row) throw new Error("Falha ao salvar assinatura");
    return row;
  });
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  const map: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE_EXPIRED",
    trialing: "TRIALING",
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    unpaid: "UNPAID",
    paused: "PAUSED",
  };
  return map[status] ?? "INCOMPLETE";
}

function periodFromSubscription(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0] as
    | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
    | undefined;
  const legacy = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  return {
    start: fromUnix(legacy.current_period_start ?? item?.current_period_start),
    end: fromUnix(legacy.current_period_end ?? item?.current_period_end),
  };
}

function fromUnix(value?: number | null) {
  return value ? new Date(value * 1000) : null;
}
