import Stripe from "stripe";
import { env } from "../config/env";
import { badRequest } from "./errors";

let client: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(
    env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO && env.STRIPE_PRICE_PREMIUM,
  );
}

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw badRequest(
      "Stripe nao configurada. Defina STRIPE_SECRET_KEY no .env e rode npm run stripe:setup.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return client;
}

export function priceIdForPlan(plan: "PRO" | "PREMIUM") {
  const priceId = plan === "PRO" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_PREMIUM;
  if (!priceId) {
    throw badRequest(
      "Price ID da Stripe nao configurado. Rode npm run stripe:setup e cole STRIPE_PRICE_PRO / STRIPE_PRICE_PREMIUM no .env.",
      "STRIPE_PRICE_MISSING",
    );
  }
  return priceId;
}

export function planFromPriceId(priceId: string | null | undefined): "PRO" | "PREMIUM" | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_PRO) return "PRO";
  if (priceId === env.STRIPE_PRICE_PREMIUM) return "PREMIUM";
  return null;
}
