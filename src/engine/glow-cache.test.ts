import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock OffscreenCanvas and canvas context before importing glow-cache
class MockCanvasCtx {
  fillStyle = "";
  fillRect() {}
  createRadialGradient() {
    return {
      addColorStop() {},
    };
  }
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return new MockCanvasCtx();
  }
}

vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

// Now import glow-cache (after mocks are in place)
const { getGlowSprite, clearGlowCache, glowCacheSize } = await import(
  "./glow-cache"
);

describe("glow-cache", () => {
  beforeEach(() => {
    clearGlowCache();
  });

  it("getGlowSprite returns object with correct dimensions", () => {
    const sprite = getGlowSprite(255, 0, 0, 10, 0.8);
    expect(sprite).toBeDefined();
    // radius=10 -> size = 10*2 = 20
    expect(sprite.width).toBe(20);
    expect(sprite.height).toBe(20);
  });

  it("same params return cached (referentially identical) sprite", () => {
    const a = getGlowSprite(255, 0, 0, 10, 0.8);
    const b = getGlowSprite(255, 0, 0, 10, 0.8);
    expect(a).toBe(b);
    expect(glowCacheSize()).toBe(1);
  });

  it("different brightness levels produce different sprites", () => {
    const dim = getGlowSprite(255, 0, 0, 10, 0.1);
    const bright = getGlowSprite(255, 0, 0, 10, 0.9);
    expect(dim).not.toBe(bright);
  });

  it("quantization maps close values to same sprite", () => {
    // BRIGHTNESS_LEVELS = 16, step = 1/15 ~= 0.0667
    // 0.50 and 0.52 should both quantize to the same bucket
    const a = getGlowSprite(100, 100, 100, 10, 0.5);
    const b = getGlowSprite(100, 100, 100, 10, 0.52);
    expect(a).toBe(b);
  });

  it("quantization separates distant values", () => {
    const a = getGlowSprite(100, 100, 100, 10, 0.2);
    const b = getGlowSprite(100, 100, 100, 10, 0.8);
    expect(a).not.toBe(b);
  });

  it("clearGlowCache empties the cache", () => {
    getGlowSprite(255, 0, 0, 10, 0.5);
    getGlowSprite(0, 255, 0, 20, 0.7);
    expect(glowCacheSize()).toBe(2);

    clearGlowCache();
    expect(glowCacheSize()).toBe(0);
  });

  it("different colors produce different sprites", () => {
    const red = getGlowSprite(255, 0, 0, 10, 0.5);
    const green = getGlowSprite(0, 255, 0, 10, 0.5);
    expect(red).not.toBe(green);
  });

  it("different radii produce different sprites", () => {
    const small = getGlowSprite(255, 0, 0, 5, 0.5);
    const large = getGlowSprite(255, 0, 0, 15, 0.5);
    expect(small).not.toBe(large);
    expect(small.width).toBe(10);
    expect(large.width).toBe(30);
  });

  it("radius 0 is treated as 1", () => {
    const sprite = getGlowSprite(255, 0, 0, 0, 0.5);
    // radius 0 -> recurses with radius 1 -> qRadius=1, size=2
    expect(sprite.width).toBe(2);
    expect(sprite.height).toBe(2);
  });
});
