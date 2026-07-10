import { EventEmitter } from "events";
import { db } from "../config/database.js";

type EventHandler = (data: Record<string, unknown>) => Promise<void>;

class EventBus {
  private emitter = new EventEmitter();
  private handlers = new Map<string, EventHandler[]>();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler) {
    const list = this.handlers.get(event);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  async emit(event: string, data: Record<string, unknown> = {}) {
    // Store event in DB (immutable log)
    try {
      await db.query(
        `INSERT INTO events (event_type, subject_type, subject_id, data)
         VALUES ($1, $2, $3, $4)`,
        [
          event,
          (data.subjectType as string) || null,
          (data.subjectId as string) || null,
          JSON.stringify(data),
        ]
      );
    } catch (err) {
      console.error(`Failed to store event ${event}:`, err);
    }

    // Notify registered handlers
    const handlers = this.handlers.get(event) || [];
    const allHandlers = [...handlers, ...(this.handlers.get("*") || [])];

    await Promise.allSettled(
      allHandlers.map((h) =>
        h(data).catch((err) => {
          console.error(`Event handler error for ${event}:`, err);
        })
      )
    );
  }
}

export const eventBus = new EventBus();

// Default event handlers
eventBus.on("server.started", async (data) => {
  console.log(`[Event] Server started: ${data.serverId}`);
});

eventBus.on("server.stopped", async (data) => {
  console.log(`[Event] Server stopped: ${data.serverId}`);
});

eventBus.on("server.crashed", async (data) => {
  console.log(`[Event] Server crashed: ${data.serverId}`);

  // Notify the owner
  if (data.ownerId) {
    console.log(`  Notifying owner: ${data.ownerId}`);
  }
});

eventBus.on("server.installed", async (data) => {
  console.log(`[Event] Server installed: ${data.serverId}`);
});

eventBus.on("node.heartbeat", async (data) => {
  // Update node last_heartbeat_at
  if (data.nodeId) {
    await db.query(
      `UPDATE nodes SET last_heartbeat_at = now(), status = 'online' WHERE id = $1`,
      [data.nodeId]
    );
  }
});

eventBus.on("node.offline", async (data) => {
  console.log(`[Event] Node went offline: ${data.nodeId}`);
  if (data.nodeId) {
    await db.query(
      `UPDATE nodes SET status = 'offline' WHERE id = $1`,
      [data.nodeId]
    );
  }
});
