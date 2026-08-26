import type Stripe from "stripe";
import { env } from "../../config/env";
import { query, queryOne } from "../../db/client";
import type { Plan, Subscription, SubscriptionStatus, User } from "../../db/types";
import { badRequest, conflict, notFound, paymentRequired, unauthorized } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { verifyPassword } from "../../lib/password";
import { getStripe, isStripeConfigured, planFromPriceId, priceIdForPlan } from "../../lib/stripe";
import type { CheckoutInput } from "./billing.schemas";
import { isPaidPlan, type PaidPlan } from "./entitlements";
import { listPlans } from "./plans";
import { grantsAccess, presentSubscription, subscriptionRequiredError } from "./subscription-access";

export { grantsAccess, listPlans, presentSubscription };

export async function getSubscriptionByUserId(userId: string) {
  return queryOne<Subscription>(`SELECT * FROM subscriptions WHERE "userId" = $1`, [userId]);
}

function periodHasEnded(value: Date | string | null | undefined) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time <= Date.now();
}

function shouldDowngradeToFree(subscription: Subscription) {
  if (!isPaidPlan(subscription.plan)) return false;
  if (!grantsAccess(subscription)) return true;
  return Boolean(subscription.cancelAtPeriodEnd && periodHasEnded(subscription.currentPeriodEnd));
}

/** Se o periodo pago acabou ou o status nao concede acesso, cai para Free na hora. */
export async function resolveSubscription(userId: string) {
  let subscription = await getSubscriptionByUserId(userId);
  if (subscription && shouldDowngradeToFree(subscription)) {
    logger.info("acesso pago encerrado; voltando para Free", {
      userId,
      plan: subscription.plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
    subscription = await downgradeToFree(userId);
  }
  return subscription;
}

export async function requireActiveSubscription(userId: string) {
  const subscription = await resolveSubscription(userId);
  if (!grantsAccess(subscription)) {
    throw paymentRequired(
      "Sua conta precisa de um plano ativo para continuar.",
      "SUBSCRIPTION_REQUIRED",
      subscriptionRequiredError(subscription?.plan),
    );
  }
  return subscription!;
}

export async function activateFreePlan(userId: string) {
  return upsertSubscription({
    userId,
    plan: "FREE",
    status: "ACTIVE",
    stripeSubscriptionId: null,
    stripePriceId: null,
    trialUsed: false,
    trialEndsAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  });
}

export async function downgradeToFree(userId: string, eventCreated?: number | null) {
  const existing = await getSubscriptionByUserId(userId);
  if (!existing) return activateFreePlan(userId);

  const updated = await queryOne<Subscription>(
    `UPDATE subscriptions SET
       plan = 'FREE',
       status = 'ACTIVE',
       "stripeSubscriptionId" = NULL,
       "stripePriceId" = NULL,
       "cancelAtPeriodEnd" = FALSE,
       "canceledAt" = NOW(),
       "currentPeriodEnd" = NULL,
       "lastStripeEventCreated" = COALESCE($2, "lastStripeEventCreated"),
       "updatedAt" = NOW()
     WHERE "userId" = $1
     RETURNING *`,
    [userId, eventCreated ?? null],
  );
  return updated!;
}

export async function assertLoginAllowed(user: User) {
  let subscription = await resolveSubscription(user.id);

  if (!subscription) {
    subscription = await activateFreePlan(user.id);
  }

  if (!grantsAccess(subscription)) {
    subscription = await downgradeToFree(user.id);
  }

  return subscription;
}

export async function createCheckoutForUser(user: User, plan: PaidPlan) {
  const existing = await resolveSubscription(user.id);
  if (grantsAccess(existing) && isPaidPlan(existing!.plan)) {
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

    const subscription = await activateLocalPaidPlan(user.id, plan);
    if (env.NODE_ENV !== "test") {
      logger.warn("stripe nao configurada; plano pago ativado localmente", { userId: user.id, plan });
    }

    return {
      checkoutUrl: null as string | null,
      sessionId: null as string | null,
      plan,
      subscription: presentSubscription(subscription),
    };
  }

  const customerId = await getOrCreateCustomer(user);
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
    },
  });

  if (!session.url) {
    throw badRequest("Nao foi possivel criar a sessao de pagamento", "CHECKOUT_SESSION_FAILED");
  }

  logger.info("checkout stripe criado", { userId: user.id, plan, sessionId: session.id });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
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
  const subscription = await resolveSubscription(userId);
  return {
    plans: listPlans(),
    subscription: presentSubscription(subscription),
  };
}

