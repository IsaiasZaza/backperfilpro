import { z } from "zod";

/** Permite rascunho vazio no editor ("" / null). */
const emptyableText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => (value ?? "").trim())
    .pipe(z.string().max(max));

const testimonialFields = {
  authorName: emptyableText(80),
  text: emptyableText(600),
  rating: z.number().int().min(1).max(5),
  sortOrder: z.number().int().min(0),
  isVisible: z.boolean(),
};

export const createTestimonialSchema = z.object({
  authorName: testimonialFields.authorName.optional().transform((value) => value ?? ""),
  text: testimonialFields.text.optional().transform((value) => value ?? ""),
  rating: testimonialFields.rating.optional().default(5),
  sortOrder: testimonialFields.sortOrder.optional(),
  isVisible: testimonialFields.isVisible.optional(),
});

export const updateTestimonialSchema = z
  .object({
    authorName: testimonialFields.authorName.optional(),
    text: testimonialFields.text.optional(),
    rating: testimonialFields.rating.optional(),
    sortOrder: testimonialFields.sortOrder.optional(),
    isVisible: testimonialFields.isVisible.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualizar",
  });
