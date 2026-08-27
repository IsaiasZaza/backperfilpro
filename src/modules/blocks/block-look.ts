import type { BlockType, Plan } from "../../db/types";
import { entitlementsOf } from "../billing/entitlements";

/** Layouts visuais pagos (HERO / LINK / SOCIAL / SERVICES / TESTIMONIALS / LOCATION). */
const VISUAL_LAYOUT_TYPES = new Set<BlockType>([
  "HERO",
  "LINK_BUTTON",
  "SOCIAL",
  "SERVICES",
  "TESTIMONIALS",
  "LOCATION",
]);

/**
 * Campos de look/layout pagos. `align`, `avatarSize` e `avatarShape` ficam no Free
 * (ja existiam e sao basicos). `style` so e pago em SOCIAL — no CTA e o estilo do botao.
 */
const PAID_LOOK_KEYS = new Set([
  "textColor",
  "backgroundColor",
  "borderColor",
  "width",
  "pulse",
  "fontSize",
  "titleFontSize",
  "headlineFontSize",
  "bioFontSize",
  "headingFontSize",
  "bodyFontSize",
  "metaFontSize",
  "buttonFontSize",
  "priceFontSize",
  "radius",
  "padding",
  "shadow",
  "hover",
  "surface",
  "bannerUrl",
  "thumbnailUrl",
  "badge",
]);

export function isPaidVisualKey(type: BlockType, key: string) {
  if (PAID_LOOK_KEYS.has(key)) return true;
  if (key === "layout" && VISUAL_LAYOUT_TYPES.has(type)) return true;
  if (key === "style" && type === "SOCIAL") return true;
  return false;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function pickKeys(
  type: BlockType,
  content: Record<string, unknown>,
  paid: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (isPaidVisualKey(type, key) === paid) next[key] = value;
  }
  return next;
}

function stableEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Remove look/layout pagos do JSON. Usado no write do Free e na pagina publica. */
export function stripPaidBlockLook(type: BlockType, content: unknown): Record<string, unknown> {
  const raw = asRecord(content);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isPaidVisualKey(type, key)) continue;
    next[key] = value;
  }
  return next;
}

export function sanitizeBlockContentForPlan(
  plan: Plan,
  type: BlockType,
  content: unknown,
): Record<string, unknown> {
  const raw = asRecord(content);
  if (entitlementsOf(plan).customTheme) return raw;
  return stripPaidBlockLook(type, raw);
}

/**
 * True quando o patch so tenta mudar visual pago (nenhum campo funcional mudou).
 * Nesse caso o Free recebe 402 em vez de um save silencioso.
 */
export function isPaidLookOnlyPatch(
  type: BlockType,
  previous: unknown,
  next: unknown,
): boolean {
  const from = asRecord(previous);
  const to = asRecord(next);
  const visualChanged = !stableEqual(pickKeys(type, from, true), pickKeys(type, to, true));
  const functionalChanged = !stableEqual(pickKeys(type, from, false), pickKeys(type, to, false));
  return visualChanged && !functionalChanged;
}
