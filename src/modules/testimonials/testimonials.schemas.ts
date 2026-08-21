import { z } from "zod";

export const createTestimonialSchema = z.object({
  authorName: z.string().trim().min(2, "Informe quem escreveu o depoimento").max(80),
  text: z.string().trim().min(3, "Escreva o depoimento").max(600),
  rating: z.number().int().min(1).max(5).default(5),
  sortOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
});

export const updateTestimonialSchema = createTestimonialSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Envie pelo menos um campo para atualizar" },
);
