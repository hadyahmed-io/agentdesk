import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default("127.0.0.1"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1).default("./data/agentdesk.sqlite"),
  APPROVED_WORKSPACE_ROOT: z
    .string()
    .min(1)
    .default(path.resolve(process.cwd(), "../..")),
  DEFAULT_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
  MAX_LOG_PAYLOAD_BYTES: z.coerce.number().int().min(1024).max(1048576).default(65536),
  LOCAL_AGENT_CLI_BINARY: z.string().optional().default(""),
  LOCAL_AGENT_CLI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = parseEnv();
