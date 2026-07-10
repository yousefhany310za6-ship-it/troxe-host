import bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import { db } from "../../config/database.js";
import { config } from "../../config/env.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateApiKey(prefix: "txc_" | "txa_"): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const raw = randomBytes(32).toString("hex");
  const key = `${prefix}${raw}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const keyPrefix = key.substring(0, 8);
  return { key, keyHash, keyPrefix };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(key: string) {
  const prefix = key.startsWith("txc_") ? "txc_" : "txa_";
  const keyHash = hashApiKey(key);

  const result = await db.query(
    `SELECT ak.*, u.username, u.email, u.root_admin
     FROM api_keys ak
     JOIN users u ON ak.user_id = u.id
     WHERE ak.key_hash = $1 AND ak.key_prefix = $2
       AND (ak.expires_at IS NULL OR ak.expires_at > now())`,
    [keyHash, prefix]
  );

  if (result.rows.length === 0) return null;

  const apiKey = result.rows[0];

  // Update last_used_at
  await db.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [
    apiKey.id,
  ]);

  return {
    id: apiKey.id,
    userId: apiKey.user_id,
    username: apiKey.username,
    email: apiKey.email,
    rootAdmin: apiKey.root_admin,
    permissions: apiKey.permissions,
    isClient: prefix === "txc_",
    isAdmin: prefix === "txa_",
  };
}

export function generateDaemonToken(): {
  tokenId: string;
  tokenHash: string;
  token: string;
} {
  const tokenId = randomBytes(16).toString("hex");
  const tokenSecret = randomBytes(32).toString("hex");
  const token = `${tokenId}.${tokenSecret}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { tokenId, tokenHash, token };
}

export function hashDaemonToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}

// Simple XOR encryption for sensitive fields (TOTP secrets, recovery codes)
export function encrypt(text: string): string {
  const key = config.ENCRYPTION_KEY;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return Buffer.from(result).toString("base64");
}

export function decrypt(encrypted: string): string {
  const key = config.ENCRYPTION_KEY;
  const text = Buffer.from(encrypted, "base64").toString();
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}
