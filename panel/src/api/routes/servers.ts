import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireAdmin,
  requireServerAccess,
} from "../middleware/rbac.js";
import { addJob } from "../../workers/index.js";
import { eventBus } from "../../events/index.js";
import {
  agentGet,
  agentPost,
  agentStreamBody,
  agentSendBody,
  getNodeForServer,
} from "../../lib/node-agent.js";

// Map a raw DB server row to the camelCase shape the frontend expects.
function mapServer(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    nodeId: row.node_id,
    nodeName: row.node_name,
    nodeFqdn: row.node_fqdn,
    owner: row.owner_username,
    ip: row.alloc_ip || row.node_fqdn || "",
    port: row.alloc_port || 0,
    publicIp: row.public_ip || "",
    memoryLimit: Number(row.memory_mb) || 0,
    memoryUsed: 0,
    cpuLimit: Number(row.cpu_percent) || 0,
    cpuUsed: 0,
    diskLimit: Number(row.disk_mb) || 0,
    diskUsed: 0,
    crashCount: Number(row.crash_count) || 0,
    lastCrashedAt: row.last_crashed_at || null,
  };
}

const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  eggId: z.string().uuid(),
  nodeId: z.string().uuid(),
  allocationId: z.string().uuid().optional(),
  memoryMb: z.number().int().min(128).max(1048576).optional(),
  diskMb: z.number().int().min(512).max(10485760).optional(),
  cpuPercent: z.number().min(1).max(1000).optional(),
  dockerImage: z.string().optional(),
  startupCommand: z.string().optional(),
  environment: z.record(z.string()).optional(),
});

