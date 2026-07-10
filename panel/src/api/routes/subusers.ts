import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireServerAccess,
} from "../middleware/rbac.js";
import { hashPassword } from "../middleware/auth.js";

const createSubuserSchema = z.object({
  email: z.string().email(),
  permissions: z.object({
    control: z
      .object({
        start: z.boolean().optional(),
        stop: z.boolean().optional(),
        restart: z.boolean().optional(),
        console: z.boolean().optional(),
      })
      .optional(),
    file: z
      .object({
        read: z.boolean().optional(),
        write: z.boolean().optional(),
        delete: z.boolean().optional(),
        upload: z.boolean().optional(),
        create: z.boolean().optional(),
      })
      .optional(),
    backup: z
      .object({
        create: z.boolean().optional(),
        read: z.boolean().optional(),
        delete: z.boolean().optional(),
      })
      .optional(),
    database: z
      .object({
        create: z.boolean().optional(),
        read: z.boolean().optional(),
        delete: z.boolean().optional(),
      })
      .optional(),
    schedule: z
      .object({
        create: z.boolean().optional(),
        read: z.boolean().optional(),
        delete: z.boolean().optional(),
      })
      .optional(),
    websocket: z
      .object({
        connect: z.boolean().optional(),
      })
      .optional(),
  }),
});

export default async function subuserRoutes(app: FastifyInstance) {
  // List subusers for a server
  app.get(
    "/servers/:id/subusers",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT su.id, su.user_id, su.permissions, su.created_at,
                u.username, u.email
         FROM subusers su
         JOIN users u ON su.user_id = u.id
         WHERE su.server_id = $1
         ORDER BY su.created_at DESC`,
        [id]
      );

      return reply.send({ subusers: result.rows });
    }
  );

  // Add subuser
  app.post(
    "/servers/:id/subusers",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = createSubuserSchema.parse(request.body);

      // Find user by email
      const userResult = await app.db.query(
        "SELECT id, username, email FROM users WHERE email = $1",
        [body.email]
      );

      if (userResult.rows.length === 0) {
        return reply
          .status(404)
          .send({ error: "User not found with that email" });
      }

      const user = userResult.rows[0];

      // Can't add yourself
      if (user.id === request.user!.userId) {
        return reply.status(400).send({ error: "Cannot add yourself as subuser" });
      }

      // Check if already a subuser
      const existing = await app.db.query(
        "SELECT id FROM subusers WHERE server_id = $1 AND user_id = $2",
        [id, user.id]
      );

      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: "User is already a subuser" });
      }

      const result = await app.db.query(
        `INSERT INTO subusers (server_id, user_id, permissions)
         VALUES ($1, $2, $3)
         RETURNING id, permissions, created_at`,
        [id, user.id, JSON.stringify(body.permissions)]
      );

      return reply.status(201).send({
        subuser: {
          ...result.rows[0],
          username: user.username,
          email: user.email,
        },
      });
    }
  );

  // Update subuser permissions
  app.put(
    "/servers/:serverId/subusers/:subuserId",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subuserId } = request.params as {
        serverId: string;
        subuserId: string;
      };
      const { permissions } = request.body as {
        permissions: Record<string, Record<string, boolean>>;
      };

      await app.db.query(
        "UPDATE subusers SET permissions = $1 WHERE id = $2",
        [JSON.stringify(permissions), subuserId]
      );

      return reply.send({ success: true });
    }
  );

  // Remove subuser
  app.delete(
    "/servers/:serverId/subusers/:subuserId",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subuserId } = request.params as {
        serverId: string;
        subuserId: string;
      };

      await app.db.query("DELETE FROM subusers WHERE id = $1", [subuserId]);
      return reply.send({ success: true });
    }
  );
}
