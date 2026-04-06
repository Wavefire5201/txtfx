import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

interface Ember {
  col: number;
  y: number;
  speed: number;
  life: number;
  maxLife: number;
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
  private color = "#ff6622";

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.intensity = (params.intensity as number) ?? 0.5;
    this.height = (params.height as number) ?? 0.3;
    this.spread = (params.spread as number) ?? 1.5;
    this.color = (params.color as string) ?? "#ff6622";
    this.embers = [];
    this.spawnAccum = 0;
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells: EffectCell[] = [];
    const baseRow = rows - 1;

    // Spawn embers with fractional accumulation
    this.spawnAccum += cols * this.intensity * dt * 3;
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      this.embers.push({
        col: Math.random() * cols,
        y: baseRow + Math.random(),
        speed: 5 + Math.random() * 10,
        life: 0,
        maxLife: 0.5 + Math.random() * 1.5 * this.height,
      });
    }

    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.life += dt;
      e.y -= e.speed * dt;
      e.col += (Math.random() - 0.5) * this.spread * dt * 5;

      if (e.life > e.maxLife) {
        this.embers.splice(i, 1);
        continue;
      }

      const t = e.life / e.maxLife;
      const rampIdx = Math.min(Math.floor(t * (FIRE_RAMP.length - 1)), FIRE_RAMP.length - 1);
      const ch = FIRE_RAMP[rampIdx];
      if (ch === " ") continue;

      const r = Math.round(e.y);
      const c = Math.round(e.col);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        cells.push({ row: r, col: c, char: ch, brightness: 1 - t, color: this.color });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "intensity", label: "Intensity", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.5 },
      { key: "height", label: "Height", type: "slider", min: 0.1, max: 1, step: 0.05, defaultValue: 0.3 },
      { key: "spread", label: "Spread", type: "slider", min: 0, max: 5, step: 0.5, defaultValue: 1.5 },
      { key: "color", label: "Color", type: "color", defaultValue: "#ff6622" },
    ];
  }
}
