/**
 * Erro de negocio com status HTTP e codigo legivel pelo frontend.
 * Qualquer lugar do codigo pode dar `throw new AppError(...)` que o
 * error handler transforma na resposta padrao { data: null, error: {...} }.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code = "BAD_REQUEST", details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = "Nao autenticado", code = "UNAUTHORIZED") =>
  new AppError(401, code, message);

export const forbidden = (message = "Acesso negado", code = "FORBIDDEN") =>
  new AppError(403, code, message);

export const paymentRequired = (
  message = "Assinatura necessaria",
  code = "SUBSCRIPTION_REQUIRED",
  details?: unknown,
) => new AppError(402, code, message, details);

export const notFound = (message = "Recurso nao encontrado", code = "NOT_FOUND") =>
  new AppError(404, code, message);

export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);

export const payloadTooLarge = (message: string, code = "FILE_TOO_LARGE") =>
  new AppError(413, code, message);

export const badGateway = (message: string, code = "STORAGE_ERROR") => new AppError(502, code, message);

export const tooManyRequests = (message = "Muitas tentativas. Tente novamente em instantes.") =>
  new AppError(429, "TOO_MANY_REQUESTS", message);
