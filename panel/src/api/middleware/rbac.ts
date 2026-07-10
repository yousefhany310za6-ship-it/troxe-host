import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validateApiKey } from "./auth.js";

// Extend Fastify types
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      userId: string;
      username: string;
      email: string;
      rootAdmin: boolean;
      permissions: Record<string, boolean>;
      isClient: boolean;
      isAdmin: boolean;
    };
  }
}

// Authenticate via session cookie (web users)
export async function authenticateSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const token = request.cookies?.troxe_session;
    if (!token) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const decoded = request.server.jwt.verify<{ userId: string }>(token);
    const result = await request.server.db.query(
      `SELECT id, username, email, root_admin, suspended FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0 || result.rows[0].suspended) {
      return reply.status(401).send({ error: "Invalid or suspended user" });
    }

    const user = result.rows[0];
    request.user = {
      id: user.id,
      userId: user.id,
      username: user.username,
      email: user.email,
      rootAdmin: user.root_admin,
      permissions: {},
      isClient: true,
      isAdmin: user.root_admin,
    };
  } catch {
    return reply.status(401).send({ error: "Invalid session" });
  }
}

// Authenticate via API key (Bearer token)
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Bearer token required" });
  }

  const key = authHeader.substring(7);
  const user = await validateApiKey(key);

  if (!user) {
    return reply.status(401).send({ error: "Invalid API key" });
  }

  request.user = user;
}

// Authenticate via daemon token (Node→Panel)
export async function authenticateDaemon(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Daemon token required" });
  }

  const token = authHeader.substring(7);
  const { hashDaemonToken } = await import("./auth.js");
  const tokenHash = hashDaemonToken(token);

  const result = await request.server.db.query(
    `SELECT id, name, fqdn, public_ip FROM nodes WHERE daemon_token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return reply.status(401).send({ error: "Invalid daemon token" });
  }

  // Attach node info to request
  (request as any).node = result.rows[0];
}

// Require root admin
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.user?.rootAdmin) {
    return reply.status(403).send({ error: "Admin access required" });
  }
}

// Check server ownership or subuser permissions
export async function requireServerAccess(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const serverId = (request.params as any).id || (request.params as any).serverId;
  if (!serverId || !request.user) {
    return reply.status(403).send({ error: "Access denied" });
  }

  // Root admin has access to everything
  if (request.user.rootAdmin) return;

  // Check ownership
  const ownerResult = await request.server.db.query(
    `SELECT id FROM servers WHERE id = $1 AND owner_id = $2`,
    [serverId, request.user.userId]
  );

  if (ownerResult.rows.length > 0) {
    return; // Owner has full access
  }

  // Check subuser permissions
  const subuserResult = await request.server.db.query(
    `SELECT permissions FROM subusers WHERE server_id = $1 AND user_id = $2`,
    [serverId, request.user.userId]
  );

  if (subuserResult.rows.length === 0) {
    return reply.status(403).send({ error: "Access denied" });
  }

  // Merge subuser permissions
  request.user.permissions = subuserResult.rows[0].permissions;
}

// Check specific permission
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.rootAdmin) return;

    if (request.user?.permissions?.[permission]) return;

    return reply.status(403).send({ error: `Permission required: ${permission}` });
  };
}
