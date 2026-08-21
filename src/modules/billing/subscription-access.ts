import { env } from "../../config/env";
import type { Plan, Subscription } from "../../db/types";
import { getPlanCatalog } from "./plans";

const ACCESS_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

export function grantsAccess(subscription: Subscription | null | undefined) {
  if (!subscription) return false;
  return ACCESS_STATUSES.has(subscription.status);
}

export function presentSubscription(subscription: Subscription | null) {
  if (!subscription) {
    return {
      plan: null,
      status: null,
      trialUsed: false,
      isTrialing: false,
      grantsAccess: false,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      entitlements: null,
    };
  }

  const catalog = getPlanCatalog(subscription.plan);

  return {
    plan: subscription.plan,
    status: subscription.status,
    trialUsed: subscription.trialUsed,
    isTrialing: subscription.status === "TRIALING",
    grantsAccess: grantsAccess(subscription),
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt,
    entitlements: catalog.entitlements,
    trialDays: env.STRIPE_TRIAL_DAYS,
  };
}

export function subscriptionRequiredError(plan?: Plan | null) {
  return {
    trialDays: env.STRIPE_TRIAL_DAYS,
    suggestedPlan: plan ?? "PRO",
  };
}
