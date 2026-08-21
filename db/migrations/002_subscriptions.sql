-- Assinaturas Stripe: planos Pro e Premium, trial de 7 dias.

DO $$ BEGIN
  CREATE TYPE "Plan" AS ENUM ('PRO', 'PREMIUM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM (
    'INCOMPLETE',
    'INCOMPLETE_EXPIRED',
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'UNPAID',
    'PAUSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "plan" "Plan" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
  "stripeSubscriptionId" TEXT UNIQUE,
  "stripePriceId" TEXT,
  "trialUsed" BOOLEAN NOT NULL DEFAULT FALSE,
  "trialEndsAt" TIMESTAMPTZ,
  "currentPeriodStart" TIMESTAMPTZ,
  "currentPeriodEnd" TIMESTAMPTZ,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT FALSE,
  "canceledAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
