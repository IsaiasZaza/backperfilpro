import type { z } from "zod";
import { query, queryOne, withTransaction } from "../../db/client";
import type { Block } from "../../db/types";
import { badRequest, notFound } from "../../lib/errors";
import { resolveSubscription } from "../billing/billing.service";
import { assertCanCreateBlock, assertCanMutateBlock, filterBlocksForPlan } from "../billing/entitlements";
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

async function planOf(userId: string) {
  const subscription = await resolveSubscription(userId);
  return subscription?.plan ?? "FREE";
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

async function findOwnedBlock(profileId: string, blockId: string) {
  const block = await queryOne<Block>(
    `SELECT * FROM blocks WHERE id = $1 AND "profileId" = $2`,
    [blockId, profileId],
  );
  if (!block) throw notFound("Bloco nao encontrado", "BLOCK_NOT_FOUND");
  return mapBlock(block);
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

  const content = parseBlockContent(input.type, input.content);
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
  const content =
    input.content !== undefined
      ? parseBlockContent(block.type, input.content)
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
  const block = await findOwnedBlock(profileId, blockId);
  await query(`DELETE FROM blocks WHERE id = $1`, [block.id]);
}

export async function reorderBlocks(
  userId: string,
  profileId: string,
  items: z.infer<typeof reorderBlocksSchema>,
) {
  const ids = items.map((item) => item.id);
  const owned = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM blocks WHERE "profileId" = $1 AND id = ANY($2::text[])`,
    [profileId, ids],
  );

  if (Number(owned?.count ?? 0) !== ids.length) {
    throw badRequest("Um ou mais blocos nao pertencem ao seu perfil", "BLOCK_NOT_FOUND");
  }

  await withTransaction(async (client) => {
    for (const item of items) {
      await client.query(
        `UPDATE blocks SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [item.sortOrder, item.id],
      );
    }
  });

  return listBlocksForPlan(userId, profileId);
}
