import { Router } from "express";
import { z } from "zod";
import { ok } from "../../lib/http";
import { presentBlock } from "../profile/profile.presenter";
import * as blocksService from "./blocks.service";
import { createBlockSchema, reorderBlocksSchema, updateBlockSchema } from "./blocks.schemas";

const idParamSchema = z.object({ id: z.uuid("id invalido") });

/** Montado em /me/profile/blocks (ja passou por authenticate + loadProfile). */
export const blocksRoutes = Router();

blocksRoutes.get("/", async (req, res) => {
  const blocks = await blocksService.listBlocks(req.profile!.id);
  return ok(res, blocks.map(presentBlock));
});

blocksRoutes.post("/", async (req, res) => {
  const input = createBlockSchema.parse(req.body);
  const block = await blocksService.createBlock(req.profile!.id, input);
  return ok(res, presentBlock(block), 201);
});

// precisa vir antes de /:id para nao ser confundido com um id
blocksRoutes.put("/reorder", async (req, res) => {
  const items = reorderBlocksSchema.parse(req.body);
  const blocks = await blocksService.reorderBlocks(req.profile!.id, items);
  return ok(res, blocks.map(presentBlock));
});

blocksRoutes.patch("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateBlockSchema.parse(req.body);
  const block = await blocksService.updateBlock(req.profile!.id, id, input);
  return ok(res, presentBlock(block));
});

blocksRoutes.delete("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await blocksService.deleteBlock(req.profile!.id, id);
  return ok(res, { deleted: true });
});
