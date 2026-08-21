import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { closeDb, query } from "../src/db/client";

/**
 * Fluxo completo: cadastro -> login -> builder -> publicar -> pagina publica.
 */
const app = createApp();

const email = `e2e-${Date.now()}@demo.com`;
const password = "Teste1234!";
const username = `e2e-${Date.now()}`.slice(0, 20);

let accessToken = "";
let blockId = "";

beforeAll(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
  await closeDb();
});

describe("fluxo do usuario", () => {
  it("registra a conta, escolhe o plano e inicia o trial (sem login)", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ name: "Usuario E2E", email, password, confirmPassword: password, plan: "PRO" });

    expect(response.status).toBe(201);
    expect(response.body.error).toBeNull();
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.plan).toBe("PRO");
    expect(response.body.data.trialGranted).toBe(true);
  });

  it("lista os planos Pro e Premium", async () => {
    const response = await request(app).get("/billing/plans");
    expect(response.status).toBe(200);
    expect(response.body.data.plans.map((plan: { id: string }) => plan.id)).toEqual([
      "PRO",
      "PREMIUM",
    ]);
    expect(response.body.data.trialDays).toBe(7);
  });

  it("recusa senha errada no login", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({ email, password: "senha-errada" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("faz login e devolve o access token", async () => {
    const response = await request(app).post("/auth/login").send({ email, password });

    expect(response.status).toBe(200);
    accessToken = response.body.data.accessToken;
    expect(accessToken).toBeTruthy();
    expect(response.body.data.subscription.plan).toBe("PRO");
    expect(response.body.data.subscription.grantsAccess).toBe(true);
  });

  it("recusa login sem assinatura ativa", async () => {
    const noPlanEmail = `e2e-noplan-${Date.now()}@demo.com`;
    await request(app)
      .post("/auth/register")
      .send({
        name: "Sem Plano",
        email: noPlanEmail,
        password,
        confirmPassword: password,
        plan: "PRO",
      });
    await query(`DELETE FROM subscriptions WHERE "userId" = (SELECT id FROM users WHERE email = $1)`, [
      noPlanEmail,
    ]);

    const response = await request(app).post("/auth/login").send({ email: noPlanEmail, password });
    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe("SUBSCRIPTION_REQUIRED");

    await query(`DELETE FROM users WHERE email = $1`, [noPlanEmail]);
  });

  it("bloqueia rotas privadas sem token", async () => {
    const response = await request(app).get("/me/profile");
    expect(response.status).toBe(401);
  });

  it("define o username e os dados do perfil", async () => {
    const response = await request(app)
      .put("/me/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        username,
        displayName: "Usuario E2E",
        headline: "Testes automatizados",
        location: "Brasilia - DF",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.username).toBe(username);
    expect(response.body.data.status).toBe("DRAFT");
  });

  it("informa que o username ficou indisponivel", async () => {
    const response = await request(app).get("/usernames/check").query({ username });

    expect(response.status).toBe(200);
    expect(response.body.data.available).toBe(false);
    expect(response.body.data.reason).toBe("TAKEN");
  });

  it("recusa username reservado", async () => {
    const response = await request(app).get("/usernames/check").query({ username: "admin" });
    expect(response.body.data.reason).toBe("RESERVED");
  });

  it("nao publica sem nenhum bloco", async () => {
    const response = await request(app)
      .post("/me/profile/publish")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("NO_BLOCKS");
  });

  it("cria um bloco de WhatsApp", async () => {
    const response = await request(app)
      .post("/me/profile/blocks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        type: "WHATSAPP",
        content: { phone: "5561999999999", message: "Oi! Vi seu perfil" },
      });

    expect(response.status).toBe(201);
    blockId = response.body.data.id;
    expect(response.body.data.content.phone).toBe("5561999999999");
  });

  it("valida o content de acordo com o tipo do bloco", async () => {
    const response = await request(app)
      .post("/me/profile/blocks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "CTA_BUTTON", content: { label: "Agendar", url: "javascript:alert(1)" } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cria um servico", async () => {
    const response = await request(app)
      .post("/me/profile/services")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Volume Brasileiro", priceCents: 18000 });

    expect(response.status).toBe(201);
    expect(response.body.data.priceFormatted).toContain("180,00");
  });

  it("nao mostra a pagina enquanto esta em rascunho", async () => {
    const response = await request(app).get(`/p/${username}`);
    expect(response.status).toBe(404);
  });

  it("publica a pagina", async () => {
    const response = await request(app)
      .post("/me/profile/publish")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("PUBLISHED");
  });

  it("serve a pagina publica com blocos e servicos", async () => {
    const response = await request(app).get(`/p/${username}`);

    expect(response.status).toBe(200);
    expect(response.body.data.username).toBe(username);
    expect(response.body.data.blocks).toHaveLength(1);
    expect(response.body.data.services).toHaveLength(1);
  });

  it("esconde o bloco marcado como invisivel", async () => {
    await request(app)
      .patch(`/me/profile/blocks/${blockId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ isVisible: false });

    const publicPage = await request(app).get(`/p/${username}`);
    expect(publicPage.body.data.blocks).toHaveLength(0);
    expect(publicPage.body.data.showBranding).toBe(true);

    const preview = await request(app)
      .get("/me/profile/preview")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(preview.body.data.blocks).toHaveLength(1);
  });

  it("impede editar bloco de outro usuario", async () => {
    const otherEmail = `e2e-outro-${Date.now()}@demo.com`;
    await request(app)
      .post("/auth/register")
      .send({
        name: "Outro",
        email: otherEmail,
        password,
        confirmPassword: password,
        plan: "PRO",
      });
    const otherLogin = await request(app).post("/auth/login").send({ email: otherEmail, password });

    const response = await request(app)
      .patch(`/me/profile/blocks/${blockId}`)
      .set("Authorization", `Bearer ${otherLogin.body.data.accessToken}`)
      .send({ isVisible: true });

    expect(response.status).toBe(404);
    await query(`DELETE FROM users WHERE email = $1`, [otherEmail]);
  });
});
