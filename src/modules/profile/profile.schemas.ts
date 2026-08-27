import { z } from "zod";
import { parsePublicHttpUrl, urlSchema } from "../../lib/sanitize";
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

export type Atmosphere = (typeof ATMOSPHERE_VALUES)[number];

const ATMOSPHERE_SET = new Set<string>(ATMOSPHERE_VALUES);

const BUTTON_STYLE_ALIASES: Record<string, "rounded" | "pill" | "square"> = {
  rounded: "rounded",
  round: "rounded",
  default: "rounded",
  pill: "pill",
  capsule: "pill",
  square: "square",
  sharp: "square",
};

const FONT_ALIASES: Record<string, "sans" | "serif" | "mono"> = {
  sans: "sans",
  "sans-serif": "sans",
  serif: "serif",
  mono: "mono",
  monospace: "mono",
};

function blankToNull(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function normalizeHexColor(value: unknown): string | null | undefined {
  const raw = blankToNull(value);
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;

  let hex = raw.trim();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) {
    return hex.slice(0, 7).toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }
  return undefined;
}

function normalizeAtmosphere(value: unknown): Atmosphere | null {
  const raw = blankToNull(value);
  if (raw === null) return "none";
  if (typeof raw !== "string") return "none";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "off" || normalized === "default" || normalized === "null") return "none";
  return ATMOSPHERE_SET.has(normalized) ? (normalized as Atmosphere) : "none";
}

function normalizeButtonStyle(value: unknown) {
  const raw = blankToNull(value);
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  return BUTTON_STYLE_ALIASES[raw.trim().toLowerCase()];
}

function normalizeFont(value: unknown) {
  const raw = blankToNull(value);
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  return FONT_ALIASES[raw.trim().toLowerCase()];
}

function normalizeBackgroundImage(value: unknown) {
  return parsePublicHttpUrl(value);
}

/** Inteiro 0–80. Invalido → ignore (undefined). Vazio → null. */
function normalizeOverlay(value: unknown): number | null | undefined {
  const raw = blankToNull(value);
  if (raw === null) return null;
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 80) return undefined;
  return n;
}

/** Converte string vazia / null em ausencia de campo, para o PUT do editor nao quebrar. */
function omitEmptyStrings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (key === "theme") {
      out[key] = field;
      continue;
    }
    if (field === "" || field === undefined) continue;
    out[key] = field;
  }
  return out;
}

function normalizeThemeInput(value: unknown) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return value;

  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = { ...raw };

  if ("primaryColor" in raw) next.primaryColor = normalizeHexColor(raw.primaryColor);
  if ("backgroundColor" in raw) next.backgroundColor = normalizeHexColor(raw.backgroundColor);
  if ("textColor" in raw) next.textColor = normalizeHexColor(raw.textColor);
  if ("buttonStyle" in raw) next.buttonStyle = normalizeButtonStyle(raw.buttonStyle);
  if ("font" in raw) next.font = normalizeFont(raw.font);
  if ("atmosphere" in raw) next.atmosphere = normalizeAtmosphere(raw.atmosphere);
  if ("backgroundImage" in raw) {
    const image = normalizeBackgroundImage(raw.backgroundImage);
    if (image === undefined) delete next.backgroundImage;
    else next.backgroundImage = image;
  }
  if ("overlay" in raw) {
    const overlay = normalizeOverlay(raw.overlay);
    if (overlay === undefined) delete next.overlay;
    else next.overlay = overlay;
  }

  return next;
}

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve estar no formato #RRGGBB")
  .nullish();

/** Aparencia da pagina publica. O FE decide como renderizar. */
export const themeSchema = z.preprocess(
  normalizeThemeInput,
  z
    .object({
      primaryColor: hexColorSchema,
      backgroundColor: hexColorSchema,
      textColor: hexColorSchema,
      buttonStyle: z.enum(["rounded", "pill", "square"]).nullish(),
      font: z.enum(["sans", "serif", "mono"]).nullish(),
      atmosphere: z.enum(ATMOSPHERE_VALUES).nullish(),
      backgroundImage: z.string().max(2048).nullish(),
      overlay: z.number().int().min(0).max(80).nullish(),
    })
    .passthrough(),
);

export const updateProfileSchema = z.preprocess(
  omitEmptyStrings,
  z
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
    }),
);

export const checkUsernameQuerySchema = z.object({
  username: z.string().trim().toLowerCase(),
});

/** Mescla o tema enviado com o salvo. null/vazio remove a chave (ou volta atmosphere para none). */
export function mergeTheme(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const next = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (key === "atmosphere") {
      next.atmosphere = value == null || value === "" ? "none" : value;
      continue;
    }
    if (value === null || value === "") {
      delete next[key];
      continue;
    }
    if (value !== undefined) {
      next[key] = value;
    }
  }

  if (!next.backgroundImage) {
    delete next.overlay;
  }

  return next;
}
