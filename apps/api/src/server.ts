import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase, runMigrations } from "./database/client.js";
import { logger } from "./utils/logger.js";

runMigrations();

const app = createApp();
const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(`AgentDesk API listening on http://${env.HOST}:${env.PORT}`, {
    env: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
  });
});

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
