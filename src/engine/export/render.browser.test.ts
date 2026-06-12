import { describe, it, afterEach } from "vitest";
import { prepareExportContext, renderFrame, getFrameDelta, getFrameTime } from "./video";
import { fixtureScenes, loadTestImage, seedMathRandom } from "@/test/fixtures";
import { expectGolden } from "@/test/pixel";

// ---------------------------------------------------------------------------
// Golden-frame smoke tests for the export render pipeline (real Canvas2D).
// Effects are Math.random-driven until the deterministic-effects phase, so
// every test seeds Math.random for reproducibility.
// ---------------------------------------------------------------------------

const W = 320;
const H = 200;

let restoreRandom: (() => void) | null = null;
afterEach(() => {
  restoreRandom?.();
  restoreRandom = null;
});

async function renderScene(scene: ReturnType<typeof fixtureScenes.baseOnly>, frames: number) {
  const img = await loadTestImage(W, H);
  const ec = await prepareExportContext(scene, img, null, W, H);
  const fps = 30;
  for (let f = 0; f < frames; f++) {
    renderFrame(ec, getFrameDelta(f, fps), getFrameTime(f, fps));
  }
  return ec;
}

describe("export renderFrame goldens", () => {
  it("base text + backdrop only", async () => {
    restoreRandom = seedMathRandom(42);
    const ec = await renderScene(fixtureScenes.baseOnly(), 1);
    await expectGolden(ec.canvas, "export-base-only");
  });

  it("colored effects with glow after 1s", async () => {
    restoreRandom = seedMathRandom(42);
    const ec = await renderScene(fixtureScenes.effects(), 31);
    await expectGolden(ec.canvas, "export-effects-1s");
  });

  it("applyToAscii hole-punching after 1s", async () => {
    restoreRandom = seedMathRandom(42);
    const ec = await renderScene(fixtureScenes.applyToAscii(), 31);
    await expectGolden(ec.canvas, "export-apply-to-ascii-1s");
  });

  it("non-zero letter spacing (per-cell text path)", async () => {
    restoreRandom = seedMathRandom(42);
    const ec = await renderScene(fixtureScenes.letterSpacing(), 16);
    await expectGolden(ec.canvas, "export-letter-spacing");
  });

  it("transparent overlay mode", async () => {
    restoreRandom = seedMathRandom(42);
    const img = await loadTestImage(W, H);
    const ec = await prepareExportContext(fixtureScenes.effects(), img, null, W, H);
    for (let f = 0; f < 16; f++) {
      renderFrame(ec, getFrameDelta(f, 30), getFrameTime(f, 30), { transparent: true });
    }
    await expectGolden(ec.canvas, "export-transparent");
  });
});
