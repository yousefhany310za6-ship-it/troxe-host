import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { db } from "../config/database.js";

async function ensureMigrationTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const result = await db.query("SELECT filename FROM _migrations ORDER BY id");
  return result.rows.map((r: any) => r.filename);
}

export async function runMigrations() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();

  const migrationsDir = join(import.meta.dirname, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.includes(file)) {
      continue;
    }

    console.log(`Applying migration: ${file}`);
    const sql = await readFile(join(migrationsDir, file), "utf-8");

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  Applied: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  Failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("All migrations applied.");
}

// CLI mode
const isMainModule = process.argv[1]?.includes("migrate");
if (isMainModule) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
