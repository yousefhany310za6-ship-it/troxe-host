import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  JWT_COOKIE_SECRET: z.string().min(16),
  PANEL_URL: z.string().url().default("http://localhost:3000"),
  PANEL_NAME: z.string().default("Troxe Host"),
  PANEL_PORT: z.coerce.number().default(3001),
  NODE_DEFAULT_TOKEN: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
