import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const GOOGLE_DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

/**
 * Bloqueia URLs perigosas nos botoes da pagina publica (javascript:, data:, etc.).
 * Aceita "instagram.com/maria" e normaliza para "https://instagram.com/maria".
 * Links do Google Drive (/file/d/.../view) viram URL direta usavel em <img> e botoes.
 */
export function sanitizeUrl(input: string): string {
  const value = input.trim().replace(/\s+/g, "");
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

  return normalizeGoogleDriveUrl(url);
}

function normalizeGoogleDriveUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!GOOGLE_DRIVE_HOSTS.has(host)) return url.toString();

  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return url.toString();

  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function extractGoogleDriveFileId(url: URL) {
  const fromPath = url.pathname.match(/\/file\/d\/([^/]+)/i);
  if (fromPath?.[1]) return fromPath[1];

  const fromUc = url.pathname.match(/\/uc\/d\/([^/]+)/i);
  if (fromUc?.[1]) return fromUc[1];

  return url.searchParams.get("id") ?? url.searchParams.get("ids");
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
