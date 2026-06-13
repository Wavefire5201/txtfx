import { describe, it, expect } from "vitest";
import { isExpired, shouldDeleteImage } from "./cleanup";

describe("cleanup helpers", () => {
  const now = new Date("2026-06-13T00:00:00Z");

  it("never expires when retentionDays <= 0", () => {
    const old = new Date("2000-01-01T00:00:00Z");
    expect(isExpired(old, 0, now)).toBe(false);
    expect(isExpired(old, -5, now)).toBe(false);
  });

  it("expires rows older than the retention window", () => {
    const old = new Date("2026-05-01T00:00:00Z"); // ~43 days
    const recent = new Date("2026-06-10T00:00:00Z"); // 3 days
    expect(isExpired(old, 30, now)).toBe(true);
    expect(isExpired(recent, 30, now)).toBe(false);
  });

  it("deletes an image only when no remaining scene references its hash", () => {
    expect(shouldDeleteImage(0)).toBe(true);
    expect(shouldDeleteImage(2)).toBe(false);
  });
});
