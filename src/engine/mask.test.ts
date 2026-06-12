import { describe, it, expect } from "vitest";
import { Mask, IncrementalMaskGrid } from "./mask";
import type { GridInfo } from "./effects/types";
import { mulberry32 } from "@/test/fixtures";

function makeGrid(cols: number, rows: number): GridInfo {
  return { cols, rows, charW: 8, charH: 16, fontSize: 14 };
}

function gridValues(maskGrid: { get(r: number, c: number): number }, cols: number, rows: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push(maskGrid.get(r, c));
  }
  return out;
}

describe("Mask.paintBrush dirty rect", () => {
  it("returns the clamped touched rect", () => {
    const mask = new Mask(100, 80);
    const rect = mask.paintBrush(50, 40, 10, 0, 2);
    expect(rect).toEqual({ x0: 38, y0: 28, x1: 62, y1: 52 });
  });

  it("clamps rects straddling the image edge", () => {
    const mask = new Mask(100, 80);
    const rect = mask.paintBrush(2, 78, 10, 0);
    expect(rect).toEqual({ x0: 0, y0: 68, x1: 12, y1: 79 });
  });

  it("returns null when the stroke is fully outside", () => {
    const mask = new Mask(100, 80);
    expect(mask.paintBrush(-50, -50, 10, 0)).toBeNull();
    expect(mask.paintBrush(500, 40, 10, 0)).toBeNull();
  });
});

describe("IncrementalMaskGrid", () => {
  // The canonical edge-case property test of this phase: incremental updates
  // must EXACTLY equal a fresh full recompute — including strokes outside the
  // image, edge-straddling strokes, and non-divisible grid/image ratios.
  it("matches a fresh toGrid after 50 random strokes (non-divisible ratios)", () => {
    const rand = mulberry32(1234);
    const imgW = 1000;
    const imgH = 700;
    const grid = makeGrid(37, 23);
    const mask = new Mask(imgW, imgH);
    const incremental = new IncrementalMaskGrid(mask, grid, imgW, imgH);

    for (let i = 0; i < 50; i++) {
      const x = Math.floor(rand() * imgW * 1.4) - Math.floor(imgW * 0.2); // some outside
      const y = Math.floor(rand() * imgH * 1.4) - Math.floor(imgH * 0.2);
      const radius = 1 + Math.floor(rand() * 80);
      const radiusY = 1 + Math.floor(rand() * 80);
      const value = rand() < 0.5 ? 0 : 255;
      const feather = rand() < 0.5 ? 0 : Math.floor(rand() * 20);

      const rect = mask.paintBrush(x, y, radius, value, feather, radiusY);
      if (rect) incremental.updateRect(rect);

      const fresh = mask.toGrid(grid, imgW, imgH);
      expect(gridValues(incremental, grid.cols, grid.rows)).toEqual(
        gridValues(fresh, grid.cols, grid.rows),
      );
    }
  });

  it("matches toGrid on a 1x1 grid and a grid larger than the image", () => {
    const mask = new Mask(10, 10);
    mask.paintBrush(5, 5, 3, 0);

    for (const [cols, rows] of [[1, 1], [40, 30]] as const) {
      const grid = makeGrid(cols, rows);
      const incremental = new IncrementalMaskGrid(mask, grid, 10, 10);
      const fresh = mask.toGrid(grid, 10, 10);
      expect(gridValues(incremental, cols, rows)).toEqual(gridValues(fresh, cols, rows));

      const rect = mask.paintBrush(2, 2, 2, 255);
      if (rect) incremental.updateRect(rect);
      const fresh2 = mask.toGrid(grid, 10, 10);
      expect(gridValues(incremental, cols, rows)).toEqual(gridValues(fresh2, cols, rows));
    }
  });
});
