import type { z } from "zod";
import { query, queryOne } from "../../db/client";
import type { Testimonial } from "../../db/types";
import { notFound } from "../../lib/errors";
import type { createTestimonialSchema, updateTestimonialSchema } from "./testimonials.schemas";

export function listTestimonials(profileId: string) {
  return query<Testimonial>(
    `SELECT * FROM testimonials WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
    [profileId],
  );
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
  profileId: string,
  input: z.infer<typeof createTestimonialSchema>,
) {
  const last = await queryOne<{ sortOrder: number }>(
    `SELECT "sortOrder" FROM testimonials WHERE "profileId" = $1 ORDER BY "sortOrder" DESC LIMIT 1`,
    [profileId],
  );

  const testimonial = await queryOne<Testimonial>(
    `INSERT INTO testimonials ("profileId", "authorName", text, rating, "sortOrder", "isVisible")
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      profileId,
      input.authorName,
      input.text,
      input.rating,
      input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
      input.isVisible ?? true,
    ],
  );

  return testimonial!;
}

export async function updateTestimonial(
  profileId: string,
  id: string,
  input: z.infer<typeof updateTestimonialSchema>,
) {
  const testimonial = await findOwned(profileId, id);

  const updated = await queryOne<Testimonial>(
    `UPDATE testimonials SET
       "authorName" = $1,
       text = $2,
       rating = $3,
       "sortOrder" = $4,
       "isVisible" = $5,
       "updatedAt" = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      input.authorName ?? testimonial.authorName,
      input.text ?? testimonial.text,
      input.rating ?? testimonial.rating,
      input.sortOrder ?? testimonial.sortOrder,
      input.isVisible ?? testimonial.isVisible,
      testimonial.id,
    ],
  );

  return updated!;
}

export async function deleteTestimonial(profileId: string, id: string) {
  const testimonial = await findOwned(profileId, id);
  await query(`DELETE FROM testimonials WHERE id = $1`, [testimonial.id]);
}
