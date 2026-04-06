import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

interface Column {
  col: number;
  y: number;
  speed: number;
  length: number;
  chars: string[];
  nextSwap: number;
}

const MATRIX_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテト";

function randomChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

export class MatrixEffect implements AsciiEffect {
  type = "matrix";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private columns: Column[] = [];
  private density = 0.15;
  private speedMin = 8;
  private speedMax = 20;

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.density = (params.density as number) ?? 0.15;
    this.speedMin = (params.speedMin as number) ?? 8;
    this.speedMax = (params.speedMax as number) ?? 20;
    this.columns = [];
  }

  update(dt: number, time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells: EffectCell[] = [];

    // Spawn new columns
    const spawnCount = Math.floor(cols * this.density * dt);
    for (let i = 0; i < spawnCount; i++) {
      const len = 5 + Math.floor(Math.random() * 15);
      this.columns.push({
        col: Math.floor(Math.random() * cols),
        y: -1,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        length: len,
        chars: Array.from({ length: len }, randomChar),
        nextSwap: time + Math.random() * 0.2,
      });
    }

    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.y += c.speed * dt;

      // Randomly swap characters for the flickering effect
      if (time > c.nextSwap) {
        const idx = Math.floor(Math.random() * c.chars.length);
        c.chars[idx] = randomChar();
        c.nextSwap = time + 0.05 + Math.random() * 0.15;
      }

      if (c.y - c.length > rows) {
        this.columns.splice(i, 1);
        continue;
      }

      const headRow = Math.floor(c.y);
      for (let j = 0; j < c.length; j++) {
        const r = headRow - j;
        if (r < 0 || r >= rows) continue;
        const brightness = j === 0 ? 1 : Math.max(0.1, 1 - j / c.length);
        cells.push({ row: r, col: c.col, char: c.chars[j], brightness });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "density", label: "Density", type: "slider", min: 0.02, max: 0.5, step: 0.02, defaultValue: 0.15 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 3, max: 15, step: 1, defaultValue: 8 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 10, max: 40, step: 1, defaultValue: 20 },
    ];
  }
}
