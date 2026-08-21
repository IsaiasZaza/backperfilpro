import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { unauthorized } from "./errors";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

/** Access token: JWT curto (default 15min), enviado no header Authorization ou cookie. */
export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch {
    throw unauthorized("Token invalido ou expirado", "INVALID_TOKEN");
  }
}

/**
 * Refresh token e reset de senha usam token opaco (string aleatoria).
 * No banco guardamos apenas o hash - se o banco vazar, os tokens nao servem.
 */
export function generateOpaqueToken() {
  const token = crypto.randomBytes(48).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function addDays(days: number, from = new Date()) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(minutes: number, from = new Date()) {
  return new Date(from.getTime() + minutes * 60 * 1000);
}
