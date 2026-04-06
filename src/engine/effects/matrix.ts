import type { AsciiEffect, GridInfo, MaskGrid, EffectCell, ControlDescriptor } from "./types";

const MATRIX_CHARS = "0123456789abcdefABCDEF:.<>+*";

function randomChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

interface Column {
  speed: number;      // rows per second
  phase: number;      // current head position (fractional row)
  length: number;     // trail length in rows
  delay: number;      // seconds before respawn after completing
  waiting: number;    // current wait timer
  chars: string[];    // fixed char per row, occasionally cycled
}

export class MatrixEffect implements AsciiEffect {
  type = "matrix";
  private grid: GridInfo = { cols: 0, rows: 0, charW: 0, charH: 0, fontSize: 0 };
  private columns: Column[] = [];
  private density = 0.4;
  private speedMin = 5;
  private speedMax = 14;

  init(grid: GridInfo, params: Record<string, unknown>): void {
    this.grid = grid;
    this.density = (params.density as number) ?? 0.4;
    this.speedMin = (params.speedMin as number) ?? 5;
    this.speedMax = (params.speedMax as number) ?? 14;

    // Create one column entry per grid column, but only some are active
    const { cols, rows } = grid;
    this.columns = [];
    for (let c = 0; c < cols; c++) {
      if (Math.random() > this.density) continue;
      this.columns.push(this.makeColumn(rows));
    }
  }

  private makeColumn(rows: number): Column {
    return {
      speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
      phase: -(Math.random() * rows), // start off-screen with random offset
      length: 8 + Math.floor(Math.random() * 14),
      delay: 0.5 + Math.random() * 3,
      waiting: 0,
      chars: Array.from({ length: rows }, randomChar),
    };
  }

  update(dt: number, _time: number, _mask: MaskGrid): EffectCell[] {
    const { cols, rows } = this.grid;
    const cells: EffectCell[] = [];

    for (const col of this.columns) {
      // Waiting to respawn
      if (col.phase > rows + col.length) {
        col.waiting += dt;
        if (col.waiting >= col.delay) {
          col.phase = -col.length;
          col.waiting = 0;
          col.speed = this.speedMin + Math.random() * (this.speedMax - this.speedMin);
          col.length = 8 + Math.floor(Math.random() * 14);
          col.delay = 0.5 + Math.random() * 3;
          // Assign a new random column position
          col.chars = Array.from({ length: rows }, randomChar);
        }
        continue;
      }

      col.phase += col.speed * dt;
      const headRow = Math.floor(col.phase);

      // Randomly pick a column position (stored as index in the array)
      // We use the column's index to determine x position
      const c = this.columns.indexOf(col) % cols;

      // Cycle a random char occasionally
      if (Math.random() < 0.05) {
        const idx = Math.floor(Math.random() * col.chars.length);
        col.chars[idx] = randomChar();
      }

      // Render the trail
      for (let i = 0; i < col.length; i++) {
        const r = headRow - i;
        if (r < 0 || r >= rows) continue;

        const t = i / col.length; // 0 at head, 1 at tail
        let brightness: number;
        if (i === 0) {
          brightness = 1.0; // head is brightest
        } else if (i < 3) {
          brightness = 0.7;
        } else {
          brightness = Math.max(0.1, 0.5 * (1 - t));
        }

        cells.push({ row: r, col: c, char: col.chars[r], brightness });
      }
    }

    return cells;
  }

  getControls(): ControlDescriptor[] {
    return [
      { key: "density", label: "Density", type: "slider", min: 0.1, max: 0.8, step: 0.05, defaultValue: 0.4 },
      { key: "speedMin", label: "Min speed", type: "slider", min: 2, max: 10, step: 1, defaultValue: 5 },
      { key: "speedMax", label: "Max speed", type: "slider", min: 5, max: 25, step: 1, defaultValue: 14 },
    ];
  }
}
