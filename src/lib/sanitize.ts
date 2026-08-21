import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Bloqueia URLs perigosas nos botoes da pagina publica (javascript:, data:, etc.).
 * Aceita "instagram.com/maria" e normaliza para "https://instagram.com/maria".
 */
export function sanitizeUrl(input: string): string {
  const value = input.trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("URL invalida");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error("Protocolo de URL nao permitido");
  }

  return url.toString();
}

/** Schema zod reutilizavel para qualquer campo de link vindo do frontend. */
export const urlSchema = z
  .string()
  .min(1, "Informe uma URL")
  .max(2048)
  .transform((value, ctx) => {
    try {
      return sanitizeUrl(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "URL invalida",
      });
      return z.NEVER;
    }
  });
