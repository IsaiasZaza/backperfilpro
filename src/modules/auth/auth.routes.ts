import { Router } from "express";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../lib/cookies";
import { unauthorized } from "../../lib/errors";
import { ok } from "../../lib/http";
import { authenticate } from "../../middlewares/authenticate";
import { authLimiter, forgotPasswordLimiter } from "../../middlewares/rate-limit";
import * as authService from "./auth.service";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schemas";

export const authRoutes = Router();

authRoutes.post("/register", authLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.register(input);

  setAuthCookies(res, accessToken, refreshToken);
  return ok(res, { user, accessToken }, 201);
});

authRoutes.post("/login", authLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.login(input);

  setAuthCookies(res, accessToken, refreshToken);
  return ok(res, { user, accessToken });
});

authRoutes.post("/refresh", async (req, res) => {
  const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? req.body?.refreshToken;
  if (!token) throw unauthorized("Refresh token nao informado", "MISSING_REFRESH_TOKEN");

  const { user, accessToken, refreshToken } = await authService.refresh(token);

  setAuthCookies(res, accessToken, refreshToken);
  return ok(res, { user, accessToken });
});

authRoutes.post("/logout", async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken);
  clearAuthCookies(res);
  return ok(res, { message: "Sessao encerrada" });
});

authRoutes.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email);

  // resposta identica exista ou nao o e-mail (evita enumeracao de usuarios)
  return ok(res, {
    message: "Se existir uma conta com esse e-mail, enviamos o link de recuperacao.",
  });
});

authRoutes.post("/reset-password", authLimiter, async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(input);
  clearAuthCookies(res);

  return ok(res, { message: "Senha alterada com sucesso. Faca login novamente." });
});

authRoutes.get("/me", authenticate, async (req, res) => {
  const me = await authService.getMe(req.user!.id);
  return ok(res, me);
});
