import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireAdmin,
} from "../middleware/rbac.js";

export default async function monitoringRoutes(app: FastifyInstance) {
  // List activity logs
  app.get(
    "/activity",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { event, actorId, limit, offset } = request.query as {
        event?: string;
        actorId?: string;
        limit?: string;
        offset?: string;
      };

      const isAdmin = request.user?.rootAdmin;
      const userId = request.user?.userId;

      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (!isAdmin) {
        conditions.push(`a.actor_id = $${idx++}`);
        values.push(userId);
      } else if (actorId) {
        conditions.push(`a.actor_id = $${idx++}`);
        values.push(actorId);
      }

      if (event) {
        conditions.push(`a.event = $${idx++}`);
        values.push(event);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const lim = Math.min(parseInt(limit || "50", 10), 200);
      const off = parseInt(offset || "0", 10);

      const result = await app.db.query(
        `SELECT a.*, u.username as actor_username
         FROM activity_logs a
         LEFT JOIN users u ON a.actor_id = u.id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, lim, off]
      );

      const countResult = await app.db.query(
        `SELECT COUNT(*) as total FROM activity_logs a ${where}`,
        values
      );

      return reply.send({
        logs: result.rows,
        total: parseInt(countResult.rows[0].total, 10),
        limit: lim,
        offset: off,
      });
    }
  );

  // List jobs
  app.get(
    "/jobs",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { status, type, limit, offset } = request.query as {
        status?: string;
        type?: string;
        limit?: string;
        offset?: string;
      };

      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (status) {
        conditions.push(`j.status = $${idx++}`);
        values.push(status);
      }

      if (type) {
        conditions.push(`j.type = $${idx++}`);
        values.push(type);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const lim = Math.min(parseInt(limit || "50", 10), 200);
      const off = parseInt(offset || "0", 10);

      const result = await app.db.query(
        `SELECT j.*, s.name as server_name
         FROM jobs j
         LEFT JOIN servers s ON j.server_id = s.id
         ${where}
         ORDER BY j.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, lim, off]
      );

      const countResult = await app.db.query(
        `SELECT COUNT(*) as total FROM jobs j ${where}`,
        values
      );

      return reply.send({
        jobs: result.rows,
        total: parseInt(countResult.rows[0].total, 10),
        limit: lim,
        offset: off,
      });
    }
  );

  // Retry a failed job
  app.post(
    "/jobs/:id/retry",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT id, status, type, payload, server_id, node_id FROM jobs WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const job = result.rows[0];

      if (job.status !== "failed") {
        return reply.status(400).send({ error: "Only failed jobs can be retried" });
      }

      const { addJob } = await import("../../workers/index.js");

      await app.db.query(
        `UPDATE jobs SET status = 'pending', error = NULL, started_at = NULL, completed_at = NULL, attempts = 0 WHERE id = $1`,
        [id]
      );

      const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;

      await addJob(job.type, { ...payload, jobId: job.id, serverId: job.server_id, nodeId: job.node_id });

      return reply.send({ success: true, job: { id: job.id, status: "pending" } });
    }
  );
}
