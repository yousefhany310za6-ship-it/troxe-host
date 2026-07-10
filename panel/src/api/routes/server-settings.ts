import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireServerAccess,
} from "../middleware/rbac.js";
import { db } from "../../config/database.js";

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startup: z.string().optional(),
  environment: z.record(z.string()).optional(),
  memoryMb: z.number().int().min(128).max(1048576).optional(),
  diskMb: z.number().int().min(512).max(10485760).optional(),
  cpuPercent: z.number().min(1).max(1000).optional(),
  pidLimit: z.number().int().min(64).max(65535).optional(),
});

export default async function serverSettingsRoutes(app: FastifyInstance) {
  // Get server settings
  app.get(
    "/servers/:id/settings",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT s.id, s.name, s.startup_command, s.environment,
                s.memory_mb, s.disk_mb, s.cpu_percent, s.pid_limit,
                s.docker_image, s.status, s.runtime_type,
                e.name as egg_name, e.variables as egg_variables
         FROM servers s
         JOIN eggs e ON s.egg_id = e.id
         WHERE s.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      return reply.send({ server: result.rows[0] });
    }
  );

  // Update server settings
  app.put(
    "/servers/:id/settings",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = updateServerSchema.parse(request.body);

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.startup !== undefined) {
        updates.push(`startup_command = $${idx++}`);
        values.push(body.startup);
      }
      if (body.environment !== undefined) {
        updates.push(`environment = $${idx++}`);
        values.push(JSON.stringify(body.environment));
      }
      if (body.memoryMb !== undefined) {
        updates.push(`memory_mb = $${idx++}`);
        values.push(body.memoryMb);
      }
      if (body.diskMb !== undefined) {
        updates.push(`disk_mb = $${idx++}`);
        values.push(body.diskMb);
      }
      if (body.cpuPercent !== undefined) {
        updates.push(`cpu_percent = $${idx++}`);
        values.push(body.cpuPercent);
      }
      if (body.pidLimit !== undefined) {
        updates.push(`pid_limit = $${idx++}`);
        values.push(body.pidLimit);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      updates.push(`updated_at = now()`);
      values.push(id);

      await app.db.query(
        `UPDATE servers SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Get server network/allocations
  app.get(
    "/servers/:id/network",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT a.id, a.ip, a.port
         FROM allocations a
         WHERE a.server_id = $1
         ORDER BY a.port`,
        [id]
      );

      return reply.send({ allocations: result.rows });
    }
  );

  // Get server startup command with variables resolved
  app.get(
    "/servers/:id/startup",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT s.startup_command, s.environment, e.variables
         FROM servers s
         JOIN eggs e ON s.egg_id = e.id
         WHERE s.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const server = result.rows[0];
      let startup = server.startup_command;

      // Resolve variables
      const env = server.environment || {};
      for (const [key, value] of Object.entries(env)) {
        startup = startup.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value as string);
      }

      return reply.send({ startup, raw: server.startup_command, environment: env });
    }
  );

  // Get server features (what the server has)
  app.get(
    "/servers/:id/features",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT 
          (SELECT COUNT(*) FROM backups WHERE server_id = $1) as backup_count,
          (SELECT COUNT(*) FROM schedules WHERE server_id = $1) as schedule_count,
          (SELECT COUNT(*) FROM subusers WHERE server_id = $1) as subuser_count,
          (SELECT COUNT(*) FROM databases WHERE server_id = $1) as database_count,
          e.max_backups, e.max_allocations, e.max_databases
         FROM servers s
         JOIN eggs e ON s.egg_id = e.id
         WHERE s.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      return reply.send({ features: result.rows[0] });
    }
  );

  // Reinstall server
  app.post(
    "/servers/:id/reinstall",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Reset server to installing state
      await app.db.query(
        `UPDATE servers SET status = 'install_pending', installed_at = NULL WHERE id = $1`,
        [id]
      );

      // Queue install job
      const { addJob } = await import("../../workers/index.js");
      await addJob("server.install", { serverId: id });

      return reply.send({ success: true });
    }
  );
}
