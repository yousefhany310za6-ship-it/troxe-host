import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { hashPassword, verifyPassword, generateApiKey, hashApiKey } from "../middleware/auth.js";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { setSecurityCookies, clearSecurityCookies } from "../middleware/security.js";
import { sendApiKeyCreated, NOTIFICATIONS_ENABLED } from "../../services/email.js";

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

const updateProfileSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
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

    // Set all security cookies
    setSecurityCookies(reply, {
      userId: user.id,
      username: user.username,
      email: user.email,
      ip: request.ip,
      language: "en",
      fingerprint: request.headers["user-agent"] || "unknown",
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

    // Set all security cookies
    setSecurityCookies(reply, {
      userId: user.id,
      username: user.username,
      email: user.email,
      ip: request.ip,
      language: "en",
      fingerprint: request.headers["user-agent"] || "unknown",
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
        isAdmin: user.root_admin,
      },
    });
  });

  // Get CSRF token (for SPA initialization)
  app.get("/auth/csrf", async (request: FastifyRequest, reply: FastifyReply) => {
    const existingCsrf = request.cookies?.troxe_csrf;
    if (existingCsrf) {
      return reply.send({ csrfToken: existingCsrf });
    }
    // Generate new CSRF token if not present
    const csrfToken = crypto.randomBytes(32).toString("hex");
    reply.setCookie("troxe_csrf", csrfToken, {
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });
    return reply.send({ csrfToken });
  });

  // Logout
  app.post("/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    clearSecurityCookies(reply);
    return reply.send({ success: true });
  });

  // Get current user
  app.get("/auth/me", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ user: request.user });
  });

  // Update profile (username / email)
  app.put("/auth/profile", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateProfileSchema.parse(request.body);

    // Fetch current user
    const userResult = await app.db.query(
      "SELECT id, username, email, password_hash FROM users WHERE id = $1",
      [request.user!.userId]
    );
    if (userResult.rows.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }
    const user = userResult.rows[0];

    // Always require current password
    const valid = await verifyPassword(body.currentPassword, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Current password is incorrect" });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.username !== undefined && body.username !== user.username) {
      const dup = await app.db.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [body.username, request.user!.userId]
      );
      if (dup.rows.length > 0) {
        return reply.status(409).send({ error: "Username already taken" });
      }
      updates.push(`username = $${idx++}`);
      values.push(body.username);
    }

    if (body.email !== undefined && body.email !== user.email) {
      const dup = await app.db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [body.email, request.user!.userId]
      );
      if (dup.rows.length > 0) {
        return reply.status(409).send({ error: "Email already taken" });
      }
      updates.push(`email = $${idx++}`);
      values.push(body.email);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: "No changes to update" });
    }

    updates.push(`updated_at = now()`);
    values.push(request.user!.userId);

    await app.db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}`,
      values
    );

    return reply.send({ success: true });
  });

  // Change password
  app.put("/auth/password", {
    preHandler: [authenticateSession],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = changePasswordSchema.parse(request.body);

    const userResult = await app.db.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [request.user!.userId]
    );

    if (userResult.rows.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }

    const valid = await verifyPassword(body.currentPassword, userResult.rows[0].password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Current password is incorrect" });
    }

    const newHash = await hashPassword(body.newPassword);
    await app.db.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [newHash, request.user!.userId]
    );

    return reply.send({ success: true });
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
    const { name, expiresInDays } = request.body as {
      name: string;
      expiresInDays?: number;
    };

    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: "Name is required" });
    }

    const prefix = request.user!.rootAdmin ? "txa_" : "txc_";
    const { key, keyHash, keyPrefix } = generateApiKey(prefix);

    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + expiresInDays);
      expiresAt = d.toISOString();
    }

    const result = await app.db.query(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, permissions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, key_prefix, permissions, expires_at, created_at`,
      [request.user!.userId, name.trim(), keyPrefix, keyHash, "{}", expiresAt]
    );

    // Send API key created notification
    try {
      if (NOTIFICATIONS_ENABLED) {
        const notifResult = await app.db.query(
          `SELECT email_on_api_key FROM notification_preferences WHERE user_id = $1`,
          [request.user!.userId]
        );
        const shouldSend = notifResult.rows.length === 0 || notifResult.rows[0].email_on_api_key !== false;
        if (shouldSend) {
          await sendApiKeyCreated(
            { email: request.user!.email, username: request.user!.username },
            name.trim()
          );
        }
      }
    } catch (err) {
      console.error(`[Auth] Failed to send API key notification:`, err);
    }

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