export default async function serverRoutes(app: FastifyInstance) {
  // Dashboard stats
  app.get(
    "/dashboard/stats",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const isAdmin = request.user!.rootAdmin;

      const queries = isAdmin
        ? [
            app.db.query("SELECT COUNT(*) FROM servers"),
            app.db.query(
              "SELECT COUNT(*) FROM nodes WHERE status = 'online'"
            ),
            app.db.query("SELECT COUNT(*) FROM users"),
            app.db.query("SELECT COUNT(*) FROM eggs"),
            app.db.query(
              `SELECT id, name, status, created_at FROM servers ORDER BY created_at DESC LIMIT 5`
            ),
          ]
        : [
            app.db.query("SELECT COUNT(*) FROM servers WHERE owner_id = $1", [
              userId,
            ]),
            app.db.query(
              `SELECT id, name, status, created_at FROM servers WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 5`,
              [userId]
            ),
          ];

      const results = await Promise.all(queries);

      if (isAdmin) {
        return reply.send({
          servers: parseInt(results[0].rows[0].count),
          onlineNodes: parseInt(results[1].rows[0].count),
          users: parseInt(results[2].rows[0].count),
          eggs: parseInt(results[3].rows[0].count),
          recentServers: results[4].rows,
        });
      } else {
        return reply.send({
          servers: parseInt(results[0].rows[0].count),
          onlineNodes: 0,
          users: 0,
          eggs: 0,
          recentServers: results[1].rows,
        });
      }
    }
  );

  // List user's servers
  app.get(
    "/servers",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const isAdmin = request.user!.rootAdmin;

      let query: string;
      let params: unknown[];

      if (isAdmin) {
        query = `
          SELECT s.*, u.username as owner_username, n.name as node_name,
                 a.ip as alloc_ip, a.port as alloc_port
          FROM servers s
          JOIN users u ON s.owner_id = u.id
          JOIN nodes n ON s.node_id = n.id
          LEFT JOIN allocations a ON s.allocation_id = a.id
          ORDER BY s.created_at DESC
        `;
        params = [];
      } else {
        query = `
          SELECT s.*, n.name as node_name,
                 a.ip as alloc_ip, a.port as alloc_port
          FROM servers s
          JOIN nodes n ON s.node_id = n.id
          LEFT JOIN allocations a ON s.allocation_id = a.id
          WHERE s.owner_id = $1
          ORDER BY s.created_at DESC
        `;
        params = [userId];
      }

      const result = await app.db.query(query, params);
      return reply.send({ servers: result.rows.map(mapServer) });
    }
  );

  // Get server details
  app.get(
    "/servers/:id",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT s.*, u.username as owner_username, n.name as node_name,
                n.fqdn as node_fqdn, n.public_ip, e.name as egg_name,
                a.ip as alloc_ip, a.port as alloc_port
         FROM servers s
         JOIN users u ON s.owner_id = u.id
         JOIN nodes n ON s.node_id = n.id
         JOIN eggs e ON s.egg_id = e.id
         LEFT JOIN allocations a ON s.allocation_id = a.id
         WHERE s.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const server = mapServer(result.rows[0]);

      if (server.status === "running") {
        try {
          const node = await getNodeForServer(id, app.db);
          if (node) {
            const resp = await agentGet(node, `/api/servers/${id}/stats`);
            if (resp.ok && resp.data) {
              const agentStats = (resp.data as any).stats || resp.data;
              const memUsed = agentStats.memory_bytes || 0;
              const diskUsed = agentStats.disk_bytes || 0;
              server.memoryUsed = Math.round(memUsed / (1024 * 1024));
              server.cpuUsed = Math.round((agentStats.cpu_absolute || 0) * 100) / 100;
              server.diskUsed = Math.round(diskUsed / (1024 * 1024));
            }
          }
        } catch {
          // Agent unreachable — keep zeroed values
        }
      }

      return reply.send({ server });
    }
  );

  // Server power actions (start/stop/restart/kill) -> queue a worker job
  app.post(
    "/servers/:id/power",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { action } = request.body as { action: string };

      if (!["start", "stop", "restart", "kill"].includes(action)) {
        return reply.status(400).send({ error: "Invalid power action" });
      }

      await addJob(`server.${action}`, { serverId: id });
      return reply.send({ success: true });
    }
  );

  // Create server
  app.post(
    "/servers",
    { preHandler: [authenticateSession] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createServerSchema.parse(request.body);

      // Get egg defaults
      const eggResult = await app.db.query(
        "SELECT * FROM eggs WHERE id = $1",
        [body.eggId]
      );
      if (eggResult.rows.length === 0) {
        return reply.status(404).send({ error: "Egg not found" });
      }
      const egg = eggResult.rows[0];

      // Get allocation (or auto-assign)
      let allocationId = body.allocationId;
      if (!allocationId) {
        const allocResult = await app.db.query(
          `SELECT id FROM allocations
           WHERE node_id = $1 AND server_id IS NULL
           ORDER BY RANDOM() LIMIT 1`,
          [body.nodeId]
        );
        if (allocResult.rows.length === 0) {
          return reply.status(400).send({ error: "No available allocations" });
        }
        allocationId = allocResult.rows[0].id;
      }

      const serverName = body.name;
      const memoryMb = body.memoryMb || egg.default_memory_mb;
      const diskMb = body.diskMb || egg.default_disk_mb;
      const cpuPercent = body.cpuPercent || egg.default_cpu_percent;
      const dockerImage = body.dockerImage || egg.docker_image;
      const startupCommand = body.startupCommand || egg.startup_command;

      // Create server record
      const result = await app.db.query(
        `INSERT INTO servers (
          name, node_id, owner_id, egg_id, allocation_id,
          memory_mb, disk_mb, cpu_percent, pid_limit,
          docker_image, startup_command, environment, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'install_pending')
        RETURNING *`,
        [
          serverName,
          body.nodeId,
          request.user!.userId,
          body.eggId,
          allocationId,
          memoryMb,
          diskMb,
          cpuPercent,
          egg.default_pid_limit,
          dockerImage,
          startupCommand,
          JSON.stringify(body.environment || {}),
        ]
      );

      const server = result.rows[0];

      // Allocate the allocation
      await app.db.query(
        "UPDATE allocations SET server_id = $1, allocated_at = now() WHERE id = $2",
        [server.id, allocationId]
      );

      // Update node allocated resources
      await app.db.query(
        `UPDATE nodes SET
          allocated_memory_mb = allocated_memory_mb + $1,
          allocated_disk_mb = allocated_disk_mb + $2
         WHERE id = $3`,
        [memoryMb, diskMb, body.nodeId]
      );

      // Queue creation job
      await addJob("server.create", {
        serverId: server.id,
        nodeId: body.nodeId,
        eggId: body.eggId,
      });

      await eventBus.emit("server.created", {
        subjectType: "server",
        subjectId: server.id,
      });

      return reply.status(201).send({ server });
    }
  );

  // Start server
  app.post(
    "/servers/:id/start",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        "SELECT status FROM servers WHERE id = $1",
        [id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const status = result.rows[0].status;
      if (status === "running" || status === "starting") {
        return reply.status(400).send({ error: "Server is already running" });
      }

      await addJob("server.start", { serverId: id });

      return reply.send({ success: true });
    }
  );

  // Stop server
  app.post(
    "/servers/:id/stop",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        "SELECT status FROM servers WHERE id = $1",
        [id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const status = result.rows[0].status;
      if (status === "stopped" || status === "stopping") {
        return reply.status(400).send({ error: "Server is already stopped" });
      }

      await addJob("server.stop", { serverId: id });

      return reply.send({ success: true });
    }
  );

  // Restart server
  app.post(
    "/servers/:id/restart",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      await addJob("server.restart", { serverId: id });

      return reply.send({ success: true });
    }
  );

  // Delete server
  app.delete(
    "/servers/:id",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        "SELECT node_id, allocation_id, memory_mb, disk_mb FROM servers WHERE id = $1",
        [id]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const server = result.rows[0];

      // Free allocation
      if (server.allocation_id) {
        await app.db.query(
          "UPDATE allocations SET server_id = NULL, allocated_at = NULL WHERE id = $1",
          [server.allocation_id]
        );
      }

      // Free node resources
      await app.db.query(
        `UPDATE nodes SET
          allocated_memory_mb = allocated_memory_mb - $1,
          allocated_disk_mb = allocated_disk_mb - $2
         WHERE id = $3`,
        [server.memory_mb, server.disk_mb, server.node_id]
      );

      // Queue deletion
      await addJob("server.delete", {
        serverId: id,
        nodeId: server.node_id,
      });

      return reply.send({ success: true });
    }
  );

  // Reset server crash count
  app.post(
    "/servers/:id/reset-crash-count",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      await app.db.query(
        `UPDATE servers SET crash_count = 0, last_crashed_at = NULL WHERE id = $1`,
        [id]
      );

      return reply.send({ success: true });
    }
  );

  // Get WebSocket token for console
  app.get(
    "/servers/:id/websocket",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Get server and node info
      const result = await app.db.query(
        `SELECT s.id as server_id, n.fqdn, n.daemon_listen_port
         FROM servers s JOIN nodes n ON s.node_id = n.id
         WHERE s.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const server = result.rows[0];

      // Generate short-lived JWT for WebSocket
      const wsToken = app.jwt.sign(
        {
          serverId: server.server_id,
          userId: request.user!.userId,
          permissions: request.user!.permissions,
        },
        { expiresIn: "60s" } // 60 second expiry!
      );

      return reply.send({
        token: wsToken,
        socket: `wss://${server.fqdn}:${server.daemon_listen_port}/api/servers/${server.server_id}/ws`,
      });
    }
  );

  // --- Server Transfer Routes ---

  // Initiate server transfer
  app.post(
    "/servers/:id/transfer",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { newNodeId, newAllocationId } = request.body as {
        newNodeId: string;
        newAllocationId: string;
      };

      if (!newNodeId || !newAllocationId) {
        return reply.status(400).send({ error: "newNodeId and newAllocationId required" });
      }

      // Get server info
      const serverResult = await app.db.query(
        `SELECT s.*, n.fqdn, n.daemon_listen_port
         FROM servers s JOIN nodes n ON s.node_id = n.id
         WHERE s.id = $1`,
        [id]
      );
      if (serverResult.rows.length === 0) {
        return reply.status(404).send({ error: "Server not found" });
      }
      const server = serverResult.rows[0];

      if (server.node_id === newNodeId) {
        return reply.status(400).send({ error: "Server is already on the target node" });
      }

      // Validate target node exists
      const nodeResult = await app.db.query("SELECT id, fqdn, daemon_listen_port FROM nodes WHERE id = $1", [newNodeId]);
      if (nodeResult.rows.length === 0) {
        return reply.status(404).send({ error: "Target node not found" });
      }
      const targetNode = nodeResult.rows[0];

      // Validate allocation is available on target node
      const allocResult = await app.db.query(
        "SELECT id FROM allocations WHERE id = $1 AND node_id = $2 AND server_id IS NULL",
        [newAllocationId, newNodeId]
      );
      if (allocResult.rows.length === 0) {
        return reply.status(400).send({ error: "Allocation not available on target node" });
      }

      // Create transfer record
      const transferResult = await app.db.query(
        `INSERT INTO server_transfers (server_id, old_node_id, new_node_id, old_allocation_id, new_allocation_id, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
        [id, server.node_id, newNodeId, server.allocation_id, newAllocationId]
      );
      const transfer = transferResult.rows[0];

      // Start transfer in the background (don't await)
      runTransfer(id, server, targetNode, transfer, app.db, newNodeId, newAllocationId);

      return reply.status(201).send({ transferId: transfer.id, status: transfer.status });
    }
  );

  // Get transfer status
  app.get(
    "/servers/:id/transfer",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT st.*,
                oldn.name as old_node_name,
                newn.name as new_node_name
         FROM server_transfers st
         LEFT JOIN nodes oldn ON st.old_node_id = oldn.id
         LEFT JOIN nodes newn ON st.new_node_id = newn.id
         WHERE st.server_id = $1
         ORDER BY st.created_at DESC
         LIMIT 1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "No transfers found" });
      }

      return reply.send({ transfer: result.rows[0] });
    }
  );

  // List transfer history
  app.get(
    "/servers/:id/transfers",
    { preHandler: [authenticateSession, requireServerAccess] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT st.*,
                oldn.name as old_node_name,
                newn.name as new_node_name
         FROM server_transfers st
         LEFT JOIN nodes oldn ON st.old_node_id = oldn.id
         LEFT JOIN nodes newn ON st.new_node_id = newn.id
         WHERE st.server_id = $1
         ORDER BY st.created_at DESC`,
        [id]
      );

      return reply.send({ transfers: result.rows });
    }
  );
}

