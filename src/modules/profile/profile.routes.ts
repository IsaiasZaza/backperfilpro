import { Router } from "express";
import { badRequest } from "../../lib/errors";
import { ok } from "../../lib/http";
import { avatarUpload, buildAvatarUrl } from "../../lib/upload";
import { authenticate } from "../../middlewares/authenticate";
import { requireActiveSubscription } from "../../middlewares/require-subscription";
import { loadProfile } from "../../middlewares/load-profile";
import { blocksRoutes } from "../blocks/blocks.routes";
import { servicesRoutes } from "../services/services.routes";
import { testimonialsRoutes } from "../testimonials/testimonials.routes";
import { presentProfile, presentPublicPage } from "./profile.presenter";
import * as profileService from "./profile.service";
import { updateProfileSchema } from "./profile.schemas";

/** Montado em /me/profile. Tudo aqui exige login e usa somente o perfil do proprio usuario. */
export const profileRoutes = Router();

profileRoutes.use(authenticate, requireActiveSubscription, loadProfile);

profileRoutes.get("/", async (req, res) => {
  return ok(res, presentProfile(req.profile!));
});

profileRoutes.put("/", async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const profile = await profileService.updateProfile(req.user!.id, input);
  return ok(res, presentProfile(profile));
});

profileRoutes.post("/publish", async (req, res) => {
  const profile = await profileService.publishProfile(req.user!.id);
  return ok(res, presentProfile(profile));
});

profileRoutes.post("/unpublish", async (req, res) => {
  const profile = await profileService.unpublishProfile(req.user!.id);
  return ok(res, presentProfile(profile));
});

/** Mesmo shape da pagina publica, mas funciona com o perfil ainda em DRAFT. */
profileRoutes.get("/preview", async (req, res) => {
  const profile = await profileService.getFullProfileByUserId(req.user!.id);
  return ok(
    res,
    presentPublicPage(
      {
        ...profile,
        plan: req.subscription?.plan ?? profile.plan,
        showBranding: req.subscription?.plan !== "PREMIUM",
      },
      false,
    ),
  );
});

profileRoutes.post("/avatar", avatarUpload, async (req, res) => {
  if (!req.file) throw badRequest("Envie a imagem no campo 'file'", "FILE_REQUIRED");

  const avatarUrl = buildAvatarUrl(req.file.filename);
  const profile = await profileService.updateAvatar(req.profile!.id, avatarUrl);

  return ok(res, { avatarUrl, profile: presentProfile(profile) }, 201);
});

profileRoutes.use("/blocks", blocksRoutes);
profileRoutes.use("/services", servicesRoutes);
profileRoutes.use("/testimonials", testimonialsRoutes);
