import { z } from "zod";
import { env } from "../config/env";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const GOOGLE_DRIVE_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "lh3.googleusercontent.com",
]);

const DRIVE_FILE_ID = /^[a-zA-Z0-9_-]{20,128}$/;

/**
 * Bloqueia URLs perigosas nos botoes da pagina publica (javascript:, data:, etc.).
 * Aceita "instagram.com/maria" e normaliza para "https://instagram.com/maria".
 * Links do Google Drive viram URL do proxy da API, para JPEG abrir em <img>.
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

  return publicDriveImageUrl(url.toString()) ?? url.toString();
}

export function extractGoogleDriveFileId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const fromProxy = url.pathname.match(/\/media\/drive\/([^/?#]+)/i);
  if (fromProxy?.[1] && DRIVE_FILE_ID.test(fromProxy[1])) return fromProxy[1];

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!GOOGLE_DRIVE_HOSTS.has(host)) return null;

  const fromPath = url.pathname.match(/\/(?:file|uc|d)\/(?:d\/)?([^/]+)/i);
  if (fromPath?.[1] && DRIVE_FILE_ID.test(fromPath[1])) return fromPath[1];

  const fromId = url.searchParams.get("id") ?? url.searchParams.get("ids");
  if (fromId && DRIVE_FILE_ID.test(fromId)) return fromId;

  return null;
}

export function isGoogleDriveFileId(value: string) {
  return DRIVE_FILE_ID.test(value);
}

/** URL servida pela API. O front usa essa no <img src>. */
export function publicDriveImageUrl(input: string | null | undefined): string | null {
  if (!input) return input ?? null;
  const fileId = extractGoogleDriveFileId(input);
  if (!fileId) return null;
  return `${env.APP_URL.replace(/\/$/, "")}/media/drive/${fileId}`;
}

export function rewriteDriveImageFields<T>(value: T): T {
  if (typeof value === "string") {
    return (publicDriveImageUrl(value) ?? value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteDriveImageFields(item)) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
      if (key === "avatarUrl" || key === "imageUrl" || key === "image") {
        next[key] = rewriteDriveImageFields(field);
      } else {
        next[key] = field;
      }
    }
    return next as T;
  }
  return value;
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
