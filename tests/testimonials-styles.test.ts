import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { closeDb, query } from "../src/db/client";

const app = createApp();
const password = "Teste1234!";
const stamp = Date.now();
const email = `testimonial-styles-${stamp}@demo.com`;
const username = `tstyles${stamp}`.slice(0, 20);

let accessToken = "";
let testimonialId = "";

function auth() {
  return { Authorization: `Bearer ${accessToken}` };
}

beforeAll(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [email]);

  const register = await request(app)
    .post("/auth/register")
    .send({ name: "Estilos Depoimento", email, password, confirmPassword: password });

  accessToken = register.body.data.accessToken;

  await request(app)
    .put("/me/profile")
    .set(auth())
    .send({ username, displayName: "Estilos Depoimento" });

  await request(app)
    .post("/me/profile/blocks")
    .set(auth())
    .send({
      type: "WHATSAPP",
      content: { phone: "5561999999999", message: "Oi!" },
    });

  const published = await request(app).post("/me/profile/publish").set(auth());
  expect(published.status).toBe(200);
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
  await closeDb();
});

describe("estilos por depoimento", () => {
  it("POST com layout quote persiste e retorna no GET", async () => {
    const created = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({
        authorName: "Ana Clara",
        text: "Excelente atendimento.",
        layout: "quote",
        spacing: "lg",
      });

    expect(created.status).toBe(201);
    expect(created.body.data.layout).toBe("quote");
    expect(created.body.data.spacing).toBe("lg");
    expect(created.body.data.padding).toBeNull();
    testimonialId = created.body.data.id;

    const listed = await request(app).get("/me/profile/testimonials").set(auth());
    expect(listed.status).toBe(200);
    expect(listed.body.data[0]).toMatchObject({
      id: testimonialId,
      layout: "quote",
      spacing: "lg",
      padding: null,
    });
  });

  it("PATCH altera padding e spacing individualmente", async () => {
    const updated = await request(app)
      .patch(`/me/profile/testimonials/${testimonialId}`)
      .set(auth())
      .send({ padding: "sm", spacing: "md" });

    expect(updated.status).toBe(200);
    expect(updated.body.data.padding).toBe("sm");
    expect(updated.body.data.spacing).toBe("md");
    expect(updated.body.data.layout).toBe("quote");
  });

  it("GET /p/:username devolve layout, padding e spacing", async () => {
    const publicPage = await request(app).get(`/p/${username}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body.data.testimonials[0]).toMatchObject({
      layout: "quote",
      padding: "sm",
      spacing: "md",
    });
  });

  it("layout invalido retorna 422", async () => {
    const response = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({
        authorName: "Teste",
        text: "Texto valido.",
        layout: "carousel",
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("limite Free (2 depoimentos) retorna 402 no terceiro POST", async () => {
    const second = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({ authorName: "Segundo", text: "Outro depoimento valido." });
    expect(second.status).toBe(201);

    const third = await request(app)
      .post("/me/profile/testimonials")
      .set(auth())
      .send({ authorName: "Terceiro", text: "Deveria ser bloqueado." });

    expect(third.status).toBe(402);
    expect(third.body.error.code).toBe("PLAN_LIMIT_REACHED");
    expect(third.body.error.details).toMatchObject({
      currentPlan: "FREE",
      limit: 2,
      entitlement: "maxTestimonials",
    });
  });
});
