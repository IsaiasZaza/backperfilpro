import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const disabled = env.NODE_ENV === "test";

function build(options: { windowMinutes: number; max: number; message: string }) {
  return rateLimit({
    windowMs: options.windowMinutes * 60 * 1000,
    limit: disabled ? 0 : options.max, // 0 = sem limite (usado nos testes)
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => disabled,
    handler: (_req, res) => {
      res.status(429).json({
        data: null,
        error: { code: "TOO_MANY_REQUESTS", message: options.message },
      });
    },
  });
}

/** Protege login/registro contra forca bruta. */
export const authLimiter = build({
  windowMinutes: 15,
  max: 10,
  message: "Muitas tentativas de login. Aguarde alguns minutos.",
});

/** Evita spam de e-mails de recuperacao de senha. */
export const forgotPasswordLimiter = build({
  windowMinutes: 60,
  max: 5,
  message: "Muitos pedidos de recuperacao de senha. Tente novamente mais tarde.",
});
