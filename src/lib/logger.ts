import { env } from "../config/env";

type Level = "info" | "warn" | "error";

/** Log estruturado em JSON (uma linha por evento), facil de mandar pro Datadog/CloudWatch. */
function write(level: Level, message: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...meta,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (env.NODE_ENV !== "test") console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
