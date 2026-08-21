import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import Stripe from "stripe";
import { ZodError } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { fail } from "../lib/http";
import { logger } from "../lib/logger";

/** Rota inexistente -> 404 no formato padrao. */
export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, "ROUTE_NOT_FOUND", `Rota ${req.method} ${req.path} nao existe`);
}

/**
 * Unico lugar que transforma erro em resposta HTTP.
 * O Express 5 encaminha erros de handlers async automaticamente para ca.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      message: issue.message,
    }));
    return fail(res, 422, "VALIDATION_ERROR", "Dados invalidos", details);
  }

  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }

  if (err instanceof Stripe.errors.StripeError) {
    const inactive = /inactive/i.test(err.message);
    return fail(
      res,
      400,
      inactive ? "STRIPE_PRICE_INACTIVE" : "STRIPE_ERROR",
      inactive
        ? "O preco da Stripe esta inativo. Confira STRIPE_PRICE_PRO / STRIPE_PRICE_PREMIUM no .env e reinicie a API."
        : err.message,
    );
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Arquivo maior que o limite de ${env.MAX_AVATAR_SIZE_MB}MB`
        : err.message;
    return fail(res, 400, "UPLOAD_ERROR", message);
  }

  // Violacao de unique constraint do Postgres
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") {
    return fail(res, 409, "ALREADY_EXISTS", "Registro ja existe");
  }

  logger.error("erro nao tratado", {
    path: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
    code: (err as { code?: string })?.code,
    stack: err instanceof Error ? err.stack : undefined,
  });

  const message =
    env.NODE_ENV === "development" && err instanceof Error
      ? err.message
      : "Erro interno do servidor";

  return fail(res, 500, "INTERNAL_ERROR", message);
}
