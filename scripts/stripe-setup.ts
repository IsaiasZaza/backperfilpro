import "dotenv/config";
import Stripe from "stripe";

/**
 * Cria (ou reutiliza) os produtos Pro e Premium na Stripe e imprime os Price IDs.
 * Uso: npm run stripe:setup
 */
async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("Defina STRIPE_SECRET_KEY no .env (chave sk_test_... do Dashboard).");
    process.exit(1);
  }

  const stripe = new Stripe(key);
  const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 7);

  const pro = await upsertPlan(stripe, {
    plan: "PRO",
    name: "PerfilPro Pro",
    description: "Pagina profissional com blocos, servicos e depoimentos.",
    amountCents: 2000,
  });

  const premium = await upsertPlan(stripe, {
    plan: "PREMIUM",
    name: "PerfilPro Premium",
    description: "Tudo do Pro, sem marca PerfilPro e com suporte prioritario.",
    amountCents: 3900,
  });

  await upsertPortal(stripe, [pro, premium]);

  console.log("\nProdutos prontos. Cole isto no .env:\n");
  console.log(`STRIPE_PRICE_PRO=${pro.priceId}`);
  console.log(`STRIPE_PRICE_PREMIUM=${premium.priceId}`);
  console.log(`STRIPE_TRIAL_DAYS=${trialDays}`);
  console.log("\nWebhook local:");
  console.log("  stripe listen --forward-to localhost:3333/billing/webhook");
  console.log("  (cole o whsec_... em STRIPE_WEBHOOK_SECRET)\n");
}

async function upsertPlan(
  stripe: Stripe,
  input: { plan: "PRO" | "PREMIUM"; name: string; description: string; amountCents: number },
) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((item) => item.metadata?.plan === input.plan);

  if (!product) {
    product = await stripe.products.create({
      name: input.name,
      description: input.description,
      metadata: { plan: input.plan },
    });
    console.log(`produto criado: ${input.plan} (${product.id})`);
  } else {
    console.log(`produto existente: ${input.plan} (${product.id})`);
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(
    (item) =>
      item.currency === "brl" &&
      item.unit_amount === input.amountCents &&
      item.recurring?.interval === "month",
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: "brl",
      unit_amount: input.amountCents,
      recurring: { interval: "month" },
      metadata: { plan: input.plan },
    });
    console.log(`preco criado: ${input.plan} ${price.id} (R$ ${(input.amountCents / 100).toFixed(2)}/mes)`);
  } else {
    console.log(`preco existente: ${input.plan} ${price.id}`);
  }

  for (const old of prices.data) {
    if (old.id !== price.id && old.recurring?.interval === "month") {
      await stripe.prices.update(old.id, { active: false });
      console.log(`preco antigo desativado: ${old.id}`);
    }
  }

  return { productId: product.id, priceId: price.id };
}

async function upsertPortal(
  stripe: Stripe,
  plans: Array<{ productId: string; priceId: string }>,
) {
  const existing = await stripe.billingPortal.configurations.list({ limit: 10 });
  const payload = {
    business_profile: {
      headline: "Gerencie sua assinatura PerfilPro",
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] as const },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" as const },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"] as const,
        proration_behavior: "create_prorations" as const,
        products: plans.map((plan) => ({
          product: plan.productId,
          prices: [plan.priceId],
        })),
      },
    },
  };

  if (existing.data[0]) {
    await stripe.billingPortal.configurations.update(existing.data[0].id, payload);
    console.log(`portal de assinatura atualizado (${existing.data[0].id})`);
    return;
  }

  const created = await stripe.billingPortal.configurations.create(payload);
  console.log(`portal de assinatura criado (${created.id})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
