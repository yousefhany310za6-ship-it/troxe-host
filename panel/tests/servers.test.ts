import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../src/config/database.js";

// Integration test exercising server CRUD at the data layer.
// Requires a reachable PostgreSQL (DATABASE_URL). Cleans up after itself.

let nodeId: string;
let ownerId: string;
let eggId: string;
let serverId: string;

beforeAll(async () => {
  const node = await db.query(
    `INSERT INTO nodes (name, fqdn, public_ip, daemon_token_id, daemon_token_hash, total_memory_mb, total_disk_mb, status)
     VALUES ('test-node', 'localhost', '127.0.0.1', 'testtokenid', 'test', 1024, 10240, 'online')
     RETURNING id`
  );
  nodeId = node.rows[0].id;

  const owner = await db.query(
    `INSERT INTO users (username, email, password_hash, root_admin)
     VALUES ('testowner', 'owner@test.local', 'x', false)
     RETURNING id`
  );
  ownerId = owner.rows[0].id;

  const egg = await db.query(
    `INSERT INTO eggs (name, docker_image, startup_command)
     VALUES ('test-egg', 'nginx:alpine', 'echo hi')
     RETURNING id`
  );
  eggId = egg.rows[0].id;
});

afterAll(async () => {
  if (serverId) await db.query(`DELETE FROM servers WHERE id = $1`, [serverId]);
  await db.query(`DELETE FROM eggs WHERE id = $1`, [eggId]);
  await db.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
  await db.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
  await db.pool?.end?.();
});

describe("servers CRUD (integration)", () => {
  it("creates a server", async () => {
    const res = await db.query(
      `INSERT INTO servers (name, node_id, owner_id, egg_id, docker_image, startup_command, memory_mb, disk_mb)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, status`,
      ["test-server", nodeId, ownerId, eggId, "nginx:alpine", "echo hi", 512, 5120]
    );
    expect(res.rows.length).toBe(1);
    serverId = res.rows[0].id;
    expect(res.rows[0].name).toBe("test-server");
    expect(res.rows[0].status).toBe("install_pending");
  });

  it("reads the server back", async () => {
    const res = await db.query(`SELECT id, name FROM servers WHERE id = $1`, [serverId]);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].name).toBe("test-server");
  });

  it("updates the server", async () => {
    await db.query(`UPDATE servers SET name = $1 WHERE id = $2`, ["renamed", serverId]);
    const res = await db.query(`SELECT name FROM servers WHERE id = $1`, [serverId]);
    expect(res.rows[0].name).toBe("renamed");
  });

  it("deletes the server", async () => {
    await db.query(`DELETE FROM servers WHERE id = $1`, [serverId]);
    const res = await db.query(`SELECT id FROM servers WHERE id = $1`, [serverId]);
    expect(res.rows.length).toBe(0);
    serverId = "";
  });
});
