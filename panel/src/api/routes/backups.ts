import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireServerAccess,
  requirePermission,
} from "../middleware/rbac.js";
import { addJob } from "../../workers/index.js";
import { eventBus } from "../../events/index.js";

const createBackupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  ignore: z.array(z.string()).optional(),
});

export default async function backupRoutes(app: FastifyInstance) {
  // List backups for a server
  app.get(
    "/servers/:id/backups",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("backup.read"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT id, name, size_bytes, sha256_hash, status, completed_at, created_at
         FROM backups
         WHERE server_id = $1
         ORDER BY created_at DESC`,
        [id]
      );

      return reply.send({ backups: result.rows });
    }
  );

  // Create backup
  app.post(
    "/servers/:id/backups",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("backup.create"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = createBackupSchema.parse(request.body);

      // Check backup limit
      const serverResult = await app.db.query(
        `SELECT e.max_backups, s.node_id
         FROM servers s JOIN eggs e ON s.egg_id = e.id
         WHERE s.id = $1`,
        [id]
      );

      if (serverResult.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const server = serverResult.rows[0];

      const countResult = await app.db.query(
        "SELECT COUNT(*) FROM backups WHERE server_id = $1",
        [id]
      );

      if (parseInt(countResult.rows[0].count) >= server.max_backups) {
        return reply.status(400).send({
          error: `Backup limit reached (${server.max_backups})`,
        });
      }

      // Create backup record
      const name = body.name || `Backup ${new Date().toISOString()}`;
      const result = await app.db.query(
        `INSERT INTO backups (server_id, name, status)
         VALUES ($1, $2, 'building')
         RETURNING id, name, status, created_at`,
        [id, name]
      );

      const backup = result.rows[0];

      // Queue backup job
      await addJob("backup.create", {
        backupId: backup.id,
        serverId: id,
        nodeId: server.node_id,
        ignore: body.ignore || [],
      });

      return reply.status(201).send({ backup });
    }
  );

  // Delete backup
  app.delete(
    "/servers/:serverId/backups/:backupId",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("backup.delete"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { backupId } = request.params as { serverId: string; backupId: string };

      const result = await app.db.query(
        "SELECT id, storage_path FROM backups WHERE id = $1",
        [backupId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Backup not found" });
      }

      // Queue deletion job
      await addJob("backup.delete", { backupId });

      return reply.send({ success: true });
    }
  );

  // Download backup
  app.get(
    "/servers/:serverId/backups/:backupId/download",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("backup.read"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { backupId } = request.params as { serverId: string; backupId: string };

      const result = await app.db.query(
        "SELECT name, storage_path, status FROM backups WHERE id = $1",
        [backupId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Backup not found" });
      }

      const backup = result.rows[0];

      if (backup.status !== "completed") {
        return reply.status(400).send({ error: "Backup not ready" });
      }

      // TODO: Stream backup file from storage
      // For now return a placeholder
      return reply.send({ message: "Download not yet implemented" });
    }
  );
}
