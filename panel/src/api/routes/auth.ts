import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword, generateApiKey, hashApiKey } from "../middleware/auth.js";
import { authenticator } from "otplib";
import QRCode from "qrcode";

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  totpCode: z.string().length(6).optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  // Register
  app.post("/auth/register", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);

    // Check if first user (becomes admin)
    const countResult = await app.db.query("SELECT COUNT(*) FROM users");
    const isFirstUser = parseInt(countResult.rows[0].count) === 0;

    // Check duplicates
    const existing = await app.db.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [body.email, body.username]
    );
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: "Username or email already taken" });
    }

    const passwordHash = await hashPassword(body.password);
    const result = await app.db.query(
      `INSERT INTO users (username, email, password_hash, root_admin)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, root_admin, created_at`,
      [body.username, body.email, passwordHash, isFirstUser]
    );

    const user = result.rows[0];

    // Generate session token
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "7d" });

    reply.setCookie("troxe_session", token, {
      path: "/",
      httpOnly: true,
      secure: false, // Set true in production
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Log activity
    await app.db.query(
      `INSERT INTO activity_logs (actor_id, actor_type, event, data, ip_address, user_agent)
       VALUES ($1, 'user', 'user.registered', $2, $3, $4)`,
      [
        user.id,
        JSON.stringify({ username: user.username }),
        request.ip,
        request.headers["user-agent"],
      ]
    );

    return reply.status(201).send({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        rootAdmin: user.root_admin,
      },
    });
  });

  // Login
  app.post("/auth/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    const result = await app.db.query(
      "SELECT id, username, email, password_hash, totp_enabled, totp_secret, root_admin, suspended FROM users WHERE email = $1",
      [body.email]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (user.suspended) {
      return reply.status(403).send({ error: "Account suspended" });
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Check 2FA
    if (user.totp_enabled) {
      if (!body.totpCode) {
        return reply.status(200).send({ requires2fa: true });
      }

      const totpSecret = user.totp_secret;
      const isValid = authenticator.verify({
        token: body.totpCode,
        secret: totpSecret,
      });

      if (!isValid) {
        return reply.status(401).send({ error: "Invalid 2FA code" });
      }
    }

    // Update login info
    await app.db.query(
      "UPDATE users SET last_login_at = now(), last_login_ip = $1 WHERE id = $2",
      [request.ip, user.id]
    );

    const token = app.jwt.sign({ userId: user.id }, { expiresIn: "7d" });

    reply.setCookie("troxe_session", token, {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    await app.db.query(
      `INSERT INTO activity_logs (actor_id, actor_type, event, data, ip_address, user_agent)
       VALUES ($1, 'user', 'user.logged_in', '{}', $2, $3)`,
      [user.id, request.ip, request.headers["user-agent"]]
    );

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        rootAdmin: user.root_admin,
      },
    });
  });

  // Logout
  app.post("/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie("troxe_session", { path: "/" });
    return reply.send({ success: true });
  });

  // Get current user
  app.get("/auth/me", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ user: request.user });
  });

  // Enable 2FA
  app.post("/auth/2fa/enable", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(
      request.user!.email,
      "Troxe Host",
      secret
    );
    const qrCode = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled yet)
    await app.db.query(
      "UPDATE users SET totp_secret = $1 WHERE id = $2",
      [secret, request.user!.userId]
    );

    return reply.send({ secret, qrCode });
  });

  // Confirm 2FA
  app.post("/auth/2fa/confirm", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code: string };

    const result = await app.db.query(
      "SELECT totp_secret FROM users WHERE id = $1",
      [request.user!.userId]
    );

    const secret = result.rows[0]?.totp_secret;
    if (!secret) {
      return reply.status(400).send({ error: "2FA not initiated" });
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      return reply.status(400).send({ error: "Invalid code" });
    }

    // Generate recovery codes
    const recoveryCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    await app.db.query(
      `UPDATE users SET totp_enabled = true, recovery_codes = $1 WHERE id = $2`,
      [recoveryCodes, request.user!.userId]
    );

    return reply.send({ recoveryCodes });
  });

  // Disable 2FA
  app.post("/auth/2fa/disable", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code: string };

    const result = await app.db.query(
      "SELECT totp_secret, totp_enabled FROM users WHERE id = $1",
      [request.user!.userId]
    );

    if (!result.rows[0]?.totp_enabled) {
      return reply.status(400).send({ error: "2FA not enabled" });
    }

    const isValid = authenticator.verify({
      token: code,
      secret: result.rows[0].totp_secret,
    });
    if (!isValid) {
      return reply.status(400).send({ error: "Invalid code" });
    }

    await app.db.query(
      `UPDATE users SET totp_enabled = false, totp_secret = NULL, recovery_codes = '{}' WHERE id = $1`,
      [request.user!.userId]
    );

    return reply.send({ success: true });
  });

  // Create API key
  app.post("/auth/api-keys", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, permissions } = request.body as {
      name: string;
      permissions: Record<string, boolean>;
    };

    const prefix = request.user!.rootAdmin ? "txa_" : "txc_";
    const { key, keyHash, keyPrefix } = generateApiKey(prefix);

    const result = await app.db.query(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, permissions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, key_prefix, permissions, created_at`,
      [request.user!.userId, name, keyPrefix, keyHash, JSON.stringify(permissions)]
    );

    return reply.status(201).send({
      ...result.rows[0],
      key, // Only shown once!
    });
  });

  // List API keys
  app.get("/auth/api-keys", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await app.db.query(
      `SELECT id, name, key_prefix, permissions, expires_at, last_used_at, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [request.user!.userId]
    );

    return reply.send({ keys: result.rows });
  });

  // Delete API key
  app.delete("/auth/api-keys/:id", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await app.db.query(
      "DELETE FROM api_keys WHERE id = $1 AND user_id = $2",
      [id, request.user!.userId]
    );
    return reply.send({ success: true });
  });
}

// Import authenticateSession
import { authenticateSession } from "../middleware/rbac.js";
