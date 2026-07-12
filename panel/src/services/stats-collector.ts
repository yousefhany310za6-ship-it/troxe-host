import { db } from "../config/database.js";
import { getNodeForServer, agentGet } from "../lib/node-agent.js";

const COLLECTION_INTERVAL = 60_000;
const RETENTION_DAYS = 7;

let timer: NodeJS.Timeout | null = null;

async function collectStatsForServer(server: any) {
  const node = await getNodeForServer(server.id, db);
  if (!node) return;

  const resp = await agentGet(node, `/api/servers/${server.id}/stats`);
  if (!resp.ok || !resp.data) return;

  const agentStats = (resp.data as any).stats || resp.data;

  const memoryUsed = agentStats.memory_bytes || 0;
  const cpuUsage = agentStats.cpu_absolute || 0;
  const diskUsed = agentStats.disk_bytes || 0;
  const network = agentStats.network || {};
  const uptime = agentStats.uptime || 0;

  await db.query(
    `INSERT INTO server_stats_history (server_id, memory_used, cpu_usage, disk_used, network_rx, network_tx, uptime)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [server.id, memoryUsed, cpuUsage, diskUsed, network.rx_bytes || 0, network.tx_bytes || 0, uptime]
  );

  if (agentStats.state && ["running", "stopped", "crashed"].includes(agentStats.state)) {
    if (agentStats.state !== server.status) {
      await db.query(`UPDATE servers SET status = $1 WHERE id = $2`, [agentStats.state, server.id]);
    }
  }
}

async function purgeOldData() {
  await db.query(
    `DELETE FROM server_stats_history WHERE created_at < now() - interval '${RETENTION_DAYS} days'`
  );
}

async function tick() {
  try {
    const result = await db.query(
      `SELECT id, status FROM servers WHERE status = 'running'`
    );

    for (const server of result.rows) {
      try {
        await collectStatsForServer(server);
      } catch (err) {
        console.error(`[StatsCollector] Failed for server ${server.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[StatsCollector] Tick error:", err);
  }
}

export async function startStatsCollector() {
  console.log("[StatsCollector] Started (interval: 60s, retention: 7d)");

  // Run immediately
  tick();
  purgeOldData();

  timer = setInterval(() => {
    tick();
  }, COLLECTION_INTERVAL);

  // Purge old data once per hour
  setInterval(() => {
    purgeOldData();
  }, 3_600_000);
}

export function stopStatsCollector() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log("[StatsCollector] Stopped");
}
