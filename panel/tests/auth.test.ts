import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  hashApiKey,
  hashDaemonToken,
} from "../src/api/middleware/auth.js";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("s3cr3t-password");
    expect(hash).not.toBe("s3cr3t-password");
    expect(await verifyPassword("s3cr3t-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("key hashing", () => {
  it("is deterministic for API keys", () => {
    const key = "txa_abcdef123456";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(hashApiKey("txa_different"));
  });

  it("is deterministic for daemon tokens", () => {
    const token = "abc.def";
    expect(hashDaemonToken(token)).toBe(hashDaemonToken(token));
  });
});
