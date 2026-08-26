import type { NextFunction, Request, Response } from "express";
import type { Subscription } from "../db/types";
import { paymentRequired } from "../lib/errors";
import * as billingService from "../modules/billing/billing.service";
import { subscriptionRequiredError } from "../modules/billing/subscription-access";

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware `requireActiveSubscription`. */
      subscription?: Subscription;
    }
  }
}

/**
 * Bloqueia o painel (/me/*) se nao houver plano ativo (Free, Pro ou Premium).
 * Precisa rodar depois de `authenticate`.
 */
export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  const subscription = await billingService.resolveSubscription(req.user!.id);

  if (!billingService.grantsAccess(subscription)) {
    throw paymentRequired(
      "Sua conta precisa de um plano ativo para continuar.",
      "SUBSCRIPTION_REQUIRED",
      subscriptionRequiredError(subscription?.plan),
    );
  }

  req.subscription = subscription!;
  next();
}