async function runTransfer(
  serverId: string,
  server: any,
  targetNode: any,
  transfer: any,
  db: any,
  newNodeId: string,
  newAllocationId: string,
) {
  try {
    await db.query(
      "UPDATE server_transfers SET status = 'transferring', updated_at = now() WHERE id = $1",
      [transfer.id]
    );

    // Get source node info
    const sourceNode = { fqdn: server.fqdn, daemon_listen_port: server.daemon_listen_port };
    const destNode = { fqdn: targetNode.fqdn, daemon_listen_port: targetNode.daemon_listen_port };

    // Step 1: Stop the server first
    await agentPost(sourceNode, `/api/servers/${serverId}/stop`);

    // Step 2: Export data from source agent (stream)
    const exportResp = await agentStreamBody(sourceNode, "POST", `/api/servers/${serverId}/transfer/export`);
    if (!exportResp.ok || !exportResp.body) {
      throw new Error(`Export failed: ${exportResp.error}`);
    }

    // Step 3: Import data to destination agent (stream the tar.gz)
    const importResp = await agentSendBody(destNode, "POST", `/api/servers/${serverId}/transfer/import`, exportResp.body);
    if (!importResp.ok) {
      throw new Error(`Import failed: ${importResp.error}`);
    }

    // Step 4: Complete transfer on destination (chown + start)
    const completeResp = await agentPost(destNode, `/api/servers/${serverId}/transfer/complete`);
    if (!completeResp.ok) {
      throw new Error(`Finalize failed: ${completeResp.error}`);
    }

    // Step 5: Update DB - reassign allocations
    await db.query(
      "UPDATE allocations SET server_id = NULL, allocated_at = NULL WHERE id = $1",
      [server.allocation_id]
    );
    await db.query(
      "UPDATE allocations SET server_id = $1, allocated_at = now() WHERE id = $2",
      [serverId, newAllocationId]
    );

    // Step 6: Update server's node_id and allocation_id
    await db.query(
      "UPDATE servers SET node_id = $1, allocation_id = $2, updated_at = now() WHERE id = $3",
      [newNodeId, newAllocationId, serverId]
    );

    // Step 7: Update node resource counts
    await db.query(
      `UPDATE nodes SET
        allocated_memory_mb = allocated_memory_mb - $1,
        allocated_disk_mb = allocated_disk_mb - $2
       WHERE id = $3`,
      [server.memory_mb, server.disk_mb, server.node_id]
    );
    await db.query(
      `UPDATE nodes SET
        allocated_memory_mb = allocated_memory_mb + $1,
        allocated_disk_mb = allocated_disk_mb + $2
       WHERE id = $3`,
      [server.memory_mb, server.disk_mb, newNodeId]
    );

    // Step 8: Cleanup source archive
    await agentPost(sourceNode, `/api/servers/${serverId}/transfer/cleanup`);

    // Step 9: Mark transfer complete
    await db.query(
      "UPDATE server_transfers SET status = 'completed', updated_at = now() WHERE id = $1",
      [transfer.id]
    );

    await eventBus.emit("server.transferred", {
      subjectType: "server",
      subjectId: serverId,
      metadata: { oldNodeId: server.node_id, newNodeId },
    });
  } catch (err: any) {
    console.error(`[Transfer] Server ${serverId} transfer failed:`, err.message);

    await db.query(
      "UPDATE server_transfers SET status = 'failed', error = $1, updated_at = now() WHERE id = $2",
      [err.message, transfer.id]
    );

    // Try to rollback: restart server on source node
    try {
      const sourceNode = { fqdn: server.fqdn, daemon_listen_port: server.daemon_listen_port };
      await agentPost(sourceNode, `/api/servers/${serverId}/start`);
      await agentPost(sourceNode, `/api/servers/${serverId}/transfer/cleanup`);
    } catch {
      // Rollback best-effort
    }
  }
}
