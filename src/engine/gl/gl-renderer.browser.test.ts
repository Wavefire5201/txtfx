import { describe, it, expect } from "vitest";
import { prepareExportContext, renderFrame, getFrameDelta, getFrameTime } from "../export/video";
import { compositeFrame } from "../renderer";
import { normalizeToCanvasSource } from "../canvas-util";
import { packRGB } from "../cell-buffer";
import { GlSceneRenderer, textToCodes } from "./renderer";
import { fixtureScenes, loadTestImage } from "@/test/fixtures";
import { expectGolden } from "@/test/pixel";

// ---------------------------------------------------------------------------
// GL renderer vs the Canvas2D export pipeline (the oracle).
// Same seeded scene stepped identically through both pipelines, then compared
// two ways:
//  - STRICT structural: mean color of each grid cell must agree closely
//    (catches alignment, color, blend bugs without flagging glyph AA)
//  - LOOSE global: overall MSE bound (catches chaos the cell means average out)
// ---------------------------------------------------------------------------

const W = 320;
const H = 200;
const FRAMES = 31; // 1s at 30fps

async function renderOracle(scene: ReturnType<typeof fixtureScenes.effects>) {
  const img = await loadTestImage(W, H);
  const ec = await prepareExportContext(scene, img, null, W, H);
  for (let f = 0; f < FRAMES; f++) renderFrame(ec, getFrameDelta(f, 30), getFrameTime(f, 30));
  return ec;
}

async function renderGl(scene: ReturnType<typeof fixtureScenes.effects>) {
  // Fresh context — Phase 6 determinism guarantees identical effect state
  const img = await loadTestImage(W, H);
  const ec = await prepareExportContext(scene, img, null, W, H);

  const canvas = document.createElement("canvas");
  const gl = new GlSceneRenderer(canvas);
  gl.setViewport(W, H, 1);
  gl.setFont({
    fontSize: ec.fontSize,
    fontFamily: ec.fontFamily,
    charW: ec.grid.charW,
    charH: ec.grid.charH,
    dpr: 1,
  });
  gl.setBackdrop(normalizeToCanvasSource(ec.image));
  gl.setSceneOptions({
    baseColor: packRGB(ec.asciiColorRgb[0], ec.asciiColorRgb[1], ec.asciiColorRgb[2]),
    baseAlpha: ec.asciiOpacity,
    blendMode: ec.asciiBlendMode,
  });

  const baseCodes = textToCodes(ec.baseText, ec.grid.cols, ec.grid.rows);
  let buffers = null;
  for (let f = 0; f < FRAMES; f++) {
    const result = compositeFrame(
      ec.activeEffects, getFrameDelta(f, 30), getFrameTime(f, 30),
      ec.maskGrid, ec.grid, ec.baseText,
      { buildText: false, exposeBuffers: true },
    );
    buffers = result.buffers!;
  }
  gl.renderFrame({ grid: ec.grid, baseCodes, composite: buffers! });
  return { canvas, grid: ec.grid };
}

function toImageData(canvas: HTMLCanvasElement): ImageData {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

interface CellDiff {
  maxCellDiff: number;
  badCells: number;
  mse: number;
}

function compareStructural(a: ImageData, b: ImageData, grid: { cols: number; rows: number; charW: number; charH: number; padX?: number; padY?: number }): CellDiff {
  // Mean color per grid cell
  function cellMeans(img: ImageData): Float64Array {
    const means = new Float64Array(grid.cols * grid.rows * 3);
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const x0 = Math.floor((grid.padX ?? 0) + c * grid.charW);
        const y0 = Math.floor((grid.padY ?? 0) + r * grid.charH);
        const x1 = Math.min(img.width, Math.floor(x0 + grid.charW));
        const y1 = Math.min(img.height, Math.floor(y0 + grid.charH));
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2];
            n++;
          }
        }
        const o = (r * grid.cols + c) * 3;
        if (n > 0) { means[o] = sr / n; means[o + 1] = sg / n; means[o + 2] = sb / n; }
      }
    }
    return means;
  }
  const ma = cellMeans(a);
  const mb = cellMeans(b);
  let maxCellDiff = 0;
  let badCells = 0;
  for (let i = 0; i < ma.length; i += 3) {
    const d = Math.max(Math.abs(ma[i] - mb[i]), Math.abs(ma[i + 1] - mb[i + 1]), Math.abs(ma[i + 2] - mb[i + 2]));
    if (d > maxCellDiff) maxCellDiff = d;
    if (d > 28) badCells++;
  }
  let sumSq = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = a.data[i] - b.data[i];
    sumSq += d * d;
  }
  return { maxCellDiff, badCells, mse: sumSq / a.data.length };
}

describe("GL renderer vs Canvas2D oracle", () => {
  it.each([
    ["effects", fixtureScenes.effects] as const,
    ["applyToAscii", fixtureScenes.applyToAscii] as const,
    ["baseOnly", fixtureScenes.baseOnly] as const,
  ])("matches the 2D pipeline structurally: %s", async (_name, makeScene) => {
    const oracle = await renderOracle(makeScene());
    const glResult = await renderGl(makeScene());

    const a = toImageData(oracle.canvas as HTMLCanvasElement);
    const b = toImageData(glResult.canvas);
    const stats = compareStructural(a, b, glResult.grid);

    // STRICT: no grid cell's mean color may diverge meaningfully — this is
    // the correctness check (alignment, colors, blending, missing glyphs).
    expect(stats.badCells, `cells over threshold (maxCellDiff=${stats.maxCellDiff.toFixed(1)}, mse=${stats.mse.toFixed(1)})`).toBeLessThanOrEqual(Math.ceil(glResult.grid.cols * glResult.grid.rows * 0.002));
    // LOOSE chaos backstop only: the supersampled atlas intentionally renders
    // crisper glyph edges than the 2D rasterizer, so per-pixel error sits
    // around ~800 on text-dense frames; total garbage lands in the thousands.
    expect(stats.mse).toBeLessThan(1200);
  });

  it("GL frame golden (effects fixture at 1s)", async () => {
    const { canvas } = await renderGl(fixtureScenes.effects());
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")!.drawImage(canvas, 0, 0);
    await expectGolden(copy, "gl-effects-1s");
  });
});
