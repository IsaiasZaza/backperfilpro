import { createApp } from "./app";
import { env } from "./config/env";
import { closeDb } from "./db/client";
import { logger } from "./lib/logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info("API no ar", {
    url: `http://localhost:${env.PORT}`,
    docs: `http://localhost:${env.PORT}/docs`,
    env: env.NODE_ENV,
  });
});

async function shutdown(signal: string) {
  logger.info("encerrando aplicacao", { signal });
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
