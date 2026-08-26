import dotenv from "dotenv";
import { z } from "zod";

/**
 * Em producao as env do host (Railway/Render) vencem.
 * Em dev o tsx watch herda process.env antigo — reler o .env evita Price IDs inativos.
 */
dotenv.config({
  override: process.env.NODE_ENV !== "production",
});

/**
 * Toda variavel de ambiente passa por aqui.
 * Se faltar alguma coisa, a aplicacao nao sobe - e o erro diz exatamente o que falta.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),

  DATABASE_URL: z.string().min(1, "DATABASE_URL e obrigatoria"),

  APP_URL: z.string().default("http://localhost:3333"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  JWT_SECRET: z.string().min(10, "JWT_SECRET precisa ter pelo menos 10 caracteres"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(60),

  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional(),

  MAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  MAIL_FROM: z.string().default("PerfilPro <no-reply@perfilpro.app>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  UPLOAD_DIR: z.string().default("uploads"),
  MAX_AVATAR_SIZE_MB: z.coerce.number().default(2),

  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PRICE_PRO: z.string().optional().default(""),
  STRIPE_PRICE_PREMIUM: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variaveis de ambiente invalidas:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

if (
  parsed.data.NODE_ENV === "production" &&
  (!parsed.data.STRIPE_SECRET_KEY ||
    !parsed.data.STRIPE_WEBHOOK_SECRET ||
    !parsed.data.STRIPE_PRICE_PRO ||
    !parsed.data.STRIPE_PRICE_PREMIUM)
) {
  console.error(
    "Em producao e obrigatorio definir STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO e STRIPE_PRICE_PREMIUM.",
  );
  process.exit(1);
}

export const env = parsed.data;

/** Origens liberadas no CORS (aceita lista separada por virgula). */
export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
