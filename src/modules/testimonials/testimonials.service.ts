import type { z } from "zod";
import { query, queryOne } from "../../db/client";
import type { Testimonial } from "../../db/types";
import { notFound } from "../../lib/errors";
import { resolveSubscription } from "../billing/billing.service";
import { applyCountLimit, assertCanCreateTestimonial, assertCanMutateIndexedItem, entitlementsOf } from "../billing/entitlements";
import type { createTestimonialSchema, updateTestimonialSchema } from "./testimonials.schemas";

async function planOf(userId: string) {
  const subscription = await resolveSubscription(userId);
  return subscription?.plan ?? "FREE";
}

export function listTestimonials(profileId: string) {
  return query<Testimonial>(
    `SELECT * FROM testimonials WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
    [profileId],
  );
}

export async function listTestimonialsForPlan(userId: string, profileId: string) {
  const plan = await planOf(userId);
  return applyCountLimit(await listTestimonials(profileId), entitlementsOf(plan).maxTestimonials);
}

async function findOwned(profileId: string, id: string) {
  const testimonial = await queryOne<Testimonial>(
    `SELECT * FROM testimonials WHERE id = $1 AND "profileId" = $2`,
    [id, profileId],
  );
  if (!testimonial) throw notFound("Depoimento nao encontrado", "TESTIMONIAL_NOT_FOUND");
  return testimonial;
}

export async function createTestimonial(
  userId: string,
  profileId: string,
  input: z.infer<typeof createTestimonialSchema>,
) {
  const plan = await planOf(userId);
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM testimonials WHERE "profileId" = $1`,
    [profileId],
  );
  assertCanCreateTestimonial(plan, Number(countRow?.count ?? 0));

  const last = await queryOne<{ sortOrder: number }>(
    `SELECT "sortOrder" FROM testimonials WHERE "profileId" = $1 ORDER BY "sortOrder" DESC LIMIT 1`,
    [profileId],
  );

  const testimonial = await queryOne<Testimonial>(
    `INSERT INTO testimonials (
       "profileId", "authorName", text, rating, "sortOrder", "isVisible",
       layout, padding, spacing
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      profileId,
      input.authorName,
      input.text,
      input.rating,
      input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
      input.isVisible ?? true,
      input.layout ?? null,
      input.padding ?? null,
      input.spacing ?? null,
    ],
  );

  return testimonial!;
}

export async function updateTestimonial(
  userId: string,
  profileId: string,
  id: string,
  input: z.infer<typeof updateTestimonialSchema>,
) {
  const plan = await planOf(userId);
  const testimonials = await listTestimonials(profileId);
  const testimonial = testimonials.find((item) => item.id === id);
  if (!testimonial) throw notFound("Depoimento nao encontrado", "TESTIMONIAL_NOT_FOUND");

  assertCanMutateIndexedItem(
    plan,
    "maxTestimonials",
    id,
    testimonials.map((item) => item.id),
  );

  const updated = await queryOne<Testimonial>(
    `UPDATE testimonials SET
       "authorName" = $1,
       text = $2,
       rating = $3,
       "sortOrder" = $4,
       "isVisible" = $5,
       layout = $6,
       padding = $7,
       spacing = $8,
       "updatedAt" = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      input.authorName ?? testimonial.authorName,
      input.text ?? testimonial.text,
      input.rating ?? testimonial.rating,
      input.sortOrder ?? testimonial.sortOrder,
      input.isVisible ?? testimonial.isVisible,
      "layout" in input ? (input.layout ?? null) : testimonial.layout,
      "padding" in input ? (input.padding ?? null) : testimonial.padding,
      "spacing" in input ? (input.spacing ?? null) : testimonial.spacing,
      testimonial.id,
    ],
  );

  return updated!;
}

export async function deleteTestimonial(profileId: string, id: string) {
  await query(`DELETE FROM testimonials WHERE id = $1 AND "profileId" = $2`, [id, profileId]);
}
