import type { Response } from "express";

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string; details?: unknown } };

/** Resposta de sucesso no formato padrao da API. */
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data, error: null } satisfies ApiResponse<T>);
}

/** Resposta de erro no formato padrao da API. */
export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    data: null,
    error: details === undefined ? { code, message } : { code, message, details },
  } satisfies ApiResponse<never>);
}
