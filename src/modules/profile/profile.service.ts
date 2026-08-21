import type { z } from "zod";
import { query, queryOne } from "../../db/client";
import type { Block, Profile, ServiceItem, Testimonial } from "../../db/types";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { isReservedUsername } from "../../lib/username";
import type { updateProfileSchema } from "./profile.schemas";

export async function getProfileByUserId(userId: string) {
  const profile = await queryOne<Profile>(`SELECT * FROM profiles WHERE "userId" = $1`, [userId]);
  if (!profile) throw notFound("Perfil nao encontrado", "PROFILE_NOT_FOUND");
  return mapProfile(profile);
}

export async function getFullProfileByUserId(userId: string) {
  const profile = await getProfileByUserId(userId);
  const [blocks, services, testimonials] = await Promise.all([
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
  ]);

  return {
    ...profile,
    blocks: blocks.map(mapBlock),
    services,
    testimonials,
  };
}

export async function isUsernameAvailable(username: string, ignoreProfileId?: string) {
  if (isReservedUsername(username)) return false;

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM profiles WHERE username = $1`,
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

  const next = {
    displayName: rest.displayName !== undefined ? rest.displayName : profile.displayName,
    headline: rest.headline !== undefined ? rest.headline : profile.headline,
    bio: rest.bio !== undefined ? rest.bio : profile.bio,
    avatarUrl: rest.avatarUrl !== undefined ? rest.avatarUrl : profile.avatarUrl,
    location: rest.location !== undefined ? rest.location : profile.location,
    theme: theme ?? profile.theme,
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

export async function updateAvatar(profileId: string, avatarUrl: string) {
  const updated = await queryOne<Profile>(
    `UPDATE profiles SET "avatarUrl" = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *`,
    [avatarUrl, profileId],
  );
  return mapProfile(updated!);
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
    `SELECT * FROM profiles WHERE username = $1 AND status = 'PUBLISHED'`,
    [username.toLowerCase()],
  );
  if (!profile) throw notFound("Pagina nao encontrada", "PAGE_NOT_FOUND");

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

  return {
    ...mapped,
    blocks: blocks.map(mapBlock),
    services,
    testimonials,
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
