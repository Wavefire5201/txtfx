import { describe, it } from "vitest";
import { drawEffectCells, type EffectCanvasLayout } from "./effect-canvas";
import type { GlowCell } from "./renderer";
import { expectGolden } from "@/test/pixel";

// ---------------------------------------------------------------------------
// Golden test for the editor's canvas effect renderer (replaced the DOM
// span/text-shadow overlay). Deterministic input — no effects involved.
// ---------------------------------------------------------------------------

const LAYOUT: EffectCanvasLayout = {
  padLeft: 8,
  padTop: 10,
  charW: 7,
  charH: 12,
  font: "700 12px monospace",
};

function cell(partial: Partial<GlowCell> & Pick<GlowCell, "row" | "col" | "char" | "color">): GlowCell {
  return { brightness: 1, ...partial };
}

describe("drawEffectCells", () => {
  it("renders sprites + glyphs deterministically (golden)", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 130;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0a0a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cells: GlowCell[] = [
      cell({ row: 1, col: 2, char: "@", color: "#00ff41", glowRadius: 14 }),
      cell({ row: 1, col: 3, char: "#", color: "#00ff41", glowRadius: 14, brightness: 0.6 }),
      cell({ row: 4, col: 10, char: "*", color: "#ff4060", glowRadius: 22 }),
      cell({ row: 7, col: 5, char: ".", color: "#60a0ff", glowRadius: 0 }), // no sprite
      cell({ row: 8, col: 20, char: "Z", color: "#ffd060", brightness: 0.25 }), // faint, default radius
      cell({ row: 0, col: 0, char: "X", color: "#ffffff", glowRadius: 8, asciiOverlay: true }),
    ];

    drawEffectCells(ctx, cells, cells.length, LAYOUT);
    // 7th element beyond count must be ignored
    cells.push(cell({ row: 9, col: 1, char: "!", color: "#ff0000", glowRadius: 30 }));
    drawEffectCells(ctx, cells, cells.length - 1, LAYOUT);

    await expectGolden(canvas, "effect-canvas-cells");
  });
});
