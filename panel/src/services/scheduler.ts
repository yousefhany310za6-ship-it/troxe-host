import { db } from "../config/database.js";
import { addJob } from "../workers/index.js";
import { getNodeForServer, sendServerCommand } from "../lib/node-agent.js";
import { agentPost } from "../lib/node-agent.js";

function matchField(field: string, value: number): boolean {
  if (field === "*") return true;
  const parts = field.split(",");
  for (const part of parts) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (range === "*") {
        if (value % step === 0) return true;
      } else {
        const [startStr] = range.split("-");
        const start = parseInt(startStr, 10);
        if ((value - start) % step === 0) return true;
      }
    } else if (part.includes("-")) {
      const [start, end] = part.split("-").map((n) => parseInt(n, 10));
      if (value >= start && value <= end) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }
  return false;
}

function matchesCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (!matchField(minute, date.getUTCMinutes())) return false;
  if (!matchField(hour, date.getUTCHours())) return false;
  if (!matchField(dayOfMonth, date.getUTCDate())) return false;
  if (!matchField(month, date.getUTCMonth() + 1)) return false;

  if (dayOfWeek !== "*") {
    const dow = date.getUTCDay();
    if (!matchField(dayOfWeek, dow === 0 ? 7 : dow)) return false;
  }

  return true;
}

async function executeSchedule(schedule: any) {
  const serverId = schedule.server_id;
  const tasks = Array.isArray(schedule.tasks) ? schedule.tasks : [];

  for (const task of tasks) {
    const type = task.type;
    const payload = task.payload || "";

    try {
      switch (type) {
        case "command": {
          await addJob("server.command", { serverId, command: payload });
          break;
        }
        case "power": {
          if (payload === "start" || payload === "stop" || payload === "restart" || payload === "kill") {
            await addJob(`server.${payload}`, { serverId });
          }
          break;
        }
        case "backup": {
          await addJob("backup.create", { serverId, backupId: crypto.randomUUID() });
          break;
        }
        case "announce": {
          console.log(`[Schedule] Announce for ${serverId}: ${payload}`);
          break;
        }
      }
    } catch (err) {
      console.error(`[Schedule] Task failed (${type}):`, err);
    }
  }

  await db.query("UPDATE schedules SET last_run_at = now() WHERE id = $1", [
    schedule.id,
  ]);
}

let timer: NodeJS.Timeout | null = null;

export async function startScheduler(intervalMs = 30000) {
  console.log("[Scheduler] Started");

  const tick = async () => {
    try {
      const result = await db.query(
        `SELECT * FROM schedules WHERE is_active = true`
      );

      const now = new Date();
      // Align to current minute
      const minuteKey = Math.floor(now.getTime() / 60000);

      for (const schedule of result.rows) {
        // Avoid double-run within the same minute
        const lastRun = schedule.last_run_at
          ? new Date(schedule.last_run_at)
          : null;
        if (lastRun && Math.floor(lastRun.getTime() / 60000) === minuteKey) {
          continue;
        }

        if (matchesCron(schedule.cron_expression, now)) {
          console.log(`[Scheduler] Executing schedule: ${schedule.name}`);
          await executeSchedule(schedule);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error:", err);
    }
  };

  // Run immediately, then every interval
  tick();
  timer = setInterval(tick, intervalMs);
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log("[Scheduler] Stopped");
}
