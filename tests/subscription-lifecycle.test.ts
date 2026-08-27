import type Stripe from "stripe";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { closeDb, query } from "../src/db/client";
import { processStripeEvent } from "../src/modules/billing/billing.service";

const app = createApp();
const password = "Teste1234!";
const stamp = Date.now();
const email = `sub-life-${stamp}@demo.com`;
const username = `sublife${stamp}`.slice(0, 20);

let accessToken = "";
let userId = "";
let locationBlockId = "";
let extraServiceId = "";
let extraTestimonialId = "";

function auth() {
  return { Authorization: `Bearer ${accessToken}` };
}

function fakeSubscriptionEvent(input: {
  id: string;
  created: number;
  type: "customer.subscription.updated" | "customer.subscription.deleted";
  subId: string;
  status: Stripe.Subscription.Status;
  plan?: "PRO" | "PREMIUM";
  cancelAtPeriodEnd?: boolean;
}) {
  return {
    id: input.id,
    object: "event",
    api_version: "2026-01-28.clover",
    created: input.created,
    type: input.type,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: {
      object: {
        id: input.subId,
        object: "subscription",
        customer: "cus_audit_test",
        status: input.status,
        metadata: { userId, plan: input.plan ?? "PREMIUM" },
        items: {
          object: "list",
          data: [{ id: "si_1", price: { id: "price_audit_fake" } }],
          has_more: false,
          url: "/v1/subscription_items",
        },
        cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
        cancel_at: null,
        canceled_at: input.status === "canceled" ? input.created : null,
        trial_end: null,
        current_period_start: input.created,
        current_period_end: input.created + 30 * 24 * 60 * 60,
      },
    },
  } as unknown as Stripe.Event;
}

beforeAll(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
  await closeDb();
});

