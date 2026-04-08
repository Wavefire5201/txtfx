import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

interface Drop {
  col: number;
  y: number;
  speed: number;
  length: number;
  color: string;
}

export class RainEffect implements AsciiEffect {
  type = "rain";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private drops: Drop[] = [];
  private density = 0.3;
  private speedMin = 15;
  private speedMax = 35;
  private wind = 0;
  private spawnAccum = 0;
  private spawnCounter = 0;
  private colors: string[] = ["#88bbee"];
  private colorMode: ColorMode = "random";
  private glowRadius = 10;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.density = (params.density as number) ?? 0.3;
    this.speedMin = (params.speedMin as number) ?? 15;
    this.speedMax = (params.speedMax as number) ?? 35;
    this.wind = (params.wind as number) ?? 0;
    this.colors = readColors(params, "#88bbee");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 10;
    this.drops = [];
    this.spawnAccum = 0;
    this.spawnCounter = 0;
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    // Spawn new drops with fractional accumulation
    this.spawnAccum += cols * this.density * dt;
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter;
      this.drops.push({
        col: Math.floor(Math.random() * cols),
        y: -1,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        length: 2 + Math.floor(Math.random() * 3),
        color: pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
      });
      this.spawnCounter++;
    }

    // Update drops
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.speed * dt;
      d.col += this.wind * dt;

      if (d.y - d.length > rows) {
        this.drops[i] = this.drops[this.drops.length - 1];
        this.drops.pop();
        continue;
      }

      const headRow = Math.floor(d.y);
      const col = Math.round(d.col);
      for (let j = 0; j < d.length; j++) {
        const r = headRow - j;
        if (r < 0 || r >= rows || col < 0 || col >= cols) continue;
        const ch = j === 0 ? "|" : j === 1 ? ":" : ".";
        cells.push({ row: r, col, char: ch, brightness: 1 - j / d.length, color: d.color, glowRadius: this.glowRadius });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "density", label: "Density", type: "slider", min: 0.05, max: 1, step: 0.05, defaultValue: 0.3 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 5, max: 30, step: 1, defaultValue: 15 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 10, max: 60, step: 1, defaultValue: 35 },
      { key: "wind", label: "Wind", type: "slider", min: -10, max: 10, step: 0.5, defaultValue: 0 },
      ...colorControls("#88bbee"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 10 },
    ];
  }
}
