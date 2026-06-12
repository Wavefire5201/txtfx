import type { AsciiEffect, GridInfo, MaskGrid, ControlDescriptor } from "./types";
import { type ColorMode, pickColorPacked, readColorsPacked, readColorMode, colorControls } from "./color-util";
import { type CellBuffer } from "../cell-buffer";
import { mulberry32, readSeed } from "../prng";

export class ScanlineEffect implements AsciiEffect {
  type = "scanline";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private speed = 8;
  private width = 2;
  private brightness = 1;
  private count = 1;
  private colors: number[] = [];
  private colorMode: ColorMode = "random";
  private glowRadius = 16;
  private chars = "=-~";
  private seed = 1;
  private rng: () => number = mulberry32(1);

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newSeed = readSeed(params);
    const needsRegen = this.grid.cols === 0
      || newSeed !== this.seed
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.grid = grid;
    this.speed = (params.speed as number) ?? 8;
    this.width = (params.width as number) ?? 2;
    this.brightness = (params.brightness as number) ?? 1;
    this.count = (params.count as number) ?? 1;
    this.seed = newSeed;
    this.colors = readColorsPacked(params, "#88ccff");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 16;
    this.chars = (params.chars as string) ?? "=-~";

    if (needsRegen) this.regen();
  }

  private regen(): void {
    this.rng = mulberry32(this.seed);
  }

  reset(): void {
    this.regen();
  }

  update(_dt: number, time: number, _mask: MaskGrid, out: CellBuffer): void {
    const { cols, rows } = this.grid;

    for (let s = 0; s < this.count; s++) {
      // Each scanline is offset evenly across the grid height
      const phase = (s / this.count) * rows;
      const headRow = ((time * this.speed + phase) % (rows + this.width)) - this.width;

      // Pick color per scanline
      const baseColor = pickColorPacked(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode,
        this.colorMode === "random" ? Math.floor(this.rng() * this.colors.length) : s);

      for (let w = 0; w < this.width; w++) {
        const r = Math.floor(headRow + w);
        if (r < 0 || r >= rows) continue;

        // Brightness fades from head (brightest) to tail
        const t = w / this.width;
        const b = this.brightness * (1 - t * 0.6);
        const ch = this.chars[Math.min(w, this.chars.length - 1)] || "=";
        const chCode = ch.codePointAt(0)!;
        // Glow only on the leading row — emitting one glow sprite per cell × width
        // tanks performance on wide grids
        const gr = w === 0 ? this.glowRadius : 0;

        for (let c = 0; c < cols; c++) {
          // Slow CRT-like horizontal undulation, gentle amplitude
          const flicker = Math.sin(c * 0.4 + time * 5 + s * 3) * 0.1;
          const finalB = Math.max(0.1, b + flicker);
          // For gradient mode, gradient across width
          const color = this.colorMode === "gradient"
            ? pickColorPacked(this.colors, this.colorMode, 0, c / cols)
            : baseColor;
          out.push(r, c, chCode, finalB, color, gr);
        }
      }
    }
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "speed", label: "Speed", type: "slider", min: 1, max: 20, step: 0.5, defaultValue: 8 },
      { key: "width", label: "Line width", type: "slider", min: 1, max: 8, step: 1, defaultValue: 2 },
      { key: "count", label: "Line count", type: "slider", min: 1, max: 5, step: 1, defaultValue: 1 },
      { key: "brightness", label: "Brightness", type: "slider", min: 0.2, max: 1, step: 0.05, defaultValue: 1 },
      ...colorControls("#88ccff"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 16 },
    ];
  }
}
