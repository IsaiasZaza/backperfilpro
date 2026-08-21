import { z } from "zod";
import { urlSchema } from "../../lib/sanitize";
import type { BlockType } from "../../db/types";

/**
 * Cada tipo de bloco tem seu proprio formato de `content`.
 * Isso e o "contrato" que o editor do frontend precisa seguir.
 */
export const blockContentSchemas = {
  HERO: z.object({
    name: z.string().trim().max(80).optional(),
    headline: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(500).optional(),
    avatarUrl: urlSchema.optional(),
    location: z.string().trim().max(120).optional(),
  }),

  CTA_BUTTON: z.object({
    label: z.string().trim().min(1).max(60),
    url: urlSchema,
    style: z.enum(["primary", "secondary", "outline"]).default("primary"),
  }),

  LINK_BUTTON: z.object({
    label: z.string().trim().min(1).max(60),
    url: urlSchema,
    icon: z.string().trim().max(40).optional(),
  }),

  WHATSAPP: z.object({
    // apenas digitos, com DDI: 5561999999999
    phone: z.string().regex(/^\d{10,15}$/, "Telefone deve conter apenas numeros com DDI e DDD"),
    message: z.string().trim().max(300).optional(),
    label: z.string().trim().max(60).optional(),
  }),

  SOCIAL: z.object({
    items: z
      .array(
        z.object({
          network: z.enum([
            "instagram",
            "facebook",
            "tiktok",
            "youtube",
            "linkedin",
            "x",
            "site",
          ]),
          url: urlSchema,
        }),
      )
      .min(1, "Adicione pelo menos uma rede social")
      .max(10),
  }),

  // Os itens ficam nas tabelas ServiceItem / Testimonial.
  SERVICES: z.object({
    heading: z.string().trim().max(80).default("Servicos"),
  }),

  TESTIMONIALS: z.object({
    heading: z.string().trim().max(80).default("Depoimentos"),
  }),

  LOCATION: z.object({
    address: z.string().trim().min(3).max(200),
    mapsUrl: urlSchema.optional(),
    label: z.string().trim().max(60).optional(),
  }),
} satisfies Record<BlockType, z.ZodTypeAny>;

export const blockTypeSchema = z.enum(
  Object.keys(blockContentSchemas) as [BlockType, ...BlockType[]],
);

export const createBlockSchema = z.object({
  type: blockTypeSchema,
  title: z.string().trim().max(80).nullish(),
  content: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
});

export const updateBlockSchema = z
  .object({
    title: z.string().trim().max(80).nullish(),
    // content e substituido por inteiro (nao e merge parcial)
    content: z.unknown().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isVisible: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualizar",
  });

export const reorderBlocksSchema = z
  .array(
    z.object({
      id: z.uuid("id de bloco invalido"),
      sortOrder: z.number().int().min(0),
    }),
  )
  .min(1, "Envie a lista de blocos com a nova ordem");

/** Valida o `content` de acordo com o tipo do bloco. */
export function parseBlockContent(type: BlockType, content: unknown) {
  return blockContentSchemas[type].parse(content ?? {});
}
