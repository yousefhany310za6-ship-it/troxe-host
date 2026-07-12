import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  authenticateSession,
  requireAdmin,
} from "../middleware/rbac.js";
import { generateDaemonToken, hashDaemonToken } from "../middleware/auth.js";
import { eventBus } from "../../events/index.js";

const createNodeSchema = z.object({
  name: z.string().min(1).max(100),
  locationId: z.string().uuid(),
  fqdn: z.string().min(1),
  publicIp: z.string().ip(),
  privateIp: z.string().ip().optional(),
  totalMemoryMb: z.number().int().min(512),
  totalDiskMb: z.number().int().min(1024),
});

export default async function nodeRoutes(app: FastifyInstance) {
  // List nodes
  app.get(
    "/nodes",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await app.db.query(
        `SELECT n.*, l.name as location_name,
          (SELECT COUNT(*) FROM servers WHERE node_id = n.id) as server_count
         FROM nodes n
         LEFT JOIN locations l ON n.location_id = l.id
         ORDER BY n.name`
      );
      return reply.send({ nodes: result.rows });
    }
  );

  // Get node details
  app.get(
    "/nodes/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const result = await app.db.query(
        `SELECT n.*, l.name as location_name
         FROM nodes n
         LEFT JOIN locations l ON n.location_id = l.id
         WHERE n.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "Node not found" });
      }

      // Get servers on this node
      const servers = await app.db.query(
        `SELECT id, name, status, owner_id FROM servers WHERE node_id = $1`,
        [id]
      );

      // Get allocations
      const allocations = await app.db.query(
        `SELECT * FROM allocations WHERE node_id = $1 ORDER BY ip, port`,
        [id]
      );

      return reply.send({
        node: result.rows[0],
        servers: servers.rows,
        allocations: allocations.rows,
      });
    }
  );

  // Create node
  app.post(
    "/nodes",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createNodeSchema.parse(request.body);

      const daemonToken = generateDaemonToken();

      const result = await app.db.query(
        `INSERT INTO nodes (
          name, location_id, fqdn, public_ip, private_ip,
          total_memory_mb, total_disk_mb,
          daemon_token_id, daemon_token_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, name, fqdn, public_ip, created_at`,
        [
          body.name,
          body.locationId,
          body.fqdn,
          body.publicIp,
          body.privateIp || null,
          body.totalMemoryMb,
          body.totalDiskMb,
          daemonToken.tokenId,
          daemonToken.tokenHash,
        ]
      );

      return reply.status(201).send({
        node: result.rows[0],
        daemonToken: daemonToken.token, // Show once!
      });
    }
  );

  // Update node
  app.put(
    "/nodes/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        name: string;
        fqdn: string;
        publicIp: string;
        privateIp: string;
        maintenanceMode: boolean;
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.fqdn !== undefined) {
        updates.push(`fqdn = $${idx++}`);
        values.push(body.fqdn);
      }
      if (body.publicIp !== undefined) {
        updates.push(`public_ip = $${idx++}`);
        values.push(body.publicIp);
      }
      if (body.privateIp !== undefined) {
        updates.push(`private_ip = $${idx++}`);
        values.push(body.privateIp);
      }
      if (body.maintenanceMode !== undefined) {
        updates.push(`maintenance_mode = $${idx++}`);
        values.push(body.maintenanceMode);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      updates.push(`updated_at = now()`);
      values.push(id);

      await app.db.query(
        `UPDATE nodes SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Delete node
  app.delete(
    "/nodes/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      // Check for servers
      const servers = await app.db.query(
        "SELECT COUNT(*) FROM servers WHERE node_id = $1",
        [id]
      );
      if (parseInt(servers.rows[0].count) > 0) {
        return reply.status(400).send({
          error: "Cannot delete node with active servers",
        });
      }

      await app.db.query("DELETE FROM nodes WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );

  // Create allocation
  app.post(
    "/nodes/:id/allocations",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { ip, port } = request.body as { ip: string; port: number };

      const existing = await app.db.query(
        "SELECT id FROM allocations WHERE node_id = $1 AND ip = $2 AND port = $3",
        [id, ip, port]
      );
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: "Allocation already exists" });
      }

      const result = await app.db.query(
        `INSERT INTO allocations (node_id, ip, port)
         VALUES ($1, $2, $3) RETURNING *`,
        [id, ip, port]
      );

      return reply.status(201).send({ allocation: result.rows[0] });
    }
  );

  // Delete allocation
  app.delete(
    "/allocations/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const alloc = await app.db.query(
        "SELECT server_id FROM allocations WHERE id = $1",
        [id]
      );
      if (alloc.rows.length > 0 && alloc.rows[0].server_id) {
        return reply.status(400).send({
          error: "Cannot delete allocation assigned to a server",
        });
      }

      await app.db.query("DELETE FROM allocations WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );

  // Node heartbeat (called by Node Agent)
  app.post(
    "/remote/heartbeat",
    { preHandler: [] }, // Daemon auth handled separately
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Daemon token required" });
      }

      const { hashDaemonToken } = await import("../middleware/auth.js");
      const tokenHash = hashDaemonToken(authHeader.substring(7));

      const nodeResult = await app.db.query(
        "SELECT id FROM nodes WHERE daemon_token_hash = $1",
        [tokenHash]
      );

      if (nodeResult.rows.length === 0) {
        return reply.status(401).send({ error: "Invalid daemon token" });
      }

      const nodeId = nodeResult.rows[0].id;
      const body = request.body as {
        stats: Record<string, number>;
        crashed_servers?: string[];
      };

      await app.db.query(
        `UPDATE nodes SET last_heartbeat_at = now(), status = 'online',
         allocated_memory_mb = $1, allocated_disk_mb = $2
         WHERE id = $3`,
        [
          body.stats?.allocatedMemoryMb || 0,
          body.stats?.allocatedDiskMb || 0,
          nodeId,
        ]
      );

      if (body.crashed_servers && body.crashed_servers.length > 0) {
        for (const serverId of body.crashed_servers) {
          const serverCheck = await app.db.query(
            "SELECT id, status FROM servers WHERE id = $1 AND node_id = $2",
            [serverId, nodeId]
          );
          if (serverCheck.rows.length === 0) continue;

          await app.db.query(
            `UPDATE servers SET
              status = 'crashed',
              crash_count = COALESCE(crash_count, 0) + 1,
              last_crashed_at = now()
             WHERE id = $1 AND status != 'crashed'`,
            [serverId]
          );

          await eventBus.emit("server.crashed", {
            subjectType: "server",
            subjectId: serverId,
            nodeId,
          });
        }
      }

      return reply.send({ success: true });
    }
  );

  // List locations
  app.get(
    "/locations",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await app.db.query("SELECT * FROM locations ORDER BY name");
      return reply.send({ locations: result.rows });
    }
  );

  // Create location
  app.post(
    "/locations",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, description } = request.body as {
        name: string;
        description?: string;
      };

      const result = await app.db.query(
        "INSERT INTO locations (name, description) VALUES ($1, $2) RETURNING *",
        [name, description || null]
      );

      return reply.status(201).send({ location: result.rows[0] });
    }
  );

  // Update location
  app.put(
    "/locations/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        name: string;
        description: string;
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${idx++}`);
        values.push(body.description);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      values.push(id);
      await app.db.query(
        `UPDATE locations SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Delete location
  app.delete(
    "/locations/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const nodes = await app.db.query(
        "SELECT COUNT(*) FROM nodes WHERE location_id = $1",
        [id]
      );
      if (parseInt(nodes.rows[0].count) > 0) {
        return reply.status(400).send({
          error: "Cannot delete location with nodes in it",
        });
      }

      await app.db.query("DELETE FROM locations WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );

  // List nests
  app.get(
    "/nests",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await app.db.query(
        `SELECT n.*,
          (SELECT COUNT(*) FROM eggs WHERE nest_id = n.id) as egg_count
         FROM nests n ORDER BY n.name`
      );
      return reply.send({ nests: result.rows });
    }
  );

  // Create nest
  app.post(
    "/nests",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, description } = request.body as {
        name: string;
        description?: string;
      };

      const result = await app.db.query(
        "INSERT INTO nests (name, description) VALUES ($1, $2) RETURNING *",
        [name, description || null]
      );

      return reply.status(201).send({ nest: result.rows[0] });
    }
  );

  // Update nest
  app.put(
    "/nests/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        name: string;
        description: string;
      }>;

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${idx++}`);
        values.push(body.description);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      values.push(id);
      await app.db.query(
        `UPDATE nests SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Delete nest
  app.delete(
    "/nests/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const eggs = await app.db.query(
        "SELECT COUNT(*) FROM eggs WHERE nest_id = $1",
        [id]
      );
      if (parseInt(eggs.rows[0].count) > 0) {
        return reply.status(400).send({
          error: "Cannot delete nest with eggs in it",
        });
      }

      await app.db.query("DELETE FROM nests WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );

  // List eggs
  app.get(
    "/eggs",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await app.db.query(
        `SELECT e.*, n.name as nest_name
         FROM eggs e
         JOIN nests n ON e.nest_id = n.id
         ORDER BY n.name, e.name`
      );
      return reply.send({ eggs: result.rows });
    }
  );

  // Create egg
  app.post(
    "/eggs",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        name: string;
        nestId: string;
        dockerImage: string;
        startupCommand: string;
        installScript?: string;
        variables?: any[];
        configFiles?: any[];
        maxDatabases?: number;
        maxAllocations?: number;
        maxBackups?: number;
        defaultMemoryMb?: number;
        defaultDiskMb?: number;
        defaultCpuPercent?: number;
        defaultPidLimit?: number;
      };

      const result = await app.db.query(
        `INSERT INTO eggs (
          name, nest_id, docker_image, startup_command, install_script,
          variables, config_files, max_databases, max_allocations, max_backups,
          default_memory_mb, default_disk_mb, default_cpu_percent, default_pid_limit
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *`,
        [
          body.name,
          body.nestId,
          body.dockerImage,
          body.startupCommand,
          body.installScript || null,
          JSON.stringify(body.variables || []),
          JSON.stringify(body.configFiles || []),
          body.maxDatabases ?? 0,
          body.maxAllocations ?? 1,
          body.maxBackups ?? 5,
          body.defaultMemoryMb ?? 1024,
          body.defaultDiskMb ?? 10240,
          body.defaultCpuPercent ?? 100,
          body.defaultPidLimit ?? 1024,
        ]
      );

      return reply.status(201).send({ egg: result.rows[0] });
    }
  );

  // Update egg
  app.put(
    "/eggs/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        name: string;
        nestId: string;
        dockerImage: string;
        startupCommand: string;
        installScript: string;
        variables: any[];
        configFiles: any[];
        maxDatabases: number;
        maxAllocations: number;
        maxBackups: number;
        defaultMemoryMb: number;
        defaultDiskMb: number;
        defaultCpuPercent: number;
        defaultPidLimit: number;
      }>;

      const fieldMap: Record<string, string> = {
        name: "name",
        nestId: "nest_id",
        dockerImage: "docker_image",
        startupCommand: "startup_command",
        installScript: "install_script",
        maxDatabases: "max_databases",
        maxAllocations: "max_allocations",
        maxBackups: "max_backups",
        defaultMemoryMb: "default_memory_mb",
        defaultDiskMb: "default_disk_mb",
        defaultCpuPercent: "default_cpu_percent",
        defaultPidLimit: "default_pid_limit",
      };

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const [camel, column] of Object.entries(fieldMap)) {
        const val = (body as any)[camel];
        if (val !== undefined) {
          updates.push(`${column} = $${idx++}`);
          values.push(val);
        }
      }

      if (body.variables !== undefined) {
        updates.push(`variables = $${idx++}`);
        values.push(JSON.stringify(body.variables));
      }
      if (body.configFiles !== undefined) {
        updates.push(`config_files = $${idx++}`);
        values.push(JSON.stringify(body.configFiles));
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      updates.push(`updated_at = now()`);
      values.push(id);

      await app.db.query(
        `UPDATE eggs SET ${updates.join(", ")} WHERE id = $${idx}`,
        values
      );

      return reply.send({ success: true });
    }
  );

  // Delete egg
  app.delete(
    "/eggs/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const servers = await app.db.query(
        "SELECT COUNT(*) FROM servers WHERE egg_id = $1",
        [id]
      );
      if (parseInt(servers.rows[0].count) > 0) {
        return reply.status(400).send({
          error: "Cannot delete egg that is in use by servers",
        });
      }

      await app.db.query("DELETE FROM eggs WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );

  // System info
  app.get(
    "/system/info",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [users, servers, nodes, eggs] = await Promise.all([
        app.db.query("SELECT COUNT(*) FROM users"),
        app.db.query("SELECT COUNT(*) FROM servers"),
        app.db.query("SELECT COUNT(*) FROM nodes WHERE status = 'online'"),
        app.db.query("SELECT COUNT(*) FROM eggs"),
      ]);

      return reply.send({
        users: parseInt(users.rows[0].count),
        servers: parseInt(servers.rows[0].count),
        nodes: parseInt(nodes.rows[0].count),
        eggs: parseInt(eggs.rows[0].count),
        version: "0.1.0",
      });
    }
  );

  // List users
  app.get(
    "/users",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await app.db.query(
        `SELECT id, username, email, root_admin, suspended, last_login_at, created_at
         FROM users ORDER BY created_at DESC`
      );
      return reply.send({ users: result.rows });
    }
  );

  // Delete user
  app.delete(
    "/users/:id",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const currentUserId = request.user!.userId;
      if (id === currentUserId) {
        return reply.status(400).send({ error: "Cannot delete your own account" });
      }
      await app.db.query("DELETE FROM users WHERE id = $1", [id]);
      return reply.send({ success: true });
    }
  );

  // Toggle user suspension
  app.patch(
    "/users/:id/suspend",
    { preHandler: [authenticateSession, requireAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { suspended } = request.body as { suspended: boolean };
      const currentUserId = request.user!.userId;
      if (id === currentUserId) {
        return reply.status(400).send({ error: "Cannot suspend your own account" });
      }
      await app.db.query("UPDATE users SET suspended = $1 WHERE id = $2", [suspended, id]);
      return reply.send({ success: true });
    }
  );
}
