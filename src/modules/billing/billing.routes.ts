import { Router } from "express";
import { ok } from "../../lib/http";
import { authenticate } from "../../middlewares/authenticate";
import { authLimiter } from "../../middlewares/rate-limit";
import { requireActiveSubscription } from "../../middlewares/require-subscription";
import * as billingService from "./billing.service";
import { changePlanSchema, checkoutSchema, confirmSessionSchema } from "./billing.schemas";

export const billingRoutes = Router();

billingRoutes.get("/plans", (_req, res) => {
  return ok(res, { plans: billingService.listPlans() });
});

billingRoutes.post("/checkout", authLimiter, async (req, res) => {
  const input = checkoutSchema.parse(req.body);
  const checkout = await billingService.checkoutWithCredentials(input);
  return ok(res, checkout);
});

billingRoutes.post("/confirm-session", async (req, res) => {
  const { sessionId } = confirmSessionSchema.parse(req.body);
  const subscription = await billingService.confirmCheckoutSession(sessionId);
  return ok(res, { subscription });
});

billingRoutes.get("/subscription", authenticate, async (req, res) => {
  const overview = await billingService.getBillingOverview(req.user!.id);
  return ok(res, overview);
});

billingRoutes.post("/change-plan", authenticate, requireActiveSubscription, async (req, res) => {
  const { plan } = changePlanSchema.parse(req.body);
  const subscription = await billingService.changePlan(req.user!.id, plan);
  return ok(res, { subscription });
});

billingRoutes.post("/cancel", authenticate, requireActiveSubscription, async (req, res) => {
  const subscription = await billingService.cancelSubscription(req.user!.id);
  return ok(res, { subscription });
});

billingRoutes.post("/resume", authenticate, requireActiveSubscription, async (req, res) => {
  const subscription = await billingService.resumeSubscription(req.user!.id);
  return ok(res, { subscription });
});

billingRoutes.post("/portal", authenticate, async (req, res) => {
  const portal = await billingService.createPortalSession(req.user!.id);
  return ok(res, portal);
});
