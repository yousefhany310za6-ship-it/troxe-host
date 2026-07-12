import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireAdmin,
} from "../middleware/rbac.js";

const createDatabaseHostSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(3306),
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(255),
  maxDatabases: z.number().int().min(1).max(10000).default(50),
});

export default async function databaseHostRoutes(app: FastifyInstance) {
  // List all database hosts
  app.get(
    "/database-hosts",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await app.db.query(
        `SELECT dh.*,
          (SELECT COUNT(*) FROM databases WHERE database_host_id = dh.id) as database_count
         FROM database_hosts dh
         ORDER BY dh.name`
      );
      return reply.send({ databaseHosts: result.rows });
    }
  );

  // Create database host
  app.post(
    "/database-hosts",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createDatabaseHostSchema.parse(request.body);

      const result = await app.db.query(
        `INSERT INTO database_hosts (name, host, port, username, password_hash, max_databases)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [body.name, body.host, body.port, body.username, body.password, body.maxDatabases]
      );

      return reply.status(201).send({ databaseHost: result.rows[0] });
    }
  );

  // Update database host
  app.put(
    "/database-hosts/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        name: string;
        host: string;
        port: number;
        username: string;
        password: string;
        maxDatabases: number;
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.host !== undefined) {
        updates.push(`host = $${idx++}`);
        values.push(body.host);
      }
      if (body.port !== undefined) {
        updates.push(`port = $${idx++}`);
        values.push(body.port);
      }
      if (body.username !== undefined) {
        updates.push(`username = $${idx++}`);
        values.push(body.username);
      }
      if (body.password !== undefined) {
        updates.push(`password_hash = $${idx++}`);
        values.push(body.password);
      }
      if (body.maxDatabases !== undefined) {
        updates.push(`max_databases = $${idx++}`);
        values.push(body.maxDatabases);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      values.push(id);
      await app.db.query(
        `UPDATE database_hosts SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Delete database host
  app.delete(
    "/database-hosts/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const countResult = await app.db.query(
        "SELECT COUNT(*) FROM databases WHERE database_host_id = $1",
        [id]
      );

      if (parseInt(countResult.rows[0].count) > 0) {
        return reply.status(400).send({
          error: "Cannot delete database host with active databases",
        });
      }

      await app.db.query("DELETE FROM database_hosts WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );
}
