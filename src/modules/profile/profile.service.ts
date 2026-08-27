import type { z } from "zod";
import { query, queryOne } from "../../db/client";
import type { Block, Profile, ServiceItem, Testimonial } from "../../db/types";
import { AppError, badGateway, badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import {
  avatarObjectPath,
  bannerObjectPath,
  objectPathFromPublicUrl,
  removeObject,
  uploadPublicObject,
} from "../../lib/storage";
import { processAvatarImage, processBannerImage, removeLocalAvatarIfOwned } from "../../lib/upload";
import { isReservedUsername } from "../../lib/username";
import { grantsAccess, resolveSubscription } from "../billing/billing.service";
import {
  applyCountLimit,
  assertCanUpdateTheme,
  entitlementsOf,
  filterBlocksForPlan,
  sanitizeThemeForPlan,
  showBrandingFor,
} from "../billing/entitlements";
import { sanitizeBlockContentForPlan } from "../blocks/block-look";
import { mergeTheme, updateProfileSchema } from "./profile.schemas";

export async function getProfileByUserId(userId: string) {
  const profile = await queryOne<Profile>(`SELECT * FROM profiles WHERE "userId" = $1`, [userId]);
  if (!profile) throw notFound("Perfil nao encontrado", "PROFILE_NOT_FOUND");
  return mapProfile(profile);
}

export async function getFullProfileByUserId(userId: string) {
  const profile = await getProfileByUserId(userId);
  const [blocks, services, testimonials, subscription] = await Promise.all([
    query<Block>(
      `SELECT * FROM blocks WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
      [profile.id],
    ),
    query<ServiceItem>(
      `SELECT * FROM service_items WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
      [profile.id],
    ),
    query<Testimonial>(
      `SELECT * FROM testimonials WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
      [profile.id],
    ),
    resolveSubscription(userId),
  ]);

  const plan = subscription?.plan ?? "FREE";
  const entitlements = entitlementsOf(plan);
  return {
    ...profile,
    theme: sanitizeThemeForPlan(plan, profile.theme),
    plan,
    showBranding: showBrandingFor(plan),
    blocks: filterBlocksForPlan(plan, blocks.map(mapBlock)).map((block) => ({
      ...block,
      content: sanitizeBlockContentForPlan(plan, block.type, block.content),
    })),
    services: applyCountLimit(services, entitlements.maxServices),
    testimonials: applyCountLimit(testimonials, entitlements.maxTestimonials),
  };
}

export async function isUsernameAvailable(username: string, ignoreProfileId?: string) {
  if (isReservedUsername(username)) return false;

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)`,
    [username],
  );

  if (!existing) return true;
  return existing.id === ignoreProfileId;
}

async function resolveUsernameChange(profile: Profile, username: string) {
  if (username === profile.username) return {};

  if (profile.status === "PUBLISHED" && profile.usernameChangesAfterPublish >= 1) {
    throw forbidden(
      "Voce ja usou a unica troca de username permitida apos publicar a pagina",
      "USERNAME_CHANGE_LIMIT_REACHED",
    );
  }

  if (isReservedUsername(username)) {
    throw conflict("Esse username e reservado pelo sistema", "USERNAME_RESERVED");
  }

  const available = await isUsernameAvailable(username, profile.id);
  if (!available) {
    throw conflict("Esse username ja esta em uso", "USERNAME_TAKEN");
  }

  return {
    username,
    usernameChangesAfterPublish:
      profile.status === "PUBLISHED"
        ? profile.usernameChangesAfterPublish + 1
        : profile.usernameChangesAfterPublish,
  };
}

export async function updateProfile(userId: string, input: z.infer<typeof updateProfileSchema>) {
  const profile = await getProfileByUserId(userId);
  const { username, theme, ...rest } = input;
  const usernameData = username ? await resolveUsernameChange(profile, username) : {};

  const subscription = await resolveSubscription(userId);
  const plan = subscription?.plan ?? "FREE";
  if (theme !== undefined) {
    assertCanUpdateTheme(plan, theme as Record<string, unknown>);
  }

  const nextTheme = theme !== undefined ? mergeTheme(profile.theme, theme as Record<string, unknown>) : profile.theme;
  const nextAvatarUrl = rest.avatarUrl !== undefined ? rest.avatarUrl : profile.avatarUrl;

  if (rest.avatarUrl !== undefined && rest.avatarUrl !== profile.avatarUrl) {
    const nextPath = objectPathFromPublicUrl(nextAvatarUrl);
    const previousPath = objectPathFromPublicUrl(profile.avatarUrl);
    if (previousPath && previousPath !== nextPath) {
      await removeObject(previousPath);
    }
    removeLocalAvatarIfOwned(profile.avatarUrl);
  }

  const next = {
    displayName: rest.displayName !== undefined ? rest.displayName : profile.displayName,
    headline: rest.headline !== undefined ? rest.headline : profile.headline,
    bio: rest.bio !== undefined ? rest.bio : profile.bio,
    avatarUrl: nextAvatarUrl,
    location: rest.location !== undefined ? rest.location : profile.location,
    theme: nextTheme,
    username: (usernameData as { username?: string }).username ?? profile.username,
    usernameChangesAfterPublish:
      (usernameData as { usernameChangesAfterPublish?: number }).usernameChangesAfterPublish ??
      profile.usernameChangesAfterPublish,
  };

  const updated = await queryOne<Profile>(
    `UPDATE profiles SET
       username = $1,
       "displayName" = $2,
       headline = $3,
       bio = $4,
       "avatarUrl" = $5,
       location = $6,
       theme = $7::jsonb,
       "usernameChangesAfterPublish" = $8,
       "updatedAt" = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      next.username,
      next.displayName,
      next.headline,
      next.bio,
      next.avatarUrl,
      next.location,
      JSON.stringify(next.theme),
      next.usernameChangesAfterPublish,
      profile.id,
    ],
  );

  return mapProfile(updated!);
}

export type ImageUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type AvatarUpload = ImageUpload;

async function storeProcessedImage(userId: string, body: Buffer, path: string) {
  try {
    return await uploadPublicObject({
      path,
      body,
      contentType: "image/webp",
      upsert: true,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("falha ao enviar imagem", {
      userId,
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    throw badGateway("Nao foi possivel salvar a imagem. Tente novamente.");
  }
}

/**
 * Sobe a foto para o Storage e devolve a URL.
 * Nao grava no perfil — o front persiste no clique de atualizar (PUT /me/profile).
 */
export async function uploadAvatar(userId: string, file: ImageUpload) {
  const image = await processAvatarImage(file.buffer);
  const stored = await storeProcessedImage(userId, image, avatarObjectPath(userId));
  return `${stored.publicUrl}?v=${Date.now()}`;
}

/**
 * Sobe o banner para o Storage e devolve a URL.
 * Nao grava theme/bloco — o front persiste no clique de atualizar
 * (`theme.backgroundImage` ou `content.bannerUrl` do HERO).
 */
export async function uploadBanner(userId: string, file: ImageUpload) {
  const subscription = await resolveSubscription(userId);
  assertCanUpdateTheme(subscription?.plan ?? "FREE");
  const image = await processBannerImage(file.buffer);
  const stored = await storeProcessedImage(userId, image, bannerObjectPath(userId));
  return `${stored.publicUrl}?v=${Date.now()}`;
}

export async function publishProfile(userId: string) {
  const profile = await getProfileByUserId(userId);

  if (!profile.username || profile.username.startsWith("user-")) {
    throw badRequest("Escolha um username antes de publicar", "USERNAME_REQUIRED");
  }
  if (!profile.displayName) {
    throw badRequest("Preencha o nome de exibicao antes de publicar", "DISPLAY_NAME_REQUIRED");
  }

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM blocks WHERE "profileId" = $1 AND "isVisible" = TRUE`,
    [profile.id],
  );
  if (Number(countRow?.count ?? 0) === 0) {
    throw badRequest("Adicione pelo menos um bloco visivel antes de publicar", "NO_BLOCKS");
  }

  const published = await queryOne<Profile>(
    `UPDATE profiles SET
       status = 'PUBLISHED',
       "publishedAt" = COALESCE("publishedAt", NOW()),
       "updatedAt" = NOW()
     WHERE id = $1
     RETURNING *`,
    [profile.id],
  );

  logger.info("perfil publicado", { profileId: profile.id, username: published?.username });
  return mapProfile(published!);
}

export async function unpublishProfile(userId: string) {
  const profile = await getProfileByUserId(userId);
  const updated = await queryOne<Profile>(
    `UPDATE profiles SET status = 'DRAFT', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
    [profile.id],
  );
  return mapProfile(updated!);
}

export async function getPublicProfile(username: string) {
  const profile = await queryOne<Profile>(
    `SELECT * FROM profiles WHERE LOWER(username) = $1 AND status = 'PUBLISHED'`,
    [username.toLowerCase()],
  );
  if (!profile) throw notFound("Pagina nao encontrada", "PAGE_NOT_FOUND");

  const subscription = await resolveSubscription(profile.userId);
  if (!grantsAccess(subscription)) {
    throw notFound("Pagina nao encontrada", "PAGE_NOT_FOUND");
  }

  const mapped = mapProfile(profile);
  const [blocks, services, testimonials] = await Promise.all([
    query<Block>(
      `SELECT * FROM blocks WHERE "profileId" = $1 AND "isVisible" = TRUE ORDER BY "sortOrder" ASC`,
      [mapped.id],
    ),
    query<ServiceItem>(
      `SELECT * FROM service_items WHERE "profileId" = $1 AND "isVisible" = TRUE ORDER BY "sortOrder" ASC`,
      [mapped.id],
    ),
    query<Testimonial>(
      `SELECT * FROM testimonials WHERE "profileId" = $1 AND "isVisible" = TRUE ORDER BY "sortOrder" ASC`,
      [mapped.id],
    ),
  ]);

  const plan = subscription!.plan;
  const entitlements = entitlementsOf(plan);
  return {
    ...mapped,
    theme: sanitizeThemeForPlan(plan, mapped.theme),
    plan,
    showBranding: showBrandingFor(plan),
    blocks: filterBlocksForPlan(plan, blocks.map(mapBlock)).map((block) => ({
      ...block,
      content: sanitizeBlockContentForPlan(plan, block.type, block.content),
    })),
    services: applyCountLimit(services, entitlements.maxServices),
    testimonials: applyCountLimit(testimonials, entitlements.maxTestimonials),
  };
}

/** theme vem como objeto (jsonb) ou string, dependendo do driver. */
function mapProfile(row: Profile): Profile {
  return {
    ...row,
    theme:
      typeof row.theme === "string"
        ? (JSON.parse(row.theme) as Record<string, unknown>)
        : (row.theme ?? {}),
  };
}

function mapBlock(row: Block): Block {
  return {
    ...row,
    content:
      typeof row.content === "string"
        ? (JSON.parse(row.content) as Record<string, unknown>)
        : (row.content ?? {}),
  };
}
