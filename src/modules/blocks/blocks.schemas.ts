import { z } from "zod";
import { parsePublicHttpUrl, urlSchema } from "../../lib/sanitize";
import type { BlockType } from "../../db/types";

const optionalUrlSchema = z.preprocess(
  (value) => (value == null || value === "" ? undefined : value),
  urlSchema.optional(),
);

/** URL de capa/miniatura: http(s) publica. Invalida → ignora a chave (nao 422). */
const optionalPublicImageUrl = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const parsed = parsePublicHttpUrl(value);
  return parsed == null ? undefined : parsed;
}, z.string().max(2048).optional());

function optionalEnum<T extends [string, ...string[]]>(values: T) {
  const allowed = new Set<string>(values);
  return z.preprocess((value) => {
    if (value == null || value === "") return undefined;
    if (typeof value === "string" && allowed.has(value)) return value;
    return undefined;
  }, z.enum(values).optional());
}

function optionalHexColor() {
  return z.preprocess((value) => {
    if (value == null || value === "") return undefined;
    if (typeof value !== "string") return undefined;
    let hex = value.trim();
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
      const [, r, g, b] = hex;
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (/^#[0-9a-fA-F]{8}$/.test(hex)) return hex.slice(0, 7).toUpperCase();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
    return undefined;
  }, z.string().optional());
}

function optionalBoolean() {
  return z.preprocess(
    (value) => (typeof value === "boolean" ? value : undefined),
    z.boolean().optional(),
  );
}

const fontSize = optionalEnum(["sm", "md", "lg", "xl"]);

/**
 * Campos de aparencia por bloco (editor).
 * Enum invalido / cor invalida → a chave e ignorada (nao 500/422).
 * `.passthrough()` preserva chaves extras no JSON.
 */
const blockLookFields = {
  textColor: optionalHexColor(),
  backgroundColor: optionalHexColor(),
  borderColor: optionalHexColor(),
  align: optionalEnum(["left", "center", "right"]),
  width: optionalEnum(["full", "fit"]),
  pulse: optionalBoolean(),
  fontSize,
  titleFontSize: fontSize,
  headlineFontSize: fontSize,
  bioFontSize: fontSize,
  headingFontSize: fontSize,
  bodyFontSize: fontSize,
  metaFontSize: fontSize,
  buttonFontSize: fontSize,
  priceFontSize: fontSize,
  avatarSize: optionalEnum(["xs", "sm", "md", "lg", "xl", "2xl"]),
  avatarShape: optionalEnum(["circle", "rounded", "square"]),
  radius: optionalEnum(["none", "sm", "md", "lg", "pill"]),
  padding: optionalEnum(["sm", "md", "lg"]),
  shadow: optionalEnum(["none", "soft", "hard", "glow"]),
  hover: optionalEnum(["none", "lift", "scale", "glow"]),
  surface: optionalEnum(["clean", "card", "glass", "neon", "comic"]),
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
      layout: optionalEnum(["stack", "split", "banner"]),
      bannerUrl: optionalPublicImageUrl,
      ...blockLookFields,
    })
    .passthrough(),

  CTA_BUTTON: z
    .object({
      label: z.string().trim().min(1).max(60),
      url: optionalUrlSchema,
      style: z.enum(["primary", "secondary", "outline"]).default("primary"),
      ...blockLookFields,
    })
    .passthrough(),

  LINK_BUTTON: z
    .object({
      label: z.string().trim().min(1).max(60),
      url: optionalUrlSchema,
      icon: z.string().trim().max(40).optional(),
      subtitle: z.string().trim().max(120).optional(),
      thumbnailUrl: optionalPublicImageUrl,
      layout: optionalEnum(["row", "cover", "minimal"]),
      badge: z.string().trim().max(24).optional(),
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
      style: optionalEnum(["brand", "mono", "ghost"]),
      ...blockLookFields,
    })
    .passthrough(),

  // Os itens ficam nas tabelas ServiceItem / Testimonial.
  SERVICES: z
    .object({
      heading: z.string().trim().max(80).default("Servicos"),
      layout: optionalEnum(["list", "cards"]),
      ...blockLookFields,
    })
    .passthrough(),

  TESTIMONIALS: z
    .object({
      heading: z.string().trim().max(80).default("Depoimentos"),
      layout: optionalEnum(["stack", "quote"]),
      itemStyles: z
        .record(
          z.string(),
          z
            .object({
              layout: optionalEnum(["stack", "quote"]),
              padding: optionalEnum(["sm", "md", "lg"]),
              spacing: optionalEnum(["sm", "md", "lg"]),
            })
            .passthrough(),
        )
        .optional(),
      ...blockLookFields,
    })
    .passthrough(),

  LOCATION: z
    .object({
      address: z.string().trim().min(3).max(200),
      mapsUrl: optionalUrlSchema,
      url: optionalUrlSchema,
      label: z.string().trim().max(60).optional(),
      layout: optionalEnum(["card", "map"]),
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

function omitUndefined(value: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) next[key] = field;
  }
  return next;
}

/** Valida o `content` de acordo com o tipo do bloco. */
export function parseBlockContent(type: BlockType, content: unknown) {
  const parsed = blockContentSchemas[type].parse(content ?? {}) as Record<string, unknown>;
  return omitUndefined(parsed);
}
