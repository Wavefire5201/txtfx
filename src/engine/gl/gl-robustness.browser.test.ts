import { describe, it, expect } from "vitest";
import { GlyphAtlas } from "./atlas";
import { GlSceneRenderer, textToCodes } from "./renderer";
import { packRGB } from "../cell-buffer";
import type { CompositeBuffers } from "../renderer";
import type { GridInfo } from "../effects/types";

const FONT = { fontSize: 12, fontFamily: "monospace", charW: 7, charH: 12, dpr: 1 };

function makeGl(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("webgl2 required for this test");
  return gl;
}

describe("GlyphAtlas", () => {
  it("reuses slots, handles emoji, and survives a forced reset when full", () => {
    const atlas = new GlyphAtlas(makeGl(), FONT);
    const a1 = atlas.slotOf(65);
    const a2 = atlas.slotOf(65);
    expect(a2).toBe(a1);
    const fire = atlas.slotOf("🔥".codePointAt(0)!);
    expect(fire).not.toBe(a1);

    // Fill beyond capacity — must reset and keep serving slots, not throw
    const capacity = atlas.capacity;
    for (let i = 0; i < capacity + 10; i++) atlas.slotOf(0x4e00 + i);
    expect(atlas.slotOf(66)).toBeGreaterThanOrEqual(0);
    atlas.dispose();
  });

  it("reconfigure clears slot assignments (font change invalidates rasters)", () => {
    const atlas = new GlyphAtlas(makeGl(), FONT);
    const before = atlas.slotOf(90);
    atlas.slotOf(91);
    atlas.configure({ ...FONT, fontSize: 20 });
    expect(atlas.slotOf(91)).toBe(0); // fresh numbering after reconfigure
    expect(atlas.slotOf(90)).toBe(1);
    expect(before).toBe(0);
    atlas.dispose();
  });
});

describe("GL context loss", () => {
  it("recovers after loseContext/restoreContext and renders again", async () => {
    const canvas = document.createElement("canvas");
    const renderer = new GlSceneRenderer(canvas);
    renderer.setViewport(140, 96, 1);
    renderer.setFont(FONT);
    renderer.setSceneOptions({ baseColor: packRGB(220, 230, 255), baseAlpha: 0.8, blendMode: "screen" });

    const grid: GridInfo = { cols: 20, rows: 8, charW: 7, charH: 12, fontSize: 12, padX: 0, padY: 0 };
    const total = grid.cols * grid.rows;
    const composite: CompositeBuffers = {
      cellCodes: new Uint32Array(total),
      cellColors: new Uint32Array(total),
      asciiCodes: new Uint32Array(total),
      brightness: new Float32Array(total),
      glowRadius: new Float64Array(total).fill(-1),
    };
    composite.cellCodes[5] = 64; // "@"
    composite.cellColors[5] = packRGB(255, 64, 96);
    composite.brightness[5] = 1;
    composite.glowRadius[5] = 10;
    const baseCodes = textToCodes("hello world test grid", grid.cols, grid.rows);

    function renderAndSample(): boolean {
      renderer.renderFrame({ grid, baseCodes, composite });
      const probe = document.createElement("canvas");
      probe.width = canvas.width;
      probe.height = canvas.height;
      const ctx = probe.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let nonZero = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 0) nonZero++;
      return nonZero > 20;
    }

    expect(renderAndSample()).toBe(true);

    const gl = canvas.getContext("webgl2")!;
    const lose = gl.getExtension("WEBGL_lose_context");
    if (!lose) return; // extension unavailable — nothing to drill
    lose.loseContext();
    await new Promise((r) => setTimeout(r, 50));
    expect(renderer.isContextLost()).toBe(true);
    // renderFrame while lost must be a no-op, not a crash
    renderer.renderFrame({ grid, baseCodes, composite });

    lose.restoreContext();
    await new Promise((r) => setTimeout(r, 100));
    expect(renderer.isContextLost()).toBe(false);
    expect(renderAndSample()).toBe(true);
    renderer.dispose();
  });
});
