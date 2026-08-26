-- Plano Free: cadastro sem cartao e sem trial. Upgrade vai para Pro/Premium na Stripe.

ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'FREE';
