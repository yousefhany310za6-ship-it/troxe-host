import pg from "pg";
import { config } from "./env.js";

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};

export async function testDatabase(): Promise<boolean> {
  try {
    const result = await db.query("SELECT NOW()");
    console.log("Database connected:", result.rows[0].now);
    return true;
  } catch (err) {
    console.error("Database connection failed:", err);
    return false;
  }
}