export async function changePlan(userId: string, plan: PaidPlan) {
  const current = await requireActiveSubscription(userId);
  if (current.plan === "FREE" || !isPaidPlan(current.plan)) {
    throw paymentRequired(
      "Para assinar Pro ou Premium, use o checkout.",
      "CHECKOUT_REQUIRED",
      subscriptionRequiredError("PRO"),
    );
  }
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

async function persistCancelAtPeriodEnd(userId: string, cancelAtPeriodEnd: boolean) {
  const updated = await queryOne<Subscription>(
    `UPDATE subscriptions
     SET "cancelAtPeriodEnd" = $1,
         "canceledAt" = CASE WHEN $1 THEN COALESCE("canceledAt", NOW()) ELSE NULL END,
         "updatedAt" = NOW()
     WHERE "userId" = $2
     RETURNING *`,
    [cancelAtPeriodEnd, userId],
  );
  if (!updated) throw notFound("Assinatura nao encontrada", "SUBSCRIPTION_NOT_FOUND");
  return updated;
}

export async function cancelSubscription(userId: string) {
  const current = await resolveSubscription(userId);
  if (!current || !grantsAccess(current)) {
    throw paymentRequired(
      "Sua conta precisa de um plano ativo para continuar.",
      "SUBSCRIPTION_REQUIRED",
      subscriptionRequiredError(current?.plan),
    );
  }

  if (current.plan === "FREE") {
    return presentSubscription(current);
  }

  if (periodHasEnded(current.currentPeriodEnd)) {
    if (current.stripeSubscriptionId && env.NODE_ENV !== "test") {
      try {
        await getStripe().subscriptions.cancel(current.stripeSubscriptionId);
      } catch (error) {
        logger.warn("stripe recusou o cancelamento imediato; aplicando Free no banco", {
          userId,
          stripeSubscriptionId: current.stripeSubscriptionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const downgraded = await downgradeToFree(userId);
    logger.info("periodo ja encerrado; cancelamento imediato para Free", { userId });
    return presentSubscription(downgraded);
  }

  if (current.cancelAtPeriodEnd) {
    return presentSubscription(current);
  }

  if (current.stripeSubscriptionId && env.NODE_ENV !== "test") {
    try {
      await getStripe().subscriptions.update(current.stripeSubscriptionId, {
        cancel_at_period_end: true,
        cancel_at: "min_period_end",
      });
    } catch (error) {
      logger.warn("stripe recusou o cancelamento; aplicando no banco", {
        userId,
        stripeSubscriptionId: current.stripeSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const updated = await persistCancelAtPeriodEnd(userId, true);
  logger.info("assinatura marcada para cancelar no fim do periodo", { userId, plan: current.plan });
  return presentSubscription(updated);
}

export async function resumeSubscription(userId: string) {
  const current = await resolveSubscription(userId);
  if (!current || current.plan === "FREE" || !grantsAccess(current)) {
    throw paymentRequired(
      "Nao ha assinatura paga para retomar.",
      "SUBSCRIPTION_REQUIRED",
      subscriptionRequiredError(current?.plan),
    );
  }

  if (!current.cancelAtPeriodEnd) {
    return presentSubscription(current);
  }

  if (current.stripeSubscriptionId && env.NODE_ENV !== "test") {
    try {
      await getStripe().subscriptions.update(current.stripeSubscriptionId, {
        cancel_at_period_end: false,
        cancel_at: "",
      });
    } catch (error) {
      logger.warn("stripe recusou o resume; aplicando no banco", {
        userId,
        stripeSubscriptionId: current.stripeSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const updated = await persistCancelAtPeriodEnd(userId, false);
  logger.info("cancelamento revertido", { userId });
  return presentSubscription(updated);
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
    return_url: `${env.FRONTEND_URL}/assinatura`,
  });

  return { portalUrl: session.url };
}

/** Processa um evento Stripe ja validado. Idempotente por `event.id`. */
export async function processStripeEvent(event: Stripe.Event) {
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

  return processStripeEvent(event);
}

export async function ownerHasActivePlan(userId: string) {
  const subscription = await resolveSubscription(userId);
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
        event.created,
      );
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncStripeSubscription(event.data.object as Stripe.Subscription, null, event.created);
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = getInvoiceSubscription(invoice);
      const stripeSub = await resolveStripeSubscription(subscriptionRef);
      if (stripeSub) await syncStripeSubscription(stripeSub, null, event.created);
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

function isStaleStripeEvent(current: Subscription | null, eventCreated: number | null | undefined) {
  if (eventCreated == null || current?.lastStripeEventCreated == null) return false;
  return eventCreated < current.lastStripeEventCreated;
}

function belongsToCurrentStripeSubscription(current: Subscription | null, stripeSubId: string) {
  if (!current?.stripeSubscriptionId) return true;
  return current.stripeSubscriptionId === stripeSubId;
}

async function syncStripeSubscription(
  stripeSub: Stripe.Subscription,
  fallbackUserId?: string | null,
  eventCreated?: number | null,
) {
  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
  const userId =
    stripeSub.metadata?.userId ||
    fallbackUserId ||
    (await queryOne<User>(`SELECT * FROM users WHERE "stripeCustomerId" = $1`, [customerId]))?.id;

  if (!userId) {
    logger.warn("webhook sem userId", { stripeSubscriptionId: stripeSub.id, customerId });
    throw notFound("Usuario da assinatura nao encontrado", "USER_NOT_FOUND");
  }

  const current = await getSubscriptionByUserId(userId);
  if (isStaleStripeEvent(current, eventCreated)) {
    logger.info("webhook fora de ordem ignorado", {
      userId,
      stripeSubscriptionId: stripeSub.id,
      eventCreated,
      lastStripeEventCreated: current?.lastStripeEventCreated,
    });
    return current!;
  }

  if (
    !belongsToCurrentStripeSubscription(current, stripeSub.id) &&
    grantsAccess(current) &&
    isPaidPlan(current!.plan)
  ) {
    logger.info("webhook de assinatura antiga ignorado", {
      userId,
      incoming: stripeSub.id,
      current: current!.stripeSubscriptionId,
    });
    return current!;
  }

  const price = stripeSub.items.data[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  const metadataPlan = stripeSub.metadata?.plan;
  const plan =
    (metadataPlan === "PRO" || metadataPlan === "PREMIUM" ? metadataPlan : undefined) ||
    planFromPriceId(priceId) ||
    (isPaidPlan(current?.plan ?? "FREE") ? current!.plan : "PRO");

  const period = periodFromSubscription(stripeSub);
  const trialEndsAt = fromUnix(stripeSub.trial_end);
  const status = mapStripeStatus(stripeSub.status);
  const canceledAt = fromUnix(stripeSub.canceled_at);

  const lostPaidAccess = ["CANCELED", "UNPAID", "INCOMPLETE_EXPIRED", "PAUSED"].includes(status);
  if (lostPaidAccess) {
    if (current?.plan === "FREE") return current;
    return downgradeToFree(userId, eventCreated);
  }

  if (
    !grantsAccess({ ...current, plan: isPaidPlan(plan) ? plan : "PRO", status } as Subscription) &&
    current?.plan === "FREE"
  ) {
    return current;
  }

  const paidPlan = isPaidPlan(plan) ? plan : "PRO";

  const saved = await upsertSubscription({
    userId,
    plan: paidPlan,
    status,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId ?? null,
    trialUsed: Boolean(trialEndsAt) || status === "TRIALING",
    trialEndsAt,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end) || stripeSub.cancel_at != null,
    canceledAt,
    lastStripeEventCreated: eventCreated ?? current?.lastStripeEventCreated ?? null,
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

async function activateLocalPaidPlan(userId: string, plan: PaidPlan) {
  return upsertSubscription({
    userId,
    plan,
    status: "ACTIVE",
    stripeSubscriptionId: null,
    stripePriceId: null,
    trialUsed: false,
    trialEndsAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    lastStripeEventCreated: null,
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
  lastStripeEventCreated?: number | null;
}) {
  return queryOne<Subscription>(
    `INSERT INTO subscriptions (
       "userId", plan, status, "stripeSubscriptionId", "stripePriceId",
       "trialUsed", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd",
       "cancelAtPeriodEnd", "canceledAt", "lastStripeEventCreated"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
       "lastStripeEventCreated" = COALESCE(EXCLUDED."lastStripeEventCreated", subscriptions."lastStripeEventCreated"),
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
      input.lastStripeEventCreated ?? null,
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
