import { env } from "../../config/env";
import { query, queryOne, withTransaction } from "../../db/client";
import type { PasswordResetToken, Profile, RefreshToken, User } from "../../db/types";
import { conflict, unauthorized } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { buildPasswordResetEmail, sendMail } from "../../lib/mailer";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  addDays,
  addMinutes,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
} from "../../lib/tokens";
import { buildTemporaryUsername } from "../../lib/username";
import {
  activateFreePlan,
  assertLoginAllowed,
  presentSubscription,
  resolveSubscription,
} from "../billing/billing.service";
import type { RegisterInput } from "./auth.schemas";

/** Nunca devolvemos passwordHash para o cliente. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

async function issueTokens(user: User) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const { token: refreshToken, tokenHash } = generateOpaqueToken();

  await query(
    `INSERT INTO refresh_tokens ("userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, addDays(env.REFRESH_TOKEN_TTL_DAYS)],
  );

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await queryOne<User>(`SELECT * FROM users WHERE email = $1`, [input.email]);
  if (existing) {
    throw conflict("Ja existe uma conta com esse e-mail", "EMAIL_ALREADY_USED");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await queryOne<User>(
    `INSERT INTO users (name, email, "passwordHash")
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, input.email, passwordHash],
  );
  if (!user) throw new Error("Falha ao criar usuario");

  await query(
    `INSERT INTO profiles ("userId", username, "displayName", status)
     VALUES ($1, $2, $3, 'DRAFT')`,
    [user.id, buildTemporaryUsername(user.id), user.name],
  );

  const subscription = await activateFreePlan(user.id);
  const tokens = await issueTokens(user);
  logger.info("usuario registrado no plano Free", { userId: user.id });

  return {
    user: toPublicUser(user),
    subscription: presentSubscription(subscription),
    ...tokens,
  };
}

export async function login(input: { email: string; password: string }) {
  const user = await queryOne<User>(`SELECT * FROM users WHERE email = $1`, [input.email]);
  const invalid = unauthorized("E-mail ou senha invalidos", "INVALID_CREDENTIALS");
  if (!user) throw invalid;

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) throw invalid;

  const subscription = await assertLoginAllowed(user);
  const tokens = await issueTokens(user);
  logger.info("login realizado", { userId: user.id, plan: subscription.plan });

  return { user: toPublicUser(user), subscription: presentSubscription(subscription), ...tokens };
}

export async function refresh(rawRefreshToken: string) {
  const token = await queryOne<RefreshToken>(
    `SELECT * FROM refresh_tokens WHERE "tokenHash" = $1`,
    [hashToken(rawRefreshToken)],
  );

  if (!token || token.revokedAt || token.expiresAt < new Date()) {
    throw unauthorized("Sessao expirada. Faca login novamente.", "INVALID_REFRESH_TOKEN");
  }

  const user = await queryOne<User>(`SELECT * FROM users WHERE id = $1`, [token.userId]);
  if (!user) throw unauthorized("Sessao expirada. Faca login novamente.", "INVALID_REFRESH_TOKEN");

  const subscription = await assertLoginAllowed(user);
  await query(`UPDATE refresh_tokens SET "revokedAt" = NOW() WHERE id = $1`, [token.id]);

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), subscription: presentSubscription(subscription), ...tokens };
}

export async function logout(rawRefreshToken?: string) {
  if (!rawRefreshToken) return;

  await query(
    `UPDATE refresh_tokens
     SET "revokedAt" = NOW()
     WHERE "tokenHash" = $1 AND "revokedAt" IS NULL`,
    [hashToken(rawRefreshToken)],
  );
}

export async function forgotPassword(email: string) {
  const user = await queryOne<User>(`SELECT * FROM users WHERE email = $1`, [email]);
  if (!user) {
    logger.info("forgot-password para e-mail inexistente", { email });
    return;
  }

  const { token, tokenHash } = generateOpaqueToken();

  await query(
    `INSERT INTO password_reset_tokens ("userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, addMinutes(env.PASSWORD_RESET_TTL_MINUTES)],
  );

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendMail({ to: user.email, ...buildPasswordResetEmail(user.name, resetUrl) });

  if (env.NODE_ENV !== "production") {
    logger.info("[dev] link de reset gerado", { resetUrl });
  }
}

export async function resetPassword(input: { token: string; password: string }) {
  const stored = await queryOne<PasswordResetToken>(
    `SELECT * FROM password_reset_tokens WHERE "tokenHash" = $1`,
    [hashToken(input.token)],
  );

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw unauthorized("Token de recuperacao invalido ou expirado", "INVALID_RESET_TOKEN");
  }

  const passwordHash = await hashPassword(input.password);

  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET "passwordHash" = $1, "updatedAt" = NOW() WHERE id = $2`, [
      passwordHash,
      stored.userId,
    ]);
    await client.query(
      `UPDATE password_reset_tokens SET "usedAt" = NOW() WHERE id = $1`,
      [stored.id],
    );
    await client.query(
      `UPDATE refresh_tokens SET "revokedAt" = NOW()
       WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [stored.userId],
    );
  });

  logger.info("senha redefinida", { userId: stored.userId });
}

export async function getMe(userId: string) {
  const user = await queryOne<User>(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!user) throw unauthorized("Usuario nao encontrado");

  const profile = await queryOne<Pick<Profile, "id" | "username" | "status">>(
    `SELECT id, username, status FROM profiles WHERE "userId" = $1`,
    [userId],
  );

  const subscription = await resolveSubscription(userId);

  return { ...toPublicUser(user), profile, subscription: presentSubscription(subscription) };
}
