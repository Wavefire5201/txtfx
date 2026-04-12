import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

interface Star {
  c: number;
  r: number;
  phase: number;
  speed: number;
  big: boolean;
  color: string;
  colorIdx: number;
}

export class TwinkleEffect implements AsciiEffect {
  type = "twinkle";
  private stars: Star[] = [];
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private count = 50;
  private speedMin = 0.5;
  private speedMax = 2.3;
  private bigChance = 0.35;
  private colors: string[] = ["#ffffff"];
  private prevColors: string[] = ["#ffffff"];
  private colorMode: ColorMode = "random";
  private prevColorMode: ColorMode = "random";
  private glowRadius = 18;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const newCount = (params.count as number) ?? 50;
    const needsRegen = this.grid.cols === 0
      || newCount !== this.count
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.grid = grid;
    this.count = newCount;
    this.speedMin = (params.speedMin as number) ?? 0.5;
    this.speedMax = (params.speedMax as number) ?? 2.3;
    this.bigChance = (params.bigChance as number) ?? 0.35;
    this.colors = readColors(params, "#ffffff");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 18;

    if (needsRegen) {
      // Structural change — regenerate all stars
      this.stars = Array.from({ length: this.count }, (_, i) => {
        const colorIdx = this.colorMode === "random"
          ? Math.floor(Math.random() * this.colors.length)
          : i;
        return {
          c: Math.floor(Math.random() * grid.cols),
          r: Math.floor(Math.random() * grid.rows),
          phase: Math.random() * Math.PI * 2,
          speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
          big: Math.random() < this.bigChance,
          color: pickColor(this.colors, this.colorMode, colorIdx),
          colorIdx,
        };
      });
    } else {
      // Visual change — update colors. Only reassign colorIdx if palette or mode changed.
      const paletteChanged = this.colors.length !== this.prevColors.length
        || this.colors.some((c, i) => c !== this.prevColors[i])
        || this.colorMode !== this.prevColorMode;
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        if (paletteChanged) {
          s.colorIdx = this.colorMode === "random"
            ? Math.floor(Math.random() * this.colors.length)
            : i;
        }
        s.color = pickColor(this.colors, this.colorMode, s.colorIdx);
      }
    }
    this.prevColors = [...this.colors];
    this.prevColorMode = this.colorMode;
  }

  update(_dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const cells = this._cells; cells.length = 0;
    for (const s of this.stars) {
      const pulse = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
      if (pulse < 0.25) continue;
      // For gradient mode, use pulse phase as t
      const color = this.colorMode === "gradient"
        ? pickColor(this.colors, this.colorMode, s.colorIdx, pulse)
        : s.color;
      const ch = pulse > 0.85 ? "*" : pulse > 0.6 ? "+" : "\u00B7";
      cells.push({ row: s.r, col: s.c, char: ch, brightness: pulse, color, glowRadius: this.glowRadius });
      if (s.big && pulse > 0.6) {
        if (s.c - 1 >= 0) cells.push({ row: s.r, col: s.c - 1, char: ".", brightness: pulse * 0.5, color, glowRadius: this.glowRadius * 0.6 });
        if (s.c + 1 < this.grid.cols) cells.push({ row: s.r, col: s.c + 1, char: ".", brightness: pulse * 0.5, color, glowRadius: this.glowRadius * 0.6 });
        if (pulse > 0.9 && s.r - 1 >= 0) {
          cells.push({ row: s.r - 1, col: s.c, char: ".", brightness: pulse * 0.3, color, glowRadius: this.glowRadius * 0.4 });
        }
      }
    }
    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "count", label: "Star count", type: "slider", min: 10, max: 200, step: 1, defaultValue: 50 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 0.1, max: 2, step: 0.1, defaultValue: 0.5 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 0.5, max: 5, step: 0.1, defaultValue: 2.3 },
      { key: "bigChance", label: "Big star %", type: "slider", min: 0, max: 1, step: 0.05, defaultValue: 0.35 },
      ...colorControls("#ffffff"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 18 },
    ];
  }
}
