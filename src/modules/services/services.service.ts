import type { z } from "zod";
import { query, queryOne } from "../../db/client";
import type { ServiceItem } from "../../db/types";
import { notFound } from "../../lib/errors";
import { resolveSubscription } from "../billing/billing.service";
import { applyCountLimit, assertCanCreateService, assertCanMutateIndexedItem, entitlementsOf } from "../billing/entitlements";
import type { createServiceSchema, updateServiceSchema } from "./services.schemas";

async function planOf(userId: string) {
  const subscription = await resolveSubscription(userId);
  return subscription?.plan ?? "FREE";
}

export function listServices(profileId: string) {
  return query<ServiceItem>(
    `SELECT * FROM service_items WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
    [profileId],
  );
}

export async function listServicesForPlan(userId: string, profileId: string) {
  const plan = await planOf(userId);
  return applyCountLimit(await listServices(profileId), entitlementsOf(plan).maxServices);
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
  userId: string,
  profileId: string,
  input: z.infer<typeof createServiceSchema>,
) {
  const plan = await planOf(userId);
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM service_items WHERE "profileId" = $1`,
    [profileId],
  );
  assertCanCreateService(plan, Number(countRow?.count ?? 0));

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
  userId: string,
  profileId: string,
  id: string,
  input: z.infer<typeof updateServiceSchema>,
) {
  const plan = await planOf(userId);
  const services = await listServices(profileId);
  const service = services.find((item) => item.id === id);
  if (!service) throw notFound("Servico nao encontrado", "SERVICE_NOT_FOUND");

  assertCanMutateIndexedItem(
    plan,
    "maxServices",
    id,
    services.map((item) => item.id),
  );

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
