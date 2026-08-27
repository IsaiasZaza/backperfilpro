import { env } from "../config/env";
import { badGateway, badRequest } from "./errors";
import { logger } from "./logger";
import { getSupabase } from "./supabase";

export type StoredObject = {
  path: string;
  publicUrl: string;
};

const USER_ID_PATH = /^[a-zA-Z0-9_-]+$/;

function assertUserIdPath(userId: string) {
  if (!USER_ID_PATH.test(userId)) {
    throw badRequest("Identificador de usuario invalido", "INVALID_USER_ID");
  }
}

/** Caminho deterministico no bucket: `{userId}.webp` (bucket padrao `avatars`). */
export function avatarObjectPath(userId: string) {
  assertUserIdPath(userId);
  return `${userId}.webp`;
}

/** Capa/banner: `{userId}-banner.webp`. Mesmo bucket do avatar. */
export function bannerObjectPath(userId: string) {
  assertUserIdPath(userId);
  return `${userId}-banner.webp`;
}

export function getPublicUrl(objectPath: string) {
  const { data } = getSupabase().storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function uploadPublicObject(params: {
  path: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
}): Promise<StoredObject> {
  const { error } = await getSupabase()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .upload(params.path, params.body, {
      contentType: params.contentType,
      upsert: params.upsert ?? true,
      cacheControl: "3600",
    });

  if (error) {
    logger.error("falha no supabase storage (upload)", {
      message: error.message,
      path: params.path,
    });

    const message = error.message.toLowerCase();
    if (message.includes("bucket") && (message.includes("not found") || message.includes("does not exist"))) {
      throw badRequest(
        `Bucket "${env.SUPABASE_STORAGE_BUCKET}" nao existe. Crie um bucket publico com esse nome no Supabase Storage.`,
        "STORAGE_BUCKET_NOT_FOUND",
      );
    }
    if (
      message.includes("invalid") &&
      (message.includes("api key") || message.includes("jwt") || message.includes("token"))
    ) {
      throw badRequest(
        "Chave do Supabase invalida. No Railway use SUPABASE_SERVICE_ROLE_KEY (service_role), nao a publishable.",
        "STORAGE_INVALID_KEY",
      );
    }
    if (message.includes("row-level security") || message.includes("permission") || message.includes("not allowed")) {
      throw badRequest(
        "Sem permissao no Storage. Use a service_role no backend e deixe o bucket avatars publico para leitura.",
        "STORAGE_FORBIDDEN",
      );
    }

    throw badGateway("Nao foi possivel salvar a imagem. Tente novamente.");
  }

  return {
    path: params.path,
    publicUrl: getPublicUrl(params.path),
  };
}

export async function removeObject(objectPath: string) {
  const { error } = await getSupabase()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .remove([objectPath]);

  if (error) {
    logger.warn("falha ao remover objeto do storage", {
      message: error.message,
      path: objectPath,
    });
  }
}

/** Extrai o path do objeto se a URL for do nosso bucket publico. */
export function objectPathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;

    const objectPath = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) return null;
    return objectPath;
  } catch {
    return null;
  }
}
