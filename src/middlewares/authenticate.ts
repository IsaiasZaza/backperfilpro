import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE } from "../lib/cookies";
import { unauthorized } from "../lib/errors";
import { verifyAccessToken } from "../lib/tokens";

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware `authenticate`. */
      user?: { id: string; email: string };
    }
  }
}

/**
 * Aceita o access token de dois jeitos:
 *  - header `Authorization: Bearer <token>` (usado pelo Swagger / apps mobile)
 *  - cookie httpOnly `pp_access_token` (usado pelo frontend web)
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer ?? (req.cookies?.[ACCESS_COOKIE] as string | undefined);

  if (!token) {
    throw unauthorized("Faca login para continuar");
  }

  const payload = verifyAccessToken(token);
  req.user = { id: payload.sub, email: payload.email };
  next();
}
