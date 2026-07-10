import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireServerAccess,
} from "../middleware/rbac.js";

export default async function monitoringRoutes(app: FastifyInstance) {
  // Get server resource stats
  app.get(
    "/servers/:id/stats",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Get server info for limits
      const serverResult = await app.db.query(
        `SELECT s.memory_mb, s.cpu_percent, s.disk_mb, s.status,
                n.fqdn, n.daemon_listen_port
         FROM servers s JOIN nodes n ON s.node_id = n.id
         WHERE s.id = $1`,
        [id]
      );

      if (serverResult.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const server = serverResult.rows[0];

      // TODO: Call Node Agent to get real stats
      // For now return mock data based on server status
      const isRunning = server.status === "running";

      const stats = {
        memory: {
          used: isRunning ? Math.floor(Math.random() * server.memory_mb * 0.6 * 1024 * 1024) : 0,
          limit: server.memory_mb * 1024 * 1024,
          percentage: isRunning ? Math.floor(Math.random() * 60) : 0,
        },
        cpu: {
          usage: isRunning ? Math.floor(Math.random() * server.cpu_percent * 0.5) : 0,
          limit: server.cpu_percent,
        },
        disk: {
          used: isRunning ? Math.floor(Math.random() * server.disk_mb * 0.3 * 1024 * 1024) : 0,
          limit: server.disk_mb * 1024 * 1024,
          percentage: isRunning ? Math.floor(Math.random() * 30) : 0,
        },
        network: {
          rx: isRunning ? Math.floor(Math.random() * 100000000) : 0,
          tx: isRunning ? Math.floor(Math.random() * 50000000) : 0,
        },
        uptime: isRunning ? Math.floor(Math.random() * 86400) : 0,
        state: server.status,
        timestamp: new Date().toISOString(),
      };

      return reply.send({ stats });
    }
  );

  // Get server resource history (for charts)
  app.get(
    "/servers/:id/stats/history",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { period } = request.query as { period?: string };

      // TODO: Store stats in Redis/DB and return history
      // For now return mock data points
      const points = [];
      const now = Date.now();
      const count = period === "24h" ? 144 : period === "7d" ? 168 : 60;

      for (let i = count; i >= 0; i--) {
        const ts = new Date(now - i * (period === "7d" ? 3600000 : period === "24h" ? 600000 : 60000));
        points.push({
          timestamp: ts.toISOString(),
          memory: Math.floor(Math.random() * 512),
          cpu: Math.floor(Math.random() * 50),
          disk: Math.floor(Math.random() * 1000),
        });
      }

      return reply.send({ history: points });
    }
  );

  // Get node stats (admin)
  app.get(
    "/nodes/:id/stats",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.rootAdmin) {
        return reply.status(403).send({ error: "Admin required" });
      }

      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT total_memory_mb, total_disk_mb, allocated_memory_mb, allocated_disk_mb,
                (SELECT COUNT(*) FROM servers WHERE node_id = $1) as server_count,
                (SELECT COUNT(*) FROM servers WHERE node_id = $1 AND status = 'running') as running_count
         FROM nodes WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Node not found" });
      }

      const node = result.rows[0];

      return reply.send({
        stats: {
          memory: {
            total: node.total_memory_mb,
            allocated: node.allocated_memory_mb,
            percentage: Math.round((node.allocated_memory_mb / node.total_memory_mb) * 100),
          },
          disk: {
            total: node.total_disk_mb,
            allocated: node.allocated_disk_mb,
            percentage: Math.round((node.allocated_disk_mb / node.total_disk_mb) * 100),
          },
          servers: {
            total: parseInt(node.server_count),
            running: parseInt(node.running_count),
          },
        },
      });
    }
  );
}
