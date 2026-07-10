import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  authenticateSession,
  requireServerAccess,
} from "../middleware/rbac.js";
import { agentGet, getNodeForServer } from "../../lib/node-agent.js";

export default async function monitoringRoutes(app: FastifyInstance) {
  app.get(
    "/servers/:id/stats",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

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

      if (server.status !== "running") {
        return reply.send({
          stats: {
            memory: { used: 0, limit: server.memory_mb * 1024 * 1024, percentage: 0 },
            cpu: { usage: 0, limit: server.cpu_percent },
            disk: { used: 0, limit: server.disk_mb * 1024 * 1024, percentage: 0 },
            network: { rx: 0, tx: 0 },
            uptime: 0,
            state: server.status,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const node = await getNodeForServer(id, app.db);
      if (!node) {
        return reply.send({
          stats: {
            memory: { used: 0, limit: server.memory_mb * 1024 * 1024, percentage: 0 },
            cpu: { usage: 0, limit: server.cpu_percent },
            disk: { used: 0, limit: server.disk_mb * 1024 * 1024, percentage: 0 },
            network: { rx: 0, tx: 0 },
            uptime: 0,
            state: server.status,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const resp = await agentGet(node, `/api/servers/${id}/stats`);

      if (!resp.ok || !resp.data) {
        return reply.send({
          stats: {
            memory: { used: 0, limit: server.memory_mb * 1024 * 1024, percentage: 0 },
            cpu: { usage: 0, limit: server.cpu_percent },
            disk: { used: 0, limit: server.disk_mb * 1024 * 1024, percentage: 0 },
            network: { rx: 0, tx: 0 },
            uptime: 0,
            state: server.status,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const agentStats = (resp.data as any).stats || resp.data;

      const memUsed = agentStats.memory_bytes || 0;
      const memLimit = agentStats.memory_limit_bytes || server.memory_mb * 1024 * 1024;
      const memPercent = memLimit > 0 ? Math.round((memUsed / memLimit) * 100) : 0;

      const cpuUsage = agentStats.cpu_absolute || 0;

      const diskUsed = agentStats.disk_bytes || 0;
      const diskLimit = server.disk_mb * 1024 * 1024;
      const diskPercent = diskLimit > 0 ? Math.round((diskUsed / diskLimit) * 100) : 0;

      const network = agentStats.network || { rx_bytes: 0, tx_bytes: 0 };

      const stats = {
        memory: {
          used: memUsed,
          limit: memLimit,
          percentage: memPercent,
        },
        cpu: {
          usage: Math.round(cpuUsage * 100) / 100,
          limit: server.cpu_percent,
        },
        disk: {
          used: diskUsed,
          limit: diskLimit,
          percentage: diskPercent,
        },
        network: {
          rx: network.rx_bytes || 0,
          tx: network.tx_bytes || 0,
        },
        uptime: agentStats.uptime || 0,
        state: agentStats.state || server.status,
        timestamp: new Date().toISOString(),
      };

      return reply.send({ stats });
    }
  );

  app.get(
    "/servers/:id/stats/history",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { period } = request.query as { period?: string };

      const points = [];
      const now = Date.now();
      const count = period === "24h" ? 144 : period === "7d" ? 168 : 60;

      for (let i = count; i >= 0; i--) {
        const ts = new Date(now - i * (period === "7d" ? 3600000 : period === "24h" ? 600000 : 60000));
        points.push({
          timestamp: ts.toISOString(),
          memory: 0,
          cpu: 0,
          disk: 0,
        });
      }

      return reply.send({ history: points });
    }
  );

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
