import { z } from "zod";
import { urlSchema } from "../../lib/sanitize";
import type { BlockType } from "../../db/types";

const optionalUrlSchema = z.preprocess(
  (value) => (value == null || value === "" ? undefined : value),
  urlSchema.optional(),
);

function optionalEnum<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(
    (value) => (value == null || value === "" ? undefined : value),
    z.enum(values).optional(),
  );
}

/**
 * Campos de aparência por bloco (editor).
 * `.passthrough()` nos schemas abaixo preserva esses campos no JSON.
 */
const blockLookFields = {
  textColor: z.string().trim().max(32).optional(),
  backgroundColor: z.string().trim().max(32).optional(),
  borderColor: z.string().trim().max(32).optional(),
  align: optionalEnum(["left", "right", "center"]),
  width: optionalEnum(["fit", "full"]),
  pulse: z.boolean().optional(),
  fontSize: optionalEnum(["sm", "md", "lg", "xl"]),
  avatarSize: optionalEnum(["xs", "sm", "md", "lg", "xl", "2xl"]),
  avatarShape: optionalEnum(["circle", "rounded", "square"]),
  radius: optionalEnum(["none", "sm", "md", "lg", "pill"]),
  padding: optionalEnum(["sm", "md", "lg"]),
  shadow: optionalEnum(["none", "soft"]),
};

/**
 * Cada tipo de bloco tem seu proprio formato de `content`.
 * Isso e o "contrato" que o editor do frontend precisa seguir.
 */
export const blockContentSchemas = {
  HERO: z
    .object({
      name: z.string().trim().max(80).optional(),
      headline: z.string().trim().max(120).optional(),
      bio: z.string().trim().max(500).optional(),
      avatarUrl: optionalUrlSchema,
      location: z.string().trim().max(120).optional(),
      ...blockLookFields,
    })
    .passthrough(),

  CTA_BUTTON: z
    .object({
      label: z.string().trim().min(1).max(60),
      url: urlSchema,
      style: z.enum(["primary", "secondary", "outline"]).default("primary"),
      ...blockLookFields,
    })
    .passthrough(),

  LINK_BUTTON: z
    .object({
      label: z.string().trim().min(1).max(60),
      url: urlSchema,
      icon: z.string().trim().max(40).optional(),
      ...blockLookFields,
    })
    .passthrough(),

  WHATSAPP: z
    .object({
      // Permite rascunho vazio/parcial no editor; wa.me usa 10–15 com DDI.
      phone: z
        .union([z.string(), z.number()])
        .transform((value) => String(value).replace(/\D/g, "").slice(0, 15))
        .refine((value) => /^\d{0,15}$/.test(value), {
          message: "Telefone deve conter apenas numeros (com DDI)",
        }),
      message: z.string().trim().max(300).optional(),
      label: z.string().trim().max(60).optional(),
      ...blockLookFields,
    })
    .passthrough(),

  SOCIAL: z
    .object({
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
            label: z.string().trim().max(60).optional(),
          }),
        )
        .min(1, "Adicione pelo menos uma rede social")
        .max(10),
      layout: optionalEnum(["icons", "buttons"]),
      ...blockLookFields,
    })
    .passthrough(),

  // Os itens ficam nas tabelas ServiceItem / Testimonial.
  SERVICES: z
    .object({
      heading: z.string().trim().max(80).default("Servicos"),
      ...blockLookFields,
    })
    .passthrough(),

  TESTIMONIALS: z
    .object({
      heading: z.string().trim().max(80).default("Depoimentos"),
      ...blockLookFields,
    })
    .passthrough(),

  LOCATION: z
    .object({
      address: z.string().trim().min(3).max(200),
      mapsUrl: optionalUrlSchema,
      url: optionalUrlSchema,
      label: z.string().trim().max(60).optional(),
      ...blockLookFields,
    })
    .passthrough(),
} satisfies Record<BlockType, z.ZodTypeAny>;

export const blockTypeSchema = z.enum(
  Object.keys(blockContentSchemas) as [BlockType, ...BlockType[]],
);

/** Titulo humano; 512 cobre titulos antigos que empacotavam look no campo. */
const blockTitleSchema = z.string().trim().max(512).nullish();

export const createBlockSchema = z.object({
  type: blockTypeSchema,
  title: blockTitleSchema,
  content: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
});

export const updateBlockSchema = z
  .object({
    title: blockTitleSchema,
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
  .default([]);

/** Valida o `content` de acordo com o tipo do bloco. */
export function parseBlockContent(type: BlockType, content: unknown) {
  return blockContentSchemas[type].parse(content ?? {});
}
