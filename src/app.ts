import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { corsOrigins, env } from "./config/env";
import { openapiDocument } from "./docs/openapi";
import { ok } from "./lib/http";
import { uploadDir } from "./lib/upload";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";
import { handleStripeWebhook } from "./modules/billing/billing.service";
import { driveMediaRoutes } from "./modules/media/drive.routes";
import { profileRoutes } from "./modules/profile/profile.routes";
import { publicRoutes } from "./modules/public/public.routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      // permite que o FE em outro dominio carregue as imagens de /uploads
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: corsOrigins,
      credentials: true, // necessario para os cookies httpOnly
    }),
  );

  // Webhook da Stripe precisa do body cru para validar a assinatura.
  app.post("/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const signatureHeader = req.headers["stripe-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
    const result = await handleStripeWebhook(rawBody, signature);
    return ok(res, result);
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/uploads", express.static(uploadDir));

  app.get("/health", (_req, res) => ok(res, { status: "ok", env: env.NODE_ENV }));

  app.use("/auth", authRoutes);
  app.use("/billing", billingRoutes);
  app.use("/me/profile", profileRoutes);
  app.use("/media/drive", driveMediaRoutes);
  app.use(publicRoutes);

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));
  app.get("/openapi.json", (_req, res) => res.json(openapiDocument));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
