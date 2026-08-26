import { z } from "zod";
import { urlSchema } from "../../lib/sanitize";
import { USERNAME_REGEX } from "../../lib/username";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O username precisa ter no minimo 3 caracteres")
  .max(30, "O username pode ter no maximo 30 caracteres")
  .regex(
    USERNAME_REGEX,
    "Use apenas letras minusculas, numeros, hifen e underline (comecando e terminando com letra ou numero)",
  );

export const ATMOSPHERE_VALUES = [
  "none",
  "claw",
  "comic",
  "arc",
  "symbiote",
  "storm",
  "inferno",
  "cosmic",
] as const;

function normalizeThemeInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  const atmosphere = raw.atmosphere;
  return {
    ...raw,
    atmosphere:
      typeof atmosphere === "string" ? atmosphere.trim().toLowerCase() || "none" : atmosphere,
  };
}

/** Aparencia da pagina publica. O FE decide como renderizar. */
export const themeSchema = z.preprocess(
  normalizeThemeInput,
  z
    .object({
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB")
        .optional(),
      backgroundColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB")
        .optional(),
      textColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB")
        .optional(),
      buttonStyle: z.enum(["rounded", "pill", "square"]).optional(),
      font: z.enum(["sans", "serif", "mono"]).optional(),
      atmosphere: z.enum(ATMOSPHERE_VALUES).nullish(),
    })
    .passthrough(),
);

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z.string().trim().min(2).max(80).optional(),
    headline: z.string().trim().max(120).nullish(),
    bio: z.string().trim().max(500).nullish(),
    avatarUrl: urlSchema.nullish(),
    location: z.string().trim().max(120).nullish(),
    theme: themeSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Envie pelo menos um campo para atualizar",
  });

export const checkUsernameQuerySchema = z.object({
  username: z.string().trim().toLowerCase(),
});
