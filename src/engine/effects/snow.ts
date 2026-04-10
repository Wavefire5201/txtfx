import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

interface Flake {
  col: number;
  y: number;
  speed: number;
  drift: number;
  phase: number;
  char: string;
  color: string;
}

const SNOW_CHARS = ["*", "\u00B7", "."];

export class SnowEffect implements AsciiEffect {
  type = "snow";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private flakes: Flake[] = [];
  private density = 0.15;
  private speedMin = 3;
  private speedMax = 8;
  private driftAmount = 2;
  private spawnAccum = 0;
  private spawnCounter = 0;
  private colors: string[] = ["#ffffff"];
  private colorMode: ColorMode = "random";
  private glowRadius = 12;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    const needsRegen = this.flakes.length === 0
      || grid.cols !== this.grid.cols
      || grid.rows !== this.grid.rows;

    this.density = (params.density as number) ?? 0.15;
    this.speedMin = (params.speedMin as number) ?? 3;
    this.speedMax = (params.speedMax as number) ?? 8;
    this.driftAmount = (params.driftAmount as number) ?? 2;
    this.colors = readColors(params, "#ffffff");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 12;
    this.grid = grid;

    if (needsRegen) {
      this.flakes = [];
      this.spawnAccum = 0;
      this.spawnCounter = 0;
    }
  }

  update(dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;

    this.spawnAccum += cols * this.density * dt;
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter;
      this.flakes.push({
        col: Math.random() * cols,
        y: -1,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        drift: this.driftAmount * (Math.random() - 0.5) * 2,
        phase: Math.random() * Math.PI * 2,
        char: SNOW_CHARS[Math.floor(Math.random() * SNOW_CHARS.length)],
        color: pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
      });
      this.spawnCounter++;
    }

    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const f = this.flakes[i];
      f.y += f.speed * dt;
      f.col += Math.sin(time * 1.5 + f.phase) * f.drift * dt;

      if (f.y > rows) {
        this.flakes[i] = this.flakes[this.flakes.length - 1];
        this.flakes.pop();
        continue;
      }

      const r = Math.floor(f.y);
      const c = Math.round(f.col);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        cells.push({ row: r, col: c, char: f.char, brightness: 0.7, color: f.color, glowRadius: this.glowRadius });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "density", label: "Density", type: "slider", min: 0.02, max: 0.5, step: 0.02, defaultValue: 0.15 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 1, max: 10, step: 0.5, defaultValue: 3 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 3, max: 20, step: 0.5, defaultValue: 8 },
      { key: "driftAmount", label: "Drift", type: "slider", min: 0, max: 5, step: 0.5, defaultValue: 2 },
      ...colorControls("#ffffff"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 12 },
    ];
  }
}
