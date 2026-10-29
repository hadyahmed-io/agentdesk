import { closeDatabase, runMigrations } from "../client.js";
import { logger } from "../../utils/logger.js";

try {
  const result = runMigrations();
  logger.info("Database migrations complete", result);
  closeDatabase();
} catch (err) {
  logger.error("Database migration failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}
