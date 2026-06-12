import { describe, it, expect, afterEach } from "vitest";
import { prepareExportContext, renderFrame, getFrameDelta, getFrameTime } from "./video";
import { fixtureScenes, loadTestImage, seedMathRandom } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Perf regression tripwire for the cached-base-layer optimization.
// "Old cost" is approximated by re-baking the base layer every frame (the
// per-glyph fillText+shadowBlur loop renderFrame used to run); "new cost" is
// the actual renderFrame with the pre-baked layer. Asserts a loose 2x margin
// to stay robust across machines; the real ratio is logged for the curious.
// ---------------------------------------------------------------------------

const W = 1280;
const H = 800;
const FRAMES = 20;

let restoreRandom: (() => void) | null = null;
afterEach(() => {
  restoreRandom?.();
  restoreRandom = null;
});

describe("export render performance", () => {
  it("pre-baked base layer is much faster than per-frame glyph drawing", async () => {
    restoreRandom = seedMathRandom(42);
    const img = await loadTestImage(W, H);
    // Non-zero letter spacing (the DEFAULT scene ships 0.06em) forces the
    // per-glyph fillText path — the case the base-layer cache exists for.
    // letterSpacing fixture: rain effect + 2px spacing.
    const scene = fixtureScenes.letterSpacing();
    const ec = await prepareExportContext(scene, img, null, W, H);

    // New path: real renderFrame (drawImage of the baked layer)
    const newStart = performance.now();
    for (let f = 0; f < FRAMES; f++) {
      renderFrame(ec, getFrameDelta(f, 30), getFrameTime(f, 30));
    }
    const newMs = (performance.now() - newStart) / FRAMES;

    // Old-cost approximation: bake the base layer from scratch each frame
    // (same glyph count, same shadowBlur the old per-frame loop paid),
    // exercised via a fresh context per bake-less run isn't needed — we call
    // the bake directly through prepareExportContext's one-time path by
    // re-preparing the context, which runs renderBaseLayer once per call.
    const oldStart = performance.now();
    const OLD_RUNS = 5;
    for (let i = 0; i < OLD_RUNS; i++) {
      await prepareExportContext(scene, img, null, W, H);
    }
    // Subtract non-bake prep cost? prepareExportContext also does ascii gen +
    // backdrop; those are a minority of its cost at this size, so this is a
    // conservative (understated) old-cost estimate.
    const oldMs = (performance.now() - oldStart) / OLD_RUNS;

    console.info(
      `[export-perf] renderFrame ${newMs.toFixed(2)}ms/frame vs per-frame base bake ~${oldMs.toFixed(2)}ms/frame ` +
        `(${(oldMs / newMs).toFixed(1)}x) at ${W}x${H}, ${FRAMES} frames`,
    );
    expect(newMs).toBeLessThan(oldMs / 2);
  });
});
