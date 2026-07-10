import { Queue, Worker, Job } from "bullmq";
import { redis } from "../config/redis.js";
import { db } from "../config/database.js";
import { eventBus } from "../events/index.js";
import { config } from "../config/env.js";

const connection = {
  host: config.REDIS_URL.includes("://")
    ? new URL(config.REDIS_URL).hostname
    : "localhost",
  port: config.REDIS_URL.includes("://")
    ? parseInt(new URL(config.REDIS_URL).port || "6379")
    : 6379,
  password: config.REDIS_PASSWORD || undefined,
};

// Queue for dispatching jobs
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

// Job type handlers
const jobHandlers: Record<string, (job: Job) => Promise<void>> = {
  "server.create": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Creating server: ${serverId}`);

    const result = await db.query(
      `SELECT s.*, n.fqdn, n.public_ip, n.daemon_listen_port
       FROM servers s
       JOIN nodes n ON s.node_id = n.id
       WHERE s.id = $1`,
      [serverId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Server ${serverId} not found`);
    }

    const server = result.rows[0];

    // Update status to installing
    await db.query(
      `UPDATE servers SET status = 'installing' WHERE id = $1`,
      [serverId]
    );

    // TODO: Call Node Agent to create container
    // await nodeClient.post(`http://${server.fqdn}:${server.daemon_listen_port}/api/v1/remote/servers`, {...})

    await eventBus.emit("server.created", {
      subjectType: "server",
      subjectId: serverId,
    });
  },

  "server.install": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Installing server: ${serverId}`);

    // TODO: Execute install script on node
    // Stream install logs back to panel

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

    // TODO: Call Node Agent to start container
    // On success: UPDATE status = 'running', emit server.started
    // On failure: UPDATE status = 'crashed', emit server.crashed
  },

  "server.stop": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Stopping server: ${serverId}`);

    await db.query(
      `UPDATE servers SET status = 'stopping' WHERE id = $1`,
      [serverId]
    );

    // TODO: Call Node Agent to stop container
  },

  "server.restart": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Restarting server: ${serverId}`);

    // TODO: Call Node Agent to restart container
  },

  "server.delete": async (job) => {
    const { serverId } = job.data;
    console.log(`[Job] Deleting server: ${serverId}`);

    // TODO: Call Node Agent to remove container
    // Then delete from DB
    await db.query(`DELETE FROM servers WHERE id = $1`, [serverId]);
  },

  "backup.create": async (job) => {
    const { backupId, serverId } = job.data;
    console.log(`[Job] Creating backup: ${backupId} for server: ${serverId}`);

    // TODO: Call Node Agent to create backup
    // On success: UPDATE backup status, emit backup.completed
    // On failure: UPDATE backup status, emit backup.failed
  },

  "backup.delete": async (job) => {
    const { backupId } = job.data;
    console.log(`[Job] Deleting backup: ${backupId}`);

    // TODO: Delete backup file from storage
    await db.query(`DELETE FROM backups WHERE id = $1`, [backupId]);
  },
};

// Worker to process jobs
const worker = new Worker(
  "troxe-jobs",
  async (job: Job) => {
    const handler = jobHandlers[job.name];
    if (!handler) {
      throw new Error(`Unknown job type: ${job.name}`);
    }

    // Update job status in DB
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

// Helper to add a job
export async function addJob(
  type: string,
  data: Record<string, unknown>,
  options?: { delay?: number; priority?: number }
): Promise<string> {
  // Store job in DB
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

  // Add to BullMQ queue
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
