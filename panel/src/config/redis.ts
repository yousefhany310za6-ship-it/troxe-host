import Redis from "ioredis";
import { config } from "./env.js";

export const redis = new Redis(config.REDIS_URL, {
  password: config.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});

redis.on("connect", () => {
  console.log("Redis connected");
});

export async function testRedis(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
