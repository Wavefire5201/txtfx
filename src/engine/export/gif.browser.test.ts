import { describe, it, expect, afterEach } from "vitest";
import { buildGlobalGifPalette, exportGif } from "./gif";
import { makeScene, makeEffect, loadTestImage, seedMathRandom } from "@/test/fixtures";

const W = 160;
const H = 100;

let restoreRandom: (() => void) | null = null;
afterEach(() => {
  restoreRandom?.();
  restoreRandom = null;
});

/** Scene whose only red content (a firework) first appears at t=2s. */
function lateRedFireworkScene() {
  const scene = makeScene({
    effects: [
      makeEffect(
        "firework",
        { intervalMin: 0.2, intervalMax: 0.2, particleCount: 80, colors: ["#ff0000"], glowRadius: 20 },
        { timeline: { start: 2, end: null, mode: "continuous" } },
      ),
    ],
  });
  scene.playback.duration = 4;
  return scene;
}

describe("GIF export", () => {
  it("global palette includes colors that first appear mid-timeline", async () => {
    restoreRandom = seedMathRandom(42);
    const img = await loadTestImage(W, H);
    const palette = await buildGlobalGifPalette(lateRedFireworkScene(), img, null, {
      width: W,
      height: H,
      duration: 4,
      maxColors: 64,
      colorFormat: "rgb444",
    });
    // The backdrop is blue/gray; strongly red entries can only come from the
    // firework — which is invisible in frame 0 (the old palette source).
    const hasRed = palette.some(([r, g, b]) => r > 120 && r > g + 60 && r > b + 60);
    expect(hasRed).toBe(true);
  });

  it("exports byte-identical GIFs for the same seeded scene (reproducible exports)", async () => {
    // No Math.random stubbing — determinism must come from scene seeding alone.
    const img = await loadTestImage(W, H);
    const scene = lateRedFireworkScene();
    const opts = { width: W, height: H, fps: 5, maxColors: 32, maxDuration: 2 } as const;
    const a = await exportGif(scene, img, null, opts);
    const b = await exportGif(scene, img, null, opts);
    expect(a.size).toBe(b.size);
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array(await b.arrayBuffer()));
  });

  it("exports a GIF end-to-end with monotonic progress", async () => {
    restoreRandom = seedMathRandom(42);
    const img = await loadTestImage(W, H);
    const progress: number[] = [];
    const blob = await exportGif(lateRedFireworkScene(), img, null, {
      width: W,
      height: H,
      fps: 5,
      maxColors: 32,
      maxDuration: 2,
      onProgress: (pct) => progress.push(pct),
    });
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/gif");
    expect(progress.at(-1)).toBe(1);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });
});
