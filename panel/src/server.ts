import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { config } from "./config/env.js";
import { db, testDatabase } from "./config/database.js";
import { redis, testRedis } from "./config/redis.js";
import { runMigrations } from "./db/migrate.js";
import authRoutes from "./api/routes/auth.js";
import serverRoutes from "./api/routes/servers.js";
import adminRoutes from "./api/routes/admin.js";
import fileRoutes from "./api/routes/files.js";
import consoleRoutes from "./api/routes/console.js";
import backupRoutes from "./api/routes/backups.js";
import scheduleRoutes from "./api/routes/schedules.js";
import subuserRoutes from "./api/routes/subusers.js";
import serverSettingsRoutes from "./api/routes/server-settings.js";
import monitoringRoutes from "./api/routes/monitoring.js";
import themeRoutes from "./api/routes/themes.js";
import { startScheduler } from "./services/scheduler.js";
import { securityHeaders } from "./api/middleware/security.js";

// Extend Fastify types
declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.LOG_LEVEL === "debug"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
  trustProxy: true,
});

// Make db available on instance
app.decorate("db", db);

// Plugins
await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(jwt, {
  secret: config.JWT_SECRET,
  sign: {
    expiresIn: config.JWT_ACCESS_EXPIRY,
  },
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.ip,
});

// Stricter rate limit for auth endpoints
app.register(async function authRateLimit(app) {
  await app.register(rateLimit, {
    max: 10,
    timeWindow: "5 minutes",
    keyGenerator: (req) => {
      const body = req.body as any;
      const email = body?.email || "";
      return `login:${req.ip}:${email}`;
    },
    errorResponseBuilder: () => ({
      error: "Too many login attempts, please try again in 5 minutes",
    }),
  });
}, { prefix: "/api/v1/auth/login" });

await app.register(cookie, {
  secret: config.JWT_COOKIE_SECRET,
});

await app.register(websocket);

await app.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// Health check
app.get("/health", async () => {
  const dbOk = await testDatabase();
  const redisOk = await testRedis();
  return {
    status: dbOk && redisOk ? "healthy" : "degraded",
    database: dbOk ? "connected" : "disconnected",
    redis: redisOk ? "connected" : "disconnected",
    version: "0.1.0",
    uptime: process.uptime(),
  };
});

// Security headers on every response
app.addHook("onRequest", securityHeaders);

// API routes
await app.register(authRoutes, { prefix: "/api/v1" });
await app.register(serverRoutes, { prefix: "/api/v1" });
await app.register(adminRoutes, { prefix: "/api/v1" });
await app.register(fileRoutes, { prefix: "/api/v1" });
await app.register(consoleRoutes, { prefix: "/api/v1" });
await app.register(backupRoutes, { prefix: "/api/v1" });
await app.register(scheduleRoutes, { prefix: "/api/v1" });
await app.register(subuserRoutes, { prefix: "/api/v1" });
await app.register(serverSettingsRoutes, { prefix: "/api/v1" });
await app.register(monitoringRoutes, { prefix: "/api/v1" });
await app.register(themeRoutes, { prefix: "/api/v1" });

// 404 handler
app.setNotFoundHandler((request, reply) => {
  reply.status(404).send({ error: "Not found" });
});

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  if (error.validation) {
    return reply.status(400).send({
      error: "Validation error",
      details: error.validation,
    });
  }

  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: error.message,
    });
  }

  return reply.status(500).send({ error: "Internal server error" });
});

// Start server
async function start() {
  console.log("Troxe Host Panel v0.1.0");
  console.log("========================");

  // Test connections
  const dbOk = await testDatabase();
  if (!dbOk) {
    console.error("Cannot start without database connection");
    process.exit(1);
  }

  const redisOk = await testRedis();
  if (!redisOk) {
    console.warn("Redis not available - some features may not work");
  }

  // Run migrations
  await runMigrations();

  // Start listening
  await app.listen({ port: config.PANEL_PORT, host: "0.0.0.0" });
  console.log(`Panel listening on port ${config.PANEL_PORT}`);
  console.log(`API: http://localhost:${config.PANEL_PORT}/api/v1`);
  console.log(`Health: http://localhost:${config.PANEL_PORT}/health`);

  // Start schedule executor
  startScheduler();
}

start().catch((err) => {
  console.error("Failed to start panel:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await app.close();
  await redis.quit();
  process.exit(0);
});
