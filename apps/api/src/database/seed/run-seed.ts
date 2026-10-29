import { logger } from "../../utils/logger.js";
import { closeDatabase, runMigrations } from "../client.js";
import { seedDemonstrationData } from "./seed-service.js";

try {
  runMigrations();
  const result = seedDemonstrationData();
  logger.info("Demonstration seed completed", { ...result });
  closeDatabase();
} catch (err) {
  logger.error("Demonstration seed failed", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}
