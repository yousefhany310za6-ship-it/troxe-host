import { describe, it, expect } from "vitest";
import { matchesCron, matchField } from "../src/services/scheduler.js";

function at(minute: number, hour: number, day: number, month: number): Date {
  // Build a date with explicit local components (month is 1-indexed here, 0-indexed for Date)
  return new Date(2026, month - 1, day, hour, minute, 0, 0);
}

describe("matchField", () => {
  it("matches * for any value", () => {
    expect(matchField("*", 0)).toBe(true);
    expect(matchField("*", 59)).toBe(true);
  });

  it("matches an exact value", () => {
    expect(matchField("5", 5)).toBe(true);
    expect(matchField("5", 6)).toBe(false);
  });

  it("matches comma-separated lists", () => {
    expect(matchField("1,3,5", 3)).toBe(true);
    expect(matchField("1,3,5", 2)).toBe(false);
  });

  it("matches ranges", () => {
    expect(matchField("10-20", 15)).toBe(true);
    expect(matchField("10-20", 21)).toBe(false);
  });

  it("matches steps with *", () => {
    expect(matchField("*/15", 0)).toBe(true);
    expect(matchField("*/15", 30)).toBe(true);
    expect(matchField("*/15", 20)).toBe(false);
  });

  it("matches steps with a range start", () => {
    expect(matchField("5-59/10", 5)).toBe(true);
    expect(matchField("5-59/10", 25)).toBe(true);
    expect(matchField("5-59/10", 16)).toBe(false);
  });

  it("returns false for malformed input", () => {
    expect(matchField("abc")).toBe(false);
  });
});

describe("matchesCron", () => {
  it("returns false for fewer than 5 fields", () => {
    expect(matchesCron("* * *", at(0, 0, 1, 1))).toBe(false);
  });

  it("matches exact minute/hour", () => {
    expect(matchesCron("30 14 * * *", at(30, 14, 1, 1))).toBe(true);
    expect(matchesCron("30 14 * * *", at(31, 14, 1, 1))).toBe(false);
  });

  it("matches wildcard everywhere", () => {
    expect(matchesCron("* * * * *", at(0, 0, 1, 1))).toBe(true);
  });

  it("matches day of month", () => {
    expect(matchesCron("0 0 15 * *", at(0, 0, 15, 1))).toBe(true);
    expect(matchesCron("0 0 15 * *", at(0, 0, 16, 1))).toBe(false);
  });

  it("matches month", () => {
    expect(matchesCron("0 0 * 6 *", at(0, 0, 1, 6))).toBe(true);
    expect(matchesCron("0 0 * 6 *", at(0, 0, 1, 7))).toBe(false);
  });

  it("matches day of week (Sunday as 0 or 7)", () => {
    // 2026-01-04 is a Sunday (dow 0)
    const sunday = new Date(2026, 0, 4, 9, 0, 0);
    expect(matchesCron("0 9 * * 0", sunday)).toBe(true);
    expect(matchesCron("0 9 * * 7", sunday)).toBe(true);
    expect(matchesCron("0 9 * * 1", sunday)).toBe(false);
  });

  it("matches combinations", () => {
    // Jan 5 2026 is a Monday (within 1-5), Jan 10 2026 is a Saturday (outside)
    expect(matchesCron("*/10 9-17 * * 1-5", at(30, 10, 5, 1))).toBe(true);
    expect(matchesCron("*/10 9-17 * * 1-5", at(30, 10, 10, 1))).toBe(false);
  });
});
