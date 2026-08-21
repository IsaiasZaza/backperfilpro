import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do servico").max(80),
  description: z.string().trim().max(300).nullish(),
  // preco em centavos evita erro de arredondamento (R$ 120,00 -> 12000)
  priceCents: z.number().int().min(0).max(100_000_000),
  sortOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
});

export const updateServiceSchema = createServiceSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Envie pelo menos um campo para atualizar" },
);
