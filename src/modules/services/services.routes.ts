import { Router } from "express";
import { z } from "zod";
import { ok } from "../../lib/http";
import { presentService } from "../profile/profile.presenter";
import * as servicesService from "./services.service";
import { createServiceSchema, updateServiceSchema } from "./services.schemas";

const idParamSchema = z.object({ id: z.uuid("id invalido") });

/** Montado em /me/profile/services. */
export const servicesRoutes = Router();

servicesRoutes.get("/", async (req, res) => {
  const services = await servicesService.listServicesForPlan(req.user!.id, req.profile!.id);
  return ok(res, services.map((service) => presentService(service)));
});

servicesRoutes.post("/", async (req, res) => {
  const input = createServiceSchema.parse(req.body);
  const service = await servicesService.createService(req.user!.id, req.profile!.id, input);
  return ok(res, presentService(service), 201);
});

servicesRoutes.patch("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateServiceSchema.parse(req.body);
  const service = await servicesService.updateService(req.user!.id, req.profile!.id, id, input);
  return ok(res, presentService(service));
});

servicesRoutes.delete("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await servicesService.deleteService(req.profile!.id, id);
  return ok(res, { deleted: true });
});
