import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors";
import {
  applyCountLimit,
  assertCanCreateBlock,
  assertCanMutateBlock,
  assertCanMutateIndexedItem,
  assertCanUpdateTheme,
  filterBlocksForPlan,
  isBlockLocked,
  isIndexedItemLocked,
  sanitizeThemeForPlan,
} from "../src/modules/billing/entitlements";

describe("entitlements do plano Free", () => {
  const freeBlocks = [
    { id: "1", type: "HERO" as const },
    { id: "2", type: "LINK_BUTTON" as const },
    { id: "3", type: "LOCATION" as const },
    { id: "4", type: "WHATSAPP" as const },
    { id: "5", type: "SOCIAL" as const },
    { id: "6", type: "CTA_BUTTON" as const },
  ];

  it("bloqueia tipo de bloco premium", () => {
    expect(() => assertCanCreateBlock("FREE", "LOCATION", 0)).toThrow(AppError);
    try {
      assertCanCreateBlock("FREE", "LOCATION", 0);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("PLAN_FEATURE_LOCKED");
      expect((error as AppError).status).toBe(402);
    }
  });

  it("bloqueia update de bloco premium mesmo se ja existia no plano pago", () => {
    expect(() => assertCanMutateBlock("FREE", freeBlocks[2], freeBlocks)).toThrow(AppError);
    expect(isBlockLocked("FREE", freeBlocks[2], freeBlocks)).toBe(true);
    expect(isBlockLocked("FREE", freeBlocks[0], freeBlocks)).toBe(false);
  });

  it("permite criar e editar blocos do Free enquanto estiver no limite", () => {
    expect(() => assertCanCreateBlock("FREE", "WHATSAPP", 3)).not.toThrow();
    expect(() => assertCanCreateBlock("FREE", "WHATSAPP", 4)).toThrow(AppError);
    expect(() => assertCanMutateBlock("PRO", freeBlocks[2], freeBlocks)).not.toThrow();
  });

  it("filtra a pagina publica para os blocos do plano", () => {
    const visible = filterBlocksForPlan("FREE", freeBlocks);
    expect(visible.map((block) => block.type)).toEqual(["HERO", "LINK_BUTTON", "WHATSAPP", "SOCIAL"]);
  });

  it("zera o tema customizado no Free e preserva no Pro", () => {
    const theme = { atmosphere: "cosmic", primaryColor: "#ff00aa" };
    expect(sanitizeThemeForPlan("FREE", theme)).toEqual({});
    expect(sanitizeThemeForPlan("PRO", theme)).toEqual(theme);
    expect(() => assertCanUpdateTheme("FREE")).toThrow(AppError);
    expect(() => assertCanUpdateTheme("FREE", { atmosphere: "cosmic" })).toThrow(AppError);
    expect(() => assertCanUpdateTheme("FREE", {})).not.toThrow();
    expect(() => assertCanUpdateTheme("FREE", { atmosphere: "none" })).not.toThrow();
    expect(() => assertCanUpdateTheme("PREMIUM")).not.toThrow();
  });

  it("trava servicos e depoimentos alem do limite do Free", () => {
    const ids = ["a", "b", "c"];
    expect(isIndexedItemLocked("FREE", "maxServices", 0)).toBe(false);
    expect(isIndexedItemLocked("FREE", "maxServices", 2)).toBe(true);
    expect(() => assertCanMutateIndexedItem("FREE", "maxServices", "c", ids)).toThrow(AppError);
    expect(() => assertCanMutateIndexedItem("FREE", "maxServices", "a", ids)).not.toThrow();
    expect(applyCountLimit(ids, 2)).toEqual(["a", "b"]);
  });
});
