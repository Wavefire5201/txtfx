import { describe, it, expect } from "vitest";
import { CORS_HEADERS, IMMUTABLE_CACHE, mergeCorsHeaders } from "./http";

describe("http helpers", () => {
  it("CORS headers allow cross-origin GET", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
    expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("immutable cache marks the response cacheable forever", () => {
    expect(IMMUTABLE_CACHE).toContain("immutable");
    expect(IMMUTABLE_CACHE).toContain("max-age=");
  });

  it("mergeCorsHeaders overlays extra headers without losing CORS", () => {
    const merged = mergeCorsHeaders({ "Cache-Control": IMMUTABLE_CACHE });
    expect(merged["Access-Control-Allow-Origin"]).toBe("*");
    expect(merged["Cache-Control"]).toBe(IMMUTABLE_CACHE);
  });
});
