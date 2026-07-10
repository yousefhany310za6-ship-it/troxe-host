import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireServerAccess,
  requirePermission,
} from "../middleware/rbac.js";
import { addJob } from "../../workers/index.js";
import { getNodeForServer, sendServerCommand, agentPost } from "../../lib/node-agent.js";

const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  cronExpression: z.string().min(1),
  tasks: z.array(
    z.object({
      type: z.enum(["command", "power", "backup", "announce"]),
      payload: z.string(),
    })
  ),
});

export default async function scheduleRoutes(app: FastifyInstance) {
  // List schedules
  app.get(
    "/servers/:id/schedules",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("schedule.read"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT id, name, cron_expression, is_active, tasks, last_run_at, created_at
         FROM schedules
         WHERE server_id = $1
         ORDER BY created_at DESC`,
        [id]
      );

      return reply.send({ schedules: result.rows });
    }
  );

  // Create schedule
  app.post(
    "/servers/:id/schedules",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("schedule.create"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = createScheduleSchema.parse(request.body);

      // Validate cron expression (basic check)
      const cronParts = body.cronExpression.trim().split(/\s+/);
      if (cronParts.length < 5 || cronParts.length > 6) {
        return reply.status(400).send({ error: "Invalid cron expression" });
      }

      const result = await app.db.query(
        `INSERT INTO schedules (server_id, name, cron_expression, tasks)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, cron_expression, is_active, tasks, created_at`,
        [id, body.name, body.cronExpression, JSON.stringify(body.tasks)]
      );

      return reply.status(201).send({ schedule: result.rows[0] });
    }
  );

  // Update schedule
  app.put(
    "/servers/:serverId/schedules/:scheduleId",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("schedule.create"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { scheduleId } = request.params as {
        serverId: string;
        scheduleId: string;
      };
      const body = request.body as Partial<{
        name: string;
        cronExpression: string;
        isActive: boolean;
        tasks: { type: string; payload: string }[];
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.cronExpression !== undefined) {
        updates.push(`cron_expression = $${idx++}`);
        values.push(body.cronExpression);
      }
      if (body.isActive !== undefined) {
        updates.push(`is_active = $${idx++}`);
        values.push(body.isActive);
      }
      if (body.tasks !== undefined) {
        updates.push(`tasks = $${idx++}`);
        values.push(JSON.stringify(body.tasks));
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      values.push(scheduleId);
      await app.db.query(
        `UPDATE schedules SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Delete schedule
  app.delete(
    "/servers/:serverId/schedules/:scheduleId",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("schedule.delete"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { scheduleId } = request.params as {
        serverId: string;
        scheduleId: string;
      };

      await app.db.query("DELETE FROM schedules WHERE id = $1", [scheduleId]);
      return reply.send({ success: true });
    }
  );

  // Run schedule now (manual trigger)
  app.post(
    "/servers/:serverId/schedules/:scheduleId/run",
    {
      preHandler: [
        authenticateSession,
        requireServerAccess,
        requirePermission("schedule.create"),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { scheduleId } = request.params as {
        serverId: string;
        scheduleId: string;
      };

      const result = await app.db.query(
        "SELECT * FROM schedules WHERE id = $1",
        [scheduleId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Schedule not found" });
      }

      const schedule = result.rows[0];
      const serverId = schedule.server_id;
      const tasks = Array.isArray(schedule.tasks) ? schedule.tasks : [];

      for (const task of tasks) {
        const type = task.type;
        const payload = task.payload || "";
        try {
          if (type === "command") {
            await addJob("server.command", { serverId, command: payload });
          } else if (type === "power" && ["start", "stop", "restart", "kill"].includes(payload)) {
            await addJob(`server.${payload}`, { serverId });
          } else if (type === "backup") {
            await addJob("backup.create", { serverId, backupId: crypto.randomUUID() });
          } else if (type === "announce") {
            console.log(`[Schedule] Announce for ${serverId}: ${payload}`);
          }
        } catch (err) {
          console.error(`[Schedule] Run-now task failed (${type}):`, err);
        }
      }

      await app.db.query("UPDATE schedules SET last_run_at = now() WHERE id = $1", [
        scheduleId,
      ]);

      return reply.send({ success: true, schedule });
    }
  );
}
