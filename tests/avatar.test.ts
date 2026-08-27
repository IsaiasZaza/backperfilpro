import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
import { AVATAR_MAX_BYTES } from "../src/lib/upload";
import { avatarObjectPath } from "../src/lib/storage";
import { query } from "../src/db/client";

vi.mock("../src/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/storage")>();
  return {
    ...actual,
    uploadPublicObject: vi.fn(async ({ path }: { path: string }) => ({
      path,
      publicUrl: `https://cdn.test/storage/v1/object/public/avatars/${path}`,
    })),
    removeObject: vi.fn(async () => undefined),
  };
});

import { createApp } from "../src/app";
import { uploadPublicObject, removeObject } from "../src/lib/storage";

const app = createApp();
const password = "Teste1234!";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const uploadPublicObjectMock = vi.mocked(uploadPublicObject);
const removeObjectMock = vi.mocked(removeObject);

async function register(email: string) {
  const response = await request(app)
    .post("/auth/register")
    .send({ name: "Usuario Avatar", email, password, confirmPassword: password });
  expect(response.status).toBe(201);
  return {
    token: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string,
  };
}

describe("avatarObjectPath", () => {
  it("usa o userId e rejeita path traversal", () => {
    expect(avatarObjectPath("user-123")).toBe("user-123.webp");
    expect(() => avatarObjectPath("../etc/passwd")).toThrow(AppError);
    expect(() => avatarObjectPath("foo/bar")).toThrow(AppError);
  });
});

describe("POST /me/profile/avatar", () => {
  const ownerEmail = `avatar-owner-${Date.now()}@demo.com`;
  const otherEmail = `avatar-other-${Date.now()}@demo.com`;
  let ownerToken = "";
  let ownerId = "";
  let otherToken = "";
  let otherId = "";

  beforeAll(async () => {
    await query(`DELETE FROM users WHERE email IN ($1, $2)`, [ownerEmail, otherEmail]);
    const owner = await register(ownerEmail);
    const other = await register(otherEmail);
    ownerToken = owner.token;
    ownerId = owner.userId;
    otherToken = other.token;
    otherId = other.userId;
  });

  afterAll(async () => {
    await query(`DELETE FROM users WHERE email IN ($1, $2)`, [ownerEmail, otherEmail]);
  });

  beforeEach(() => {
    uploadPublicObjectMock.mockClear();
    removeObjectMock.mockClear();
    uploadPublicObjectMock.mockImplementation(async ({ path }) => ({
      path,
      publicUrl: `https://cdn.test/storage/v1/object/public/avatars/${path}`,
    }));
  });

  it("faz upload valido, converte e grava a URL publica", async () => {
    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG_1x1, { filename: "foto.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(response.body.error).toBeNull();
    expect(response.body.data.avatarUrl).toMatch(
      new RegExp(`^https://cdn\\.test/storage/v1/object/public/avatars/${ownerId}\\.webp\\?v=\\d+$`),
    );
    expect(response.body.data.profile.avatarUrl).toBe(response.body.data.avatarUrl);
    expect(uploadPublicObjectMock).toHaveBeenCalledTimes(1);
    expect(uploadPublicObjectMock.mock.calls[0][0]).toMatchObject({
      path: `${ownerId}.webp`,
      contentType: "image/webp",
      upsert: true,
    });
    expect(Buffer.isBuffer(uploadPublicObjectMock.mock.calls[0][0].body)).toBe(true);
  });

  it("rejeita arquivo maior que o limite", async () => {
    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.alloc(AVATAR_MAX_BYTES + 1), {
        filename: "grande.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
    expect(uploadPublicObjectMock).not.toHaveBeenCalled();
  });

  it("rejeita MIME type invalido", async () => {
    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("nao e imagem"), {
        filename: "virus.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_FILE_TYPE");
    expect(uploadPublicObjectMock).not.toHaveBeenCalled();
  });

  it("rejeita arquivo com extensao de imagem mas conteudo invalido", async () => {
    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("isso nao e uma imagem"), {
        filename: "foto.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_FILE_TYPE");
    expect(uploadPublicObjectMock).not.toHaveBeenCalled();
  });

  it("nao deixa um usuario alterar o avatar de outro", async () => {
    const before = await request(app)
      .get("/me/profile")
      .set("Authorization", `Bearer ${otherToken}`);
    const otherAvatarBefore = before.body.data.avatarUrl;

    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG_1x1, { filename: "foto.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(uploadPublicObjectMock.mock.calls[0][0].path).toBe(`${ownerId}.webp`);
    expect(uploadPublicObjectMock.mock.calls[0][0].path).not.toBe(`${otherId}.webp`);

    const after = await request(app)
      .get("/me/profile")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(after.body.data.avatarUrl).toBe(otherAvatarBefore);
  });

  it("substitui o avatar anterior no mesmo path (upsert)", async () => {
    const first = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG_1x1, { filename: "a.png", contentType: "image/png" });
    const second = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG_1x1, { filename: "b.png", contentType: "image/png" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(uploadPublicObjectMock).toHaveBeenCalledTimes(2);
    expect(uploadPublicObjectMock.mock.calls[0][0].path).toBe(`${ownerId}.webp`);
    expect(uploadPublicObjectMock.mock.calls[1][0].path).toBe(`${ownerId}.webp`);
    expect(uploadPublicObjectMock.mock.calls[1][0].upsert).toBe(true);
    expect(second.body.data.avatarUrl).not.toBe(first.body.data.avatarUrl);
  });

  it("remove o objeto anterior do Storage quando o path muda", async () => {
    await query(`UPDATE profiles SET "avatarUrl" = $1 WHERE "userId" = $2`, [
      "https://cdn.test/storage/v1/object/public/avatars/arquivo-antigo.webp",
      ownerId,
    ]);

    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG_1x1, { filename: "nova.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(removeObjectMock).toHaveBeenCalledWith("arquivo-antigo.webp");
  });

  it("devolve 502 quando o Supabase Storage falha", async () => {
    uploadPublicObjectMock.mockRejectedValueOnce(
      new AppError(502, "STORAGE_ERROR", "Nao foi possivel salvar a foto de perfil. Tente novamente."),
    );

    const response = await request(app)
      .post("/me/profile/avatar")
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG_1x1, { filename: "foto.png", contentType: "image/png" });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("STORAGE_ERROR");
  });

  it("bloqueia upload sem autenticacao", async () => {
    const response = await request(app)
      .post("/me/profile/avatar")
      .attach("file", PNG_1x1, { filename: "foto.png", contentType: "image/png" });

    expect(response.status).toBe(401);
    expect(uploadPublicObjectMock).not.toHaveBeenCalled();
  });
});
