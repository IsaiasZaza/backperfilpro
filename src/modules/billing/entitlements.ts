import type { BlockType, Plan } from "../../db/types";
import { paymentRequired } from "../../lib/errors";
import { getPlanCatalog } from "./plans";

export type PaidPlan = Exclude<Plan, "FREE">;

export function isPaidPlan(plan: Plan): plan is PaidPlan {
  return plan === "PRO" || plan === "PREMIUM";
}

export function entitlementsOf(plan: Plan) {
  return getPlanCatalog(plan).entitlements;
}

export function showBrandingFor(plan: Plan | null | undefined) {
  if (!plan) return true;
  return !entitlementsOf(plan).removeBranding;
}

export function sanitizeThemeForPlan(plan: Plan, theme: Record<string, unknown>) {
  if (entitlementsOf(plan).customTheme) return theme;
  return {};
}

export function applyCountLimit<T>(items: T[], max: number | null) {
  if (max == null) return items;
  return items.slice(0, max);
}

export function filterBlocksForPlan<T extends { type: BlockType }>(plan: Plan, blocks: T[]) {
  const allowed = entitlementsOf(plan).allowedBlockTypes;
  const filtered = allowed ? blocks.filter((block) => allowed.includes(block.type)) : blocks;
  return applyCountLimit(filtered, entitlementsOf(plan).maxBlocks);
}

function upgradeDetails(plan: Plan, extra: Record<string, unknown>) {
  return {
    currentPlan: plan,
    suggestedPlan: "PRO" as const,
    ...extra,
  };
}

function featureLocked(plan: Plan, message: string, extra: Record<string, unknown> = {}) {
  throw paymentRequired(message, "PLAN_FEATURE_LOCKED", upgradeDetails(plan, extra));
}

function limitReached(plan: Plan, message: string, extra: Record<string, unknown> = {}) {
  throw paymentRequired(message, "PLAN_LIMIT_REACHED", upgradeDetails(plan, extra));
}

export function isBlockTypeAllowed(plan: Plan, type: BlockType) {
  const allowed = entitlementsOf(plan).allowedBlockTypes;
  return !allowed || allowed.includes(type);
}

/** Posicao 0-based do bloco entre os tipos permitidos pelo plano. -1 se o tipo nao e permitido. */
export function inPlanBlockIndex(
  plan: Plan,
  blockId: string,
  allBlocks: Array<{ id: string; type: BlockType }>,
) {
  const block = allBlocks.find((item) => item.id === blockId);
  if (!block || !isBlockTypeAllowed(plan, block.type)) return -1;

  const allowed = entitlementsOf(plan).allowedBlockTypes;
  const inPlan = allowed ? allBlocks.filter((item) => allowed.includes(item.type)) : allBlocks;
  return inPlan.findIndex((item) => item.id === blockId);
}

export function isBlockLocked(
  plan: Plan,
  block: { id: string; type: BlockType },
  allBlocks: Array<{ id: string; type: BlockType }>,
) {
  if (!isBlockTypeAllowed(plan, block.type)) return true;
  const maxBlocks = entitlementsOf(plan).maxBlocks;
  if (maxBlocks == null) return false;
  const index = inPlanBlockIndex(plan, block.id, allBlocks);
  return index < 0 || index >= maxBlocks;
}

export function isIndexedItemLocked(plan: Plan, entitlement: "maxServices" | "maxTestimonials", index: number) {
  const max = entitlementsOf(plan)[entitlement];
  return max != null && index >= max;
}

export function assertCanCreateBlock(plan: Plan, type: BlockType, currentCount: number) {
  if (!isBlockTypeAllowed(plan, type)) {
    featureLocked(plan, "Esse tipo de bloco e exclusivo dos planos Pro e Premium.", {
      entitlement: "allowedBlockTypes",
      blockType: type,
    });
  }

  const { maxBlocks } = entitlementsOf(plan);
  if (maxBlocks != null && currentCount >= maxBlocks) {
    limitReached(
      plan,
      `O plano Free permite no maximo ${maxBlocks} blocos. Faca upgrade para o Pro.`,
      { entitlement: "maxBlocks", limit: maxBlocks, current: currentCount },
    );
  }
}

export function assertCanMutateBlock(
  plan: Plan,
  block: { id: string; type: BlockType },
  allBlocks: Array<{ id: string; type: BlockType }>,
) {
  if (!isBlockTypeAllowed(plan, block.type)) {
    featureLocked(plan, "Esse tipo de bloco e exclusivo dos planos Pro e Premium.", {
      entitlement: "allowedBlockTypes",
      blockType: block.type,
    });
  }

  const { maxBlocks } = entitlementsOf(plan);
  if (maxBlocks == null) return;

  const index = inPlanBlockIndex(plan, block.id, allBlocks);
  if (index >= maxBlocks) {
    limitReached(
      plan,
      `O plano Free permite editar no maximo ${maxBlocks} blocos. Remova os extras ou faca upgrade.`,
      { entitlement: "maxBlocks", limit: maxBlocks, current: allBlocks.length },
    );
  }
}

export function assertCanCreateService(plan: Plan, currentCount: number) {
  const { maxServices } = entitlementsOf(plan);
  if (maxServices != null && currentCount >= maxServices) {
    limitReached(
      plan,
      `O plano Free permite no maximo ${maxServices} servicos. Faca upgrade para o Pro.`,
      { entitlement: "maxServices", limit: maxServices, current: currentCount },
    );
  }
}

export function assertCanCreateTestimonial(plan: Plan, currentCount: number) {
  const { maxTestimonials } = entitlementsOf(plan);
  if (maxTestimonials != null && currentCount >= maxTestimonials) {
    limitReached(
      plan,
      `O plano Free permite no maximo ${maxTestimonials} depoimentos. Faca upgrade para o Pro.`,
      { entitlement: "maxTestimonials", limit: maxTestimonials, current: currentCount },
    );
  }
}

export function assertCanMutateIndexedItem(
  plan: Plan,
  entitlement: "maxServices" | "maxTestimonials",
  itemId: string,
  orderedIds: string[],
) {
  const max = entitlementsOf(plan)[entitlement];
  if (max == null) return;

  const index = orderedIds.indexOf(itemId);
  if (index >= max) {
    const label = entitlement === "maxServices" ? "servicos" : "depoimentos";
    limitReached(
      plan,
      `O plano Free permite editar no maximo ${max} ${label}. Remova os extras ou faca upgrade.`,
      { entitlement, limit: max, current: orderedIds.length },
    );
  }
}

export function assertCanUpdateTheme(plan: Plan) {
  if (!entitlementsOf(plan).customTheme) {
    featureLocked(plan, "Temas e cores personalizados estao nos planos Pro e Premium.", {
      entitlement: "customTheme",
    });
  }
}
