import type { z } from "zod";
import { query, queryOne, withTransaction } from "../../db/client";
import type { Block, Plan } from "../../db/types";
import { notFound } from "../../lib/errors";
import { resolveSubscription } from "../billing/billing.service";
import {
  assertCanCreateBlock,
  assertCanMutateBlock,
  assertCanUpdateTheme,
  entitlementsOf,
  filterBlocksForPlan,
} from "../billing/entitlements";
import { isPaidLookOnlyPatch, stripPaidBlockLook } from "./block-look";
import type { createBlockSchema, reorderBlocksSchema, updateBlockSchema } from "./blocks.schemas";
import { parseBlockContent } from "./blocks.schemas";

function mapBlock(row: Block): Block {
  return {
    ...row,
    content:
      typeof row.content === "string"
        ? (JSON.parse(row.content) as Record<string, unknown>)
        : (row.content ?? {}),
  };
}

async function planOf(userId: string): Promise<Plan> {
  const subscription = await resolveSubscription(userId);
  return subscription?.plan ?? "FREE";
}

function contentForPlanWrite(
  plan: Plan,
  type: Block["type"],
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
  extraFieldsChanged = false,
) {
  if (entitlementsOf(plan).customTheme) return incoming;
  if (!extraFieldsChanged && isPaidLookOnlyPatch(type, previous, incoming)) {
    assertCanUpdateTheme(plan);
  }
  return stripPaidBlockLook(type, incoming);
}

export async function listBlocks(profileId: string) {
  const rows = await query<Block>(
    `SELECT * FROM blocks WHERE "profileId" = $1 ORDER BY "sortOrder" ASC`,
    [profileId],
  );
  return rows.map(mapBlock);
}

/** Lista que o editor pode ver/editar no plano atual. O restante fica no banco para um upgrade. */
export async function listBlocksForPlan(userId: string, profileId: string) {
  const plan = await planOf(userId);
  return filterBlocksForPlan(plan, await listBlocks(profileId));
}

async function nextSortOrder(profileId: string) {
  const last = await queryOne<{ sortOrder: number }>(
    `SELECT "sortOrder" FROM blocks WHERE "profileId" = $1 ORDER BY "sortOrder" DESC LIMIT 1`,
    [profileId],
  );
  return last ? last.sortOrder + 1 : 0;
}

export async function createBlock(
  userId: string,
  profileId: string,
  input: z.infer<typeof createBlockSchema>,
) {
  const plan = await planOf(userId);
  const existing = await listBlocks(profileId);
  assertCanCreateBlock(plan, input.type, filterBlocksForPlan(plan, existing).length);

  const parsed = parseBlockContent(input.type, input.content);
  const content = contentForPlanWrite(plan, input.type, {}, parsed);
  const sortOrder = input.sortOrder ?? (await nextSortOrder(profileId));

  const block = await queryOne<Block>(
    `INSERT INTO blocks ("profileId", type, title, content, "sortOrder", "isVisible")
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING *`,
    [
      profileId,
      input.type,
      input.title ?? null,
      JSON.stringify(content),
      sortOrder,
      input.isVisible ?? true,
    ],
  );

  return mapBlock(block!);
}

export async function updateBlock(
  userId: string,
  profileId: string,
  blockId: string,
  input: z.infer<typeof updateBlockSchema>,
) {
  const plan = await planOf(userId);
  const blocks = await listBlocks(profileId);
  const block = blocks.find((item) => item.id === blockId);
  if (!block) throw notFound("Bloco nao encontrado", "BLOCK_NOT_FOUND");

  assertCanMutateBlock(plan, block, blocks);

  const title = input.title !== undefined ? input.title : block.title;
  const sortOrder = input.sortOrder !== undefined ? input.sortOrder : block.sortOrder;
  const isVisible = input.isVisible !== undefined ? input.isVisible : block.isVisible;
  const extraFieldsChanged =
    input.title !== undefined || input.sortOrder !== undefined || input.isVisible !== undefined;

  const content =
    input.content !== undefined
      ? contentForPlanWrite(
          plan,
          block.type,
          block.content,
          parseBlockContent(block.type, input.content),
          extraFieldsChanged,
        )
      : block.content;

  const updated = await queryOne<Block>(
    `UPDATE blocks SET
       title = $1,
       content = $2::jsonb,
       "sortOrder" = $3,
       "isVisible" = $4,
       "updatedAt" = NOW()
     WHERE id = $5
     RETURNING *`,
    [title, JSON.stringify(content), sortOrder, isVisible, block.id],
  );

  return mapBlock(updated!);
}

export async function deleteBlock(profileId: string, blockId: string) {
  await query(`DELETE FROM blocks WHERE id = $1 AND "profileId" = $2`, [blockId, profileId]);
}

export async function reorderBlocks(
  userId: string,
  profileId: string,
  items: z.infer<typeof reorderBlocksSchema>,
) {
  if (items.length === 0) {
    return listBlocksForPlan(userId, profileId);
  }

  const owned = await query<{ id: string }>(
    `SELECT id FROM blocks WHERE "profileId" = $1 AND id = ANY($2::text[])`,
    [profileId, items.map((item) => item.id)],
  );
  const ownedIds = new Set(owned.map((row) => row.id));

  await withTransaction(async (client) => {
    for (const item of items) {
      if (!ownedIds.has(item.id)) continue;
      await client.query(
        `UPDATE blocks SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [item.sortOrder, item.id],
      );
    }
  });

  return listBlocksForPlan(userId, profileId);
}
