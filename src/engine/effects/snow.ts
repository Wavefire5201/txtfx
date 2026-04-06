import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

interface Flake {
  col: number;
  y: number;
  speed: number;
  drift: number;
  phase: number;
  char: string;
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

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.density = (params.density as number) ?? 0.15;
    this.speedMin = (params.speedMin as number) ?? 3;
    this.speedMax = (params.speedMax as number) ?? 8;
    this.driftAmount = (params.driftAmount as number) ?? 2;
    this.flakes = [];
    this.spawnAccum = 0;
  }

  update(dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells: EffectCell[] = [];

    this.spawnAccum += cols * this.density * dt;
    const spawnCount = Math.floor(this.spawnAccum);
    this.spawnAccum -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      this.flakes.push({
        col: Math.random() * cols,
        y: -1,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        drift: this.driftAmount * (Math.random() - 0.5) * 2,
        phase: Math.random() * Math.PI * 2,
        char: SNOW_CHARS[Math.floor(Math.random() * SNOW_CHARS.length)],
      });
    }

    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const f = this.flakes[i];
      f.y += f.speed * dt;
      f.col += Math.sin(time * 1.5 + f.phase) * f.drift * dt;

      if (f.y > rows) {
        this.flakes.splice(i, 1);
        continue;
      }

      const r = Math.floor(f.y);
      const c = Math.round(f.col);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        cells.push({ row: r, col: c, char: f.char, brightness: 0.7 });
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
    ];
  }
}
