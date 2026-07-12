import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireServerAccess,
} from "../middleware/rbac.js";
import crypto from "crypto";

function generateId(): string {
  return crypto.randomBytes(4).toString("hex");
}

async function getMySQLConnection(host: string, port: number, username: string, password: string) {
  const mysql = await import("mysql2/promise");
  return mysql.createConnection({
    host,
    port,
    user: username,
    password,
  });
}

export default async function databaseRoutes(app: FastifyInstance) {
  // List databases for a server
  app.get(
    "/servers/:id/databases",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT d.id, d.name, d.username, d.remote, d.created_at,
                dh.name as host_name, dh.host as db_host, dh.port as db_port
         FROM databases d
         JOIN database_hosts dh ON d.database_host_id = dh.id
         WHERE d.server_id = $1
         ORDER BY d.created_at DESC`,
        [id]
      );

      return reply.send({ databases: result.rows });
    }
  );

  // Create database for a server
  app.post(
    "/servers/:id/databases",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Find a database host with capacity
      const hostResult = await app.db.query(
        `SELECT dh.*,
          (SELECT COUNT(*) FROM databases WHERE database_host_id = dh.id) as current_count
         FROM database_hosts dh
         ORDER BY current_count ASC`
      );

      if (hostResult.rows.length === 0) {
        return reply.status(400).send({
          error: "No database hosts configured",
        });
      }

      const host = hostResult.rows.find(
        (h: any) => parseInt(h.current_count) < h.max_databases
      );

      if (!host) {
        return reply.status(400).send({
          error: "All database hosts are at capacity",
        });
      }

      // Generate database name, username, password
      const shortId = generateId();
      const dbName = `s${shortId}`;
      const dbUsername = `u${shortId}`;
      const dbPassword = crypto.randomBytes(24).toString("base64url");

      try {
        const conn = await getMySQLConnection(
          host.host,
          host.port,
          host.username,
          host.password_hash
        );

        await conn.execute(`CREATE DATABASE \`${dbName}\``);
        await conn.execute(
          `CREATE USER '${dbUsername}'@'%' IDENTIFIED BY '${dbPassword}'`
        );
        await conn.execute(
          `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUsername}'@'%'`
        );
        await conn.execute(`FLUSH PRIVILEGES`);
        await conn.end();
      } catch (err: any) {
        app.log.error(err, "Failed to create MySQL database");
        return reply.status(500).send({
          error: "Failed to create database on MySQL host",
        });
      }

      // Store in our database
      const result = await app.db.query(
        `INSERT INTO databases (server_id, database_host_id, name, username, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, username, remote, created_at`,
        [id, host.id, dbName, dbUsername, dbPassword]
      );

      return reply.status(201).send({
        database: {
          ...result.rows[0],
          host: host.host,
          port: host.port,
          password: dbPassword,
        },
      });
    }
  );

  // Delete database
  app.delete(
    "/servers/:id/databases/:dbId",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, dbId } = request.params as { id: string; dbId: string };

      // Get database info
      const dbResult = await app.db.query(
        `SELECT d.*, dh.host, dh.port, dh.username as host_username, dh.password_hash as host_password
         FROM databases d
         JOIN database_hosts dh ON d.database_host_id = dh.id
         WHERE d.id = $1 AND d.server_id = $2`,
        [dbId, id]
      );

      if (dbResult.rows.length === 0) {
        return reply.status(404).send({ error: "Database not found" });
      }

      const db = dbResult.rows[0];

      try {
        const conn = await getMySQLConnection(
          db.host,
          db.port,
          db.host_username,
          db.host_password
        );

        await conn.execute(`DROP DATABASE IF EXISTS \`${db.name}\``);
        await conn.execute(
          `DROP USER IF EXISTS '${db.username}'@'%'`
        );
        await conn.execute(`FLUSH PRIVILEGES`);
        await conn.end();
      } catch (err: any) {
        app.log.error(err, "Failed to drop MySQL database");
      }

      await app.db.query("DELETE FROM databases WHERE id = $1", [dbId]);

      return reply.send({ success: true });
    }
  );
}
