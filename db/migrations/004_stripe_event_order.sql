-- Ordenacao de webhooks Stripe e protecao contra eventos atrasados reativando plano pago.

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "lastStripeEventCreated" INTEGER;
