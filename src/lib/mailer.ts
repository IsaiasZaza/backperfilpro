import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Em dev (MAIL_TRANSPORT=console) o e-mail e impresso no terminal.
 * Em producao/staging (MAIL_TRANSPORT=smtp) usa as credenciais SMTP_*.
 */
export async function sendMail(mail: Mail) {
  if (env.MAIL_TRANSPORT === "console") {
    logger.info("[email:dev] e-mail nao enviado, apenas impresso", {
      to: mail.to,
      subject: mail.subject,
    });
    console.log(`\n--- E-MAIL (dev) ---\nPara: ${mail.to}\nAssunto: ${mail.subject}\n\n${mail.text}\n--------------------\n`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  await transporter.sendMail({ from: env.MAIL_FROM, ...mail });
  logger.info("e-mail enviado", { to: mail.to, subject: mail.subject });
}

export function buildPasswordResetEmail(name: string, resetUrl: string): Omit<Mail, "to"> {
  return {
    subject: "Recuperacao de senha - PerfilPro",
    text: `Ola, ${name}!\n\nRecebemos um pedido para redefinir sua senha.\nAbra o link abaixo (valido por ${env.PASSWORD_RESET_TTL_MINUTES} minutos):\n\n${resetUrl}\n\nSe nao foi voce, pode ignorar este e-mail.`,
    html: `
      <p>Ola, <strong>${name}</strong>!</p>
      <p>Recebemos um pedido para redefinir sua senha.</p>
      <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a> (link valido por ${env.PASSWORD_RESET_TTL_MINUTES} minutos).</p>
      <p>Se nao foi voce, pode ignorar este e-mail.</p>
    `,
  };
}
