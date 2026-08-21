import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

export const ACCESS_COOKIE = "pp_access_token";
export const REFRESH_COOKIE = "pp_refresh_token";

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // em producao o FE costuma ficar em outro dominio -> precisa de sameSite none + https
    sameSite: env.COOKIE_SECURE ? "none" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    maxAge: 1000 * 60 * 30,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    maxAge: 1000 * 60 * 60 * 24 * env.REFRESH_TOKEN_TTL_DAYS,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
