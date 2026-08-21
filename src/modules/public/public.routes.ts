import { Router } from "express";
import { z } from "zod";
import { ok } from "../../lib/http";
import { isReservedUsername } from "../../lib/username";
import { presentPublicPage } from "../profile/profile.presenter";
import { getPublicProfile, isUsernameAvailable } from "../profile/profile.service";
import { checkUsernameQuerySchema, usernameSchema } from "../profile/profile.schemas";

/** Rotas abertas (sem login): a pagina publica e a checagem de username. */
export const publicRoutes = Router();

publicRoutes.get("/p/:username", async (req, res) => {
  const { username } = z.object({ username: z.string() }).parse(req.params);
  const profile = await getPublicProfile(username);
  return ok(res, presentPublicPage(profile));
});

publicRoutes.get("/usernames/check", async (req, res) => {
  const { username } = checkUsernameQuerySchema.parse(req.query);

  const format = usernameSchema.safeParse(username);
  if (!format.success) {
    return ok(res, {
      available: false,
      reason: "INVALID_FORMAT",
      message: format.error.issues[0]?.message ?? "Username invalido",
    });
  }
  if (isReservedUsername(format.data)) {
    return ok(res, {
      available: false,
      reason: "RESERVED",
      message: "Esse username e reservado pelo sistema",
    });
  }

  const available = await isUsernameAvailable(format.data);
  return ok(res, {
    available,
    reason: available ? null : "TAKEN",
    message: available ? "Username disponivel" : "Esse username ja esta em uso",
  });
});
