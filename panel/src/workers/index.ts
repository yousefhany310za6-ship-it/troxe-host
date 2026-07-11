import { Queue, Worker, Job } from "bullmq";
import { redis } from "../config/redis.js";
import { db } from "../config/database.js";
import { eventBus } from "../events/index.js";
import { config } from "../config/env.js";
import {
  agentPost,
  agentGet,
  getNodeForServer,
  sendServerCommand,
} from "../lib/node-agent.js";

const connection = {
  host: config.REDIS_URL.includes("://")
    ? new URL(config.REDIS_URL).hostname
    : "localhost",
  port: config.REDIS_URL.includes("://")
    ? parseInt(new URL(config.REDIS_URL).port || "6379")
    : 6379,
  password: config.REDIS_PASSWORD || undefined,
};

export const jobQueue = new Queue("troxe-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

const jobHandlers: Record<string, (job: Job) => Promise<void>> = {
  "server.create": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Creating server: ${serverId}`);

    const result = await db.query(
      `SELECT s.*, n.fqdn, n.daemon_listen_port, n.public_ip,
              a.ip as alloc_ip, a.port as alloc_port,
              e.container_port, e.install_script
       FROM servers s
       JOIN nodes n ON s.node_id = n.id
       LEFT JOIN allocations a ON s.allocation_id = a.id
       LEFT JOIN eggs e ON s.egg_id = e.id
       WHERE s.id = $1`,
      [serverId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Server ${serverId} not found`);
    }

    const server = result.rows[0];

    await db.query(
      `UPDATE servers SET status = 'installing' WHERE id = $1`,
      [serverId]
    );

    const node = await getNodeForServer(serverId, db);
    if (!node) {
      throw new Error(`Node not found for server ${serverId}`);
    }

    const environment =
      typeof server.environment === "string"
        ? JSON.parse(server.environment)
        : server.environment || {};

    const startupCmd = server.startup_command || "";

    // Step 0: Remove any existing container
    await agentPost(node, `/api/servers/${serverId}/remove`);

    // Step 1: Create container with keep-alive for install
    const createResp = await agentPost(node, `/api/servers/${serverId}/create`, {
      image: server.docker_image,
      startup: "sleep infinity",
      environment: { ...environment, STARTUP: "sleep infinity" },
      memory_bytes: Number(server.memory_mb) * 1024 * 1024,
      cpu_percent: Number(server.cpu_percent),
      pid_limit: Number(server.pid_limit) || 512,
      data_path: `/var/lib/troxe/${serverId}`,
      ports: server.alloc_port ? [{
        host_port: Number(server.alloc_port),
        container_port: Number(server.container_port) || 25565,
      }] : [],
    });

    if (!createResp.ok) {
      await db.query(
        `UPDATE servers SET status = 'install_failed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to create container: ${createResp.error}`);
    }

    // Step 2: Start keep-alive container
    const startResp = await agentPost(node, `/api/servers/${serverId}/start`);
    if (!startResp.ok) {
      console.warn(`[Job] Warning: container created but failed to start: ${startResp.error}`);
    }

    // Step 3: Run install script as root
    const installScript = server.install_script || "";
    if (installScript) {
      console.log(`[Job] Running install script for ${serverId}...`);
      const installResp = await agentPost(node, `/api/servers/${serverId}/install`, {
        command: installScript,
      });
      if (!installResp.ok) {
        console.warn(`[Job] Install script failed (continuing): ${installResp.error}`);
      } else {
        console.log(`[Job] Install script completed for ${serverId}`);
      }
    }

    // Step 4: Remove keep-alive container
    await agentPost(node, `/api/servers/${serverId}/remove`);

    // Step 5: Recreate with real startup
    const createFinal = await agentPost(node, `/api/servers/${serverId}/create`, {
      image: server.docker_image,
      startup: startupCmd,
      environment: { ...environment, STARTUP: startupCmd },
      memory_bytes: Number(server.memory_mb) * 1024 * 1024,
      cpu_percent: Number(server.cpu_percent),
      pid_limit: Number(server.pid_limit) || 512,
      data_path: `/var/lib/troxe/${serverId}`,
      ports: server.alloc_port ? [{
        host_port: Number(server.alloc_port),
        container_port: Number(server.container_port) || 25565,
      }] : [],
    });

    if (!createFinal.ok) {
      await db.query(
        `UPDATE servers SET status = 'install_failed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to recreate container after install: ${createFinal.error}`);
    }

    // Step 6: Start real server
    const finalStart = await agentPost(node, `/api/servers/${serverId}/start`);
    if (!finalStart.ok) {
      console.warn(`[Job] Warning: install done but failed to start: ${finalStart.error}`);
    }

    await db.query(
      `UPDATE servers SET status = 'running', installed_at = now() WHERE id = $1`,
      [serverId]
    );

    await eventBus.emit("server.created", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.install": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Installing server: ${serverId}`);

    const node = await getNodeForServer(serverId, db);
    if (!node) throw new Error(`Node not found for server ${serverId}`);

    // Load server + egg data
    const result = await db.query(
      `SELECT s.*, a.port as alloc_port, e.container_port, e.install_script
       FROM servers s
       LEFT JOIN allocations a ON s.allocation_id = a.id
       LEFT JOIN eggs e ON s.egg_id = e.id
       WHERE s.id = $1`,
      [serverId]
    );
    if (result.rows.length === 0) throw new Error(`Server ${serverId} not found`);
    const srv = result.rows[0];

    const environment =
      typeof srv.environment === "string"
        ? JSON.parse(srv.environment)
        : srv.environment || {};

    // Step 0: Remove any existing container first
    await agentPost(node, `/api/servers/${serverId}/remove`);

    // Step 1: Create container with a keep-alive command for install
    const createResp = await agentPost(node, `/api/servers/${serverId}/create`, {
      image: srv.docker_image,
      startup: "sleep infinity",
      environment: { ...environment, STARTUP: "sleep infinity" },
      memory_bytes: Number(srv.memory_mb) * 1024 * 1024,
      cpu_percent: Number(srv.cpu_percent),
      pid_limit: Number(srv.pid_limit) || 512,
      data_path: `/var/lib/troxe/${serverId}`,
      ports: srv.alloc_port ? [{
        host_port: Number(srv.alloc_port),
        container_port: Number(srv.container_port) || 25565,
      }] : [],
    });

    if (!createResp.ok) {
      await db.query(
        `UPDATE servers SET status = 'install_failed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to create container for install: ${createResp.error}`);
    }

    // Step 2: Start the keep-alive container
    const startResp = await agentPost(node, `/api/servers/${serverId}/start`);
    if (!startResp.ok) {
      await db.query(
        `UPDATE servers SET status = 'install_failed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to start container for install: ${startResp.error}`);
    }

    // Step 3: Run install script as root inside the container
    const installScript = srv.install_script || "";
    if (installScript) {
      console.log(`[Job] Running install script for ${serverId}...`);
      const installResp = await agentPost(node, `/api/servers/${serverId}/install`, {
        command: installScript,
      });

      if (!installResp.ok) {
        console.warn(`[Job] Install script failed: ${installResp.error}`);
        // Continue anyway — server might still work (e.g. user upload mode)
      } else {
        console.log(`[Job] Install script completed for ${serverId}`);
      }
    }

    // Step 4: Kill and remove the temporary keep-alive container
    await agentPost(node, `/api/servers/${serverId}/remove`);

    // Step 5: Recreate with the real startup command
    const realStartup = srv.startup_command || "";
    const createFinal = await agentPost(node, `/api/servers/${serverId}/create`, {
      image: srv.docker_image,
      startup: realStartup,
      environment: { ...environment, STARTUP: realStartup },
      memory_bytes: Number(srv.memory_mb) * 1024 * 1024,
      cpu_percent: Number(srv.cpu_percent),
      pid_limit: Number(srv.pid_limit) || 512,
      data_path: `/var/lib/troxe/${serverId}`,
      ports: srv.alloc_port ? [{
        host_port: Number(srv.alloc_port),
        container_port: Number(srv.container_port) || 25565,
      }] : [],
    });

    if (!createFinal.ok) {
      await db.query(
        `UPDATE servers SET status = 'install_failed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to recreate container after install: ${createFinal.error}`);
    }

    // Step 6: Start the real server
    const finalStart = await agentPost(node, `/api/servers/${serverId}/start`);
    if (!finalStart.ok) {
      console.warn(`[Job] Warning: install done but failed to start server: ${finalStart.error}`);
    }

    await db.query(
      `UPDATE servers SET status = 'running', installed_at = now() WHERE id = $1`,
      [serverId]
    );

    await eventBus.emit("server.installed", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.start": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Starting server: ${serverId}`);

    await db.query(
      `UPDATE servers SET status = 'starting' WHERE id = $1`,
      [serverId]
    );

    const result = await db.query(
      `SELECT s.*, n.fqdn, n.daemon_listen_port
       FROM servers s JOIN nodes n ON s.node_id = n.id
       WHERE s.id = $1`,
      [serverId]
    );
    if (result.rows.length === 0) throw new Error(`Server ${serverId} not found`);

    const srv = result.rows[0];
    const node = await getNodeForServer(serverId, db);
    if (!node) throw new Error(`Node not found for server ${serverId}`);

    let resp = await agentPost(node, `/api/servers/${serverId}/start`);

    // If agent doesn't track this container (e.g. agent restarted), create it first
    if (!resp.ok && resp.error && resp.error.includes("container not found")) {
      console.log(`[Job] Container not tracked, creating for server: ${serverId}`);

      const environment =
        typeof srv.environment === "string"
          ? JSON.parse(srv.environment)
          : srv.environment || {};

      const createResp = await agentPost(node, `/api/servers/${serverId}/create`, {
        image: srv.docker_image,
        startup: srv.startup_command || "",
        environment: { ...environment, STARTUP: srv.startup_command || "" },
        memory_bytes: Number(srv.memory_mb) * 1024 * 1024,
        cpu_percent: Number(srv.cpu_percent),
        pid_limit: Number(srv.pid_limit) || 512,
        data_path: `/var/lib/troxe/${serverId}`,
        ports: [],
      });

      if (!createResp.ok) {
        await db.query(
          `UPDATE servers SET status = 'crashed' WHERE id = $1`,
          [serverId]
        );
        throw new Error(`Failed to create container: ${createResp.error}`);
      }

      resp = await agentPost(node, `/api/servers/${serverId}/start`);
    }

    if (!resp.ok) {
      await db.query(
        `UPDATE servers SET status = 'crashed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to start server: ${resp.error}`);
    }

    await db.query(
      `UPDATE servers SET status = 'running' WHERE id = $1`,
      [serverId]
    );

    await eventBus.emit("server.started", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.stop": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Stopping server: ${serverId}`);

    await db.query(
      `UPDATE servers SET status = 'stopping' WHERE id = $1`,
      [serverId]
    );

    const node = await getNodeForServer(serverId, db);
    if (!node) throw new Error(`Node not found for server ${serverId}`);

    const resp = await agentPost(node, `/api/servers/${serverId}/stop`);
    if (!resp.ok) {
      // Container not tracked (agent restarted) — treat as already stopped
      if (resp.error && resp.error.includes("container not found")) {
        console.log(`[Job] Container not tracked for ${serverId}, treating as stopped`);
      } else {
        throw new Error(`Failed to stop server: ${resp.error}`);
      }
    }

    await db.query(
      `UPDATE servers SET status = 'stopped' WHERE id = $1`,
      [serverId]
    );

    await eventBus.emit("server.stopped", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.kill": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Killing server: ${serverId}`);

    await db.query(
      `UPDATE servers SET status = 'stopping' WHERE id = $1`,
      [serverId]
    );

    const node = await getNodeForServer(serverId, db);
    if (!node) throw new Error(`Node not found for server ${serverId}`);

    const resp = await agentPost(node, `/api/servers/${serverId}/kill`);
    if (!resp.ok) {
      if (resp.error && resp.error.includes("container not found")) {
        console.log(`[Job] Container not tracked for ${serverId}, treating as stopped`);
      } else {
        throw new Error(`Failed to kill server: ${resp.error}`);
      }
    }

    await db.query(
      `UPDATE servers SET status = 'stopped' WHERE id = $1`,
      [serverId]
    );

    await eventBus.emit("server.stopped", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.restart": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Restarting server: ${serverId}`);

    await db.query(
      `UPDATE servers SET status = 'starting' WHERE id = $1`,
      [serverId]
    );

    const node = await getNodeForServer(serverId, db);
    if (!node) throw new Error(`Node not found for server ${serverId}`);

    // Kill first (instant SIGKILL, tolerate "not found")
    const stopResp = await agentPost(node, `/api/servers/${serverId}/kill`);
    if (!stopResp.ok && stopResp.error && !stopResp.error.includes("container not found")) {
      console.warn(`[Job] Kill before restart failed: ${stopResp.error}`);
    }

    // Create if needed, then start (reuse server.start logic)
    const startResp = await agentPost(node, `/api/servers/${serverId}/start`);
    if (!startResp.ok && startResp.error && startResp.error.includes("container not found")) {
      // Fall back to create + start
      const srv = (await db.query(
        `SELECT s.*, n.fqdn, n.daemon_listen_port
         FROM servers s JOIN nodes n ON s.node_id = n.id
         WHERE s.id = $1`,
        [serverId]
      )).rows[0];

      if (srv) {
        const environment =
          typeof srv.environment === "string"
            ? JSON.parse(srv.environment)
            : srv.environment || {};

        await agentPost(node, `/api/servers/${serverId}/create`, {
          image: srv.docker_image,
          startup: srv.startup_command || "",
          environment: { ...environment, STARTUP: srv.startup_command || "" },
          memory_bytes: Number(srv.memory_mb) * 1024 * 1024,
          cpu_percent: Number(srv.cpu_percent),
          pid_limit: Number(srv.pid_limit) || 512,
          data_path: `/var/lib/troxe/${serverId}`,
          ports: [],
        });
      }
    }

    const finalResp = await agentPost(node, `/api/servers/${serverId}/start`);
    if (!finalResp.ok) {
      await db.query(
        `UPDATE servers SET status = 'crashed' WHERE id = $1`,
        [serverId]
      );
      throw new Error(`Failed to restart server: ${finalResp.error}`);
    }

    await db.query(
      `UPDATE servers SET status = 'running' WHERE id = $1`,
      [serverId]
    );

    await eventBus.emit("server.restarted", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.delete": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Deleting server: ${serverId}`);

    const node = await getNodeForServer(serverId, db);
    if (node) {
      await agentPost(node, `/api/servers/${serverId}/remove`);
    }

    await db.query(`DELETE FROM servers WHERE id = $1`, [serverId]);
  },

  "server.command": async (job) => {
    const { serverId, command } = job.data;
    console.log(`[Job] Sending command to server: ${serverId}`);

    const node = await getNodeForServer(serverId, db);
    if (!node) {
      throw new Error(`Node not found for server ${serverId}`);
    }

    const resp = await sendServerCommand(node, serverId, command);
    if (!resp.ok) {
      throw new Error(`Failed to send command: ${resp.error}`);
    }

    await eventBus.emit("server.command.sent", {
      subjectType: "server",
      subjectId: serverId,
      command,
    });
  },

  "backup.create": async (job) => {
    const { backupId, serverId } = job.data;
    console.log(`[Job] Creating backup: ${backupId} for server: ${serverId}`);

    await db.query(
      `UPDATE backups SET status = 'compressing' WHERE id = $1`,
      [backupId]
    );

    await db.query(
      `UPDATE backups SET status = 'completed', completed_at = now() WHERE id = $1`,
      [backupId]
    );

    await eventBus.emit("backup.completed", {
      subjectType: "backup",
      subjectId: backupId,
    });
  },

  "backup.delete": async (job) => {
    const { backupId } = job.data;
    console.log(`[Job] Deleting backup: ${backupId}`);
    await db.query(`DELETE FROM backups WHERE id = $1`, [backupId]);
  },
};

const worker = new Worker(
  "troxe-jobs",
  async (job: Job) => {
    const handler = jobHandlers[job.name];
    if (!handler) {
      throw new Error(`Unknown job type: ${job.name}`);
    }

    await db.query(
      `UPDATE jobs SET status = 'active', started_at = now(), attempts = attempts + 1
       WHERE id = $1`,
      [job.data.jobId]
    );

    try {
      await handler(job);

      await db.query(
        `UPDATE jobs SET status = 'completed', completed_at = now() WHERE id = $1`,
        [job.data.jobId]
      );
    } catch (err) {
      await db.query(
        `UPDATE jobs SET status = 'failed', error = $1 WHERE id = $2`,
        [String(err), job.data.jobId]
      );
      throw err;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

worker.on("failed", (job, err) => {
  console.error(`[Job] Failed: ${job?.name} - ${err.message}`);
});

worker.on("completed", (job) => {
  console.log(`[Job] Completed: ${job.name}`);
});

export async function addJob(
  type: string,
  data: Record<string, unknown>,
  options?: { delay?: number; priority?: number }
): Promise<string> {
  const result = await db.query(
    `INSERT INTO jobs (type, payload, status, server_id, node_id)
     VALUES ($1, $2, 'pending', $3, $4)
     RETURNING id`,
    [
      type,
      JSON.stringify(data),
      (data.serverId as string) || null,
      (data.nodeId as string) || null,
    ]
  );

  const jobId = result.rows[0].id;

  await jobQueue.add(
    type,
    { ...data, jobId },
    {
      jobId,
      delay: options?.delay,
      priority: options?.priority,
    }
  );

  return jobId;
}
