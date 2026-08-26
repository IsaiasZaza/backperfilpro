import { Router } from "express";
import { z } from "zod";
import { ok } from "../../lib/http";
import { presentTestimonial } from "../profile/profile.presenter";
import * as testimonialsService from "./testimonials.service";
import { createTestimonialSchema, updateTestimonialSchema } from "./testimonials.schemas";

const idParamSchema = z.object({ id: z.uuid("id invalido") });

/** Montado em /me/profile/testimonials. */
export const testimonialsRoutes = Router();

testimonialsRoutes.get("/", async (req, res) => {
  const testimonials = await testimonialsService.listTestimonialsForPlan(req.user!.id, req.profile!.id);
  return ok(res, testimonials.map((testimonial) => presentTestimonial(testimonial)));
});

testimonialsRoutes.post("/", async (req, res) => {
  const input = createTestimonialSchema.parse(req.body);
  const testimonial = await testimonialsService.createTestimonial(
    req.user!.id,
    req.profile!.id,
    input,
  );
  return ok(res, presentTestimonial(testimonial), 201);
});

testimonialsRoutes.patch("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateTestimonialSchema.parse(req.body);
  const testimonial = await testimonialsService.updateTestimonial(
    req.user!.id,
    req.profile!.id,
    id,
    input,
  );
  return ok(res, presentTestimonial(testimonial));
});

testimonialsRoutes.delete("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await testimonialsService.deleteTestimonial(req.profile!.id, id);
  return ok(res, { deleted: true });
});
