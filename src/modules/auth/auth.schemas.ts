import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter no minimo 8 caracteres")
  .max(72, "A senha pode ter no maximo 72 caracteres");

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome").max(120),
    email: z.email("E-mail invalido").toLowerCase().trim(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas nao conferem",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.email("E-mail invalido").toLowerCase().trim(),
  password: z.string().min(1, "Informe a senha"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("E-mail invalido").toLowerCase().trim(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "Token invalido"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas nao conferem",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