describe("FREE -> PAID -> CANCEL -> FREE", () => {
  it("cadastra no Free", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ name: "Auditoria Planos", email, password, confirmPassword: password });

    expect(response.status).toBe(201);
    expect(response.body.data.subscription.plan).toBe("FREE");
    accessToken = response.body.data.accessToken;
    userId = response.body.data.user.id;
  });

  it("Free nao usa recurso premium nem altera planId pelo payload", async () => {
    await request(app).put("/me/profile").set(auth()).send({ username, displayName: "Auditoria" });

    const theme = await request(app)
      .put("/me/profile")
      .set(auth())
      .send({
        theme: { atmosphere: "cosmic", primaryColor: "", buttonStyle: "" },
      });
    expect(theme.status).toBe(200);
    expect(theme.body.data.theme.atmosphere).toBe("cosmic");

    const mixed = await request(app)
      .put("/me/profile")
      .set(auth())
      .send({
        headline: "Livre",
        theme: { atmosphere: "" },
        plan: "PREMIUM",
        planId: "PREMIUM",
        entitlements: { customTheme: true },
      });
    expect(mixed.status).toBe(200);
    expect(mixed.body.data.headline).toBe("Livre");
    expect(mixed.body.data.theme.atmosphere).toBe("none");
    expect(mixed.body.data.plan).toBeUndefined();

    const location = await request(app)
      .post("/me/profile/blocks")
      .set(auth())
      .send({ type: "LOCATION", content: { address: "Brasilia - DF" } });
    expect(location.status).toBe(402);

    const changePlan = await request(app).post("/billing/change-plan").set(auth()).send({ plan: "PREMIUM" });
    expect(changePlan.status).toBe(402);
  });

  it("upgrade local para Premium libera editor pago", async () => {
    const checkout = await request(app)
      .post("/billing/checkout")
      .send({ email, password, plan: "PREMIUM" });
    expect(checkout.status).toBe(200);
    expect(checkout.body.data.subscription.plan).toBe("PREMIUM");

    const theme = await request(app)
      .put("/me/profile")
      .set(auth())
      .send({ theme: { atmosphere: "cosmic", primaryColor: "#112233" } });
    expect(theme.status).toBe(200);
    expect(theme.body.data.theme.atmosphere).toBe("cosmic");

    const location = await request(app)
      .post("/me/profile/blocks")
      .set(auth())
      .send({ type: "LOCATION", content: { address: "Asa Norte" } });
    expect(location.status).toBe(201);
    locationBlockId = location.body.data.id;

    const serviceA = await request(app)
      .post("/me/profile/services")
      .set(auth())
      .send({ name: "Servico 1", priceCents: 1000 });
    const serviceB = await request(app)
      .post("/me/profile/services")
      .set(auth())
      .send({ name: "Servico 2", priceCents: 2000 });
    const serviceC = await request(app)
      .post("/me/profile/services")
      .set(auth())
      .send({ name: "Servico 3", priceCents: 3000 });
    expect(serviceA.status).toBe(201);
    expect(serviceB.status).toBe(201);
    expect(serviceC.status).toBe(201);
    extraServiceId = serviceC.body.data.id;

    const t1 = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({ authorName: "Ana", text: "Otima", rating: 5 });
    const t2 = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({ authorName: "Bia", text: "Boa", rating: 4 });
    const t3 = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({ authorName: "Caio", text: "Extra", rating: 5 });
    expect(t3.status).toBe(201);
    extraTestimonialId = t3.body.data.id;
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
  });

  it("cancelamento no fim do periodo mantem o plano pago", async () => {
    await query(
      `UPDATE subscriptions
       SET "currentPeriodEnd" = NOW() + INTERVAL '10 days',
           "stripeSubscriptionId" = 'sub_audit_current'
       WHERE "userId" = $1`,
      [userId],
    );

    const cancel = await request(app).post("/billing/cancel").set(auth());
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.subscription.plan).toBe("PREMIUM");
    expect(cancel.body.data.subscription.cancelAtPeriodEnd).toBe(true);

    const stillPaid = await request(app)
      .patch(`/me/profile/blocks/${locationBlockId}`)
      .set(auth())
      .send({ content: { address: "Ainda pago" } });
    expect(stillPaid.status).toBe(200);
  });

  it("resume volta o cancelamento e o editor pago continua", async () => {
    const resume = await request(app).post("/billing/resume").set(auth());
    expect(resume.status).toBe(200);
    expect(resume.body.data.subscription.cancelAtPeriodEnd).toBe(false);
    expect(resume.body.data.subscription.plan).toBe("PREMIUM");
  });

  it("apos o periodo encerrar, cai para Free e bloqueia o editor premium", async () => {
    await request(app).post("/billing/cancel").set(auth());
    await query(
      `UPDATE subscriptions SET "currentPeriodEnd" = NOW() - INTERVAL '1 day' WHERE "userId" = $1`,
      [userId],
    );

    const me = await request(app).get("/auth/me").set(auth());
    expect(me.status).toBe(200);
    expect(me.body.data.subscription.plan).toBe("FREE");
    expect(me.body.data.subscription.entitlements.customTheme).toBe(false);

    const profile = await request(app).get("/me/profile").set(auth());
    expect(profile.body.data.theme.atmosphere).toBe("cosmic");

    const storedTheme = await query<{ theme: Record<string, unknown> }>(
      `SELECT theme FROM profiles WHERE "userId" = $1`,
      [userId],
    );
    expect(storedTheme[0]?.theme).toMatchObject({ atmosphere: "cosmic" });

    const clearAtmosphere = await request(app)
      .put("/me/profile")
      .set(auth())
      .send({ theme: { atmosphere: "" } });
    expect(clearAtmosphere.status).toBe(200);
    expect(clearAtmosphere.body.data.theme.atmosphere).toBe("none");

    await request(app)
      .put("/me/profile")
      .set(auth())
      .send({ theme: { atmosphere: "cosmic" } });

    const location = await request(app)
      .patch(`/me/profile/blocks/${locationBlockId}`)
      .set(auth())
      .send({ content: { address: "Tentativa Free" } });
    expect(location.status).toBe(402);
    expect(location.body.error.code).toBe("PLAN_FEATURE_LOCKED");

    const extraService = await request(app)
      .patch(`/me/profile/services/${extraServiceId}`)
      .set(auth())
      .send({ name: "Nao pode" });
    expect(extraService.status).toBe(402);
    expect(extraService.body.error.code).toBe("PLAN_LIMIT_REACHED");

    const extraTestimonial = await request(app)
      .patch(`/me/profile/testimonials/${extraTestimonialId}`)
      .set(auth())
      .send({ text: "Nao pode" });
    expect(extraTestimonial.status).toBe(402);

    const createPremium = await request(app)
      .post("/me/profile/blocks")
      .set(auth())
      .send({ type: "CTA_BUTTON", content: { label: "X", url: "https://exemplo.com" } });
    expect(createPremium.status).toBe(402);

    await request(app).post("/me/profile/publish").set(auth());
    const publicPage = await request(app).get(`/p/${username}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.data.theme).toEqual({});
    expect(publicPage.body.data.showBranding).toBe(true);
    expect(publicPage.body.data.blocks.some((block: { type: string }) => block.type === "LOCATION")).toBe(
      false,
    );
    expect(publicPage.body.data.services).toHaveLength(2);
    expect(publicPage.body.data.testimonials).toHaveLength(2);

    const preview = await request(app).get("/me/profile/preview").set(auth());
    expect(preview.body.data.theme).toEqual({});
    expect(preview.body.data.blocks.some((block: { type: string }) => block.type === "LOCATION")).toBe(
      false,
    );

    const blocks = await request(app).get("/me/profile/blocks").set(auth());
    expect(blocks.body.data.some((block: { type: string }) => block.type === "LOCATION")).toBe(false);
    expect(blocks.body.data.every((block: { type: string }) => ["HERO", "LINK_BUTTON", "WHATSAPP", "SOCIAL"].includes(block.type))).toBe(true);

    const services = await request(app).get("/me/profile/services").set(auth());
    expect(services.body.data).toHaveLength(2);

    const testimonials = await request(app).get("/me/profile/testimonials").set(auth());
    expect(testimonials.body.data).toHaveLength(2);
  });

  it("permite assinar de novo depois do Free e recupera o conteudo pago", async () => {
    const checkout = await request(app)
      .post("/billing/checkout")
      .send({ email, password, plan: "PREMIUM" });
    expect(checkout.status).toBe(200);
    expect(checkout.body.data.subscription.plan).toBe("PREMIUM");

    const profile = await request(app).get("/me/profile").set(auth());
    expect(profile.body.data.theme.atmosphere).toBe("cosmic");

    const location = await request(app)
      .patch(`/me/profile/blocks/${locationBlockId}`)
      .set(auth())
      .send({ content: { address: "De volta ao Premium" } });
    expect(location.status).toBe(200);
  });
});

describe("webhooks Stripe", () => {
  it("pagamento recusado (UNPAID) rebaixa para Free", async () => {
    await query(
      `UPDATE subscriptions SET plan = 'PREMIUM', status = 'UNPAID', "cancelAtPeriodEnd" = FALSE WHERE "userId" = $1`,
      [userId],
    );

    const me = await request(app).get("/billing/subscription").set(auth());
    expect(me.body.data.subscription.plan).toBe("FREE");
    expect(me.body.data.subscription.status).toBe("ACTIVE");
  });

  it("evento duplicado e ignorado", async () => {
    const event = fakeSubscriptionEvent({
      id: `evt_dup_${stamp}`,
      created: Math.floor(Date.now() / 1000),
      type: "customer.subscription.updated",
      subId: "sub_dup",
      status: "active",
      plan: "PREMIUM",
    });

    const first = await processStripeEvent(event);
    const second = await processStripeEvent(event);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });

  it("evento fora de ordem nao reativa plano pago", async () => {
    const canceled = fakeSubscriptionEvent({
      id: `evt_cancel_${stamp}`,
      created: 2_000,
      type: "customer.subscription.deleted",
      subId: "sub_order",
      status: "canceled",
    });
    const staleActive = fakeSubscriptionEvent({
      id: `evt_stale_${stamp}`,
      created: 1_000,
      type: "customer.subscription.updated",
      subId: "sub_order",
      status: "active",
    });

    await processStripeEvent(canceled);
    const afterCancel = await request(app).get("/billing/subscription").set(auth());
    expect(afterCancel.body.data.subscription.plan).toBe("FREE");

    await processStripeEvent(staleActive);
    const afterStale = await request(app).get("/billing/subscription").set(auth());
    expect(afterStale.body.data.subscription.plan).toBe("FREE");
  });

  it("webhook de assinatura antiga nao derruba a nova", async () => {
    await request(app).post("/billing/checkout").send({ email, password, plan: "PRO" });
    await query(
      `UPDATE subscriptions SET "stripeSubscriptionId" = 'sub_new', "lastStripeEventCreated" = 3000 WHERE "userId" = $1`,
      [userId],
    );

    const oldDeleted = fakeSubscriptionEvent({
      id: `evt_old_${stamp}`,
      created: 4_000,
      type: "customer.subscription.deleted",
      subId: "sub_old",
      status: "canceled",
    });
    await processStripeEvent(oldDeleted);

    const current = await request(app).get("/billing/subscription").set(auth());
    expect(current.body.data.subscription.plan).toBe("PRO");
  });
});
