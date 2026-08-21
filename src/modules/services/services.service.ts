import type { z } from "zod";
import { query, queryOne } from "../../db/client";
import type { ServiceItem } from "../../db/types";
import { notFound } from "../../lib/errors";
import type { createServiceSchema, updateServiceSchema } from "./services.schemas";

export function listServices(profileId: string) {
  return query<ServiceItem>(
    `SELECT * FROM service_items WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
    [profileId],
  );
}

async function findOwned(profileId: string, id: string) {
  const service = await queryOne<ServiceItem>(
    `SELECT * FROM service_items WHERE id = $1 AND "profileId" = $2`,
    [id, profileId],
  );
  if (!service) throw notFound("Servico nao encontrado", "SERVICE_NOT_FOUND");
  return service;
}

export async function createService(
  profileId: string,
  input: z.infer<typeof createServiceSchema>,
) {
  const last = await queryOne<{ sortOrder: number }>(
    `SELECT "sortOrder" FROM service_items WHERE "profileId" = $1 ORDER BY "sortOrder" DESC LIMIT 1`,
    [profileId],
  );

  const service = await queryOne<ServiceItem>(
    `INSERT INTO service_items ("profileId", name, description, "priceCents", "sortOrder", "isVisible")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      profileId,
      input.name,
      input.description ?? null,
      input.priceCents,
      input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
      input.isVisible ?? true,
    ],
  );

  return service!;
}

export async function updateService(
  profileId: string,
  id: string,
  input: z.infer<typeof updateServiceSchema>,
) {
  const service = await findOwned(profileId, id);

  const updated = await queryOne<ServiceItem>(
    `UPDATE service_items SET
       name = $1,
       description = $2,
       "priceCents" = $3,
       "sortOrder" = $4,
       "isVisible" = $5,
       "updatedAt" = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      input.name ?? service.name,
      input.description !== undefined ? input.description : service.description,
      input.priceCents ?? service.priceCents,
      input.sortOrder ?? service.sortOrder,
      input.isVisible ?? service.isVisible,
      service.id,
    ],
  );

  return updated!;
}

export async function deleteService(profileId: string, id: string) {
  const service = await findOwned(profileId, id);
  await query(`DELETE FROM service_items WHERE id = $1`, [service.id]);
}
