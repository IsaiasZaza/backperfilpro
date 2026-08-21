import { z } from "zod";

export const planSchema = z.enum(["PRO", "PREMIUM"], {
  error: "Escolha o plano PRO ou PREMIUM",
});

export const checkoutSchema = z.object({
  email: z.email("E-mail invalido").toLowerCase().trim(),
  password: z.string().min(1, "Informe a senha"),
  plan: planSchema,
});

export const changePlanSchema = z.object({
  plan: planSchema,
});

export const confirmSessionSchema = z.object({
  sessionId: z.string().min(8, "sessionId invalido"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
