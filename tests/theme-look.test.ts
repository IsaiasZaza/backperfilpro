import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { query } from "../src/db/client";

const app = createApp();
const password = "Teste1234!";
const stamp = Date.now();

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function register(prefix: string) {
  const email = `${prefix}-${stamp}@demo.com`;
  const response = await request(app)
    .post("/auth/register")
    .send({ name: "Tema Look", email, password, confirmPassword: password });
  expect(response.status).toBe(201);
  return { email, token: response.body.data.accessToken as string, userId: response.body.data.user.id as string };
}

describe("tema e look dos blocos", () => {
  const created: string[] = [];

  afterAll(async () => {
    if (created.length > 0) {
      await query(`DELETE FROM users WHERE email = ANY($1::text[])`, [created]);
    }
  });

  it("Pro persiste atmosphere, backgroundImage e overlay", async () => {
    const account = await register("theme-pro");
    created.push(account.email);
    await request(app).post("/billing/checkout").send({ email: account.email, password, plan: "PRO" });

    const put = await request(app)
      .put("/me/profile")
      .set(auth(account.token))
      .send({
        theme: {
          atmosphere: "claw",
          backgroundImage: "https://example.com/a.jpg",
          overlay: 40,
        },
      });

    expect(put.status).toBe(200);
    expect(put.body.data.theme).toMatchObject({
      atmosphere: "claw",
      backgroundImage: "https://example.com/a.jpg",
      overlay: 40,
    });

    const get = await request(app).get("/me/profile").set(auth(account.token));
    expect(get.body.data.theme).toMatchObject({
      atmosphere: "claw",
      backgroundImage: "https://example.com/a.jpg",
      overlay: 40,
    });
  });

  it("Free PUT theme custom responde 402 customTheme", async () => {
    const account = await register("theme-free");
    created.push(account.email);

    const put = await request(app)
      .put("/me/profile")
      .set(auth(account.token))
      .send({
        theme: {
          atmosphere: "claw",
          backgroundImage: "https://example.com/a.jpg",
          overlay: 40,
        },
      });

    expect(put.status).toBe(402);
    expect(put.body.error.code).toBe("PLAN_FEATURE_LOCKED");
    expect(put.body.error.details).toMatchObject({
      currentPlan: "FREE",
      suggestedPlan: "PRO",
      entitlement: "customTheme",
    });
  });

  it("Free PATCH HERO salva o nome e descarta surface", async () => {
    const account = await register("hero-free");
    created.push(account.email);

    const createdHero = await request(app)
      .post("/me/profile/blocks")
      .set(auth(account.token))
      .send({ type: "HERO", content: { name: "Ana" } });
    expect(createdHero.status).toBe(201);
    const id = createdHero.body.data.id as string;

    const patched = await request(app)
      .patch(`/me/profile/blocks/${id}`)
      .set(auth(account.token))
      .send({ content: { name: "Maria", surface: "neon", layout: "banner" } });

    expect(patched.status).toBe(200);
    expect(patched.body.data.content.name).toBe("Maria");
    expect(patched.body.data.content.surface).toBeUndefined();
    expect(patched.body.data.content.layout).toBeUndefined();

    const listed = await request(app).get("/me/profile/blocks").set(auth(account.token));
    const hero = listed.body.data.find((block: { id: string }) => block.id === id);
    expect(hero.content.name).toBe("Maria");
    expect(hero.content.surface).toBeUndefined();
  });

  it("Pro PATCH LINK persiste thumbnail, layout e badge na publica", async () => {
    const account = await register("link-pro");
    created.push(account.email);
    const username = `linkpro${stamp}`.slice(0, 20);
    await request(app).post("/billing/checkout").send({ email: account.email, password, plan: "PRO" });
    await request(app)
      .put("/me/profile")
      .set(auth(account.token))
      .send({ username, displayName: "Link Pro" });

    const createdLink = await request(app)
      .post("/me/profile/blocks")
      .set(auth(account.token))
      .send({
        type: "LINK_BUTTON",
        content: { label: "Site", url: "https://exemplo.com" },
      });
    expect(createdLink.status).toBe(201);

    const patched = await request(app)
      .patch(`/me/profile/blocks/${createdLink.body.data.id}`)
      .set(auth(account.token))
      .send({
        content: {
          label: "Site",
          url: "https://exemplo.com",
          thumbnailUrl: "https://example.com/thumb.jpg",
          layout: "cover",
          badge: "Novo",
        },
      });

    expect(patched.status).toBe(200);
    expect(patched.body.data.content).toMatchObject({
      thumbnailUrl: "https://example.com/thumb.jpg",
      layout: "cover",
      badge: "Novo",
    });

    await request(app).post("/me/profile/publish").set(auth(account.token));
    const page = await request(app).get(`/p/${username}`);
    expect(page.status).toBe(200);
    const link = page.body.data.blocks.find((block: { type: string }) => block.type === "LINK_BUTTON");
    expect(link.content).toMatchObject({
      thumbnailUrl: "https://example.com/thumb.jpg",
      layout: "cover",
      badge: "Novo",
    });
  });

  it("enum invalido no look nao derruba o PATCH", async () => {
    const account = await register("look-enum");
    created.push(account.email);
    await request(app).post("/billing/checkout").send({ email: account.email, password, plan: "PRO" });

    const createdHero = await request(app)
      .post("/me/profile/blocks")
      .set(auth(account.token))
      .send({ type: "HERO", content: { name: "Ana" } });

    const patched = await request(app)
      .patch(`/me/profile/blocks/${createdHero.body.data.id}`)
      .set(auth(account.token))
      .send({
        content: { name: "Ana", surface: "nao-existe", hover: "lift", layout: "split" },
      });

    expect(patched.status).toBe(200);
    expect(patched.body.data.content.name).toBe("Ana");
    expect(patched.body.data.content.surface).toBeUndefined();
    expect(patched.body.data.content.hover).toBe("lift");
    expect(patched.body.data.content.layout).toBe("split");
  });
});
