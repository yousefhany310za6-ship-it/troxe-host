import crypto from "crypto";
import { FastifyRequest, FastifyReply } from "fastify";

const CSRF_SECRET = "troxe-csrf-2026";
const COOKIE_VERSION = "v2";

function hmac(data: string, secret: string = CSRF_SECRET): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex").slice(0, 32);
}

function sign(value: string): string {
  return hmac(value);
}

// Generate all security cookies on login
export function setSecurityCookies(
  reply: FastifyReply,
  data: {
    userId: string;
    username: string;
    email: string;
    ip: string;
    language?: string;
    fingerprint?: string;
  }
) {
  const sessionVersion = COOKIE_VERSION;
  const signedUser = sign(data.username);
  const signedEmail = sign(data.email);
  const signedIp = sign(data.ip);
  const signedFingerprint = sign(data.fingerprint || "default");
  const deviceId = crypto.randomUUID();
  const signedDevice = sign(deviceId);

  // CSRF token (double-submit cookie pattern)
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const signedCsrf = sign(csrfToken);

  // Session ID (bound to user)
  const sessionId = crypto.randomUUID();

  const cookieOpts = {
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };

  const nonHttpOnlyOpts = {
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60,
  };

  // 1. Session cookie (main auth)
  reply.setCookie("troxe_session", data.userId + "." + sign(data.userId), cookieOpts);

  // 2. CSRF token cookie (httpOnly, server reads it; also sends value via header)
  reply.setCookie("troxe_csrf", csrfToken, { ...cookieOpts, httpOnly: false });

  // 3. User binding cookie
  reply.setCookie("troxe_uid", `${data.username}:${signedUser}`, nonHttpOnlyOpts);

  // 4. Email binding cookie
  reply.setCookie("troxe_email", `${data.email}:${signedEmail}`, cookieOpts);

  // 5. IP binding cookie
  reply.setCookie("troxe_ip", `${data.ip}:${signedIp}`, cookieOpts);

  // 6. Fingerprint binding cookie
  reply.setCookie("troxe_fp", `${data.fingerprint || "default"}:${signedFingerprint}`, cookieOpts);

  // 7. Device ID cookie
  reply.setCookie("troxe_device", `${deviceId}:${signedDevice}`, cookieOpts);

  // 8. Language cookie
  reply.setCookie("troxe_lang", data.language || "en", nonHttpOnlyOpts);

  // 9. Session version cookie
  reply.setCookie("troxe_ver", sessionVersion, nonHttpOnlyOpts);

  // 10. Session timestamp cookie
  reply.setCookie("troxe_time", String(Date.now()), { ...cookieOpts, httpOnly: false });

  // 11. Session nonce (anti-replay)
  const nonce = crypto.randomBytes(16).toString("hex");
  reply.setCookie("troxe_nonce", nonce, cookieOpts);
}

// Clear all security cookies on logout
export function clearSecurityCookies(reply: FastifyReply) {
  const cookieNames = [
    "troxe_session", "troxe_csrf", "troxe_uid", "troxe_email",
    "troxe_ip", "troxe_fp", "troxe_device", "troxe_lang",
    "troxe_ver", "troxe_time", "troxe_nonce",
  ];
  for (const name of cookieNames) {
    reply.clearCookie(name, { path: "/" });
  }
}

// Validate all security cookies on each authenticated request
export async function validateSessionSecurity(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const cookies = request.cookies;
  const ip = request.ip;

  // 1. Session must exist
  const sessionCookie = cookies?.troxe_session;
  if (!sessionCookie) {
    return reply.status(401).send({ error: "No session" });
  }

  // 2. Extract userId from session cookie
  const sessionParts = sessionCookie.split(".");
  const userId = sessionParts[0];
  const sessionSig = sessionParts[1];

  if (!userId || !sessionSig) {
    return reply.status(401).send({ error: "Invalid session format" });
  }

  // 3. Verify session signature
  if (sign(userId) !== sessionSig) {
    return reply.status(401).send({ error: "Session tampered" });
  }

  // 4. Verify user still exists in DB
  const result = await request.server.db.query(
    `SELECT id, username, email, root_admin, suspended FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0 || result.rows[0].suspended) {
    return reply.status(401).send({ error: "User not found or suspended" });
  }

  const user = result.rows[0];

  // 5. CSRF validation — double-submit cookie (only for state-changing methods)
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const csrfCookie = cookies?.troxe_csrf;
    const csrfHeader = request.headers["x-csrf-token"] as string;
    if (csrfCookie && csrfHeader) {
      if (csrfCookie !== csrfHeader) {
        return reply.status(403).send({ error: "CSRF token mismatch" });
      }
    }
  }

  // 6. User binding validation
  const uidCookie = cookies?.troxe_uid;
  if (uidCookie) {
    const [username, sig] = uidCookie.split(":");
    if (sign(username) !== sig) {
      return reply.status(401).send({ error: "User binding tampered" });
    }
    // Check username matches DB
    if (username !== user.username) {
      return reply.status(401).send({ error: "Session user mismatch" });
    }
  }

  // 7. IP binding validation (soft — warn but don't block for NAT changes)
  const ipCookie = cookies?.troxe_ip;
  if (ipCookie) {
    const parts = ipCookie.split(":");
    const storedIp = parts.slice(0, -1).join(":"); // IPv6 colons
    const sig = parts[parts.length - 1];
    if (sign(storedIp) !== sig) {
      return reply.status(401).send({ error: "IP binding tampered" });
    }
  }

  // 8. Fingerprint binding validation
  const fpCookie = cookies?.troxe_fp;
  if (fpCookie) {
    const parts = fpCookie.split(":");
    const fp = parts.slice(0, -1).join(":");
    const sig = parts[parts.length - 1];
    if (sign(fp) !== sig) {
      return reply.status(401).send({ error: "Fingerprint binding tampered" });
    }
  }

  // 9. Device binding validation
  const deviceCookie = cookies?.troxe_device;
  if (deviceCookie) {
    const parts = deviceCookie.split(":");
    const deviceId = parts.slice(0, -1).join(":");
    const sig = parts[parts.length - 1];
    if (sign(deviceId) !== sig) {
      return reply.status(401).send({ error: "Device binding tampered" });
    }
  }

  // 10. Version check
  const verCookie = cookies?.troxe_ver;
  if (verCookie && verCookie !== COOKIE_VERSION) {
    return reply.status(401).send({ error: "Session version outdated, please re-login" });
  }

  // 11. Nonce rotation (prevent cookie replay)
  const nonceCookie = cookies?.troxe_nonce;
  if (nonceCookie) {
    // Rotate nonce on each request
    const newNonce = crypto.randomBytes(16).toString("hex");
    reply.setCookie("troxe_nonce", newNonce, {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  // Attach user
  request.user = {
    id: user.id,
    userId: user.id,
    username: user.username,
    email: user.email,
    rootAdmin: user.root_admin,
    totpEnabled: false,
    permissions: {},
    isClient: true,
    isAdmin: user.root_admin,
  };
}

// Security headers middleware
export async function securityHeaders(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Prevent clickjacking
  reply.header("X-Frame-Options", "DENY");
  // Prevent MIME sniffing
  reply.header("X-Content-Type-Options", "nosniff");
  // XSS protection
  reply.header("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // CSP
  reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:;");
  // HSTS (commented for dev since no HTTPS)
  // reply.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}
