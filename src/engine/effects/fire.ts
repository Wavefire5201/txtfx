import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";
import { type ColorMode, pickColor, readColors, readColorMode, colorControls } from "./color-util";

interface Ember {
  col: number;
  y: number;
  speed: number;
  life: number;
  maxLife: number;
  color: string;
  colorIdx: number;
}

const FIRE_RAMP = ["@", "#", "*", "+", ".", " "];

export class FireEffect implements AsciiEffect {
  type = "fire";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private embers: Ember[] = [];
  private intensity = 0.5;
  private height = 0.3;
  private spread = 1.5;
  private spawnAccum = 0;
  private spawnCounter = 0;
  private colors: string[] = ["#ff6622"];
  private colorMode: ColorMode = "random";
  private glowRadius = 16;
  private _cells: EffectCell[] = [];

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.intensity = (params.intensity as number) ?? 0.5;
    this.height = (params.height as number) ?? 0.3;
    this.spread = (params.spread as number) ?? 1.5;
    this.colors = readColors(params, "#ff6622");
    this.colorMode = readColorMode(params);
    this.glowRadius = (params.glowRadius as number) ?? 16;
    this.embers = [];
    this.spawnAccum = 0;
    this.spawnCounter = 0;
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells = this._cells; cells.length = 0;
    const baseRow = rows - 1;

    // Spawn embers with fractional accumulation
    this.spawnAccum += cols * this.intensity * dt * 3;
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      const idx = this.colorMode === "random"
        ? Math.floor(Math.random() * this.colors.length)
        : this.spawnCounter;
      this.embers.push({
        col: Math.random() * cols,
        y: baseRow + Math.random(),
        speed: 5 + Math.random() * 10,
        life: 0,
        maxLife: 0.5 + Math.random() * 1.5 * this.height,
        color: pickColor(this.colors, this.colorMode === "gradient" ? "random" : this.colorMode, idx),
        colorIdx: idx,
      });
      this.spawnCounter++;
    }

    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life += dt;
      e.y -= e.speed * dt;
      e.col += (Math.random() - 0.5) * this.spread * dt * 5;

      if (e.life > e.maxLife) {
        this.embers[i] = this.embers[this.embers.length - 1];
        this.embers.pop();
        continue;
      }

      const t = e.life / e.maxLife;
      const rampIdx = Math.min(Math.floor(t * (FIRE_RAMP.length - 1)), FIRE_RAMP.length - 1);
      const ch = FIRE_RAMP[rampIdx];
      if (ch === " ") continue;

      const r = Math.round(e.y);
      const c = Math.round(e.col);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        // For gradient mode, use lifecycle position
        const color = this.colorMode === "gradient"
          ? pickColor(this.colors, this.colorMode, e.colorIdx, t)
          : e.color;
        cells.push({ row: r, col: c, char: ch, brightness: 1 - t, color, glowRadius: this.glowRadius });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "intensity", label: "Intensity", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.5 },
      { key: "height", label: "Height", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.3 },
      { key: "spread", label: "Spread", type: "slider", min: 0, max: 5, step: 0.5, defaultValue: 1.5 },
      ...colorControls("#ff6622"),
      { key: "glowRadius", label: "Glow radius", type: "slider", min: 0, max: 40, step: 1, defaultValue: 16 },
    ];
  }
}
